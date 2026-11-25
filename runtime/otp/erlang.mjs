// erlang module BIFs that need no scheduler state: conversions, iodata,
// hashing, the external term format, fun and code introspection and system
// information. Each definition returns a term or a runtime action.
import {
  CONS, FLOAT, TUPLE, BITSTRING, PID, REFERENCE, FUN, NIL, HOST_HANDLE,
  is, isAtom, listToArray, arrayToList, bool, charlist, charlistText, bytesToList,
  binary, utf8, decodeUtf8, latin1Text, iolistBytes, bitlistBits, termKey,
  phash2, phash, crc32, adler32, md5, md5Init, md5Update, md5Final,
  floatToText, parseIntegerPrefix,
} from './term.mjs';
import {encodeTerm, decodeTerm} from './etf.mjs';
import {matchSpecTest} from './ets.mjs';

export const existingAtoms = new Set();

const badarg = rt => rt.raiseError(rt.atom('badarg'));
const MAX_ATOM_CHARACTERS = 255;

function makeAtom(rt, name, existing) {
  if ([...name].length > MAX_ATOM_CHARACTERS) rt.raiseError(rt.atom('system_limit'));
  if (existing && !existingAtoms.has(name)) badarg(rt);
  existingAtoms.add(name);
  return rt.atom(name);
}

function binaryBytes(rt, term) {
  if (!is(term, BITSTRING) || term[1][1] % 8 !== 0) badarg(rt);
  return term[1][0].subarray(0, term[1][1] / 8);
}

function encodingName(rt, encoding) {
  if (!isAtom(encoding)) badarg(rt);
  const name = Symbol.keyFor(encoding);
  if (name === 'utf8' || name === 'unicode') return 'utf8';
  if (name === 'latin1') return 'latin1';
  return badarg(rt);
}

function binaryToAtom(rt, value, encoding, existing) {
  const bytes = binaryBytes(rt, value);
  let name;
  if (encodingName(rt, encoding) === 'utf8') {
    name = decodeUtf8(bytes);
    if (name === null) badarg(rt);
  } else {
    name = latin1Text(bytes);
  }
  return makeAtom(rt, name, existing);
}

function listToAtom(rt, list, existing) {
  const name = charlistText(list);
  if (name === null || /[\ud800-\udfff]/.test(name)) badarg(rt);
  return makeAtom(rt, name, existing);
}

function parseInteger(rt, text, base) {
  if (typeof base !== 'bigint' || base < 2n || base > 36n) badarg(rt);
  const parsed = text === null ? null : parseIntegerPrefix(text, Number(base));
  if (parsed === null || parsed.length !== text.length) badarg(rt);
  return parsed.value;
}

// list_to_float/1 syntax: the whole text must be an Erlang float.
const wholeFloat = /^[+-]?[0-9]+\.[0-9]+(?:[eE][+-]?[0-9]+)?$/;
function parseFloat(rt, text) {
  if (text === null || !wholeFloat.test(text)) badarg(rt);
  const value = Number(text);
  if (!Number.isFinite(value)) badarg(rt);
  return rt.float(value);
}

function floatText(rt, value, options) {
  if (!is(value, FLOAT)) badarg(rt);
  const list = listToArray(options);
  if (list === null) badarg(rt);
  const text = floatToText(value[1], list);
  if (text === null) badarg(rt);
  return text;
}

function pidText(term) {
  return `<0.${term[1]}.0>`;
}

function refText(term) {
  const value = BigInt(term[1]);
  return `#Ref<0.${(value >> 50n) & 0xffffffffn}.${(value >> 18n) & 0xffffffffn}.${value & 0x3ffffn}>`;
}

function funText(rt, term) {
  const data = term[1];
  if (data.external) return `fun ${atomSource(data.module)}:${atomSource(data.name)}/${data.arity}`;
  return `#Fun<${data.module}.${funIndex(data)}.${phash2(rt.atom(data.name))}>`;
}

const funIndexes = new Map();
function funIndex(data) {
  const key = `${data.module}:${data.name}`;
  if (!funIndexes.has(key)) funIndexes.set(key, funIndexes.size);
  return funIndexes.get(key);
}

function atomSource(name) {
  return /^[a-z][A-Za-z0-9_@]*$/.test(name) ? name : `'${name.replace(/[\\']/g, '\\$&')}'`;
}

