// Overrides for the NIF stubs of the preloaded erts modules (erts_internal,
// persistent_term, atomics) and of maps. The compiled OTP modules supply
// everything else; counters is plain Erlang over erts_internal:counters_*.
import {
  FLOAT, TUPLE, BITSTRING, MAP, NIL,
  is, isAtom, isMap, listToArray, arrayToList, charlistText, termKey, compareExact, parseIntegerPrefix,
  latin1Text, binary, md5,
} from './term.mjs';

const badarg = rt => rt.raiseError(rt.atom('badarg'));

// Map entries in map-key order, cached per (immutable) map term.
const sortedEntries = new WeakMap();
function orderedEntries(rt, map) {
  let entries = sortedEntries.get(map);
  if (!entries) {
    entries = rt.mapEntries(map).sort((a, b) => compareExact(rt, a[0], b[0]));
    sortedEntries.set(map, entries);
  }
  return entries;
}

const requireMap = (rt, map) => {
  if (!isMap(map)) rt.raiseError(rt.tuple([rt.atom('badmap'), map]));
};

// Iterators over small maps are returned as {K, V, {K2, V2, ... none}} chains
// of up to this many entries, like OTP's flatmap iterators.
const CHAIN = 32;

function mapNext(rt, path, map, accumulator) {
  if (!isMap(map)) badarg(rt);
  const entries = orderedEntries(rt, map);
  let chunk;
  let rest;
  if (typeof path === 'bigint') {
    if (path < 0n || path > BigInt(entries.length)) badarg(rt);
    const start = Number(path);
    if (accumulator !== rt.atom('iterator')) {
      chunk = entries.slice(start);
      rest = null;
    } else {
      chunk = entries.slice(start, start + CHAIN);
      rest = start + CHAIN < entries.length ? rt.cons(BigInt(start + CHAIN), map) : null;
    }
  } else {
    const keys = listToArray(path);
    if (keys === null) badarg(rt);
    const take = accumulator === rt.atom('iterator') ? keys.slice(0, CHAIN) : keys;
    chunk = take.map(key => {
      const value = rt.mapGet(map, key);
      if (value === null) badarg(rt);
      return [key, value];
    });
    rest = keys.length > take.length ? rt.cons(arrayToList(rt, keys.slice(take.length)), map) : null;
  }
  if (accumulator === rt.atom('iterator')) {
    let result = rest ?? rt.atom('none');
    for (let i = chunk.length - 1; i >= 0; i--) result = rt.tuple([chunk[i][0], chunk[i][1], result]);
    return result;
  }
  if (listToArray(accumulator) === null) badarg(rt);
  return arrayToList(rt, chunk.map(entry => rt.tuple(entry)), accumulator);
}

function termType(rt, term) {
  if (typeof term === 'bigint') {
    return rt.atom(term >= -(1n << 59n) && term < (1n << 59n) ? 'fixnum' : 'bignum');
  }
  if (isAtom(term)) return rt.atom('atom');
  switch (term[0]) {
    case FLOAT: return rt.atom('hfloat');
    case NIL: return rt.atom('nil');
    case TUPLE: return rt.atom('tuple');
    case MAP: return rt.atom(term[1].length > 32 ? 'hashmap' : 'flatmap');
    case BITSTRING: return rt.atom(term[1][1] <= 64 * 8 ? 'heap_binary' : 'refc_binary');
    default: break;
  }
  if (rt.isType('is_nonempty_list', term)) return rt.atom('list');
  if (rt.isType('is_pid', term)) return rt.atom('pid');
  if (rt.isType('is_reference', term)) return rt.atom('ref');
  if (rt.isType('is_function', term)) return rt.atom(term[1].external ? 'export' : 'fun');
  return rt.atom('port');
}

// erts_internal:list_to_integer/2: {Int, Rest} | no_integer | not_a_list | badarg.
function listToIntegerPrefix(rt, list, base) {
  if (typeof base !== 'bigint' || base < 2n || base > 36n) return rt.atom('badarg');
  const chars = [];
  let cursor = list;
  if (!rt.isType('is_list', cursor)) return rt.atom('not_a_list');
  while (rt.isType('is_nonempty_list', cursor)) {
    const head = rt.listHead(cursor);
    if (typeof head !== 'bigint' || head < 0n || head > 0x10ffffn) break;
    chars.push(String.fromCodePoint(Number(head)));
    cursor = rt.listTail(cursor);
  }
  const text = chars.join('');
  const parsed = parseIntegerPrefix(text, Number(base));
  if (!parsed) return rt.atom('no_integer');
  let rest = list;
  for (let i = 0; i < parsed.length; i++) rest = rt.listTail(rest);
  return rt.tuple([parsed.value, rest]);
}

