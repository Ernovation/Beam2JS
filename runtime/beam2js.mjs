const CONS = 1;
const FLOAT = 2;
const TUPLE = 3;
const BITSTRING = 4;
const HOST_HANDLE = 5;
const PID = 6;
const REFERENCE = 7;
const MAP = 8;
const FUN = 9;
const NIL = 10;

function tagged(tag) {
  return {
    has: value => Array.isArray(value) && value[0] === tag,
    get: value => Array.isArray(value) && value[0] === tag ? value[1] : undefined,
  };
}

const floats = tagged(FLOAT);
const tuples = tagged(TUPLE);
const bitstrings = tagged(BITSTRING);
const hostHandles = tagged(HOST_HANDLE);
const pids = tagged(PID);
const references = tagged(REFERENCE);
const maps = tagged(MAP);
const funs = tagged(FUN);
let nextFunId = 0n;
let nextHostHandleId = 0n;
let nextPidId = 0n;
let nextReferenceId = 0n;
const nil = Object.freeze([NIL, null]);
const processInfoItems = new Set([
  'registered_name', 'current_function', 'initial_call', 'status', 'messages', 'message_queue_len',
  'links', 'monitors', 'monitored_by', 'dictionary', 'trap_exit', 'error_handler', 'heap_size',
  'stack_size', 'memory', 'garbage_collection', 'group_leader', 'reductions', 'priority',
  'trace', 'binary', 'sequential_trace_token', 'catchlevel', 'backtrace', 'last_calls',
  'total_heap_size', 'suspending', 'min_heap_size', 'min_bin_vheap_size', 'max_heap_size',
  'current_location', 'current_stacktrace', 'message_queue_data', 'garbage_collection_info',
  'magic_ref', 'fullsweep_after', 'parent', 'async_dist', 'label', 'priority_messages',
]);
const supportedProcessInfoItems = new Set([
  'registered_name', 'status', 'messages', 'message_queue_len', 'dictionary',
]);
const callableBifs = new Map([
  'is_integer', 'is_number', 'is_atom', 'is_boolean', 'is_float',
  'is_list', 'is_tuple', 'is_binary', 'is_bitstring', 'is_pid', 'is_reference', 'is_map', 'is_function',
].map(name => [JSON.stringify([name, 1]), {
  exported: true,
  run: (rt, args) => ({type: 'return', value: rt.atom(rt.isType(name, args[0]) ? 'true' : 'false')}),
}]));
callableBifs.set(JSON.stringify(['load_nif', 2]), {
  exported: true,
  run: (rt, [name, info]) => ({type: 'load_nif', name, info}),
});
for (const arity of [1, 2]) {
  callableBifs.set(JSON.stringify(['nif_error', arity]), {
    exported: true,
    run: (rt, [reason]) => rt.raiseError(reason),
  });
}
callableBifs.set(JSON.stringify(['map_size', 1]), {
  exported: true,
  run: (rt, [value]) => {
    if (!rt.isType('is_map', value)) rt.raiseError(rt.atom('badmap'));
    return {type: 'return', value: rt.mapSize(value)};
  },
});
callableBifs.set(JSON.stringify(['is_map_key', 2]), {
  exported: true,
  run: (rt, [key, value]) => {
    if (!rt.isType('is_map', value)) rt.raiseError(rt.atom('badmap'));
    return {type: 'return', value: rt.atom(rt.mapGet(value, key) !== null ? 'true' : 'false')};
  },
});
callableBifs.set(JSON.stringify(['map_get', 2]), {
  exported: true,
  run: (rt, [key, value]) => {
    if (!rt.isType('is_map', value)) rt.raiseError(rt.atom('badmap'));
    const found = rt.mapGet(value, key);
    if (found === null) rt.raiseError(rt.tuple([rt.atom('badkey'), key]));
    return {type: 'return', value: found};
  },
});
callableBifs.set(JSON.stringify(['atom_to_list', 1]), {
  exported: true,
  run: (rt, [value]) => {
    if (!isAtom(value)) rt.raiseError(rt.atom('badarg'));
    const bytes = new TextEncoder().encode(Symbol.keyFor(value));
    let result = nil;
    for (let i = bytes.length - 1; i >= 0; i--) {
      result = rt.cons(BigInt(bytes[i]), result);
    }
    return {type: 'return', value: result};
  },
});
callableBifs.set(JSON.stringify(['atom_to_binary', 2]), {
  exported: true,
  run: (rt, [value, encoding]) => {
    if (!isAtom(value) || !isAtom(encoding)) rt.raiseError(rt.atom('badarg'));
    const name = Symbol.keyFor(value);
    const format = Symbol.keyFor(encoding);
    let bytes;
    if (format === 'utf8' || format === 'unicode') {
      bytes = new TextEncoder().encode(name);
    } else if (format === 'latin1') {
      bytes = Array.from(name, character => character.codePointAt(0));
      if (bytes.some(byte => byte > 255)) rt.raiseError(rt.atom('badarg'));
    } else {
      rt.raiseError(rt.atom('badarg'));
    }
    return {type: 'return', value: rt.bitstring(bytes, bytes.length * 8)};
  },
});
callableBifs.set(JSON.stringify(['binary_to_atom', 2]), {
  exported: true,
  run: (rt, [value, encoding]) => {
    if (!bitstrings.has(value) || bitstrings.get(value)[1] % 8 !== 0 || !isAtom(encoding)) {
      rt.raiseError(rt.atom('badarg'));
    }
    const [bytes] = bitstrings.get(value);
    const format = Symbol.keyFor(encoding);
    let name;
    if (format === 'utf8' || format === 'unicode') {
      try {
        name = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
      } catch {
        rt.raiseError(rt.atom('badarg'));
      }
    } else if (format === 'latin1') {
      name = String.fromCharCode(...bytes);
    } else {
      rt.raiseError(rt.atom('badarg'));
    }
    return {type: 'return', value: rt.atom(name)};
  },
});
for (const [name, compare] of [
  ['=:=', (rt, left, right) => rt.equalExact(left, right)],
  ['=/=', (rt, left, right) => !rt.equalExact(left, right)],
  ['==', (rt, left, right) => rt.equalNumeric(left, right)],
  ['/=', (rt, left, right) => !rt.equalNumeric(left, right)],
  ['<', (rt, left, right) => rt.compare(left, right) < 0],
  ['=<', (rt, left, right) => rt.compare(left, right) <= 0],
  ['>', (rt, left, right) => rt.compare(left, right) > 0],
  ['>=', (rt, left, right) => rt.compare(left, right) >= 0],
]) {
  callableBifs.set(JSON.stringify([name, 2]), {
    exported: true,
    run: (rt, [left, right]) => ({type: 'return', value: rt.atom(compare(rt, left, right) ? 'true' : 'false')}),
  });
}
for (const [name, arity, operation] of [
  ['not', 1, (truth, left) => left !== truth],
  ['and', 2, (truth, left, right) => left === truth && right === truth],
  ['or', 2, (truth, left, right) => left === truth || right === truth],
  ['xor', 2, (truth, left, right) => left !== right],
]) {
  callableBifs.set(JSON.stringify([name, arity]), {
    exported: true,
    run: (rt, args) => {
      if (args.some(value => !rt.isType('is_boolean', value))) rt.raiseError(rt.atom('badarg'));
      const result = operation(rt.atom('true'), ...args);
      return {type: 'return', value: rt.atom(result ? 'true' : 'false')};
    },
  });
}
for (const arity of [1, 2]) {
  callableBifs.set(JSON.stringify(['error', arity]), {
    exported: true,
    run: (rt, args) => rt.raiseException('error', args[0]),
  });
}
callableBifs.set(JSON.stringify(['exit', 1]), {
  exported: true,
  run: (rt, [reason]) => rt.raiseException('exit', reason),
});
callableBifs.set(JSON.stringify(['exit', 2]), {
  exported: true,
  run: (rt, [pid, reason]) => ({type: 'exit_signal', pid, reason}),
});
callableBifs.set(JSON.stringify(['raise', 2]), {
  exported: true,
  run: (rt, [erlangClass, reason]) => {
    if (!isAtom(erlangClass)) rt.raiseError(rt.atom('badarg'));
    rt.raiseException(erlangClass, reason);
  },
});
callableBifs.set(JSON.stringify(['raise', 3]), {
  exported: true,
  run: (rt, [erlangClass, reason, stack]) => {
    if (!['error', 'exit', 'throw'].includes(isAtom(erlangClass) ? Symbol.keyFor(erlangClass) : undefined) ||
        !rt.isType('is_list', stack)) rt.raiseError(rt.atom('badarg'));
    rt.raiseException(erlangClass, reason, stack);
  },
});
callableBifs.set(JSON.stringify(['throw', 1]), {
  exported: true,
  run: (rt, [reason]) => rt.raiseException('throw', reason),
});
callableBifs.set(JSON.stringify(['self', 0]), {
  exported: true,
  run: (rt, args, state, budget, pid) => ({type: 'return', value: pid}),
});
callableBifs.set(JSON.stringify(['process_flag', 2]), {
  exported: true,
  run: (rt, [flag, value]) => ({type: 'process_flag', flag, value}),
});
callableBifs.set(JSON.stringify(['link', 1]), {
  exported: true,
  run: (rt, [pid]) => ({type: 'link', pid}),
});
callableBifs.set(JSON.stringify(['unlink', 1]), {
  exported: true,
  run: (rt, [pid]) => ({type: 'unlink', pid}),
});
callableBifs.set(JSON.stringify(['monitor', 2]), {
  exported: true,
  run: (rt, [kind, target]) => ({type: 'monitor', kind, target}),
});
callableBifs.set(JSON.stringify(['demonitor', 1]), {
  exported: true,
  run: (rt, [reference]) => ({type: 'demonitor', reference, flush: false}),
});
callableBifs.set(JSON.stringify(['demonitor', 2]), {
  exported: true,
  run: (rt, [reference, options]) => ({type: 'demonitor', reference, options}),
});
callableBifs.set(JSON.stringify(['make_ref', 0]), {
  exported: true,
  run: rt => ({type: 'return', value: rt.makeRef()}),
});
callableBifs.set(JSON.stringify(['monotonic_time', 0]), {
  exported: true,
  run: rt => ({type: 'return', value: rt.monotonicTime(rt.atom('native'))}),
});
callableBifs.set(JSON.stringify(['monotonic_time', 1]), {
  exported: true,
  run: (rt, [unit]) => ({type: 'return', value: rt.monotonicTime(unit)}),
});
callableBifs.set(JSON.stringify(['is_process_alive', 1]), {
  exported: true,
  run: (rt, args) => ({type: 'return', value: rt.atom(rt.isProcessAlive(args[0]) ? 'true' : 'false')}),
});
callableBifs.set(JSON.stringify(['process_info', 2]), {
  exported: true,
  run: (rt, [pid, items]) => ({type: 'return', value: rt.processInfo(pid, items)}),
});
for (const [name, options] of [
  ['spawn', {}], ['spawn_link', {link: true}], ['spawn_monitor', {monitor: true}],
]) {
  callableBifs.set(JSON.stringify([name, 1]), {
    exported: true,
    run: (rt, [fun]) => ({type: 'spawn', fun, ...options}),
  });
  callableBifs.set(JSON.stringify([name, 3]), {
    exported: true,
    run: (rt, args) => ({type: 'spawn', args, ...options}),
  });
}
callableBifs.set(JSON.stringify(['apply', 2]), {
  exported: true,
  run: (rt, [fun, list]) => {
    if (!funs.has(fun) || !isCons(list) && list !== nil) rt.raiseError(rt.atom('badarg'));
    const args = [];
    let cursor = list;
    while (isCons(cursor)) {
      const [head, tail] = consValue(cursor);
      args.push(head);
      cursor = tail;
    }
    if (cursor !== nil) rt.raiseError(rt.atom('badarg'));
    rt.funCallArgs(fun, args);
    return {type: 'tail_fun', fun, args, module: rt.funValue(fun).module, name: rt.funValue(fun).name};
  },
});
callableBifs.set(JSON.stringify(['apply', 3]), {
  exported: true,
  run: (rt, [module, name, list]) => {
    if (!isAtom(module) || !isAtom(name)) rt.raiseError(rt.atom('badarg'));
    const args = [];
    while (isCons(list)) {
      const [head, tail] = consValue(list);
      args.push(head);
      list = tail;
      if (args.length > 255) throw new Error('unsupported function arity: more than 255');
    }
    if (list !== nil) rt.raiseError(rt.atom('badarg'));
    return {
      type: 'tail', module: Symbol.keyFor(module), name: Symbol.keyFor(name),
      args, external: true,
    };
  },
});
callableBifs.set(JSON.stringify(['get_module_info', 1]), {
  exported: true,
  run: (rt, [module]) => {
    if (!isAtom(module)) rt.raiseError(rt.atom('badarg'));
    return {type: 'module_info', module: Symbol.keyFor(module), arity: 0, args: []};
  },
});
callableBifs.set(JSON.stringify(['get_module_info', 2]), {
  exported: true,
  run: (rt, [module, key]) => {
    if (!isAtom(module)) rt.raiseError(rt.atom('badarg'));
    return {type: 'module_info', module: Symbol.keyFor(module), arity: 1, args: [key]};
  },
});
callableBifs.set(JSON.stringify(['register', 2]), {
  exported: true,
  run: (rt, args) => ({type: 'return', value: rt.registerProcess(...args)}),
});
callableBifs.set(JSON.stringify(['unregister', 1]), {
  exported: true,
  run: (rt, [name]) => ({type: 'return', value: rt.unregisterProcess(name)}),
});
callableBifs.set(JSON.stringify(['whereis', 1]), {
  exported: true,
  run: (rt, [name]) => ({type: 'return', value: rt.whereisProcess(name)}),
});
callableBifs.set(JSON.stringify(['registered', 0]), {
  exported: true,
  run: rt => ({type: 'return', value: rt.registeredProcesses()}),
});
for (const [name, arity] of [
  ['get', 0], ['get', 1], ['get_keys', 0], ['get_keys', 1],
  ['put', 2], ['erase', 0], ['erase', 1],
]) {
  callableBifs.set(JSON.stringify([name, arity]), {
    exported: true,
    run: (rt, args) => ({type: 'dictionary', name, args}),
  });
}
for (const name of ['send', '!']) {
  callableBifs.set(JSON.stringify([name, 2]), {
    exported: true,
    run: (rt, args) => ({type: 'return', value: rt.sendPidMessage(...args)}),
  });
}
for (const name of ['send_after', 'start_timer']) {
  callableBifs.set(JSON.stringify([name, 3]), {
    exported: true,
    run: (rt, args) => ({type: 'return', value: rt.startTimer(name, ...args)}),
  });
  callableBifs.set(JSON.stringify([name, 4]), {
    exported: true,
    run: (rt, [delay, destination, message, options]) => ({
      type: 'return', value: rt.startTimerWithOptions(name, delay, destination, message, options),
    }),
  });
}
for (const name of ['read_timer', 'cancel_timer']) {
  callableBifs.set(JSON.stringify([name, 1]), {
    exported: true,
    run: (rt, [ref]) => ({type: 'return', value: rt.accessTimer(ref, name === 'cancel_timer')}),
  });
  callableBifs.set(JSON.stringify([name, 2]), {
    exported: true,
    run: (rt, [ref, options], state, budget, pid) => ({
      type: 'return', value: rt.accessTimerWithOptions(ref, options, name === 'cancel_timer', pid),
    }),
  });
}
function addGuardedBifs(entries, guard, errorReason = 'badarg') {
  for (const [name, arity] of entries) {
    callableBifs.set(JSON.stringify([name, arity]), {
      exported: true,
      run: (rt, args) => {
        const value = guard(rt, name, args);
        if (value === null) rt.raiseError(rt.atom(errorReason));
        return {type: 'return', value};
      },
    });
  }
}
addGuardedBifs([['hd', 1], ['tl', 1], ['length', 1], ['tuple_size', 1], ['element', 2],
  ['list_to_tuple', 1], ['tuple_to_list', 1]],
  (rt, name, args) => rt.guardListTuple(name, ...args));