function funInfo(rt, fun, item) {
  const data = fun[1];
  const key = Symbol.keyFor(item);
  const pair = value => rt.tuple([item, value]);
  switch (key) {
    case 'module': return pair(rt.atom(data.module));
    case 'name': return pair(rt.atom(data.name));
    case 'arity': return pair(BigInt(data.arity - data.environment.length));
    case 'type': return pair(rt.atom(data.external ? 'external' : 'local'));
    case 'env': return pair(arrayToList(rt, data.environment));
    case 'pid': return pair(data.external ? rt.atom('undefined') : rt.lookupPid(0n));
    case 'index': return data.external ? pair(rt.atom('undefined')) : pair(BigInt(funIndex(data)));
    case 'new_index': return data.external ? pair(rt.atom('undefined')) : pair(BigInt(funIndex(data)));
    case 'uniq':
    case 'new_uniq':
      return data.external ? pair(rt.atom('undefined')) : pair(BigInt(phash2(rt.atom(data.name))));
    default: return badarg(rt);
  }
}

function tupleElements(rt, tuple) {
  if (!is(tuple, TUPLE)) badarg(rt);
  return tuple[1];
}

function tupleIndex(rt, index, limit) {
  if (typeof index !== 'bigint' || index < 1n || index > BigInt(limit)) badarg(rt);
  return Number(index) - 1;
}

function bytesFromIodata(rt, term) {
  if (is(term, BITSTRING)) return binaryBytes(rt, term);
  const bytes = iolistBytes(term);
  if (bytes === null) badarg(rt);
  return bytes;
}

function checksumBytes(rt, data) {
  return bytesFromIodata(rt, data);
}

function u32Argument(rt, value) {
  if (typeof value !== 'bigint' || value < 0n || value > 0xffffffffn) badarg(rt);
  return Number(value);
}

function md5Context(rt, term) {
  if (!is(term, BITSTRING) || term[1][1] !== 92 * 8) badarg(rt);
  const bytes = term[1][0];
  const view = new DataView(bytes.buffer, bytes.byteOffset, 92);
  const state = [0, 1, 2, 3].map(i => view.getInt32(i * 4, true));
  const length = Number(view.getBigUint64(16, true));
  const buffered = length % 64;
  return {state, length, buffer: Array.from(bytes.subarray(24, 24 + buffered))};
}

function md5ContextTerm(rt, context) {
  const bytes = new Uint8Array(92);
  const view = new DataView(bytes.buffer);
  context.state.forEach((word, i) => view.setInt32(i * 4, word, true));
  view.setBigUint64(16, BigInt(context.length), true);
  bytes.set(context.buffer, 24);
  return binary(rt, bytes);
}

const timeUnits = {
  second: 1n, seconds: 1n, millisecond: 1000n, milli_seconds: 1000n,
  microsecond: 1000000n, micro_seconds: 1000000n, nanosecond: 1000000000n, nano_seconds: 1000000000n,
  native: 1000000000n, perf_counter: 1000000000n,
};

export function unitScale(rt, unit) {
  if (typeof unit === 'bigint' && unit > 0n) return unit;
  if (isAtom(unit) && Object.hasOwn(timeUnits, Symbol.keyFor(unit))) return timeUnits[Symbol.keyFor(unit)];
  return badarg(rt);
}

// floor(value * to / from), as erlang:convert_time_unit/3 rounds towards -infinity.
export function convertTime(value, from, to) {
  const scaled = value * to;
  return scaled >= 0n ? scaled / from : -((-scaled + from - 1n) / from);
}

export function systemTimeNs() {
  const ms = Date.now();
  const extra = typeof performance !== 'undefined' ? Math.floor((performance.now() % 1) * 1e6) : 0;
  return BigInt(ms) * 1000000n + BigInt(extra);
}

function dateTuple(rt, date, utc) {
  const get = name => BigInt(utc ? date[`getUTC${name}`]() : date[`get${name}`]());
  return rt.tuple([
    rt.tuple([get('FullYear'), get('Month') + 1n, get('Date')]),
    rt.tuple([get('Hours'), get('Minutes'), get('Seconds')]),
  ]);
}

function dateFromTuple(rt, term, utc) {
  const outer = tupleElements(rt, term);
  if (outer.length !== 2) badarg(rt);
  const date = tupleElements(rt, outer[0]);
  const time = tupleElements(rt, outer[1]);
  if (date.length !== 3 || time.length !== 3 || [...date, ...time].some(v => typeof v !== 'bigint')) badarg(rt);
  const [y, mo, d] = date.map(Number);
  const [h, mi, s] = time.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59) badarg(rt);
  return utc ? new Date(Date.UTC(y, mo - 1, d, h, mi, s)) : new Date(y, mo - 1, d, h, mi, s);
}

let uniqueCounter = 0n;