function binaryToIntegerStrict(rt, bin, base) {
  if (!is(bin, BITSTRING) || bin[1][1] % 8 !== 0 || typeof base !== 'bigint' || base < 2n || base > 36n) {
    return rt.atom('badarg');
  }
  const text = latin1Text(bin[1][0].subarray(0, bin[1][1] / 8));
  const parsed = parseIntegerPrefix(text, Number(base));
  if (!parsed || parsed.length !== text.length) return rt.atom('badarg');
  return parsed.value;
}

// Per-runtime state: persistent terms, atomics and counters arrays.
const state = new WeakMap();
function runtimeState(rt) {
  let found = state.get(rt);
  if (!found) {
    found = {persistent: new Map(), arrays: new Map()};
    state.set(rt, found);
  }
  return found;
}

function arrayFor(rt, ref, kind) {
  if (!rt.isType('is_reference', ref)) badarg(rt);
  const array = runtimeState(rt).arrays.get(ref[1]);
  if (!array || array.kind !== kind) badarg(rt);
  return array;
}

function slot(rt, array, index) {
  if (typeof index !== 'bigint' || index < 1n || index > BigInt(array.values.length)) badarg(rt);
  return Number(index) - 1;
}

const wrap = (array, value) => array.signed ? BigInt.asIntN(64, value) : BigInt.asUintN(64, value);

function checkValue(rt, array, value) {
  if (typeof value !== 'bigint') badarg(rt);
  const [min, max] = array.signed ? [-(1n << 63n), (1n << 63n) - 1n] : [0n, (1n << 64n) - 1n];
  if (value < min || value > max) badarg(rt);
  return value;
}

function checkIncrement(rt, value) {
  if (typeof value !== 'bigint' || value < -(1n << 63n) || value >= (1n << 64n)) badarg(rt);
  return value;
}

function newArray(rt, kind, size, signed) {
  if (typeof size !== 'bigint' || size < 1n || size > (1n << 28n)) badarg(rt);
  const ref = rt.makeRef();
  runtimeState(rt).arrays.set(ref[1], {kind, signed, values: new Array(Number(size)).fill(0n)});
  return ref;
}

// erts_internal:beamfile_chunk/2: the contents of an IFF chunk of a BEAM file.
function beamChunk(bytes, id) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12 || latin1Text(bytes.subarray(0, 4)) !== 'FOR1' || latin1Text(bytes.subarray(8, 12)) !== 'BEAM') {
    return null;
  }
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const name = latin1Text(bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4);
    if (name === id) return bytes.subarray(offset + 8, offset + 8 + size);
    offset += 8 + ((size + 3) & ~3);
  }
  return null;
}