addGuardedBifs([['bit_size', 1], ['byte_size', 1], ['binary_part', 2], ['binary_part', 3]],
  (rt, name, args) => rt.guardBitstringBif(name, ...args));
addGuardedBifs([['binary_to_list', 1], ['binary_to_list', 3]], (rt, name, args) => {
  const bits = bitstrings.get(args[0]);
  if (!bits || bits[1] % 8 !== 0) return null;
  const bytes = bits[0];
  let start = 0;
  let end = bytes.length;
  if (args.length === 3) {
    const [first, last] = args.slice(1);
    if (typeof first !== 'bigint' || typeof last !== 'bigint' ||
        first < 1n || last < first || last > BigInt(bytes.length)) return null;
    start = Number(first - 1n);
    end = Number(last);
  }
  let result = nil;
  for (let i = end - 1; i >= start; i--) result = rt.cons(BigInt(bytes[i]), result);
  return result;
});
addGuardedBifs([['abs', 1], ['trunc', 1], ['round', 1], ['floor', 1], ['ceil', 1], ['float', 1]],
  (rt, name, args) => rt.guardArithmetic(name, ...args));
addGuardedBifs([['+', 2], ['-', 1], ['-', 2], ['*', 2], ['/', 2]],
  (rt, name, args) => rt.guardArithmetic(name === '-' && args.length === 1 ? 'neg' : name, ...args),
  'badarith');
addGuardedBifs([['band', 2], ['bor', 2], ['bxor', 2], ['bnot', 1], ['div', 2], ['rem', 2]],
  (rt, name, args) => rt.guardArithmetic(name, ...args), 'badarith');
addGuardedBifs([
  ['integer_to_list', 1], ['integer_to_list', 2],
  ['integer_to_binary', 1], ['integer_to_binary', 2],
], (rt, name, [value, base = 10n]) => {
  if (typeof value !== 'bigint' || typeof base !== 'bigint' || base < 2n || base > 36n) return null;
  const text = value.toString(Number(base)).toUpperCase();
  if (name === 'integer_to_binary') {
    return rt.bitstring(Array.from(text, char => char.charCodeAt(0)), text.length * 8);
  }
  let list = nil;
  for (let i = text.length - 1; i >= 0; i--) list = rt.cons(BigInt(text.charCodeAt(i)), list);
  return list;
});

function isAtom(value) {
  return typeof value === 'symbol' && Symbol.keyFor(value) !== undefined;
}

function isCons(value) {
  return Array.isArray(value) && value[0] === CONS;
}

function consValue(value) {
  return isCons(value) ? value[1] : undefined;
}

function isTerm(value) {
  return typeof value === 'bigint' || isAtom(value) || value === nil ||
    (Array.isArray(value) && Number.isInteger(value[0]) &&
      value[0] >= CONS && value[0] <= NIL);
}

function termType(value) {
  if (typeof value === 'bigint') return 'integer';
  if (isAtom(value)) return 'atom';
  if (value === nil) return 'nil';
  if (Array.isArray(value)) {
    switch (value[0]) {
      case CONS: return 'cons';
      case FLOAT: return 'float';
      case TUPLE: return 'tuple';
      case BITSTRING: return 'bitstring';
      case HOST_HANDLE: return 'host_handle';
      case PID: return 'pid';
      case REFERENCE: return 'reference';
      case FUN: return 'fun';
      case MAP: return 'map';
    }
  }
  throw new TypeError('unsupported Erlang term');
}