const systemInfo = {
  otp_release: rt => charlist(rt, '29'),
  version: rt => charlist(rt, '17.1.1'),
  machine: rt => charlist(rt, 'BEAM'),
  system_version: rt => charlist(rt, 'Erlang/OTP 29 [erts-17.1.1] [beam2js] [64-bit]\n'),
  system_architecture: rt => charlist(rt, 'javascript'),
  emu_flavor: rt => rt.atom('emu'),
  emu_type: rt => rt.atom('opt'),
  build_type: rt => rt.atom('opt'),
  compat_rel: () => 29n,
  nif_version: rt => charlist(rt, '2.18'),
  driver_version: rt => charlist(rt, '3.3'),
  wordsize: () => 8n,
  schedulers: () => 1n,
  schedulers_online: () => 1n,
  dirty_cpu_schedulers: () => 0n,
  dirty_cpu_schedulers_online: () => 0n,
  dirty_io_schedulers: () => 0n,
  logical_processors: () => 1n,
  logical_processors_available: rt => rt.atom('unknown'),
  logical_processors_online: () => 1n,
  process_limit: () => 1048576n,
  atom_limit: () => 1048576n,
  port_limit: () => 0n,
  ets_limit: () => 8192n,
  atom_count: () => BigInt(existingAtoms.size),
  port_count: () => 0n,
  smp_support: rt => rt.atom('true'),
  threads: rt => rt.atom('false'),
  thread_pool_size: () => 0n,
  creation: () => 0n,
  debug_compiled: rt => rt.atom('false'),
  kernel_poll: rt => rt.atom('false'),
  hipe_architecture: rt => rt.atom('undefined'),
  heap_type: rt => rt.atom('private'),
  dist_ctrl: rt => rt.nil(),
  dist_buf_busy_limit: () => 1048576n,
  start_time: () => 0n,
  time_offset: rt => rt.atom('final'),
  time_warp_mode: rt => rt.atom('no_time_warp'),
  time_correction: rt => rt.atom('false'),
  fullsweep_after: rt => rt.tuple([rt.atom('fullsweep_after'), 65535n]),
  min_heap_size: rt => rt.tuple([rt.atom('min_heap_size'), 233n]),
  min_bin_vheap_size: rt => rt.tuple([rt.atom('min_bin_vheap_size'), 46422n]),
  max_heap_size: rt => rt.tuple([rt.atom('max_heap_size'), rt.map([
    [rt.atom('size'), 0n], [rt.atom('kill'), rt.atom('true')], [rt.atom('error_logger'), rt.atom('true')],
    [rt.atom('include_shared_binaries'), rt.atom('false')],
  ])]),
  c_compiler_used: rt => rt.tuple([rt.atom('undefined'), rt.atom('undefined')]),
  os_type: rt => osType(rt),
  scheduler_id: () => 1n,
  multi_scheduling: rt => rt.atom('disabled'),
  trace_control_word: () => 0n,
  sequential_tracer: rt => rt.tuple([rt.atom('sequential_tracer'), rt.atom('false')]),
  outstanding_system_requests_limit: () => 144n,
  async_dist: rt => rt.atom('false'),
  halt_flush_timeout: rt => rt.atom('infinity'),
  modified_timing_level: rt => rt.atom('undefined'),
  eager_check_io: rt => rt.atom('false'),
  info: rt => binary(rt, utf8.encode('beam2js\n')),
  loaded: rt => binary(rt, utf8.encode('')),
  procs: rt => binary(rt, utf8.encode('')),
  dist: rt => binary(rt, utf8.encode('')),
};

export function osType(rt) {
  return rt.tuple([rt.atom(typeof process !== 'undefined' && process.versions?.node ? 'unix' : 'unix'),
    rt.atom(typeof process !== 'undefined' && process.platform ? process.platform : 'browser')]);
}