export function ertsBifs() {
  const modules = new Map();
  const def = (module, name, arity, fn) => {
    if (!modules.has(module)) modules.set(module, []);
    modules.get(module).push([name, arity, fn]);
  };
  const atom = (rt, name) => rt.atom(name);

  // --- erts_internal -------------------------------------------------------------
  def('erts_internal', 'cmp_term', 2, (rt, [a, b]) => BigInt(compareExact(rt, a, b)));
  def('erts_internal', 'map_next', 3, (rt, [path, map, accumulator]) => mapNext(rt, path, map, accumulator));
  def('erts_internal', 'map_to_tuple_keys', 1, (rt, [map]) => {
    if (!isMap(map)) badarg(rt);
    return rt.tuple(orderedEntries(rt, map).map(([key]) => key));
  });
  def('erts_internal', 'map_hashmap_children', 1, rt => badarg(rt));
  def('erts_internal', 'term_type', 1, (rt, [term]) => termType(rt, term));
  def('erts_internal', 'list_to_integer', 2, (rt, [list, base]) => listToIntegerPrefix(rt, list, base));
  def('erts_internal', 'binary_to_integer', 2, (rt, [bin, base]) => binaryToIntegerStrict(rt, bin, base));
  def('erts_internal', 'time_unit', 0, () => 1000000000n);
  def('erts_internal', 'perf_counter_unit', 0, () => 1000000000n);
  def('erts_internal', 'is_system_process', 1, rt => atom(rt, 'false'));
  def('erts_internal', 'get_creation', 0, () => 0n);
  def('erts_internal', 'get_dflags', 0, rt => badarg(rt));
  def('erts_internal', 'no_aux_work_threads', 0, () => 0n);
  def('erts_internal', 'scheduler_wall_time', 1, rt => atom(rt, 'false'));
  def('erts_internal', 'system_check', 1, rt => atom(rt, 'ok'));
  def('erts_internal', 'garbage_collect', 1, rt => atom(rt, 'true'));
  def('erts_internal', 'check_process_code', 1, rt => atom(rt, 'false'));
  def('erts_internal', 'is_process_executing_dirty', 1, rt => atom(rt, 'false'));
  def('erts_internal', 'ets_super_user', 1, rt => atom(rt, 'true'));
  def('erts_internal', 'erase_persistent_terms', 0, rt => {
    runtimeState(rt).persistent.clear();
    return atom(rt, 'ok');
  });
  def('erts_internal', 'spawn_system_process', 3, (rt, [module, name, args]) =>
    ({type: 'tail', module: 'erlang', name: 'spawn', args: [module, name, args], external: true}));
  def('erts_internal', 'beamfile_chunk', 2, (rt, [bin, id]) => {
    if (!is(bin, BITSTRING) || bin[1][1] % 8 !== 0) badarg(rt);
    const found = beamChunk(bin[1][0].subarray(0, bin[1][1] / 8), charlistText(id) ?? badarg(rt));
    return found ? binary(rt, found) : atom(rt, 'undefined');
  });
  def('erts_internal', 'beamfile_module_md5', 1, (rt, [bin]) => {
    if (!is(bin, BITSTRING) || bin[1][1] % 8 !== 0) badarg(rt);
    const bytes = bin[1][0].subarray(0, bin[1][1] / 8);
    // The loader's MD5 covers these chunks in this order.
    const parts = ['AtU8', 'Code', 'StrT', 'ImpT', 'ExpT', 'FunT', 'LitT'].map(id => beamChunk(bytes, id));
    if (parts[0] === null || parts[1] === null) return atom(rt, 'undefined');
    const joined = [];
    for (const part of parts) if (part) joined.push(...part);
    return binary(rt, md5(Uint8Array.from(joined)));
  });
  def('erts_internal', 'atomics_new', 2, (rt, [size, options]) => {
    if (typeof options !== 'bigint') badarg(rt);
    return newArray(rt, 'atomics', size, (options & 1n) !== 0n);
  });
  def('erts_internal', 'counters_new', 1, (rt, [size]) => newArray(rt, 'counters', size, true));
  def('erts_internal', 'counters_get', 2, (rt, [ref, index]) => {
    const array = arrayFor(rt, ref, 'counters');
    return array.values[slot(rt, array, index)];
  });
  def('erts_internal', 'counters_add', 3, (rt, [ref, index, increment]) => {
    const array = arrayFor(rt, ref, 'counters');
    const i = slot(rt, array, index);
    array.values[i] = wrap(array, array.values[i] + checkIncrement(rt, increment));
    return atom(rt, 'ok');
  });
  def('erts_internal', 'counters_put', 3, (rt, [ref, index, value]) => {
    const array = arrayFor(rt, ref, 'counters');
    array.values[slot(rt, array, index)] = checkValue(rt, array, value);
    return atom(rt, 'ok');
  });
  def('erts_internal', 'counters_info', 1, (rt, [ref]) => {
    const array = arrayFor(rt, ref, 'counters');
    const size = BigInt(array.values.length);
    return rt.map([[atom(rt, 'size'), size], [atom(rt, 'memory'), 64n + 8n * size]]);
  });

  // --- atomics ---------------------------------------------------------------------
  def('atomics', 'get', 2, (rt, [ref, index]) => {
    const array = arrayFor(rt, ref, 'atomics');
    return array.values[slot(rt, array, index)];
  });
  def('atomics', 'put', 3, (rt, [ref, index, value]) => {
    const array = arrayFor(rt, ref, 'atomics');
    const i = slot(rt, array, index);
    array.values[i] = wrap(array, checkIncrement(rt, value));
    return atom(rt, 'ok');
  });
  def('atomics', 'add', 3, (rt, [ref, index, increment]) => {
    const array = arrayFor(rt, ref, 'atomics');
    const i = slot(rt, array, index);
    array.values[i] = wrap(array, array.values[i] + checkIncrement(rt, increment));
    return atom(rt, 'ok');
  });
  def('atomics', 'add_get', 3, (rt, [ref, index, increment]) => {
    const array = arrayFor(rt, ref, 'atomics');
    const i = slot(rt, array, index);
    array.values[i] = wrap(array, array.values[i] + checkIncrement(rt, increment));
    return array.values[i];
  });
  def('atomics', 'exchange', 3, (rt, [ref, index, desired]) => {
    const array = arrayFor(rt, ref, 'atomics');
    const i = slot(rt, array, index);
    const old = array.values[i];
    array.values[i] = wrap(array, checkIncrement(rt, desired));
    return old;
  });
  def('atomics', 'compare_exchange', 4, (rt, [ref, index, expected, desired]) => {
    const array = arrayFor(rt, ref, 'atomics');
    const i = slot(rt, array, index);
    checkIncrement(rt, expected);
    const replacement = wrap(array, checkIncrement(rt, desired));
    if (array.values[i] !== wrap(array, expected)) return array.values[i];
    array.values[i] = replacement;
    return atom(rt, 'ok');
  });
  def('atomics', 'info', 1, (rt, [ref]) => {
    const array = arrayFor(rt, ref, 'atomics');
    const size = BigInt(array.values.length);
    const [min, max] = array.signed ? [-(1n << 63n), (1n << 63n) - 1n] : [0n, (1n << 64n) - 1n];
    return rt.map([[atom(rt, 'size'), size], [atom(rt, 'max'), max], [atom(rt, 'min'), min],
      [atom(rt, 'memory'), 40n + 8n * size]]);
  });

  // --- persistent_term -------------------------------------------------------------
  const terms = rt => runtimeState(rt).persistent;
  def('persistent_term', 'get', 0, rt =>
    arrayToList(rt, [...terms(rt).values()].map(([key, value]) => rt.tuple([key, value]))));
  def('persistent_term', 'get', 1, (rt, [key]) => terms(rt).get(termKey(key))?.[1] ?? badarg(rt));
  def('persistent_term', 'get', 2, (rt, [key, fallback]) => terms(rt).get(termKey(key))?.[1] ?? fallback);
  def('persistent_term', 'put', 2, (rt, [key, value]) => {
    terms(rt).set(termKey(key), [key, value]);
    return atom(rt, 'ok');
  });
  def('persistent_term', 'put_new', 2, (rt, [key, value]) => {
    const found = terms(rt).get(termKey(key));
    if (found && !rt.equalExact(found[1], value)) badarg(rt);
    if (!found) terms(rt).set(termKey(key), [key, value]);
    return atom(rt, 'ok');
  });
  def('persistent_term', 'erase', 1, (rt, [key]) => rt.atom(terms(rt).delete(termKey(key)) ? 'true' : 'false'));
  def('persistent_term', 'info', 0, rt => {
    return rt.map([[atom(rt, 'count'), BigInt(terms(rt).size)], [atom(rt, 'memory'), BigInt(terms(rt).size) * 64n]]);
  });

  // --- maps ------------------------------------------------------------------------
  def('maps', 'get', 2, (rt, [key, map]) => {
    requireMap(rt, map);
    const found = rt.mapGet(map, key);
    if (found === null) rt.raiseError(rt.tuple([atom(rt, 'badkey'), key]));
    return found;
  });
  def('maps', 'find', 2, (rt, [key, map]) => {
    requireMap(rt, map);
    const found = rt.mapGet(map, key);
    return found === null ? atom(rt, 'error') : rt.tuple([atom(rt, 'ok'), found]);
  });
  def('maps', 'is_key', 2, (rt, [key, map]) => {
    requireMap(rt, map);
    return rt.atom(rt.mapGet(map, key) === null ? 'false' : 'true');
  });
  def('maps', 'keys', 1, (rt, [map]) => {
    requireMap(rt, map);
    return arrayToList(rt, orderedEntries(rt, map).map(([key]) => key));
  });
  def('maps', 'values', 1, (rt, [map]) => {
    requireMap(rt, map);
    return arrayToList(rt, orderedEntries(rt, map).map(([, value]) => value));
  });
  def('maps', 'from_list', 1, (rt, [list]) => {
    const items = listToArray(list);
    if (items === null) badarg(rt);
    return rt.map(items.map(item => {
      if (!is(item, TUPLE) || item[1].length !== 2) badarg(rt);
      return [item[1][0], item[1][1]];
    }));
  });
  def('maps', 'from_keys', 2, (rt, [list, value]) => {
    const keys = listToArray(list);
    if (keys === null) badarg(rt);
    return rt.map(keys.map(key => [key, value]));
  });
  def('maps', 'merge', 2, (rt, [left, right]) => {
    requireMap(rt, left);
    requireMap(rt, right);
    return rt.mapPut(left, rt.mapEntries(right));
  });
  def('maps', 'put', 3, (rt, [key, value, map]) => {
    requireMap(rt, map);
    return rt.mapPut(map, [[key, value]]);
  });
  def('maps', 'update', 3, (rt, [key, value, map]) => {
    requireMap(rt, map);
    return rt.mapUpdate(map, key, value);
  });
  def('maps', 'remove', 2, (rt, [key, map]) => {
    requireMap(rt, map);
    return rt.mapRemove(map, [key]);
  });
  def('maps', 'take', 2, (rt, [key, map]) => {
    requireMap(rt, map);
    const found = rt.mapGet(map, key);
    return found === null ? atom(rt, 'error') : rt.tuple([found, rt.mapRemove(map, [key])]);
  });
  return modules;
}
