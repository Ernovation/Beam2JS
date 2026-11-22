const floats = new WeakMap();
const consCells = new WeakMap();
const tuples = new WeakMap();
const bitstrings = new WeakMap();
const hostHandles = new WeakMap();
const pids = new WeakMap();
const references = new WeakMap();
let nextHostHandleId = 0n;
let nextPidId = 0n;
let nextReferenceId = 0n;
const nil = Object.freeze({});
const callableBifs = new Map([
  'is_integer', 'is_number', 'is_atom', 'is_boolean', 'is_float',
  'is_list', 'is_tuple', 'is_binary', 'is_bitstring', 'is_pid', 'is_reference',
].map(name => [JSON.stringify([name, 1]), {
  exported: true,
  run: (rt, args) => ({type: 'return', value: rt.atom(rt.isType(name, args[0]) ? 'true' : 'false')}),
}]));
callableBifs.set(JSON.stringify(['self', 0]), {
  exported: true,
  run: (rt, args, state, budget, pid) => ({type: 'return', value: pid}),
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
callableBifs.set(JSON.stringify(['spawn', 3]), {
  exported: true,
  run: (rt, args) => ({type: 'spawn', args}),
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
function addGuardedBifs(entries, guard) {
  for (const [name, arity] of entries) {
    callableBifs.set(JSON.stringify([name, arity]), {
      exported: true,
      run: (rt, args) => {
        const value = guard(rt, name, args);
        if (value === null) rt.raiseError(rt.atom('badarg'));
        return {type: 'return', value};
      },
    });
  }
}
addGuardedBifs([['hd', 1], ['tl', 1], ['length', 1], ['tuple_size', 1], ['element', 2]],
  (rt, name, args) => rt.guardListTuple(name, ...args));
addGuardedBifs([['bit_size', 1], ['byte_size', 1], ['binary_part', 2], ['binary_part', 3]],
  (rt, name, args) => rt.guardBitstringBif(name, ...args));
addGuardedBifs([['abs', 1], ['trunc', 1], ['round', 1], ['floor', 1], ['ceil', 1], ['float', 1]],
  (rt, name, args) => rt.guardArithmetic(name, ...args));

function isAtom(value) {
  return typeof value === 'symbol' && Symbol.keyFor(value) !== undefined;
}

function isTerm(value) {
  return typeof value === 'bigint' || isAtom(value) || floats.has(value) ||
    value === nil || consCells.has(value) || tuples.has(value) || bitstrings.has(value) ||
    hostHandles.has(value) || pids.has(value) || references.has(value);
}

function termType(value) {
  if (typeof value === 'bigint') return 'integer';
  if (isAtom(value)) return 'atom';
  if (floats.has(value)) return 'float';
  if (value === nil) return 'nil';
  if (consCells.has(value)) return 'cons';
  if (tuples.has(value)) return 'tuple';
  if (bitstrings.has(value)) return 'bitstring';
  if (hostHandles.has(value)) return 'host_handle';
  if (pids.has(value)) return 'pid';
  if (references.has(value)) return 'reference';
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
  constructor(reason) {
    if (!isTerm(reason)) throw new TypeError('error reason must be a supported Erlang term');
    const tag = tuples.get(reason)?.[0] ?? reason;
    super(`Erlang ${isAtom(tag) ? Symbol.keyFor(tag) : 'error'}`);
    this.name = 'ErlangError';
    this.erlangClass = 'error';
    this.reason = reason;
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

  constructor({schedulers = 1, reductionLimit = 1000,
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
    this.modules = new Map();
  }

  hostHandle(value) {
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
      throw new TypeError('host handle requires a JavaScript object or function');
    }
    let handle = this.#hostObjects.get(value);
    if (!handle) {
      handle = Object.freeze({});
      hostHandles.set(handle, {owner: this, value, id: nextHostHandleId++});
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

  makeRef() {
    const ref = Object.freeze({});
    references.set(ref, nextReferenceId++);
    return ref;
  }

  raiseError(reason) {
    throw new ErlangError(reason);
  }

  float(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError('float must be a finite number');
    }
    const term = Object.freeze({});
    floats.set(term, value);
    return term;
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
    const term = Object.freeze({});
    consCells.set(term, [head, tail]);
    return term;
  }

  listHead(value) {
    const cell = consCells.get(value);
    if (!cell) throw new TypeError('expected nonempty Erlang list');
    return cell[0];
  }

  listTail(value) {
    const cell = consCells.get(value);
    if (!cell) throw new TypeError('expected nonempty Erlang list');
    return cell[1];
  }

  tuple(elements) {
    if (!Array.isArray(elements)) throw new TypeError('tuple requires an array of Erlang terms');
    const copy = Array.from(elements);
    if (copy.some(value => !isTerm(value))) throw new TypeError('tuple requires an array of Erlang terms');
    const term = Object.freeze({});
    tuples.set(term, copy);
    return term;
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
    if (!['hd', 'tl', 'length', 'tuple_size', 'element'].includes(op) || args.length !== arity) {
      throw new Error(`invalid list or tuple BIF: ${op}/${args.length}`);
    }
    for (const value of args) termType(value);
    if (op === 'hd' || op === 'tl') {
      const cell = consCells.get(args[0]);
      return cell ? cell[op === 'hd' ? 0 : 1] : null;
    }
    if (op === 'length') {
      let value = args[0];
      let length = 0n;
      while (consCells.has(value)) {
        value = consCells.get(value)[1];
        length += 1n;
      }
      return value === nil ? length : null;
    }
    const elements = tuples.get(args[op === 'element' ? 1 : 0]);
    if (!elements) return null;
    if (op === 'tuple_size') return BigInt(elements.length);
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
    const term = Object.freeze({});
    bitstrings.set(term, [copy, bitLength]);
    return term;
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
    const term = Object.freeze({});
    bitstrings.set(term, [copy, copy.length * 8]);
    return term;
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
    const unary = ['neg', 'abs', 'trunc', 'round', 'floor', 'ceil', 'float'].includes(op);
    if ((!unary && !['+', '-', '*', '/'].includes(op)) || unary !== (right === undefined)) {
      throw new Error(`invalid guard arithmetic operation: ${op}`);
    }
    const leftType = termType(left);
    const rightType = unary ? undefined : termType(right);
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
        const [ah, at] = consCells.get(a);
        const [bh, bt] = consCells.get(b);
        pending.push([at, bt], [ah, bh]);
      } else if (type === 'tuple') {
        const x = tuples.get(a);
        const y = tuples.get(b);
        if (x.length !== y.length) return false;
        for (let i = x.length - 1; i >= 0; i--) pending.push([x[i], y[i]]);
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
      tuple: 5, nil: 6, cons: 7, bitstring: 8};
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
        const [ah, at] = consCells.get(a);
        const [bh, bt] = consCells.get(b);
        pending.push([at, bt], [ah, bh]);
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
      case 'is_binary':
        return actual === 'bitstring' && bitstrings.get(value)[1] % 8 === 0;
      case 'is_bitstr':
      case 'is_bitstring': return actual === 'bitstring';
      default: throw new Error(`unsupported type test: ${type}`);
    }
  }

  registerModule(version, name, functions) {
    if (version !== 25) {
      throw new Error(`unsupported runtime ABI ${version}`);
    }
    if (this.modules.has(name)) throw new Error(`module already registered: ${name}`);
    const table = new Map();
    for (const fn of functions) {
      const key = JSON.stringify([fn.name, fn.arity]);
      if (table.has(key)) throw new Error(`duplicate function: ${name}:${fn.name}/${fn.arity}`);
      table.set(key, fn);
    }
    this.modules.set(name, table);
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

  spawnProcess(module, name, args) {
    const process = this.#newProcess(module, name, args);
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
    while (consCells.has(options)) {
      const [option, tail] = consCells.get(options);
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
    const pid = Object.freeze({});
    pids.set(pid, nextPidId++);
    this.#localPids.add(pid);
    this.#livePids.add(pid);
    const process = {
      pid, module, name, args: args.slice(), external: true, fn: undefined, state: undefined,
      continuations: [], mailbox: [], receiveIndex: 0, receiveChecked: false, status: 'runnable',
    };
    this.#pidProcesses.set(pid, process);
    return process;
  }

  #spawnErlang([module, name, list]) {
    if (!isAtom(module) || !isAtom(name)) this.raiseError(this.atom('badarg'));
    const args = [];
    while (consCells.has(list)) {
      const [head, tail] = consCells.get(list);
      args.push(head);
      list = tail;
    }
    if (list !== nil) this.raiseError(this.atom('badarg'));
    const handle = this.spawnProcess(Symbol.keyFor(module), Symbol.keyFor(name), args);
    if (args.length > 255) {
      this.#processes.get(handle).startError = new Error(`unsupported function arity: ${args.length}`);
    }
    handle.result.catch(error => this.#onProcessError(handle.pid, error));
    return handle.pid;
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
    process.status = 'running';
    try {
      const result = this.#runProcess(process, this.#reductionLimit);
      if (result.done) {
        this.#finishProcess(process, 'completed');
        process.resolve(result.value);
      } else if (result.waiting) {
        process.status = 'waiting';
        this.#waiting.add(process);
      } else {
        process.status = 'runnable';
        this.#enqueue(process);
      }
    } catch (error) {
      let failure = error;
      try {
        this.#finishProcess(process, 'failed');
      } catch (cleanupError) {
        failure = new AggregateError([error, cleanupError], 'process and timer cleanup failed');
      }
      process.reject(failure);
    }
    this.#schedule();
  }

  #finishProcess(process, status) {
    process.status = status;
    if (process.registeredName !== undefined) {
      this.#registered.delete(process.registeredName);
      process.registeredName = undefined;
    }
    const errors = [];
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
    if ('startError' in process) throw process.startError;
    const budget = {remaining: limit};
    while (budget.remaining > 0) {
      if (!process.fn) {
        if (!Array.isArray(process.args) || process.args.some(value => !isTerm(value))) {
          throw new TypeError('arguments must be supported Erlang terms');
        }
        const {external, module, name, args} = process;
        process.fn = external && module === 'erlang' ? callableBifs.get(JSON.stringify([name, args.length])) : undefined;
        if (!process.fn) process.fn = this.modules.get(module)?.get(JSON.stringify([name, args.length]));
        if (!process.fn || (external && !process.fn.exported)) {
          throw new Error(`undefined or unsupported function: ${module}:${name}/${args.length}`);
        }
      }
      const previous = budget.remaining;
      let action = process.fn.run(this, process.args.slice(), process.state, budget, process.pid);
      if (budget.remaining === previous) budget.remaining--;
      if (action.type === 'spawn') {
        action = {type: 'return', value: this.#spawnErlang(action.args)};
      }
      if (action.type === 'return') {
        if (!isTerm(action.value)) throw new TypeError('return value must be a supported Erlang term');
        if (process.continuations.length === 0) return {done: true, value: action.value};
        ({fn: process.fn, state: process.state} = process.continuations.pop());
        process.args = [action.value];
      } else if (action.type === 'call' || action.type === 'tail') {
        if (action.type === 'call') process.continuations.push({fn: process.fn, state: action.state});
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