export function erlangBifs() {
  const bifs = [];
  const def = (name, arity, fn) => bifs.push([name, arity, fn]);

  def('atom_to_binary', 1, (rt, [atom]) => {
    if (!isAtom(atom)) badarg(rt);
    return binary(rt, utf8.encode(Symbol.keyFor(atom)));
  });
  def('binary_to_atom', 1, (rt, [value]) => binaryToAtom(rt, value, rt.atom('utf8'), false));
  def('binary_to_atom', 2, (rt, [value, encoding]) => binaryToAtom(rt, value, encoding, false));
  def('binary_to_existing_atom', 1, (rt, [value]) => binaryToAtom(rt, value, rt.atom('utf8'), true));
  def('binary_to_existing_atom', 2, (rt, [value, encoding]) => binaryToAtom(rt, value, encoding, true));
  def('list_to_atom', 1, (rt, [list]) => listToAtom(rt, list, false));
  def('list_to_existing_atom', 1, (rt, [list]) => listToAtom(rt, list, true));

  def('list_to_integer', 1, (rt, [list]) => parseInteger(rt, charlistText(list), 10n));
  def('list_to_integer', 2, (rt, [list, base]) => parseInteger(rt, charlistText(list), base));
  def('binary_to_integer', 1, (rt, [value]) => parseInteger(rt, latin1Text(binaryBytes(rt, value)), 10n));
  def('binary_to_integer', 2, (rt, [value, base]) =>
    parseInteger(rt, latin1Text(binaryBytes(rt, value)), base));
  def('list_to_float', 1, (rt, [list]) => parseFloat(rt, charlistText(list)));
  def('binary_to_float', 1, (rt, [value]) => parseFloat(rt, latin1Text(binaryBytes(rt, value))));
  def('float_to_list', 2, (rt, [value, options]) => charlist(rt, floatText(rt, value, options)));
  def('float_to_binary', 1, (rt, [value]) => binary(rt, utf8.encode(floatText(rt, value, rt.nil()))));
  def('float_to_binary', 2, (rt, [value, options]) => binary(rt, utf8.encode(floatText(rt, value, options))));

  def('bitstring_to_list', 1, (rt, [value]) => {
    if (!is(value, BITSTRING)) badarg(rt);
    const [bytes, bits] = value[1];
    const whole = bits >> 3;
    const tail = bits & 7;
    const items = Array.from(bytes.subarray(0, whole), byte => BigInt(byte));
    if (tail) items.push(rt.bitstring(Uint8Array.of(bytes[whole] & ((0xff << (8 - tail)) & 0xff)), tail));
    return arrayToList(rt, items);
  });
  def('list_to_binary', 1, (rt, [list]) => {
    if (!is(list, CONS) && !is(list, NIL)) badarg(rt);
    return binary(rt, bytesFromIodata(rt, list));
  });
  def('list_to_bitstring', 1, (rt, [list]) => {
    const bits = bitlistBits(list);
    if (bits === null) badarg(rt);
    return rt.bitstring(Uint8Array.from(bits.bytes), bits.bits);
  });
  def('iolist_to_binary', 1, (rt, [data]) => binary(rt, bytesFromIodata(rt, data)));
  def('iolist_size', 1, (rt, [data]) => BigInt(bytesFromIodata(rt, data).length));
  def('iolist_to_iovec', 1, (rt, [data]) => {
    const bytes = bytesFromIodata(rt, data);
    return bytes.length ? rt.cons(binary(rt, bytes), rt.nil()) : rt.nil();
  });
  def('split_binary', 2, (rt, [value, position]) => {
    if (!is(value, BITSTRING) || typeof position !== 'bigint' || position < 0n ||
        position * 8n > BigInt(value[1][1])) badarg(rt);
    const [bytes, bits] = value[1];
    const at = Number(position);
    return rt.tuple([rt.bitstring(bytes.slice(0, at), at * 8), rt.bitstring(bytes.slice(at), bits - at * 8)]);
  });

  const encode = (rt, term) => {
    const bytes = encodeTerm(rt, term);
    if (bytes === null) badarg(rt);
    return binary(rt, bytes);
  };
  def('term_to_binary', 1, (rt, [term]) => encode(rt, term));
  def('term_to_binary', 2, (rt, [term, options]) => {
    if (listToArray(options) === null) badarg(rt);
    return encode(rt, term);
  });
  def('term_to_iovec', 1, (rt, [term]) => rt.cons(encode(rt, term), rt.nil()));
  def('term_to_iovec', 2, (rt, [term]) => rt.cons(encode(rt, term), rt.nil()));
  def('external_size', 1, (rt, [term]) => BigInt(encode(rt, term)[1][1] / 8));
  def('external_size', 2, (rt, [term]) => BigInt(encode(rt, term)[1][1] / 8));
  const decode = (rt, value, options) => {
    const bytes = binaryBytes(rt, value);
    const list = listToArray(options);
    if (list === null) badarg(rt);
    const safe = list.includes(rt.atom('safe'));
    const used = list.includes(rt.atom('used'));
    let result;
    try {
      result = decodeTerm(rt, bytes, {safe, existingAtom: name => existingAtoms.has(name)});
    } catch (error) {
      if (error?.name === 'ErlangError') throw error;
      return badarg(rt);
    }
    for (const atomTerm of collectAtoms(result.term)) existingAtoms.add(Symbol.keyFor(atomTerm));
    if (used) return rt.tuple([result.term, BigInt(result.used)]);
    if (result.used !== bytes.length) badarg(rt);
    return result.term;
  };
  def('binary_to_term', 1, (rt, [value]) => decode(rt, value, rt.nil()));
  def('binary_to_term', 2, (rt, [value, options]) => decode(rt, value, options));

  def('pid_to_list', 1, (rt, [pid]) => {
    if (!is(pid, PID)) badarg(rt);
    return charlist(rt, pidText(pid));
  });
  def('ref_to_list', 1, (rt, [ref]) => {
    if (!is(ref, REFERENCE)) badarg(rt);
    return charlist(rt, refText(ref));
  });
  def('port_to_list', 1, (rt, [port]) => {
    if (!is(port, HOST_HANDLE)) badarg(rt);
    return charlist(rt, `#Port<0.${port[1].id}>`);
  });
  def('fun_to_list', 1, (rt, [fun]) => {
    if (!is(fun, FUN)) badarg(rt);
    return charlist(rt, funText(rt, fun));
  });
  def('list_to_pid', 1, (rt, [list]) => {
    const match = charlistText(list)?.match(/^<(\d+)\.(\d+)\.(\d+)>$/);
    if (!match || match[1] !== '0') badarg(rt);
    return rt.lookupPid(BigInt(match[2]));
  });
  def('list_to_ref', 1, (rt, [list]) => {
    const match = charlistText(list)?.match(/^#Ref<(\d+)\.(\d+)\.(\d+)\.(\d+)>$/);
    if (!match) badarg(rt);
    return rt.lookupRef((BigInt(match[2]) << 50n) | (BigInt(match[3]) << 18n) | BigInt(match[4]));
  });
  def('list_to_port', 1, rt => badarg(rt));

  def('fun_info', 1, (rt, [fun]) => {
    if (!is(fun, FUN)) badarg(rt);
    const items = fun[1].external
      ? ['module', 'name', 'arity', 'env', 'type']
      : ['pid', 'module', 'new_index', 'new_uniq', 'index', 'uniq', 'name', 'arity', 'env', 'type'];
    return arrayToList(rt, items.map(item => funInfo(rt, fun, rt.atom(item))));
  });
  def('fun_info', 2, (rt, [fun, item]) => {
    if (!is(fun, FUN) || !isAtom(item)) badarg(rt);
    return funInfo(rt, fun, item);
  });
  def('fun_info_mfa', 1, (rt, [fun]) => {
    if (!is(fun, FUN)) badarg(rt);
    const data = fun[1];
    return rt.tuple([rt.atom(data.module), rt.atom(data.name), BigInt(data.arity)]);
  });
  def('make_fun', 3, (rt, [module, name, arity]) => {
    if (!isAtom(module) || !isAtom(name) || typeof arity !== 'bigint' || arity < 0n || arity > 255n) badarg(rt);
    return rt.externalFun(Symbol.keyFor(module), Symbol.keyFor(name), Number(arity));
  });

  def('max', 2, (rt, [a, b]) => rt.compare(a, b) < 0 ? b : a);
  def('min', 2, (rt, [a, b]) => rt.compare(a, b) > 0 ? b : a);
  def('is_integer', 3, (rt, [value, low, high]) => {
    if (typeof low !== 'bigint' || typeof high !== 'bigint') badarg(rt);
    return bool(rt, typeof value === 'bigint' && value >= low && value <= high);
  });
  def('is_record', 2, (rt, [term, tag]) => {
    if (!isAtom(tag)) badarg(rt);
    return bool(rt, is(term, TUPLE) && term[1].length > 0 && term[1][0] === tag);
  });
  def('is_record', 3, (rt, [term, tag, size]) => {
    if (!isAtom(tag) || typeof size !== 'bigint') badarg(rt);
    return bool(rt, is(term, TUPLE) && BigInt(term[1].length) === size && term[1][0] === tag);
  });
  def('make_tuple', 2, (rt, [arity, value]) => {
    if (typeof arity !== 'bigint' || arity < 0n || arity > 16777215n) badarg(rt);
    return rt.tuple(new Array(Number(arity)).fill(value));
  });
  def('make_tuple', 3, (rt, [arity, value, inits]) => {
    if (typeof arity !== 'bigint' || arity < 0n || arity > 16777215n) badarg(rt);
    const elements = new Array(Number(arity)).fill(value);
    const list = listToArray(inits);
    if (list === null) badarg(rt);
    for (const init of list) {
      const pair = tupleElements(rt, init);
      if (pair.length !== 2) badarg(rt);
      elements[tupleIndex(rt, pair[0], elements.length)] = pair[1];
    }
    return rt.tuple(elements);
  });
  def('append_element', 2, (rt, [tuple, value]) => rt.tuple([...tupleElements(rt, tuple), value]));
  def('delete_element', 2, (rt, [index, tuple]) => {
    const elements = tupleElements(rt, tuple).slice();
    elements.splice(tupleIndex(rt, index, elements.length), 1);
    return rt.tuple(elements);
  });
  def('insert_element', 3, (rt, [index, tuple, value]) => {
    const elements = tupleElements(rt, tuple).slice();
    elements.splice(tupleIndex(rt, index, elements.length + 1), 0, value);
    return rt.tuple(elements);
  });
  def('size', 1, (rt, [term]) => {
    if (is(term, TUPLE)) return BigInt(term[1].length);
    if (is(term, BITSTRING)) return BigInt(term[1][1] >> 3);
    return badarg(rt);
  });
  for (const [name, op] of [['bsl', (a, b) => a << b], ['bsr', (a, b) => a >> b]]) {
    def(name, 2, (rt, [a, b]) => {
      if (typeof a !== 'bigint' || typeof b !== 'bigint') rt.raiseError(rt.atom('badarith'));
      if (b > 1n << 26n && a !== 0n && name === 'bsl') rt.raiseError(rt.atom('system_limit'));
      return op(a, b);
    });
  }

  def('crc32', 1, (rt, [data]) => BigInt(crc32(checksumBytes(rt, data))));
  def('crc32', 2, (rt, [old, data]) => BigInt(crc32(checksumBytes(rt, data), u32Argument(rt, old))));
  def('crc32_combine', 3, (rt, [first, second, size]) => {
    u32Argument(rt, first);
    u32Argument(rt, second);
    if (typeof size !== 'bigint' || size < 0n) badarg(rt);
    return BigInt(crc32Combine(Number(first), Number(second), Number(size)));
  });
  def('adler32', 1, (rt, [data]) => BigInt(adler32(checksumBytes(rt, data))));
  def('adler32', 2, (rt, [old, data]) => BigInt(adler32(checksumBytes(rt, data), u32Argument(rt, old))));
  def('adler32_combine', 3, (rt, [first, second, size]) => {
    u32Argument(rt, first);
    u32Argument(rt, second);
    if (typeof size !== 'bigint' || size < 0n) badarg(rt);
    return BigInt(adler32Combine(Number(first), Number(second), Number(size % 65521n)));
  });
  def('md5', 1, (rt, [data]) => binary(rt, md5(bytesFromIodata(rt, data))));
  def('md5_init', 0, rt => md5ContextTerm(rt, md5Init()));
  def('md5_update', 2, (rt, [context, data]) =>
    md5ContextTerm(rt, md5Update(md5Context(rt, context), bytesFromIodata(rt, data))));
  def('md5_final', 1, (rt, [context]) => binary(rt, md5Final(md5Context(rt, context))));
  def('phash', 2, (rt, [term, range]) => {
    if (typeof range !== 'bigint' || range < 1n || range > 0x100000000n) badarg(rt);
    return 1n + BigInt(phash(term)) % range;
  });
  def('phash2', 1, (rt, [term]) => BigInt(phash2(term) & 0x7ffffff));
  def('phash2', 2, (rt, [term, range]) => {
    if (typeof range !== 'bigint' || range < 1n || range > 0xffffffffn) badarg(rt);
    const hash = BigInt(phash2(term));
    return range > 0x7ffffffn || (range & (range - 1n)) !== 0n ? hash % range : hash & (range - 1n);
  });

  def('node', 0, rt => rt.atom('nonode@nohost'));
  def('node', 1, rt => rt.atom('nonode@nohost'));
  def('nodes', 0, rt => rt.nil());
  def('nodes', 1, rt => rt.nil());
  def('nodes', 2, rt => rt.nil());
  def('is_alive', 0, rt => rt.atom('false'));
  def('get_cookie', 0, rt => rt.atom('nocookie'));
  def('get_cookie', 1, rt => rt.atom('nocookie'));
  def('set_cookie', 1, rt => rt.atom('true'));
  def('set_cookie', 2, rt => rt.atom('true'));
  def('disconnect_node', 1, rt => rt.atom('ignored'));
  def('dist_ctrl_get_opt', 2, rt => badarg(rt));
  def('module_loaded', 1, (rt, [module]) => {
    if (!isAtom(module)) badarg(rt);
    return bool(rt, rt.modules.has(Symbol.keyFor(module)));
  });
  def('function_exported', 3, (rt, [module, name, arity]) => {
    if (!isAtom(module) || !isAtom(name) || typeof arity !== 'bigint') badarg(rt);
    const fn = rt.modules.get(Symbol.keyFor(module))?.get(JSON.stringify([Symbol.keyFor(name), Number(arity)]));
    return bool(rt, Boolean(fn?.exported));
  });
  def('is_builtin', 3, (rt, [module, name, arity]) => {
    if (!isAtom(module) || !isAtom(name) || typeof arity !== 'bigint') badarg(rt);
    return bool(rt, Symbol.keyFor(module) === 'erlang' && rt.isErlangBif(Symbol.keyFor(name), Number(arity)));
  });
  def('loaded', 0, rt => arrayToList(rt, [...rt.modules.keys()].map(name => rt.atom(name))));
  def('pre_loaded', 0, rt => arrayToList(rt, ['erlang', 'erts_internal', 'init', 'erl_prim_loader', 'prim_eval',
    'persistent_term', 'atomics', 'counters'].map(name => rt.atom(name))));
  def('check_old_code', 1, rt => rt.atom('false'));
  def('check_process_code', 2, rt => rt.atom('false'));
  def('check_process_code', 3, rt => rt.atom('false'));
  def('delete_module', 1, rt => rt.atom('undefined'));
  def('purge_module', 1, rt => rt.atom('false'));
  def('has_prepared_code_on_load', 1, rt => badarg(rt));
  def('prepare_loading', 2, rt => rt.tuple([rt.atom('error'), rt.atom('badfile')]));
  def('finish_loading', 1, rt => rt.atom('ok'));
  def('call_on_load_function', 1, rt => badarg(rt));
  def('module_info', 0, rt => rt.nil());
  def('module_info', 1, (rt, [item]) => item === rt.atom('module') ? rt.atom('erlang') : rt.nil());

  def('garbage_collect', 0, rt => rt.atom('true'));
  def('garbage_collect', 1, rt => rt.atom('true'));
  def('garbage_collect', 2, rt => rt.atom('true'));
  def('bump_reductions', 1, rt => rt.atom('true'));
  def('yield', 0, rt => rt.atom('true'));
  def('hibernate', 0, rt => rt.atom('ok'));
  def('display', 1, (rt, [term]) => {
    console.log(rt.formatTerm ? rt.formatTerm(term) : String(term));
    return rt.atom('true');
  });
  def('display_string', 1, (rt, [text]) => {
    const value = is(text, BITSTRING) ? decodeUtf8(binaryBytes(rt, text)) : charlistText(text);
    if (value === null) badarg(rt);
    if (typeof process !== 'undefined' && process.stderr?.write) process.stderr.write(value);
    else console.log(value);
    return rt.atom('true');
  });
  def('display_string', 2, (rt, [device, text]) => {
    const value = is(text, BITSTRING) ? decodeUtf8(binaryBytes(rt, text)) : charlistText(text);
    if (value === null || !isAtom(device)) badarg(rt);
    const stream = typeof process !== 'undefined' && process[Symbol.keyFor(device)];
    if (stream?.write) stream.write(value);
    else console.log(value);
    return rt.atom('true');
  });
  def('memory', 0, rt => arrayToList(rt, ['total', 'processes', 'processes_used', 'system', 'atom', 'atom_used',
    'binary', 'code', 'ets'].map(name => rt.tuple([rt.atom(name), 0n]))));
  def('memory', 1, (rt, [type]) => {
    if (isAtom(type)) return 0n;
    const list = listToArray(type);
    if (list === null) badarg(rt);
    return arrayToList(rt, list.map(item => rt.tuple([item, 0n])));
  });
  def('system_info', 1, (rt, [item]) => {
    if (isAtom(item) && Object.hasOwn(systemInfo, Symbol.keyFor(item))) return systemInfo[Symbol.keyFor(item)](rt);
    if (is(item, TUPLE) && item[1][0] === rt.atom('wordsize')) return 8n;
    return badarg(rt);
  });
  def('system_flag', 2, (rt, [flag, value]) => {
    if (!isAtom(flag)) badarg(rt);
    return value;
  });

  def('convert_time_unit', 3, (rt, [value, from, to]) => {
    if (typeof value !== 'bigint') badarg(rt);
    return convertTime(value, unitScale(rt, from), unitScale(rt, to));
  });
  def('system_time', 0, () => systemTimeNs());
  def('system_time', 1, (rt, [unit]) => convertTime(systemTimeNs(), 1000000000n, unitScale(rt, unit)));
  def('time_offset', 0, rt => systemTimeNs() - rt.monotonicTime(rt.atom('native')));
  def('time_offset', 1, (rt, [unit]) =>
    convertTime(systemTimeNs() - rt.monotonicTime(rt.atom('native')), 1000000000n, unitScale(rt, unit)));
  def('timestamp', 0, rt => {
    const us = systemTimeNs() / 1000n;
    return rt.tuple([us / 1000000000000n, (us / 1000000n) % 1000000n, us % 1000000n]);
  });
  def('now', 0, rt => {
    const us = systemTimeNs() / 1000n + uniqueCounter++;
    return rt.tuple([us / 1000000000000n, (us / 1000000n) % 1000000n, us % 1000000n]);
  });
  def('unique_integer', 0, () => uniqueCounter++ - (1n << 59n));
  def('unique_integer', 1, (rt, [options]) => {
    const list = listToArray(options);
    if (list === null || list.some(o => o !== rt.atom('positive') && o !== rt.atom('monotonic'))) badarg(rt);
    const value = uniqueCounter++;
    return list.includes(rt.atom('positive')) ? value + 1n : value - (1n << 59n);
  });
  def('time', 0, rt => dateTuple(rt, new Date(), false)[1][1]);
  def('date', 0, rt => dateTuple(rt, new Date(), false)[1][0]);
  def('localtime', 0, rt => dateTuple(rt, new Date(), false));
  def('universaltime', 0, rt => dateTuple(rt, new Date(), true));
  def('localtime_to_universaltime', 1, (rt, [time]) => dateTuple(rt, dateFromTuple(rt, time, false), true));
  def('localtime_to_universaltime', 2, (rt, [time]) => dateTuple(rt, dateFromTuple(rt, time, false), true));
  def('universaltime_to_localtime', 1, (rt, [time]) => dateTuple(rt, dateFromTuple(rt, time, true), false));
  def('posixtime_to_universaltime', 1, (rt, [seconds]) => {
    if (typeof seconds !== 'bigint') badarg(rt);
    return dateTuple(rt, new Date(Number(seconds) * 1000), true);
  });
  def('universaltime_to_posixtime', 1, (rt, [time]) =>
    BigInt(Math.floor(dateFromTuple(rt, time, true).getTime() / 1000)));

  for (const [name, arity] of [['open_port', 2], ['port_command', 2], ['port_command', 3], ['port_control', 3],
    ['port_call', 3], ['port_connect', 2]]) def(name, arity, rt => badarg(rt));
  def('port_close', 1, rt => badarg(rt));
  def('port_info', 1, rt => rt.atom('undefined'));
  def('port_info', 2, rt => rt.atom('undefined'));
  def('ports', 0, rt => rt.nil());
  def('trace', 3, () => 0n);
  def('trace_pattern', 2, () => 0n);
  def('trace_pattern', 3, () => 0n);
  def('seq_trace', 2, rt => rt.atom('false'));
  def('seq_trace_info', 1, (rt, [item]) => rt.tuple([item, rt.atom('false')]));
  def('seq_trace_print', 1, rt => rt.atom('false'));
  def('seq_trace_print', 2, rt => rt.atom('false'));
  for (const name of ['dt_spread_tag', 'dt_restore_tag']) def(name, 1, (rt, [enabled]) => {
    if (enabled !== rt.atom('true') && (name === 'dt_restore_tag' || enabled !== rt.atom('false'))) badarg(rt);
    return rt.atom('true');
  });
  def('system_monitor', 0, rt => rt.atom('undefined'));
  def('system_monitor', 1, rt => rt.atom('undefined'));
  def('system_monitor', 2, rt => rt.atom('undefined'));
  def('system_profile', 0, rt => rt.atom('undefined'));
  def('system_profile', 2, rt => rt.atom('undefined'));
  def('match_spec_test', 3, (rt, [term, spec, kind]) => {
    if (kind !== rt.atom('table') && kind !== rt.atom('trace')) badarg(rt);
    return matchSpecTest(rt, term, spec, kind);
  });
  def('decode_packet', 3, rt => badarg(rt));

  return bifs;
}

function collectAtoms(root) {
  const found = [];
  const stack = [root];
  while (stack.length) {
    const term = stack.pop();
    if (typeof term === 'symbol') found.push(term);
    else if (is(term, TUPLE)) stack.push(...term[1]);
    else if (is(term, CONS)) stack.push(term[1][0], term[1][1]);
    else if (is(term, 8)) for (const [k, v] of term[1]) stack.push(k, v);
  }
  return found;
}

function gf2Times(matrix, vector) {
  let sum = 0;
  for (let i = 0; vector; i++, vector >>>= 1) if (vector & 1) sum ^= matrix[i];
  return sum >>> 0;
}

// zlib's crc32_combine.
function crc32Combine(crc1, crc2, length) {
  if (length <= 0) return crc1;
  let odd = new Array(32);
  let even = new Array(32);
  odd[0] = 0xedb88320;
  for (let i = 1, row = 1; i < 32; i++, row <<= 1) odd[i] = row >>> 0;
  const square = (target, matrix) => {
    for (let i = 0; i < 32; i++) target[i] = gf2Times(matrix, matrix[i]);
  };
  square(even, odd);
  square(odd, even);
  let remaining = length;
  do {
    square(even, odd);
    if (remaining & 1) crc1 = gf2Times(even, crc1);
    remaining = Math.floor(remaining / 2);
    if (!remaining) break;
    square(odd, even);
    if (remaining & 1) crc1 = gf2Times(odd, crc1);
    remaining = Math.floor(remaining / 2);
  } while (remaining);
  return (crc1 ^ crc2) >>> 0;
}

// zlib's adler32_combine.
function adler32Combine(adler1, adler2, rem) {
  const BASE = 65521;
  let sum1 = adler1 & 0xffff;
  let sum2 = (rem * sum1) % BASE;
  sum1 += (adler2 & 0xffff) + BASE - 1;
  sum2 += ((adler1 >>> 16) & 0xffff) + ((adler2 >>> 16) & 0xffff) + BASE - rem;
  if (sum1 >= BASE) sum1 -= BASE;
  if (sum1 >= BASE) sum1 -= BASE;
  if (sum2 >= BASE << 1) sum2 -= BASE << 1;
  if (sum2 >= BASE) sum2 -= BASE;
  return ((sum2 << 16) | sum1) >>> 0;
}

export {bytesToList, termKey, latin1Text, binaryBytes, bytesFromIodata, encodingName, makeAtom};