function compareBitstrings(left, right) {
  const [a, aLength] = bitstrings.get(left);
  const [b, bLength] = bitstrings.get(right);
  const common = Math.min(aLength, bLength);
  const fullBytes = Math.floor(common / 8);
  for (let i = 0; i < fullBytes; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  const remaining = common % 8;
  if (remaining) {
    const mask = (0xff << (8 - remaining)) & 0xff;
    const x = a[fullBytes] & mask;
    const y = b[fullBytes] & mask;
    if (x !== y) return x < y ? -1 : 1;
  }
  return aLength === bLength ? 0 : aLength < bLength ? -1 : 1;
}

export class ErlangError extends Error {
  constructor(reason, erlangClass = 'error', stack = nil) {
    if (!isTerm(reason)) throw new TypeError('error reason must be a supported Erlang term');
    const tag = tuples.get(reason)?.[0] ?? reason;
    super(`Erlang ${isAtom(tag) ? Symbol.keyFor(tag) : 'error'}`);
    this.name = 'ErlangError';
    this.erlangClass = erlangClass;
    this.reason = reason;
    this.stack = stack;
  }
}

// Termination by an exit signal; unlike an exception it cannot be caught by try/catch.
class ProcessExit extends ErlangError {
  constructor(reason) {
    super(reason, 'exit');
  }
}

export class Runtime {
  #hostObjects = new WeakMap();
  #processes = new WeakMap();
  #pidHandles = new WeakMap();
  #pidProcesses = new WeakMap();
  #localPids = new WeakSet();
  #livePids = new WeakSet();
  #registered = new Map();
  #ready = [];
  #waiting = new Set(); // Keep blocked processes alive even without an external PID reference.
  #readyHead = 0;
  #scheduled = 0;
  #schedulerCount;
  #reductionLimit;
  #onProcessError;
  #clock;
  #timers = new Map();
  #processLinks = new WeakMap();
  #processMonitors = new WeakMap();
  #processMonitoredBy = new WeakMap();
  #moduleBaseURL;
  #moduleLoads = new Map();
  #moduleWaits = new Map();
  #onLoads = new Map();
  #nifLoads = new Map();

  constructor({schedulers = 1, reductionLimit = 1000,
    moduleBaseURL = globalThis.document?.baseURI ?? new URL('../', import.meta.url),
    onProcessError = (pid, error) => console.error('Erlang-spawned process failed:', error),
    clock = {now: () => performance.now(), setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: handle => clearTimeout(handle)}} = {}) {
    if (!Number.isSafeInteger(schedulers) || schedulers < 1 ||
        !Number.isSafeInteger(reductionLimit) || reductionLimit < 1) {
      throw new RangeError('schedulers and reductionLimit must be positive safe integers');
    }
    if (typeof onProcessError !== 'function') throw new TypeError('onProcessError must be a function');
    if (!clock || typeof clock.now !== 'function' || typeof clock.setTimeout !== 'function' ||
        typeof clock.clearTimeout !== 'function') throw new TypeError('clock requires now, setTimeout and clearTimeout');
    this.#schedulerCount = schedulers;
    this.#reductionLimit = reductionLimit;
    this.#onProcessError = onProcessError;
    this.#clock = clock;
    this.#moduleBaseURL = new URL(moduleBaseURL);
    this.modules = new Map();
    this.registerMapsModule();
  }

  registerMapsModule() {
    const rt = this;
    const requireMap = value => {
      if (!rt.isType('is_map', value)) rt.raiseError(rt.atom('badmap'));
    };
    const erlList = values => {
      let result = rt.nil();
      for (let i = values.length - 1; i >= 0; i--) result = rt.cons(values[i], result);
      return result;
    };
    const erlPairs = pairs => {
      let result = rt.nil();
      for (let i = pairs.length - 1; i >= 0; i--) {
        result = rt.cons(rt.tuple(pairs[i]), result);
      }
      return result;
    };
    rt.registerModule(26, 'maps', [
      {name: 'new', arity: 0, exported: true, run: () => ({type: 'return', value: rt.map()})},
      {name: 'size', arity: 1, exported: true, run: (r, [value]) => { requireMap(value); return {type: 'return', value: rt.mapSize(value)}; }},
      {name: 'is_key', arity: 2, exported: true, run: (r, [key, value]) => { requireMap(value); return {type: 'return', value: rt.atom(rt.mapGet(value, key) !== null ? 'true' : 'false')}; }},
      {name: 'get', arity: 2, exported: true, run: (r, [key, value]) => { requireMap(value); const found = rt.mapGet(value, key); if (found === null) rt.raiseError(rt.tuple([rt.atom('badkey'), key])); return {type: 'return', value: found}; }},
      {name: 'get', arity: 3, exported: true, run: (r, [key, value, fallback]) => { requireMap(value); const found = rt.mapGet(value, key); return {type: 'return', value: found === null ? fallback : found}; }},
      {name: 'find', arity: 2, exported: true, run: (r, [key, value]) => { requireMap(value); const found = rt.mapGet(value, key); return {type: 'return', value: found === null ? rt.atom('error') : rt.tuple([rt.atom('ok'), found])}; }},
      {name: 'put', arity: 3, exported: true, run: (r, [key, value, map]) => { requireMap(map); return {type: 'return', value: rt.mapPut(map, [[key, value]])}; }},
      {name: 'update', arity: 3, exported: true, run: (r, [key, value, map]) => ({type: 'return', value: rt.mapUpdate(map, key, value)})},
      {name: 'remove', arity: 2, exported: true, run: (r, [key, map]) => ({type: 'return', value: rt.mapRemove(map, [key])})},
      {name: 'take', arity: 2, exported: true, run: (r, [key, map]) => { requireMap(map); const found = rt.mapGet(map, key); return {type: 'return', value: found === null ? rt.atom('error') : rt.tuple([found, rt.mapRemove(map, [key])])}; }},
      {name: 'keys', arity: 1, exported: true, run: (r, [map]) => { requireMap(map); return {type: 'return', value: erlList(rt.mapEntries(map).map(([key]) => key))}; }},
      {name: 'values', arity: 1, exported: true, run: (r, [map]) => { requireMap(map); return {type: 'return', value: erlList(rt.mapEntries(map).map(([, value]) => value))}; }},
      {name: 'to_list', arity: 1, exported: true, run: (r, [map]) => { requireMap(map); return {type: 'return', value: erlPairs(rt.mapEntries(map))}; }},
      {name: 'from_list', arity: 1, exported: true, run: (r, [list]) => { const entries = []; let cursor = list; while (r.isType('is_nonempty_list', cursor)) { const pair = r.listHead(cursor); if (!r.isType('is_tuple', pair) || r.tupleSize(pair) !== 2) r.raiseError(r.atom('badarg')); entries.push([r.tupleElement(pair, 1), r.tupleElement(pair, 2)]); cursor = r.listTail(cursor); } if (cursor !== r.nil()) r.raiseError(r.atom('badarg')); return {type: 'return', value: r.map(entries)}; }},
      {name: 'from_keys', arity: 2, exported: true, run: (r, [value, keys]) => { const entries = []; let cursor = keys; while (r.isType('is_nonempty_list', cursor)) { entries.push([r.listHead(cursor), value]); cursor = r.listTail(cursor); } if (cursor !== r.nil()) r.raiseError(r.atom('badarg')); return {type: 'return', value: r.map(entries)}; }},
      {name: 'merge', arity: 2, exported: true, run: (r, [left, right]) => { requireMap(left); requireMap(right); const entries = rt.mapEntries(right); return {type: 'return', value: rt.mapPut(left, entries)}; }},
      {name: 'with', arity: 2, exported: true, run: (r, [keys, map]) => { requireMap(map); const wanted = []; let cursor = keys; while (r.isType('is_nonempty_list', cursor)) { wanted.push(r.listHead(cursor)); cursor = r.listTail(cursor); } if (cursor !== r.nil()) r.raiseError(r.atom('badarg')); return {type: 'return', value: rt.map(rt.mapEntries(map).filter(([key]) => wanted.some(candidate => rt.equalExact(key, candidate))))}; }},
      {name: 'without', arity: 2, exported: true, run: (r, [keys, map]) => { requireMap(map); const unwanted = []; let cursor = keys; while (r.isType('is_nonempty_list', cursor)) { unwanted.push(r.listHead(cursor)); cursor = r.listTail(cursor); } if (cursor !== r.nil()) r.raiseError(r.atom('badarg')); return {type: 'return', value: rt.mapRemove(map, unwanted)}; }},
      {name: 'intersect', arity: 2, exported: true, run: (r, [left, right]) => { requireMap(left); requireMap(right); return {type: 'return', value: rt.map(rt.mapEntries(left).filter(([key]) => rt.mapGet(right, key) !== null))}; }},
      {name: 'merge_with', arity: 3, exported: true, run: (r, [fun, left, right]) => { requireMap(left); requireMap(right); if (!rt.isType('is_function', fun)) rt.raiseError(rt.atom('badfun')); const combined = rt.mapEntries(left).map(entry => [entry[0], entry[1]]); for (const [key, rightValue] of rt.mapEntries(right)) { const leftValue = rt.mapGet(left, key); if (leftValue === null) combined.push([key, rightValue]); else { const replacement = rt.invokeFun(fun, [key, leftValue, rightValue]); const index = combined.findIndex(([candidate]) => rt.equalExact(candidate, key)); combined[index] = [key, replacement]; } } return {type: 'return', value: rt.map(combined)}; }},
      {name: 'intersect_with', arity: 3, exported: true, run: (r, [fun, left, right]) => { requireMap(left); requireMap(right); if (!rt.isType('is_function', fun)) rt.raiseError(rt.atom('badfun')); const combined = []; for (const [key, leftValue] of rt.mapEntries(left)) { const rightValue = rt.mapGet(right, key); if (rightValue !== null) combined.push([key, rt.invokeFun(fun, [key, leftValue, rightValue])]); } return {type: 'return', value: rt.map(combined)}; }},
      {name: 'filter', arity: 2, exported: true, run: (r, [fun, map]) => { requireMap(map); if (!rt.isType('is_function', fun)) rt.raiseError(rt.atom('badfun')); const kept = rt.mapEntries(map).filter(([key, value]) => rt.equalExact(rt.invokeFun(fun, [key, value]), rt.atom('true'))); return {type: 'return', value: rt.map(kept)}; }},
      {name: 'filtermap', arity: 2, exported: true, run: (r, [fun, map]) => { requireMap(map); if (!rt.isType('is_function', fun)) rt.raiseError(rt.atom('badfun')); const kept = []; for (const [key, value] of rt.mapEntries(map)) { const result = rt.invokeFun(fun, [key, value]); if (rt.equalExact(result, rt.atom('true'))) kept.push([key, value]); else if (rt.isType('is_tuple', result) && rt.tupleSize(result) === 2 && rt.equalExact(rt.tupleElement(result, 1), rt.atom('true'))) kept.push([key, rt.tupleElement(result, 2)]); } return {type: 'return', value: rt.map(kept)}; }},
      {name: 'map', arity: 2, exported: true, run: (r, [fun, map]) => { requireMap(map); if (!rt.isType('is_function', fun)) rt.raiseError(rt.atom('badfun')); const changed = rt.mapEntries(map).map(([key, value]) => [key, rt.invokeFun(fun, [key, value])]); return {type: 'return', value: rt.map(changed)}; }},
      {name: 'fold', arity: 3, exported: true, run: (r, [fun, initial, map]) => { requireMap(map); if (!rt.isType('is_function', fun)) rt.raiseError(rt.atom('badfun')); let accumulator = initial; for (const [key, value] of rt.mapEntries(map)) accumulator = rt.invokeFun(fun, [key, value, accumulator]); return {type: 'return', value: accumulator}; }},
      {name: 'foreach', arity: 2, exported: true, run: (r, [fun, map]) => { requireMap(map); if (!rt.isType('is_function', fun)) rt.raiseError(rt.atom('badfun')); for (const [key, value] of rt.mapEntries(map)) rt.invokeFun(fun, [key, value]); return {type: 'return', value: rt.atom('ok')}; }},
      {name: 'groups_from_list', arity: 2, exported: true, run: (r, [fun, list]) => { if (!rt.isType('is_function', fun)) rt.raiseError(rt.atom('badfun')); const entries = []; let cursor = list; while (r.isType('is_nonempty_list', cursor)) { const item = r.listHead(cursor); const key = rt.invokeFun(fun, [item]); let index = entries.findIndex(([candidate]) => rt.equalExact(candidate, key)); if (index < 0) { index = entries.length; entries.push([key, []]); } entries[index][1].push(item); cursor = r.listTail(cursor); } if (cursor !== r.nil()) r.raiseError(r.atom('badarg')); return {type: 'return', value: rt.map(entries.map(([key, values]) => { let result = rt.nil(); for (let i = values.length - 1; i >= 0; i--) result = rt.cons(values[i], result); return [key, result]; }))}; }},
      {name: 'groups_from_list', arity: 3, exported: true, run: (r, [keyFun, valueFun, list]) => { if (!rt.isType('is_function', keyFun) || !rt.isType('is_function', valueFun)) rt.raiseError(rt.atom('badfun')); const entries = []; let cursor = list; while (r.isType('is_nonempty_list', cursor)) { const item = r.listHead(cursor); const key = rt.invokeFun(keyFun, [item]); const value = rt.invokeFun(valueFun, [item]); let index = entries.findIndex(([candidate]) => rt.equalExact(candidate, key)); if (index < 0) { index = entries.length; entries.push([key, []]); } entries[index][1].push(value); cursor = r.listTail(cursor); } if (cursor !== r.nil()) r.raiseError(r.atom('badarg')); return {type: 'return', value: rt.map(entries.map(([key, values]) => { let result = rt.nil(); for (let i = values.length - 1; i >= 0; i--) result = rt.cons(values[i], result); return [key, result]; }))}; }},
      {name: 'update_with', arity: 3, exported: true, run: (r, [key, fun, map]) => { requireMap(map); if (!rt.isType('is_function', fun)) rt.raiseError(rt.atom('badfun')); const found = rt.mapGet(map, key); if (found === null) rt.raiseError(r.tuple([r.atom('badkey'), key])); return {type: 'return', value: rt.mapUpdate(map, key, rt.invokeFun(fun, [found]))}; }},
      {name: 'update_with', arity: 4, exported: true, run: (r, [key, fun, initial, map]) => { requireMap(map); if (!rt.isType('is_function', fun)) rt.raiseError(rt.atom('badfun')); const found = rt.mapGet(map, key); return {type: 'return', value: found === null ? rt.mapPut(map, [[key, initial]]) : rt.mapUpdate(map, key, rt.invokeFun(fun, [found]))}; }},
      {name: 'iterator', arity: 1, exported: true, run: (r, [map]) => { requireMap(map); return {type: 'return', value: rt.tuple([rt.atom('maps_iterator'), map, erlPairs(rt.mapEntries(map))])}; }},
      {name: 'iterator', arity: 2, exported: true, run: (r, [map, order]) => { requireMap(map); if (!rt.isType('is_atom', order)) rt.raiseError(rt.atom('badarg')); const name = Symbol.keyFor(order); if (!['ordered','reversed','undefined'].includes(name)) rt.raiseError(rt.atom('badarg')); let entries = rt.mapEntries(map); if (name === 'reversed') entries = entries.reverse(); else if (name === 'ordered') entries = entries.slice().sort((left, right) => rt.compare(left[0], right[0])).map(entry => [entry[0], entry[1]]); return {type: 'return', value: rt.tuple([rt.atom('maps_iterator'), map, erlPairs(entries)])}; }},
      {name: 'next', arity: 1, exported: true, run: (r, [iterator]) => { if (!rt.isType('is_tuple', iterator) || rt.tupleSize(iterator) !== 3 || !rt.equalExact(rt.tupleElement(iterator, 1), rt.atom('maps_iterator'))) rt.raiseError(rt.atom('badarg')); const entries = rt.tupleElement(iterator, 3); if (entries === r.nil()) return {type: 'return', value: rt.atom('none')}; if (!r.isType('is_nonempty_list', entries)) rt.raiseError(rt.atom('badarg')); const pair = r.listHead(entries); const tail = r.listTail(entries); if (!r.isType('is_tuple', pair) || r.tupleSize(pair) !== 2) rt.raiseError(rt.atom('badarg')); const rest = rt.tuple([rt.atom('maps_iterator'), rt.tupleElement(iterator, 2), tail]); return {type: 'return', value: rt.tuple([r.tupleElement(pair, 1), r.tupleElement(pair, 2), rest])}; }},
      {name: 'is_iterator_valid', arity: 1, exported: true, run: (r, [iterator]) => ({type: 'return', value: rt.atom(rt.isType('is_tuple', iterator) && rt.tupleSize(iterator) === 3 && rt.equalExact(rt.tupleElement(iterator, 1), rt.atom('maps_iterator')) ? 'true' : 'false')})},
    ]);
  }

  hostHandle(value) {
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
      throw new TypeError('host handle requires a JavaScript object or function');
    }
    let handle = this.#hostObjects.get(value);
    if (!handle) {
      handle = Object.freeze([HOST_HANDLE, {owner: this, value, id: nextHostHandleId++}]);
      this.#hostObjects.set(value, handle);
    }
    return handle;
  }

  hostValue(handle) {
    const data = hostHandles.get(handle);
    if (!data || data.owner !== this) throw new TypeError('expected a host handle from this runtime');
    return data.value;
  }

  atom(name) {
    if (typeof name !== 'string') throw new TypeError('atom name must be a string');
    return Symbol.for(name);
  }

  makeFun(module, name, arity, environment = []) {
    if (typeof module !== 'string' || typeof name !== 'string' ||
        !Number.isInteger(arity) || arity < 0 || arity > 255 ||
        !Array.isArray(environment) || environment.some(value => !isTerm(value))) {
      throw new TypeError('invalid Erlang fun definition');
    }
    return Object.freeze([FUN, Object.freeze({id: nextFunId++, module, name, arity,
      environment: Object.freeze(environment.slice())})]);
  }

  funValue(value) {
    if (!funs.has(value)) throw new TypeError('expected Erlang fun');
    return funs.get(value);
  }

  funArity(value) {
    const data = this.funValue(value);
    return data.arity - data.environment.length;
  }

  invokeFun(value, args) {
    if (!funs.has(value)) this.raiseError(this.atom('badfun'));
    const data = this.funValue(value);
    const callArgs = this.funCallArgs(value, args);
    const process = this.#newProcess(data.module, data.name, callArgs);
    process.external = false;
    process.status = 'running';
    let failed = false;
    let failure;
    try {
      const result = this.#runProcess(process, Infinity);
      if (result.waiting) throw new Error('synchronous fun invocation cannot wait for a message');
      if (!result.done) throw new Error('unexpected yield in synchronous fun invocation');
      return result.value;
    } catch (error) {
      failed = true;
      failure = error;
      throw error;
    } finally {
      try {
        this.#finishProcess(process, 'completed');
      } catch (error) {
        if (failed) throw new AggregateError([failure, error], 'fun process and timer cleanup failed');
        throw error;
      }
    }
  }

  funCallArgs(value, args) {
    const data = this.funValue(value);
    if (args.length !== this.funArity(value)) this.raiseError(this.atom('badarity'));
    return [...data.environment, ...args];
  }

  makeRef() {
    return Object.freeze([REFERENCE, nextReferenceId++]);
  }

  map(entries = []) {
    if (!Array.isArray(entries)) throw new TypeError('map entries must be an array');
    const result = [];
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length !== 2) throw new TypeError('invalid map entry');
      const [key, value] = entry;
      if (!isTerm(key) || !isTerm(value)) throw new TypeError('map requires Erlang terms');
      const existing = result.findIndex(([oldKey]) => this.equalExact(oldKey, key));
      if (existing >= 0) result[existing] = [key, value];
      else result.push([key, value]);
    }
    return Object.freeze([MAP, Object.freeze(result.map(entry => Object.freeze(entry)))]);
  }

  mapSize(value) {
    if (!maps.has(value)) throw new TypeError('expected Erlang map');
    return BigInt(maps.get(value).length);
  }

  mapGet(value, key) {
    if (!maps.has(value)) this.raiseError(this.atom('badmap'));
    for (const [candidate, result] of maps.get(value)) {
      if (this.equalExact(candidate, key)) return result;
    }
    return null;
  }

  mapPut(value, entries) {
    if (!maps.has(value)) this.raiseError(this.atom('badmap'));
    const combined = maps.get(value).map(entry => [entry[0], entry[1]]);
    for (const [key, result] of entries) {
      const existing = combined.findIndex(([oldKey]) => this.equalExact(oldKey, key));
      if (existing >= 0) combined[existing] = [key, result];
      else combined.push([key, result]);
    }
    return this.map(combined);
  }

  mapPutExact(value, entries) {
    if (!maps.has(value)) this.raiseError(this.atom('badmap'));
    for (const [key] of entries) {
      if (this.mapGet(value, key) === null) this.raiseError(this.atom('badkey'));
    }
    return this.mapPut(value, entries);
  }

  mapRemove(value, keys) {
    if (!maps.has(value)) this.raiseError(this.atom('badmap'));
    const result = maps.get(value)
      .filter(([key]) => !keys.some(candidate => this.equalExact(key, candidate)))
      .map(entry => [entry[0], entry[1]]);
    return this.map(result);
  }

  mapUpdate(value, key, replacement) {
    if (!maps.has(value)) this.raiseError(this.atom('badmap'));
    if (this.mapGet(value, key) === null) this.raiseError(this.tuple([this.atom('badkey'), key]));
    return this.mapPut(value, [[key, replacement]]);
  }

  mapEntries(value) {
    if (!maps.has(value)) this.raiseError(this.atom('badmap'));
    return maps.get(value).map(entry => [entry[0], entry[1]]);
  }

  mapOrderedEntries(value) {
    if (!maps.has(value)) this.raiseError(this.atom('badmap'));
    return maps.get(value).slice().sort((left, right) => this.compare(left[0], right[0]))
      .map(entry => [entry[0], entry[1]]);
  }

  raiseError(reason) {
    throw new ErlangError(reason, 'error');
  }

  raiseException(erlangClass, reason, stack = nil) {
    if (typeof erlangClass === 'string') erlangClass = this.atom(erlangClass);
    if (!isAtom(erlangClass)) throw new TypeError('exception class must be an atom');
    throw new ErlangError(reason, Symbol.keyFor(erlangClass), stack);
  }

  // Returns [Class, Reason, RawStack]; the raw stack carries the class for rethrowing.
  takeException(pid) {
    const process = this.#pidProcesses.get(pid);
    const exception = process?.pendingException;
    if (!exception) throw new Error('no exception is being handled');
    process.pendingException = undefined;
    const [erlangClass, reason, stack] = exception;
    return [erlangClass, reason, this.tuple([erlangClass, stack])];
  }

  catchEnd(pid, value) {
    const process = this.#pidProcesses.get(pid);
    if (!process?.pendingException) {
      this.popExceptionHandler(pid);
      return value;
    }
    const [erlangClass, reason, stack] = process.pendingException;
    process.pendingException = undefined;
    switch (Symbol.keyFor(erlangClass)) {
      case 'throw': return reason;
      case 'error': return this.tuple([this.atom('EXIT'), this.tuple([reason, stack])]);
      default: return this.tuple([this.atom('EXIT'), reason]);
    }
  }

  buildStacktrace(raw) {
    if (raw === nil || isCons(raw)) return raw;
    if (this.isType('is_tuple', raw) && this.tupleSize(raw) === 2) return this.buildStacktrace(this.tupleElement(raw, 2));
    return nil;
  }

  raiseRaw(raw, reason) {
    const erlangClass = this.isType('is_tuple', raw) && this.tupleSize(raw) === 2 ? this.tupleElement(raw, 1) : this.atom('error');
    this.raiseException(erlangClass, reason, this.buildStacktrace(raw));
  }

  raiseExceptionFromRegisters(registers) {
    this.raiseException(registers[0], registers[1], this.buildStacktrace(registers[2] ?? nil));
  }

  pushExceptionHandler(pid, handler) {
    const process = this.#pidProcesses.get(pid);
    if (!process) this.raiseError(this.atom('badarg'));
    if (!process.exceptionHandlers) process.exceptionHandlers = [];
    process.exceptionHandlers.push({...handler, depth: process.continuations.length});
  }

  popExceptionHandler(pid) {
    const process = this.#pidProcesses.get(pid);
    if (process?.exceptionHandlers) process.exceptionHandlers.pop();
  }

  float(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError('float must be a finite number');
    }
    return Object.freeze([FLOAT, value]);
  }

  floatValue(value) {
    if (!floats.has(value)) throw new TypeError('expected Erlang float');
    return floats.get(value);
  }

  nil() {
    return nil;
  }

  cons(head, tail) {
    if (!isTerm(head) || !isTerm(tail)) throw new TypeError('cons requires Erlang terms');
    return Object.freeze([CONS, [head, tail]]);
  }

  listHead(value) {
    const cell = consValue(value);
    if (!cell) throw new TypeError('expected nonempty Erlang list');
    return cell[0];
  }

  listTail(value) {
    const cell = consValue(value);
    if (!cell) throw new TypeError('expected nonempty Erlang list');
    return cell[1];
  }

  tuple(elements) {
    if (!Array.isArray(elements)) throw new TypeError('tuple requires an array of Erlang terms');
    const copy = Array.from(elements);
    if (copy.some(value => !isTerm(value))) throw new TypeError('tuple requires an array of Erlang terms');
    return Object.freeze([TUPLE, copy]);
  }

  tupleSize(value) {
    const elements = tuples.get(value);
    if (!elements) throw new TypeError('expected Erlang tuple');
    return elements.length;
  }

  tupleElement(value, index) {
    const elements = tuples.get(value);
    if (!elements) throw new TypeError('expected Erlang tuple');
    if (!Number.isSafeInteger(index) || index < 1 || index > elements.length) {
      throw new RangeError('invalid tuple index');
    }
    return elements[index - 1];
  }

  guardListTuple(op, ...args) {
    const arity = op === 'element' ? 2 : 1;
    if (!['hd', 'tl', 'length', 'tuple_size', 'element', 'list_to_tuple', 'tuple_to_list'].includes(op) ||
        args.length !== arity) {
      throw new Error(`invalid list or tuple BIF: ${op}/${args.length}`);
    }
    for (const value of args) termType(value);
    if (op === 'hd' || op === 'tl') {
      const cell = consValue(args[0]);
      return cell ? cell[op === 'hd' ? 0 : 1] : null;
    }
    if (op === 'length') {
      let value = args[0];
      let length = 0n;
      while (isCons(value)) {
        value = consValue(value)[1];
        length += 1n;
      }
      return value === nil ? length : null;
    }
    if (op === 'list_to_tuple') {
      let value = args[0];
      const elements = [];
      while (isCons(value)) {
        const [head, tail] = consValue(value);
        elements.push(head);
        value = tail;
      }
      return value === nil ? this.tuple(elements) : null;
    }
    const elements = tuples.get(args[op === 'element' ? 1 : 0]);
    if (!elements) return null;
    if (op === 'tuple_size') return BigInt(elements.length);
    if (op === 'tuple_to_list') {
      let result = nil;
      for (let i = elements.length - 1; i >= 0; i--) result = this.cons(elements[i], result);
      return result;
    }
    const position = args[0];
    if (typeof position !== 'bigint' || position < 1n || position > BigInt(elements.length)) return null;
    return elements[Number(position - 1n)];
  }

  bitstring(bytes, bitLength) {
    if (!Array.isArray(bytes) && !(bytes instanceof Uint8Array)) {
      throw new TypeError('bitstring requires an array or Uint8Array of bytes');
    }
    if (!Number.isSafeInteger(bitLength) || bitLength < 0 ||
        bytes.length !== Math.ceil(bitLength / 8)) {
      throw new RangeError('invalid bitstring length');
    }
    const values = Array.from(bytes);
    if (values.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
      throw new TypeError('bitstring requires bytes in the range 0..255');
    }
    const copy = Uint8Array.from(values);
    if (bitLength % 8) copy[copy.length - 1] &= (0xff << (8 - bitLength % 8)) & 0xff;
    return Object.freeze([BITSTRING, [copy, bitLength]]);
  }

  isBitstring(value) {
    return bitstrings.has(value);
  }

  bitstringSize(value) {
    const bits = bitstrings.get(value);
    if (!bits) throw new TypeError('expected Erlang bitstring');
    return bits[1];
  }

  bitstringBytes(value) {
    const bits = bitstrings.get(value);
    if (!bits) throw new TypeError('expected Erlang bitstring');
    return bits[0].slice();
  }

  guardBitstringBif(op, ...args) {
    if (!((op === 'bit_size' || op === 'byte_size') && args.length === 1) &&
        !(op === 'binary_part' && (args.length === 2 || args.length === 3))) {
      throw new Error(`invalid bitstring BIF: ${op}/${args.length}`);
    }
    for (const value of args) termType(value);
    if (op !== 'binary_part') {
      const bits = bitstrings.get(args[0]);
      if (!bits) return null;
      return BigInt(op === 'bit_size' ? bits[1] : Math.ceil(bits[1] / 8));
    }
    if (args.length === 2) {
      const range = tuples.get(args[1]);
      return range && range.length === 2 ? this.guardBinaryPart(args[0], range[0], range[1]) : null;
    }
    return this.guardBinaryPart(args[0], args[1], args[2]);
  }

  guardBinaryPart(value, position, length) {
    const valueType = termType(value);
    const positionType = termType(position);
    const lengthType = termType(length);
    if (valueType !== 'bitstring' || positionType !== 'integer' || lengthType !== 'integer') return null;
    const [bytes, bitLength] = bitstrings.get(value);
    if (bitLength % 8 !== 0) return null;
    const end = position + length;
    const size = BigInt(bytes.length);
    if (position < 0n || position > size || end < 0n || end > size) return null;
    const start = length < 0n ? end : position;
    const stop = length < 0n ? position : end;
    const copy = bytes.slice(Number(start), Number(stop));
    return Object.freeze([BITSTRING, [copy, copy.length * 8]]);
  }

  read(registers, index) {
    if (!(index in registers)) throw new Error(`uninitialized x register ${index}`);
    return registers[index];
  }

  readF(registers, index) {
    if (!(index in registers)) throw new Error(`uninitialized floating-point register ${index}`);
    return registers[index];
  }

  args(registers, arity) {
    return Array.from({length: arity}, (_, index) => this.read(registers, index));
  }

  readY(stack, index) {
    if (!stack || index >= stack.length || !(index in stack)) {
      throw new Error(`uninitialized y register ${index}`);
    }
    return stack[index];
  }

  writeY(stack, index, value) {
    if (!stack || index >= stack.length) throw new Error(`invalid y register ${index}`);
    stack[index] = value;
  }

  allocate(stack, size) {
    if (stack !== null) throw new Error('stack frame already allocated');
    return new Array(size);
  }

  deallocate(stack, size) {
    if (!stack || stack.length !== size) throw new Error('invalid stack deallocation');
    return null;
  }

  initYregs(stack, indexes) {
    if (!stack || !Array.isArray(indexes) || indexes.length === 0 ||
        indexes.some((index, i) => !Number.isInteger(index) || index < 0 ||
          index >= stack.length || (i > 0 && index <= indexes[i - 1]))) {
      throw new Error('invalid y register initialization');
    }
    for (const index of indexes) stack[index] = nil;
  }

  trim(stack, count, remaining) {
    if (!stack || !Number.isInteger(count) || count < 0 ||
        !Number.isInteger(remaining) || remaining < 0 ||
        count + remaining !== stack.length) {
      throw new Error('invalid stack trim');
    }
    return stack.slice(count);
  }

  guardArithmetic(op, left, right) {
    const unary = ['neg', 'abs', 'trunc', 'round', 'floor', 'ceil', 'float', 'bnot'].includes(op);
    if ((!unary && !['+', '-', '*', '/', 'band', 'bor', 'bxor', 'div', 'rem'].includes(op)) ||
        unary !== (right === undefined)) {
      throw new Error(`invalid guard arithmetic operation: ${op}`);
    }
    const leftType = termType(left);
    const rightType = unary ? undefined : termType(right);
    if (['band', 'bor', 'bxor', 'bnot', 'div', 'rem'].includes(op)) {
      if (leftType !== 'integer' || (!unary && rightType !== 'integer')) return null;
      switch (op) {
        case 'band': return left & right;
        case 'bor': return left | right;
        case 'bxor': return left ^ right;
        case 'bnot': return ~left;
        case 'div': return right === 0n ? null : left / right;
        case 'rem': return right === 0n ? null : left % right;
      }
    }
    if ((leftType !== 'integer' && leftType !== 'float') ||
        (rightType !== undefined && rightType !== 'integer' && rightType !== 'float')) return null;

    if (op === 'float') {
      if (leftType === 'float') return left;
      const value = Number(left);
      return Number.isFinite(value) ? this.float(value) : null;
    }

    if (op !== '/' && leftType === 'integer' && (unary || rightType === 'integer')) {
      switch (op) {
        case 'neg': return -left;
        case 'abs': return left < 0n ? -left : left;
        case 'trunc':
        case 'round':
        case 'floor':
        case 'ceil': return left;
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
      }
    }

    const a = leftType === 'integer' ? Number(left) : floats.get(left);
    const b = rightType === 'integer' ? Number(right) : floats.get(right);
    if (!Number.isFinite(a) || (!unary && !Number.isFinite(b)) ||
        (op === '/' && b === 0)) return null;
    if (op === 'trunc') return BigInt(Math.trunc(a));
    if (op === 'floor') return BigInt(Math.floor(a));
    if (op === 'ceil') return BigInt(Math.ceil(a));
    if (op === 'round') {
      const truncated = Math.trunc(a);
      const integer = BigInt(truncated);
      return Math.abs(a - truncated) >= 0.5 ? integer + (a < 0 ? -1n : 1n) : integer;
    }
    let result;
    switch (op) {
      case 'neg': result = -a; break;
      case 'abs': result = Math.abs(a); break;
      case '+': result = a + b; break;
      case '-': result = a - b; break;
      case '*': result = a * b; break;
      case '/': result = a / b; break;
    }
    return Number.isFinite(result) ? this.float(result) : null;
  }

  equalExact(left, right) {
    const pending = [[left, right]];
    while (pending.length) {
      const [a, b] = pending.pop();
      const type = termType(a);
      if (type !== termType(b)) return false;
      if (a === b) continue;
      if (type === 'float') {
        if (!Object.is(floats.get(a), floats.get(b))) return false;
      } else if (type === 'cons') {
        const [ah, at] = consValue(a);
        const [bh, bt] = consValue(b);
        pending.push([at, bt], [ah, bh]);
      } else if (type === 'map') {
        const mapEntries = maps.get(a);
        const otherEntries = maps.get(b);
        if (mapEntries.length !== otherEntries.length) return false;
        for (const [key, value] of mapEntries) {
          const found = otherEntries.find(([candidate]) => this.equalExact(key, candidate));
          if (!found || !this.equalExact(value, found[1])) return false;
        }
      } else if (type === 'tuple') {
        const elements = tuples.get(a);
        const otherElements = tuples.get(b);
        if (elements.length !== otherElements.length) return false;
        for (let i = elements.length - 1; i >= 0; i--) {
          pending.push([elements[i], otherElements[i]]);
        }
      } else if (type === 'fun') {
        if (funs.get(a).id !== funs.get(b).id) return false;
      } else if (type === 'bitstring') {
        if (compareBitstrings(a, b) !== 0) return false;
      } else {
        return false;
      }
    }
    return true;
  }

  equalNumeric(left, right) {
    return this.compare(left, right) === 0;
  }

  compare(left, right) {
    const rank = {integer: 0, float: 0, atom: 1, reference: 2, host_handle: 3, pid: 4,
      tuple: 5, map: 6, fun: 7, nil: 8, cons: 9, bitstring: 10};
    const pending = [[left, right]];
    while (pending.length) {
      const [a, b] = pending.pop();
      const aType = termType(a);
      const bType = termType(b);
      if (rank[aType] !== rank[bType]) return rank[aType] < rank[bType] ? -1 : 1;
      if (aType === 'integer' || aType === 'float') {
        const x = aType === 'float' ? floats.get(a) : a;
        const y = bType === 'float' ? floats.get(b) : b;
        // BigInt/Number relational comparison does not round the BigInt to Number.
        if (x < y) return -1;
        if (x > y) return 1;
      } else if (aType === 'host_handle') {
        const x = hostHandles.get(a).id;
        const y = hostHandles.get(b).id;
        if (x !== y) return x < y ? -1 : 1;
      } else if (aType === 'pid') {
        const x = pids.get(a);
        const y = pids.get(b);
        if (x !== y) return x < y ? -1 : 1;
      } else if (aType === 'reference') {
        const x = references.get(a);
        const y = references.get(b);
        if (x !== y) return x < y ? -1 : 1;
      } else if (aType === 'fun') {
        const x = funs.get(a);
        const y = funs.get(b);
        if (x.id !== y.id) return x.id < y.id ? -1 : 1;
      } else if (aType === 'atom') {
        const leftChars = Symbol.keyFor(a)[Symbol.iterator]();
        const rightChars = Symbol.keyFor(b)[Symbol.iterator]();
        while (true) {
          const x = leftChars.next();
          const y = rightChars.next();
          if (x.done || y.done) {
            if (x.done !== y.done) return x.done ? -1 : 1;
            break;
          }
          const difference = x.value.codePointAt(0) - y.value.codePointAt(0);
          if (difference !== 0) return difference < 0 ? -1 : 1;
        }
      } else if (aType === 'cons' && a !== b) {
        const [ah, at] = consValue(a);
        const [bh, bt] = consValue(b);
        pending.push([at, bt], [ah, bh]);
      } else if (aType === 'map' && a !== b) {
        const x = maps.get(a);
        const y = maps.get(b);
        if (x.length !== y.length) return x.length < y.length ? -1 : 1;
        const xKeys = x.map(([key]) => key).sort((left, right) => this.compare(left, right));
        const yKeys = y.map(([key]) => key).sort((left, right) => this.compare(left, right));
        for (let i = 0; i < xKeys.length; i++) {
          const keyOrder = this.compare(xKeys[i], yKeys[i]);
          if (keyOrder !== 0) return keyOrder;
        }
        for (let i = 0; i < xKeys.length; i++) {
          const left = x.find(([key]) => this.equalExact(key, xKeys[i]))[1];
          const right = y.find(([key]) => this.equalExact(key, yKeys[i]))[1];
          const valueOrder = this.compare(left, right);
          if (valueOrder !== 0) return valueOrder;
        }
      } else if (aType === 'tuple' && a !== b) {
        const x = tuples.get(a);
        const y = tuples.get(b);
        if (x.length !== y.length) return x.length < y.length ? -1 : 1;
        for (let i = x.length - 1; i >= 0; i--) pending.push([x[i], y[i]]);
      } else if (aType === 'bitstring' && a !== b) {
        const order = compareBitstrings(a, b);
        if (order !== 0) return order;
      }
    }
    return 0;
  }

  isType(type, value) {
    const actual = termType(value);
    switch (type) {
      case 'is_integer':
        return actual === 'integer';
      case 'is_number': return actual === 'integer' || actual === 'float';
      case 'is_atom': return actual === 'atom';
      case 'is_boolean':
        return actual === 'atom' && (value === this.atom('true') || value === this.atom('false'));
      case 'is_float': return actual === 'float';
      case 'is_nil': return actual === 'nil';
      case 'is_list': return actual === 'nil' || actual === 'cons';
      case 'is_nonempty_list': return actual === 'cons';
      case 'is_tuple': return actual === 'tuple';
      case 'is_pid': return actual === 'pid';
      case 'is_reference': return actual === 'reference';
      case 'is_function': return actual === 'fun';
      case 'is_fun': return actual === 'fun';
      case 'is_map': return actual === 'map';
      case 'is_binary':
        return actual === 'bitstring' && bitstrings.get(value)[1] % 8 === 0;
      case 'is_bitstr':
      case 'is_bitstring': return actual === 'bitstring';
      default: throw new Error(`unsupported type test: ${type}`);
    }
  }

  registerModule(version, name, functions, {onLoad} = {}) {
    if (version !== 26) {
      throw new Error(`unsupported runtime ABI ${version}`);
    }
    if (this.modules.has(name)) throw new Error(`module already registered: ${name}`);
    const table = new Map();
    for (const fn of functions) {
      const key = JSON.stringify([fn.name, fn.arity]);
      if (table.has(key)) throw new Error(`duplicate function: ${name}:${fn.name}/${fn.arity}`);
      table.set(key, fn);
    }
    for (const arity of [0, 1]) {
      const key = JSON.stringify(['module_info', arity]);
      if (!table.has(key)) {
        table.set(key, {
          name: 'module_info', arity, exported: true,
          run: (rt, args) => ({type: 'return', value: rt.#moduleInfo(name, arity, args)}),
        });
      }
    }
    if (onLoad !== undefined && (typeof onLoad !== 'string' || !table.has(JSON.stringify([onLoad, 0])))) {
      throw new TypeError('onLoad must name a zero-arity function in the module');
    }
    this.modules.set(name, table);
    if (onLoad !== undefined) this.#onLoads.set(name, onLoad);
  }

  loadModule(name) {
    if (typeof name !== 'string' || !name) throw new TypeError('module name must be a nonempty string');
    if (this.#moduleLoads.has(name)) return this.#moduleLoads.get(name);
    if (this.modules.has(name) && !this.#onLoads.has(name)) return Promise.resolve();
    const loading = Promise.resolve().then(async () => {
      try {
        if (!this.modules.has(name)) {
          const source = await import(new URL(`${encodeURIComponent(name)}.mjs`, this.#moduleBaseURL).href);
          if (typeof source.register !== 'function') throw new TypeError(`module ${name} has no register function`);
          await source.register(this);
          if (!this.modules.has(name)) throw new Error(`module ${name} did not register itself`);
        }
        const onLoad = this.#onLoads.get(name);
        if (onLoad !== undefined) {
          const handle = this.spawnProcess(name, onLoad, []);
          const process = this.#processes.get(handle);
          process.external = false;
          process.initializingModule = name;
          const result = await handle.result;
          if (result !== this.atom('ok')) {
            const detail = tuples.get(tuples.get(result)?.[1]);
            const message = detail?.[0] === this.atom('load_failed') && bitstrings.has(detail[1])
              ? `: ${new TextDecoder().decode(this.bitstringBytes(detail[1]))}` : '';
            throw new Error(`on_load failed for module ${name}${message}`);
          }
          this.#onLoads.delete(name);
        }
      } catch (error) {
        this.modules.delete(name);
        this.#onLoads.delete(name);
        for (const key of this.#nifLoads.keys()) {
          if (JSON.parse(key)[0] === name) this.#nifLoads.delete(key);
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`cannot load module ${name}: ${message}`, {cause: error});
      } finally {
        this.#moduleLoads.delete(name);
        this.#moduleWaits.delete(name);
      }
    });
    this.#moduleLoads.set(name, loading);
    return loading;
  }

  invokeAsync(module, name, args) {
    return this.spawnProcess(module, name, args).result;
  }

  #loadDependency(process, module) {
    const parent = process.initializingModule;
    if (parent !== undefined) {
      for (let dependency = module; dependency !== undefined; dependency = this.#moduleWaits.get(dependency)) {
        if (dependency === parent) throw new Error(`circular on_load dependency: ${parent} -> ${module}`);
      }
      this.#moduleWaits.set(parent, module);
    }
    return this.loadModule(module).finally(() => {
      if (parent !== undefined) this.#moduleWaits.delete(parent);
    });
  }

  #nifName(term) {
    const points = [];
    while (isCons(term)) {
      const [point, tail] = consValue(term);
      if (typeof point !== 'bigint' || point < 0n || point > 0x10ffffn ||
          point >= 0xd800n && point <= 0xdfffn) this.raiseError(this.atom('badarg'));
      points.push(String.fromCodePoint(Number(point)));
      term = tail;
    }
    if (term !== nil || points.length === 0) this.raiseError(this.atom('badarg'));
    const name = points.join('');
    if (name.includes('\0')) this.raiseError(this.atom('badarg'));
    return name;
  }

  #loadNif(module, name, info) {
    const key = JSON.stringify([module, name]);
    if (this.#nifLoads.has(key)) return this.#nifLoads.get(key);
    const loading = Promise.resolve().then(async () => {
      const table = this.modules.get(module);
      if (!table) throw new Error('load_nif requires a calling Erlang module');
      const path = name.split('/').map(encodeURIComponent).join('/');
      const source = await import(new URL(`${path}.nif.mjs`, this.#moduleBaseURL).href);
      if (typeof source.nif !== 'function') throw new TypeError(`NIF ${name} has no nif function`);
      const functions = await source.nif(this, info);
      if (!Array.isArray(functions)) throw new TypeError('nif must return an array of functions');
      const replacements = new Map();
      for (const fn of functions) {
        if (!fn || typeof fn.name !== 'string' || !Number.isSafeInteger(fn.arity) ||
            fn.arity < 0 || typeof fn.run !== 'function') throw new TypeError('invalid NIF function');
        const fnKey = JSON.stringify([fn.name, fn.arity]);
        const original = table.get(fnKey);
        if (!original) throw new Error(`NIF target does not exist: ${module}:${fn.name}/${fn.arity}`);
        if (replacements.has(fnKey)) throw new Error(`duplicate NIF function: ${fn.name}/${fn.arity}`);
        replacements.set(fnKey, {...original, run: fn.run});
      }
      for (const [fnKey, fn] of replacements) table.set(fnKey, fn);
      return this.atom('ok');
    }).catch(error => {
      this.#nifLoads.delete(key);
      const bytes = new TextEncoder().encode(error instanceof Error ? error.message : String(error));
      return this.tuple([this.atom('error'), this.tuple([
        this.atom('load_failed'), this.bitstring(bytes, bytes.length * 8),
      ])]);
    });
    this.#nifLoads.set(key, loading);
    return loading;
  }

  #suspendForLoad(process, promise, resume) {
    if (!process.scheduled) throw new Error('synchronous invocation cannot load code; use invokeAsync or loadModule');
    promise.then(value => {
      if (!this.#livePids.has(process.pid)) return;
      if (resume) process.resumedAction = {type: 'return', value};
      process.status = 'runnable';
      this.#enqueue(process);
    }, error => {
      if (!this.#livePids.has(process.pid)) return;
      process.startError = error;
      process.status = 'runnable';
      this.#enqueue(process);
    });
    return {done: false, loading: true};
  }

  #moduleInfo(moduleName, arity, args) {
    const table = this.modules.get(moduleName);
    if (!table) this.raiseError(this.atom('badarg'));
    const exports = [...table.values()]
      .filter(fn => fn.exported)
      .sort((left, right) => this.compare(this.atom(left.name), this.atom(right.name)) ||
        left.arity - right.arity)
      .map(fn => this.tuple([this.atom(fn.name), BigInt(fn.arity)]));
    let result = this.nil();
    for (let i = exports.length - 1; i >= 0; i--) result = this.cons(exports[i], result);
    if (arity === 1) {
      const key = args[0];
      if (!isAtom(key)) this.raiseError(this.atom('badarg'));
      if (key === this.atom('module')) return this.atom(moduleName);
      if (key === this.atom('exports')) return result;
      this.raiseError(this.atom('badarg'));
    }
    return this.cons(
      this.tuple([this.atom('module'), this.atom(moduleName)]),
      this.cons(this.tuple([this.atom('exports'), result]), this.nil()),
    );
  }

  invoke(module, name, args) {
    const process = this.#newProcess(module, name, args);
    process.status = 'running';
    let failed = false;
    let failure;
    try {
      const result = this.#runProcess(process, Infinity);
      if (result.waiting) throw new Error('synchronous invocation cannot wait for a message');
      if (!result.done) throw new Error('unexpected yield in synchronous invocation');
      return result.value;
    } catch (error) {
      failed = true;
      failure = error;
      throw error;
    } finally {
      try {
        this.#finishProcess(process, 'completed');
      } catch (error) {
        if (failed) throw new AggregateError([failure, error], 'process and timer cleanup failed');
        throw error;
      }
    }
  }

  isProcessAlive(pid) {
    if (!isTerm(pid)) throw new TypeError('expected a supported Erlang term');
    if (!this.#localPids.has(pid)) this.raiseError(this.atom('badarg'));
    return this.#livePids.has(pid);
  }

  processInfo(pid, itemSpec) {
    if (!isTerm(pid) || !isTerm(itemSpec)) throw new TypeError('expected supported Erlang terms');
    if (!this.#localPids.has(pid)) this.raiseError(this.atom('badarg'));
    const list = itemSpec === nil || isCons(itemSpec);
    const items = [];
    if (list) {
      let cursor = itemSpec;
      while (isCons(cursor)) {
        const [item, tail] = consValue(cursor);
        items.push(item);
        cursor = tail;
      }
      if (cursor !== nil) this.raiseError(this.atom('badarg'));
    } else {
      items.push(itemSpec);
    }
    let unsupported;
    for (const item of items) {
      const pair = tuples.get(item);
      if (pair?.length === 2 && pair[0] === this.atom('dictionary')) continue;
      if (!isAtom(item) || !processInfoItems.has(Symbol.keyFor(item))) this.raiseError(this.atom('badarg'));
      if (!supportedProcessInfoItems.has(Symbol.keyFor(item))) unsupported ??= Symbol.keyFor(item);
    }
    const process = this.#pidProcesses.get(pid);
    if (!process || process.status === 'completed' || process.status === 'failed') return this.atom('undefined');
    if (unsupported !== undefined) throw new Error(`unsupported process_info item: ${unsupported}`);
    const info = item => {
      const pair = tuples.get(item);
      if (pair) return this.tuple([item, this.#processDictionary(process, 'get', [pair[1]])]);
      switch (Symbol.keyFor(item)) {
        case 'registered_name':
          if (process.registeredName === undefined && !list) return nil;
          return this.tuple([item, process.registeredName ?? nil]);
        case 'status': return this.tuple([item, this.atom(process.status)]);
        case 'message_queue_len': return this.tuple([item, BigInt(process.mailbox.length)]);
        case 'messages': {
          let messages = nil;
          for (let i = process.mailbox.length - 1; i >= 0; i--) {
            messages = this.cons(process.mailbox[i], messages);
          }
          return this.tuple([item, messages]);
        }
        case 'dictionary': return this.tuple([item, this.#processDictionary(process, 'get', [])]);
        default: throw new Error('invalid process_info item');
      }
    };
    if (!list) return info(items[0]);
    let result = nil;
    for (let i = items.length - 1; i >= 0; i--) result = this.cons(info(items[i]), result);
    return result;
  }

  spawnProcess(module, name, args) {
    const process = this.#newProcess(module, name, args);
    process.scheduled = true;
    const result = new Promise((resolve, reject) => {
      process.resolve = resolve;
      process.reject = reject;
    });
    const handle = Object.freeze({pid: process.pid, result});
    this.#processes.set(handle, process);
    this.#pidHandles.set(process.pid, handle);
    this.#enqueue(process);
    return handle;
  }

  onProcessExit(pid, cleanup) {
    if (!isTerm(pid) || !this.#localPids.has(pid)) this.raiseError(this.atom('badarg'));
    const process = this.#pidProcesses.get(pid);
    if (!process || !process.scheduled || !this.#livePids.has(pid) ||
        typeof cleanup !== 'function') this.raiseError(this.atom('badarg'));
    if (!process.cleanups) process.cleanups = new Set();
    process.cleanups.add(cleanup);
    let detached = false;
    return () => {
      if (detached) return;
      detached = true;
      process.cleanups?.delete(cleanup);
    };
  }

  setTrapExit(pid, trap) {
    if (!isTerm(pid) || !this.#localPids.has(pid)) this.raiseError(this.atom('badarg'));
    const process = this.#pidProcesses.get(pid);
    if (!process) this.raiseError(this.atom('noproc'));
    if (!isAtom(trap) || trap !== this.atom('true') && trap !== this.atom('false')) this.raiseError(this.atom('badarg'));
    const previous = process.trapExit ? this.atom('true') : this.atom('false');
    process.trapExit = trap === this.atom('true');
    return previous;
  }

  linkProcesses(leftPid, rightPid) {
    const left = this.#pidProcesses.get(leftPid);
    const right = this.#pidProcesses.get(rightPid);
    if (!left || !right) this.raiseError(this.atom('noproc'));
    left.links.add(rightPid);
    right.links.add(leftPid);
    return this.atom('true');
  }

  monitorProcess(monitorPid, targetPid) {
    const monitor = this.#pidProcesses.get(monitorPid);
    if (!monitor) this.raiseError(this.atom('badarg'));
    return this.#monitorProcess(monitor, this.atom('process'), targetPid);
  }

  sendExitSignal(fromPid, toPid, reason) {
    if (!isTerm(reason)) throw new TypeError('exit reason must be a supported Erlang term');
    const from = this.#pidProcesses.get(fromPid);
    const to = this.#pidProcesses.get(toPid);
    if (!from || !to) this.raiseError(this.atom('noproc'));
    this.#deliverExit(to, fromPid, reason);
  }

  terminateProcess(pid, reason) {
    if (!isTerm(reason)) throw new TypeError('exit reason must be a supported Erlang term');
    const process = this.#pidProcesses.get(pid);
    if (!process) this.raiseError(this.atom('noproc'));
    this.#terminateProcess(process, reason);
  }

  demonitorProcess(monitorPid, reference, options = false) {
    const monitor = this.#pidProcesses.get(monitorPid);
    if (!monitor) this.raiseError(this.atom('badarg'));
    return this.#demonitorProcess(monitor, reference, options === true ? this.cons(this.atom('flush'), nil) : nil);
  }

  processHandle(pid) {
    const handle = this.#pidHandles.get(pid);
    if (!handle) throw new TypeError('expected a scheduled process PID from this runtime');
    return handle;
  }

  registerProcess(name, pid) {
    const process = this.#pidProcesses.get(pid);
    if (!isAtom(name) || name === this.atom('undefined') || !process ||
        process.status === 'completed' || process.status === 'failed' ||
        this.#registered.has(name) || process.registeredName !== undefined) {
      this.raiseError(this.atom('badarg'));
    }
    this.#registered.set(name, process);
    process.registeredName = name;
    return this.atom('true');
  }

  unregisterProcess(name) {
    const process = this.#registered.get(name);
    if (!isAtom(name) || !process) this.raiseError(this.atom('badarg'));
    this.#registered.delete(name);
    process.registeredName = undefined;
    return this.atom('true');
  }

  whereisProcess(name) {
    if (!isAtom(name)) this.raiseError(this.atom('badarg'));
    return this.#registered.get(name)?.pid ?? this.atom('undefined');
  }

  registeredProcesses() {
    let names = nil;
    for (const name of this.#registered.keys()) names = this.cons(name, names);
    return names;
  }

  getProcessDictionary(pid, key) {
    const process = this.#pidProcesses.get(pid);
    if (!process || process.status !== 'running') throw new Error('process dictionary requires the running process');
    return this.#processDictionary(process, 'get', [key]);
  }

  #processDictionary(process, name, args) {
    if (!Array.isArray(args) || args.some(value => !isTerm(value)) ||
        !((name === 'get' || name === 'get_keys' || name === 'erase') && args.length <= 1 ||
          name === 'put' && args.length === 2)) {
      throw new TypeError('invalid process dictionary operation');
    }
    const entries = process.dictionary;
    if (name === 'get_keys') {
      let keys = nil;
      for (const [key, value] of entries) {
        if (args.length === 0 || this.equalExact(value, args[0])) keys = this.cons(key, keys);
      }
      return keys;
    }
    if (args.length === 0) {
      let pairs = nil;
      for (const [key, value] of entries) pairs = this.cons(this.tuple([key, value]), pairs);
      if (name === 'erase') process.dictionary = [];
      return pairs;
    }
    const index = entries.findIndex(([key]) => this.equalExact(key, args[0]));
    const previous = index < 0 ? this.atom('undefined') : entries[index][1];
    if (name === 'put') {
      if (index < 0) entries.push([args[0], args[1]]);
      else entries[index][1] = args[1];
    } else if (name === 'erase' && index >= 0) {
      entries.splice(index, 1);
    }
    return previous;
  }

  sendPidMessage(destination, message) {
    if (!isTerm(destination) || !isTerm(message)) throw new TypeError('expected supported Erlang terms');
    if (this.#localPids.has(destination)) {
      const process = this.#pidProcesses.get(destination);
      if (process) this.#deliverMessage(process, message);
      return message;
    }
    if (isAtom(destination)) {
      const process = this.#registered.get(destination);
      if (!process) this.raiseError(this.atom('badarg'));
      this.#deliverMessage(process, message);
      return message;
    }
    if (pids.has(destination)) throw new Error('sending to a non-local PID is unsupported');
    const address = tuples.get(destination);
    if (address?.length === 2 && isAtom(address[0]) && isAtom(address[1])) {
      throw new Error('sending to a registered name on a node is unsupported');
    }
    this.raiseError(this.atom('badarg'));
  }

  startTimer(kind, delay, destination, message, absolute = false) {
    if (typeof delay !== 'bigint' || (!absolute && delay < 0n)) this.raiseError(this.atom('badarg'));
    if (!absolute && delay > 4294967295n) throw new Error('timer delays above 4294967295 ms are unsupported');
    if (!isTerm(destination) || !isTerm(message)) throw new TypeError('expected supported Erlang terms');
    if (!this.#localPids.has(destination) && !isAtom(destination)) this.raiseError(this.atom('badarg'));
    let deadline;
    if (absolute) {
      if (delay < -9007199254740991n || delay > 9007199254740991n) {
        throw new RangeError('absolute timer deadline exceeds supported clock precision');
      }
      const now = this.#clockNow();
      const milliseconds = Math.floor(now);
      if (!Number.isSafeInteger(milliseconds)) throw new RangeError('clock exceeds supported millisecond precision');
      if (delay - BigInt(milliseconds) > 4294967295n) {
        throw new RangeError('absolute timer deadline is more than 4294967295 ms ahead');
      }
      deadline = Number(delay);
    }
    const ref = this.makeRef();
    const process = this.#pidProcesses.get(destination);
    if (!process && !isAtom(destination)) return ref;
    const timer = {ref, process, destination, message, kind,
      deadline: absolute ? deadline : this.#clockNow() + Number(delay)};
    this.#timers.set(ref, timer);
    if (process) {
      process.bifTimers ??= new Set();
      process.bifTimers.add(timer);
    }
    try {
      this.#scheduleBifTimer(timer);
    } catch (error) {
      this.#forgetBifTimer(timer);
      throw error;
    }
    return ref;
  }

  startTimerWithOptions(kind, delay, destination, message, options) {
    const {abs} = this.#parseTimerOptions(options, {abs: false});
    return this.startTimer(kind, delay, destination, message, abs);
  }

  accessTimer(ref, cancel, info = true) {
    if (!references.has(ref)) this.raiseError(this.atom('badarg'));
    const timer = this.#timers.get(ref);
    const remaining = timer && info
      ? BigInt(Math.max(0, Math.ceil(timer.deadline - this.#clockNow())))
      : this.atom('false');
    if (timer && cancel) {
      this.#forgetBifTimer(timer);
      this.#clock.clearTimeout(timer.handle);
    }
    return info ? remaining : this.atom('ok');
  }

  accessTimerWithOptions(ref, options, cancel, pid) {
    const {async, info = true} = this.#parseTimerOptions(options,
      cancel ? {async: false, info: true} : {async: false});
    const result = this.accessTimer(ref, cancel, info);
    if (!async) return result;
    if (info) {
      const process = this.#pidProcesses.get(pid);
      if (!process || process.status !== 'running') throw new Error('timer access requires the running process');
      this.#deliverMessage(process, this.tuple([
        this.atom(cancel ? 'cancel_timer' : 'read_timer'), ref, result,
      ]));
    }
    return this.atom('ok');
  }

  #parseTimerOptions(options, defaults) {
    const result = {...defaults};
    while (isCons(options)) {
      const [option, tail] = consValue(options);
      const pair = tuples.get(option);
      if (!pair || pair.length !== 2 || !isAtom(pair[0]) ||
          !Object.hasOwn(result, Symbol.keyFor(pair[0])) ||
          (pair[1] !== this.atom('true') && pair[1] !== this.atom('false'))) {
        this.raiseError(this.atom('badarg'));
      }
      result[Symbol.keyFor(pair[0])] = pair[1] === this.atom('true');
      options = tail;
    }
    if (options !== nil) this.raiseError(this.atom('badarg'));
    return result;
  }

  #forgetBifTimer(timer) {
    this.#timers.delete(timer.ref);
    timer.process?.bifTimers.delete(timer);
  }

  #scheduleBifTimer(timer) {
    const delay = Math.min(2147483647, Math.max(0, Math.ceil(timer.deadline - this.#clockNow())));
    const handle = this.#clock.setTimeout(() => {
      if (this.#timers.get(timer.ref) !== timer) return;
      try {
        if (this.#clockNow() < timer.deadline) {
          this.#scheduleBifTimer(timer);
          return;
        }
        this.#forgetBifTimer(timer);
        const message = timer.kind === 'start_timer'
          ? this.tuple([this.atom('timeout'), timer.ref, timer.message]) : timer.message;
        const process = timer.process ?? this.#registered.get(timer.destination);
        if (process) this.#deliverMessage(process, message);
      } catch (error) {
        this.#forgetBifTimer(timer);
        throw error;
      }
    }, delay);
    if (handle === undefined || handle === null) throw new TypeError('clock.setTimeout must return a handle');
    timer.handle = handle;
  }

  sendMessage(handle, message) {
    const process = this.#getProcess(handle);
    if (!isTerm(message)) throw new TypeError('message must be a supported Erlang term');
    if (process.status === 'completed' || process.status === 'failed') {
      throw new Error('cannot send a message to a terminated process');
    }
    this.#deliverMessage(process, message);
  }

  #deliverMessage(process, message) {
    process.mailbox.push(message);
    if (process.status === 'waiting') {
      this.#waiting.delete(process);
      process.status = 'runnable';
      this.#enqueue(process);
    }
  }

  processMailbox(handle) {
    return this.#getProcess(handle).mailbox.slice();
  }

  receiveMessage(pid) {
    const process = this.#receiveProcess(pid);
    process.receiveChecked = true;
    return process.mailbox[process.receiveIndex] ?? null;
  }

  advanceMessage(pid) {
    const process = this.#receiveProcess(pid);
    if (process.receiveIndex >= process.mailbox.length) throw new Error('no current mailbox message');
    process.receiveIndex++;
  }

  removeMessage(pid) {
    const process = this.#receiveProcess(pid);
    if (process.receiveIndex >= process.mailbox.length) throw new Error('no current mailbox message');
    process.mailbox.splice(process.receiveIndex, 1);
    process.receiveIndex = 0;
    process.receiveChecked = false;
    this.#clearReceiveTimer(process);
  }

  timeoutMessage(pid) {
    const process = this.#receiveProcess(pid);
    process.receiveIndex = 0;
    process.receiveChecked = false;
    this.#clearReceiveTimer(process);
  }

  #receiveProcess(pid) {
    const process = this.#pidProcesses.get(pid);
    if (!process || process.status !== 'running') throw new Error('receive requires the running process');
    return process;
  }

  #getProcess(handle) {
    const process = this.#processes.get(handle);
    if (!process) throw new TypeError('expected a process from this runtime');
    return process;
  }

  #newProcess(module, name, args) {
    if (!Array.isArray(args) || args.some(value => !isTerm(value))) {
      throw new TypeError('arguments must be supported Erlang terms');
    }
    const pid = Object.freeze([PID, nextPidId++]);
    this.#localPids.add(pid);
    this.#livePids.add(pid);
    const process = {
      pid, module, name, args: args.slice(), external: true, fn: undefined, state: undefined,
      continuations: [], mailbox: [], dictionary: [], receiveIndex: 0, receiveChecked: false, status: 'runnable',
      trapExit: false, links: new Set(), monitors: new Map(), monitoredBy: new Map(),
    };
    this.#pidProcesses.set(pid, process);
    return process;
  }

  #spawnErlang(process, action) {
    let module, name, list;
    if (action.args) {
      [module, name, list] = action.args;
    } else {
      if (!funs.has(action.fun) || this.funArity(action.fun) !== 0) this.raiseError(this.atom('badarg'));
      [module, name, list] = [this.atom('erlang'), this.atom('apply'), this.cons(action.fun, this.cons(nil, nil))];
    }
    if (!isAtom(module) || !isAtom(name)) this.raiseError(this.atom('badarg'));
    const args = [];
    while (isCons(list)) {
      const [head, tail] = consValue(list);
      args.push(head);
      list = tail;
    }
    if (list !== nil) this.raiseError(this.atom('badarg'));
    const handle = this.spawnProcess(Symbol.keyFor(module), Symbol.keyFor(name), args);
    const child = this.#processes.get(handle);
    if (args.length > 255) child.startError = new Error(`unsupported function arity: ${args.length}`);
    handle.result.catch(error => {
      if (!(error instanceof ErlangError && error.erlangClass === 'exit')) this.#onProcessError(handle.pid, error);
    });
    if (action.link) {
      process.links.add(child.pid);
      child.links.add(process.pid);
    }
    if (action.monitor) return this.tuple([child.pid, this.#monitorProcess(process, this.atom('process'), child.pid)]);
    return child.pid;
  }

  #enqueue(process) {
    this.#ready.push(process);
    this.#schedule();
  }

  #schedule() {
    while (this.#scheduled < this.#schedulerCount &&
           this.#scheduled < this.#ready.length - this.#readyHead) {
      this.#scheduled++;
      setTimeout(() => this.#runScheduled(), 0);
    }
  }

  #runScheduled() {
    this.#scheduled--;
    const process = this.#ready[this.#readyHead++];
    if (this.#readyHead === this.#ready.length) {
      this.#ready = [];
      this.#readyHead = 0;
    } else if (this.#readyHead >= 1024 && this.#readyHead * 2 >= this.#ready.length) {
      this.#ready = this.#ready.slice(this.#readyHead);
      this.#readyHead = 0;
    }
    // A process can be terminated by an exit signal while it waits in the run queue.
    if (process.status !== 'runnable') {
      this.#schedule();
      return;
    }
    process.status = 'running';
    try {
      const result = this.#runProcess(process, this.#reductionLimit);
      if (result.done) {
        const cleanupError = this.#exitProcess(process, this.atom('normal'));
        if (cleanupError) process.reject(cleanupError);
        else process.resolve(result.value);
      } else if (result.loading) {
        process.status = 'loading';
      } else if (result.waiting) {
        process.status = 'waiting';
        this.#waiting.add(process);
      } else {
        process.status = 'runnable';
        this.#enqueue(process);
      }
    } catch (error) {
      const cleanupError = this.#exitProcess(process, this.#exitReason(error));
      process.reject(cleanupError
        ? new AggregateError([error, cleanupError], 'process and timer cleanup failed')
        : error);
    }
    this.#schedule();
  }

  #exitReason(error) {
    if (error instanceof ProcessExit) return error.reason;
    if (!(error instanceof ErlangError)) return this.atom('undef');
    const stack = error.stack === nil || isCons(error.stack) ? error.stack : nil;
    switch (error.erlangClass) {
      case 'error': return this.tuple([error.reason, stack]);
      case 'throw': return this.tuple([this.tuple([this.atom('nocatch'), error.reason]), stack]);
      default: return error.reason;
    }
  }

  #stacktrace(process) {
    const frames = [];
    const frame = (module, name, arity) => {
      if (typeof module === 'string' && typeof name === 'string' && Number.isInteger(arity)) {
        frames.push(this.tuple([this.atom(module), this.atom(name), BigInt(arity), nil]));
      }
    };
    if (process.module !== 'erlang' || !['error', 'exit', 'throw', 'raise', 'nif_error'].includes(process.name)) {
      frame(process.module, process.name, process.fn?.arity ?? process.args?.length);
    } else if (process.tailCaller) {
      // A tail-called BIF raises on behalf of the function that called it.
      frame(process.tailCaller.module, process.tailCaller.name, process.tailCaller.arity);
    }
    for (let i = process.continuations.length - 1; i >= 0; i--) {
      const {module, name, fn} = process.continuations[i];
      frame(module, name, fn?.arity);
    }
    let stack = nil;
    for (let i = frames.length - 1; i >= 0; i--) stack = this.cons(frames[i], stack);
    return stack;
  }

  // Ends a process and propagates its exit reason to monitors and links; returns any cleanup error.
  #exitProcess(process, reason) {
    this.#waiting.delete(process);
    let cleanupError;
    try {
      this.#finishProcess(process, reason === this.atom('normal') ? 'completed' : 'failed');
    } catch (error) {
      cleanupError = error;
    }
    for (const [reference, targetPid] of process.monitors) {
      this.#pidProcesses.get(targetPid)?.monitoredBy.delete(reference);
    }
    process.monitors.clear();
    for (const [reference, monitorPid] of process.monitoredBy) {
      const watcher = this.#pidProcesses.get(monitorPid);
      if (!watcher) continue;
      watcher.monitors.delete(reference);
      const object = process.monitorNames?.get(reference) ?? process.pid;
      this.#deliverMessage(watcher, this.tuple([this.atom('DOWN'), reference, this.atom('process'), object, reason]));
    }
    process.monitoredBy.clear();
    process.monitorNames = undefined;
    const links = [...process.links];
    process.links.clear();
    for (const pid of links) {
      const target = this.#pidProcesses.get(pid);
      if (!target) continue;
      target.links.delete(process.pid);
      this.#deliverExit(target, process.pid, reason);
    }
    return cleanupError;
  }

  #processFlag(process, flag, value) {
    if (!isAtom(flag) || !isAtom(value) && typeof value !== 'boolean') this.raiseError(this.atom('badarg'));
    if (Symbol.keyFor(flag) !== 'trap_exit') this.raiseError(this.atom('badarg'));
    if (value !== this.atom('true') && value !== this.atom('false')) this.raiseError(this.atom('badarg'));
    const previous = process.trapExit ? this.atom('true') : this.atom('false');
    process.trapExit = value === this.atom('true');
    return previous;
  }

  #linkProcess(process, pid) {
    if (!this.#localPids.has(pid)) this.raiseError(this.atom('badarg'));
    if (pid === process.pid) return this.atom('true');
    const target = this.#livePids.has(pid) ? this.#pidProcesses.get(pid) : undefined;
    if (!target) {
      if (!process.trapExit) this.raiseError(this.atom('noproc'));
      this.#deliverMessage(process, this.tuple([this.atom('EXIT'), pid, this.atom('noproc')]));
      return this.atom('true');
    }
    process.links.add(pid);
    target.links.add(process.pid);
    return this.atom('true');
  }

  #unlinkProcess(process, pid) {
    if (!this.#localPids.has(pid)) this.raiseError(this.atom('badarg'));
    process.links.delete(pid);
    const target = this.#pidProcesses.get(pid);
    target?.links.delete(process.pid);
    return this.atom('true');
  }

  #monitorProcess(process, kind, target) {
    if (!isAtom(kind) || Symbol.keyFor(kind) !== 'process') this.raiseError(this.atom('badarg'));
    let targetProcess, object = target;
    if (isAtom(target)) {
      targetProcess = this.#registered.get(target);
      object = this.tuple([target, this.atom('nonode@nohost')]);
    } else if (this.#localPids.has(target)) {
      targetProcess = this.#pidProcesses.get(target);
    } else {
      this.raiseError(this.atom('badarg'));
    }
    const reference = this.makeRef();
    if (!targetProcess || !this.#livePids.has(targetProcess.pid)) {
      this.#deliverMessage(process, this.tuple([
        this.atom('DOWN'), reference, this.atom('process'), object, this.atom('noproc'),
      ]));
      return reference;
    }
    process.monitors.set(reference, targetProcess.pid);
    targetProcess.monitoredBy.set(reference, process.pid);
    if (isAtom(target)) (targetProcess.monitorNames ??= new Map()).set(reference, object);
    return reference;
  }

  #demonitorProcess(process, reference, options = nil) {
    let flush = false, info = false;
    while (isCons(options)) {
      const [option, tail] = consValue(options);
      if (option === this.atom('flush')) flush = true;
      else if (option === this.atom('info')) info = true;
      else this.raiseError(this.atom('badarg'));
      options = tail;
    }
    if (options !== nil || !references.has(reference)) this.raiseError(this.atom('badarg'));
    const targetPid = process.monitors.get(reference);
    if (targetPid !== undefined) {
      process.monitors.delete(reference);
      const target = this.#pidProcesses.get(targetPid);
      target?.monitoredBy.delete(reference);
      target?.monitorNames?.delete(reference);
    }
    if (flush) {
      const down = this.atom('DOWN');
      for (let i = process.mailbox.length - 1; i >= 0; i--) {
        const message = process.mailbox[i];
        if (this.isType('is_tuple', message) && this.tupleSize(message) === 5 &&
            this.tupleElement(message, 1) === down && this.tupleElement(message, 2) === reference) {
          process.mailbox.splice(i, 1);
          if (i < process.receiveIndex) process.receiveIndex--;
        }
      }
    }
    return this.atom(!info || targetPid !== undefined ? 'true' : 'false');
  }

  #exitSignal(process, pid, reason) {
    if (!this.#localPids.has(pid)) this.raiseError(this.atom('badarg'));
    const target = this.#pidProcesses.get(pid);
    if (!target || !this.#livePids.has(pid)) return this.atom('true');
    if (reason === this.atom('kill')) this.#terminateProcess(target, this.atom('killed'));
    else if (target === process && reason === this.atom('normal') && !process.trapExit) this.#terminateProcess(process, reason);
    else this.#deliverExit(target, process.pid, reason);
    return this.atom('true');
  }

  #deliverExit(process, fromPid, reason) {
    if (!this.#livePids.has(process.pid)) return;
    if (process.trapExit) {
      this.#deliverMessage(process, this.tuple([this.atom('EXIT'), fromPid, reason]));
    } else if (reason !== this.atom('normal')) {
      this.#terminateProcess(process, reason);
    }
  }

  #terminateProcess(process, reason) {
    if (!this.#livePids.has(process.pid)) return;
    if (process.status === 'running') {
      // The running process notices this after its current action; see #runProcess.
      process.pendingExit ??= reason;
      return;
    }
    const failure = new ProcessExit(reason);
    const cleanupError = this.#exitProcess(process, reason);
    process.reject?.(cleanupError ? new AggregateError([failure, cleanupError], 'process cleanup failed') : failure);
  }

  #finishProcess(process, status) {
    process.status = status;
    const errors = [];
    if (process.cleanups) {
      const cleanups = [...process.cleanups];
      process.cleanups.clear();
      for (const cleanup of cleanups) {
        try {
          cleanup();
        } catch (error) {
          errors.push(error);
        }
      }
    }
    if (process.registeredName !== undefined) {
      this.#registered.delete(process.registeredName);
      process.registeredName = undefined;
    }
    try {
      this.#clearReceiveTimer(process);
    } catch (error) {
      errors.push(error);
    }
    if (process.bifTimers) {
      for (const timer of process.bifTimers) {
        this.#forgetBifTimer(timer);
        try {
          this.#clock.clearTimeout(timer.handle);
        } catch (error) {
          errors.push(error);
        }
      }
    }
    this.#livePids.delete(process.pid);
    this.#pidProcesses.delete(process.pid);
    process.fn = undefined;
    process.state = undefined;
    process.args = [];
    process.continuations = [];
    process.dictionary = [];
    process.cleanups = undefined;
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'failed to clear process timers');
  }

  #clearReceiveTimer(process) {
    const timer = process.receiveTimer;
    process.receiveTimer = undefined;
    if (timer?.handle !== undefined) this.#clock.clearTimeout(timer.handle);
  }

  #clockNow() {
    const now = this.#clock.now();
    if (typeof now !== 'number' || !Number.isFinite(now)) throw new TypeError('clock.now must return a finite number');
    return now;
  }

  monotonicTime(unit) {
    let units;
    if (typeof unit === 'bigint' && unit > 0n) units = unit;
    else if (isAtom(unit)) {
      switch (Symbol.keyFor(unit)) {
        case 'second':
        case 'seconds': units = 1n; break;
        case 'millisecond':
        case 'milli_seconds': units = 1000n; break;
        case 'microsecond':
        case 'micro_seconds': units = 1000000n; break;
        case 'nanosecond':
        case 'nano_seconds':
        case 'native':
        case 'perf_counter': units = 1000000000n; break;
        default: this.raiseError(this.atom('badarg'));
      }
    } else this.raiseError(this.atom('badarg'));
    const now = this.#clockNow();
    const milliseconds = Math.floor(now);
    if (!Number.isSafeInteger(milliseconds)) throw new RangeError('clock exceeds supported millisecond precision');
    const whole = Math.trunc(now);
    const nanoseconds = BigInt(whole) * 1000000n + BigInt(Math.floor((now - whole) * 1000000));
    const scaled = nanoseconds * units;
    return scaled >= 0n ? scaled / 1000000000n : -((-scaled + 999999999n) / 1000000000n);
  }

  #scheduleReceiveTimer(process, timer) {
    const delay = Math.min(2147483647, Math.max(0, Math.ceil(timer.deadline - this.#clockNow())));
    const handle = this.#clock.setTimeout(() => {
      if (process.receiveTimer !== timer) return;
      timer.handle = undefined;
      try {
        if (this.#clockNow() < timer.deadline) {
          this.#scheduleReceiveTimer(process, timer);
          return;
        }
        timer.expired = true;
        if (process.status === 'waiting') process.state = {...process.state, pc: timer.timeoutPc};
      } catch (error) {
        process.startError = error;
      }
      if (process.status === 'waiting') {
        this.#waiting.delete(process);
        process.status = 'runnable';
        this.#enqueue(process);
      }
    }, delay);
    if (handle === undefined || handle === null) throw new TypeError('clock.setTimeout must return a handle');
    timer.handle = handle;
  }

  #prepareWait(process) {
    const pending = process.receiveChecked && process.receiveIndex < process.mailbox.length;
    process.receiveChecked = false;
    if (!pending) process.receiveIndex = process.mailbox.length;
    return pending;
  }

  #runProcess(process, limit) {
    const budget = {remaining: limit};
    while (true) {
      try {
        return this.#runFrames(process, budget);
      } catch (error) {
        if (!(error instanceof ErlangError) || error instanceof ProcessExit) throw error;
        if (error.stack === nil) error.stack = this.#stacktrace(process);
        const handler = process.exceptionHandlers?.pop();
        if (!handler) throw error;
        if (process.continuations.length > handler.depth) {
          const frame = process.continuations[handler.depth];
          process.fn = frame.fn;
          process.module = frame.module;
          process.name = frame.name;
          process.external = frame.external;
          process.continuations.length = handler.depth;
        }
        process.state = {pc: handler.pc, y: handler.y};
        process.args = [];
        process.resumedAction = undefined;
        process.pendingException = [this.atom(error.erlangClass), error.reason, error.stack];
      }
    }
  }

  #runFrames(process, budget) {
    if ('startError' in process) {
      const error = process.startError;
      delete process.startError;
      throw error;
    }
    while (budget.remaining > 0) {
      if (!process.fn) {
        if (!Array.isArray(process.args) || process.args.some(value => !isTerm(value))) {
          throw new TypeError('arguments must be supported Erlang terms');
        }
        const {external, module, name, args} = process;
        process.fn = external && module === 'erlang' ? callableBifs.get(JSON.stringify([name, args.length])) : undefined;
        if (!process.fn && module !== 'erlang' && process.initializingModule !== module &&
            (!this.modules.has(module) || this.#moduleLoads.has(module) || this.#onLoads.has(module))) {
          const diagnostic = `undefined or unsupported function: ${module}:${name}/${args.length}`;
          if (!process.scheduled) throw new Error(`${diagnostic}; use invokeAsync or loadModule to load code`);
          return this.#suspendForLoad(process, this.#loadDependency(process, module).catch(error => {
            throw new Error(`${diagnostic}; ${error.message}`, {cause: error});
          }), false);
        }
        if (!process.fn) process.fn = this.modules.get(module)?.get(JSON.stringify([name, args.length]));
        if (!process.fn || (external && !process.fn.exported)) {
          throw new Error(`undefined or unsupported function: ${module}:${name}/${args.length}`);
        }
      }
      const previous = budget.remaining;
      let action = process.resumedAction ?? process.fn.run(this, process.args.slice(), process.state, budget, process.pid);
      process.resumedAction = undefined;
      if (action.type === 'load_nif') action = {...action, name: this.#nifName(action.name)};
      if (budget.remaining === previous) budget.remaining--;
      if (action.type === 'load_nif') {
        if (!process.scheduled) throw new Error('synchronous invocation cannot load a NIF; use invokeAsync');
        return this.#suspendForLoad(process,
          this.#loadNif(process.callingModule, action.name, action.info), true);
      } else if (action.type === 'dictionary') {
        action = {type: 'return', value: this.#processDictionary(process, action.name, action.args)};
      } else if (action.type === 'spawn') {
        action = {type: 'return', value: this.#spawnErlang(process, action)};
      } else if (action.type === 'exit_signal') {
        action = {type: 'return', value: this.#exitSignal(process, action.pid, action.reason)};
      } else if (action.type === 'fun_call' || action.type === 'tail_fun') {
        const data = this.funValue(action.fun);
        const callArgs = this.funCallArgs(action.fun, action.args);
        if (action.type === 'fun_call') process.continuations.push({
          fn: process.fn, state: action.state, module: process.module, name: process.name, external: process.external,
        });
        process.tailCaller = action.type === 'tail_fun'
          ? {module: process.module, name: process.name, arity: process.fn?.arity} : undefined;
        if (process.module !== 'erlang') process.callingModule = process.module;
        process.module = data.module;
        process.name = data.name;
        process.args = callArgs;
        process.external = false;
        process.fn = undefined;
        process.state = undefined;
        continue;
      } else if (action.type === 'process_flag') {
        action = {type: 'return', value: this.#processFlag(process, action.flag, action.value)};
      } else if (action.type === 'link') {
        action = {type: 'return', value: this.#linkProcess(process, action.pid)};
      } else if (action.type === 'unlink') {
        action = {type: 'return', value: this.#unlinkProcess(process, action.pid)};
      } else if (action.type === 'monitor') {
        action = {type: 'return', value: this.#monitorProcess(process, action.kind, action.target)};
      } else if (action.type === 'demonitor') {
        action = {type: 'return', value: this.#demonitorProcess(process, action.reference, action.options)};
      } else if (action.type === 'module_info') {
        action = {
          type: 'return',
          value: this.#moduleInfo(action.module, action.arity, action.args),
        };
      }
      if (process.pendingExit !== undefined) throw new ProcessExit(process.pendingExit);
      if (action.type === 'return') {
        if (!isTerm(action.value)) throw new TypeError('return value must be a supported Erlang term');
        if (process.continuations.length === 0) return {done: true, value: action.value};
        Object.assign(process, process.continuations.pop());
        process.args = [action.value];
      } else if (action.type === 'call' || action.type === 'tail') {
        if (action.type === 'call') process.continuations.push({
          fn: process.fn, state: action.state, module: process.module, name: process.name, external: process.external,
        });
        process.tailCaller = action.type === 'tail'
          ? {module: process.module, name: process.name, arity: process.fn?.arity} : undefined;
        if (process.module !== 'erlang') process.callingModule = process.module;
        ({module: process.module, name: process.name, args: process.args, external: process.external} = action);
        process.fn = undefined;
        process.state = undefined;
      } else if (action.type === 'yield') {
        process.state = action.state;
        process.args = action.registers;
        return {done: false};
      } else if (action.type === 'wait') {
        process.state = action.state;
        process.args = action.registers;
        // A message can arrive between an exhausted scan and wait across a yield.
        if (this.#prepareWait(process)) continue;
        return {done: false, waiting: true};
      } else if (action.type === 'wait_timeout') {
        let timer = process.receiveTimer;
        if (!timer) {
          const value = action.timeout;
          if (value !== this.atom('infinity') &&
              (typeof value !== 'bigint' || value < 0n || value > 4294967295n)) {
            this.raiseError(this.atom('timeout_value'));
          }
          if (value === 0n) {
            process.state = {...action.state, pc: action.timeoutPc};
            process.args = action.registers;
            continue;
          }
          timer = {timeoutPc: action.timeoutPc, expired: false};
          process.receiveTimer = timer;
          if (value !== this.atom('infinity')) {
            timer.deadline = this.#clockNow() + Number(value);
            this.#scheduleReceiveTimer(process, timer);
          }
        }
        process.args = action.registers;
        if (timer.expired) {
          process.state = {...action.state, pc: action.timeoutPc};
          continue;
        }
        process.state = action.state;
        if (this.#prepareWait(process)) continue;
        return {done: false, waiting: true};
      } else {
        throw new Error(`unsupported runtime action: ${action.type}`);
      }
    }
    return {done: false};
  }
}
