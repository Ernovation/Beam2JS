// Term helpers shared by the native OTP function implementations. Terms use
// the runtime ABI: [tag, data] arrays, BigInt integers and Symbol atoms.
export const CONS = 1;
export const FLOAT = 2;
export const TUPLE = 3;
export const BITSTRING = 4;
export const HOST_HANDLE = 5;
export const PID = 6;
export const REFERENCE = 7;
export const MAP = 8;
export const FUN = 9;
export const NIL = 10;

export const is = (term, tag) => Array.isArray(term) && term[0] === tag;
export const isAtom = term => typeof term === 'symbol';
export const isInteger = term => typeof term === 'bigint';
export const isFloat = term => is(term, FLOAT);
export const isNumber = term => typeof term === 'bigint' || is(term, FLOAT);
export const isTuple = term => is(term, TUPLE);
export const isCons = term => is(term, CONS);
export const isNil = term => is(term, NIL);
export const isList = term => is(term, CONS) || is(term, NIL);
export const isBitstring = term => is(term, BITSTRING);
export const isBinary = term => is(term, BITSTRING) && term[1][1] % 8 === 0;
export const isMap = term => is(term, MAP);
export const isFun = term => is(term, FUN);
export const isPid = term => is(term, PID);
export const isReference = term => is(term, REFERENCE);
export const atomName = atom => Symbol.keyFor(atom);
export const numberValue = term => typeof term === 'bigint' ? Number(term) : term[1];

export function fail(rt, reason = 'badarg') {
  rt.raiseError(typeof reason === 'string' ? rt.atom(reason) : reason);
}

export function binary(rt, bytes) {
  const array = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  return rt.bitstring(array, array.length * 8);
}

// Elements of a proper list, or null.
export function listToArray(term) {
  const result = [];
  while (is(term, CONS)) {
    result.push(term[1][0]);
    term = term[1][1];
  }
  return is(term, NIL) ? result : null;
}

export function arrayToList(rt, values, tail = rt.nil()) {
  let result = tail;
  for (let i = values.length - 1; i >= 0; i--) result = rt.cons(values[i], result);
  return result;
}

export function bool(rt, value) {
  return rt.atom(value ? 'true' : 'false');
}

// A string as a list of code points.
export function charlist(rt, text) {
  return arrayToList(rt, Array.from(text, char => BigInt(char.codePointAt(0))));
}

export function bytesToList(rt, bytes) {
  return arrayToList(rt, Array.from(bytes, byte => BigInt(byte)));
}

// A flat list of Unicode code points as a JavaScript string, or null.
export function charlistText(term) {
  let text = '';
  while (is(term, CONS)) {
    const value = term[1][0];
    if (typeof value !== 'bigint' || value < 0n || value > 0x10ffffn) return null;
    text += String.fromCodePoint(Number(value));
    term = term[1][1];
  }
  return is(term, NIL) ? text : null;
}

export const utf8 = new TextEncoder();
const strictUtf8 = new TextDecoder('utf-8', {fatal: true});

export function decodeUtf8(bytes) {
  try {
    return strictUtf8.decode(bytes);
  } catch {
    return null;
  }
}

export function latin1Text(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return text;
}

export function textBinary(rt, text) {
  return binary(rt, utf8.encode(text));
}

// Flattens iodata into bytes; returns null for anything else.
export function iolistBytes(term) {
  if (typeof term === 'bigint') return null;
  const out = [];
  const stack = [term];
  while (stack.length) {
    const item = stack.pop();
    if (is(item, BITSTRING)) {
      if (item[1][1] % 8 !== 0) return null;
      for (const byte of item[1][0]) out.push(byte);
    } else if (typeof item === 'bigint') {
      if (item < 0n || item > 255n) return null;
      out.push(Number(item));
    } else if (is(item, CONS)) {
      const tail = item[1][1];
      if (!is(tail, CONS) && !is(tail, NIL) && !is(tail, BITSTRING)) return null;
      stack.push(tail, item[1][0]);
    } else if (!is(item, NIL)) {
      return null;
    }
  }
  return Uint8Array.from(out);
}

// Flattens a bitstring list (as list_to_bitstring/1 accepts) into
// {bytes, bits}; returns null for anything else.
export function bitlistBits(term) {
  const writer = {bytes: [], bits: 0};
  const pushBits = (bytes, count) => {
    for (let i = 0; i < count; i++) {
      const bit = (bytes[i >> 3] >> (7 - (i & 7))) & 1;
      if ((writer.bits & 7) === 0) writer.bytes.push(0);
      writer.bytes[writer.bytes.length - 1] |= bit << (7 - (writer.bits & 7));
      writer.bits++;
    }
  };
  if (!is(term, CONS) && !is(term, NIL)) return null;
  const stack = [term];
  while (stack.length) {
    const item = stack.pop();
    if (is(item, BITSTRING)) {
      if ((writer.bits & 7) === 0 && item[1][1] % 8 === 0) {
        for (const byte of item[1][0]) writer.bytes.push(byte);
        writer.bits += item[1][1];
      } else {
        pushBits(item[1][0], item[1][1]);
      }
    } else if (typeof item === 'bigint') {
      if (item < 0n || item > 255n) return null;
      pushBits([Number(item)], 8);
    } else if (is(item, CONS)) {
      const tail = item[1][1];
      if (!is(tail, CONS) && !is(tail, NIL) && !is(tail, BITSTRING)) return null;
      stack.push(tail, item[1][0]);
    } else if (!is(item, NIL)) {
      return null;
    }
  }
  return writer;
}

// The code points of chardata (lists of code points and UTF-8 binaries).
export function chardataText(term) {
  if (typeof term === 'bigint') return null;
  let text = '';
  const stack = [term];
  while (stack.length) {
    const item = stack.pop();
    if (is(item, BITSTRING)) {
      if (item[1][1] % 8 !== 0) return null;
      const decoded = decodeUtf8(item[1][0]);
      if (decoded === null) return null;
      text += decoded;
    } else if (typeof item === 'bigint') {
      if (item < 0n || item > 0x10ffffn || (item >= 0xd800n && item <= 0xdfffn)) return null;
      text += String.fromCodePoint(Number(item));
    } else if (is(item, CONS)) {
      stack.push(item[1][1], item[1][0]);
    } else if (!is(item, NIL)) {
      return null;
    }
  }
  return text;
}

// A string key that is equal for exactly equal (=:=) terms.
export function termKey(term) {
  if (typeof term === 'bigint') return `i${term}`;
  if (typeof term === 'symbol') return `a${Symbol.keyFor(term)}\u0000`;
  const [tag, data] = term;
  switch (tag) {
    case FLOAT: return `f${Object.is(data, -0) ? '-0' : data}`;
    case NIL: return 'n';
    case CONS: {
      let key = '[';
      let cursor = term;
      while (is(cursor, CONS)) {
        key += `${termKey(cursor[1][0])},`;
        cursor = cursor[1][1];
      }
      return `${key}|${termKey(cursor)}]`;
    }
    case TUPLE: return `{${data.map(termKey).join(',')}}`;
    case BITSTRING: {
      const [bytes, bits] = data;
      let hex = '';
      const whole = bits >> 3;
      for (let i = 0; i < whole; i++) hex += bytes[i].toString(16).padStart(2, '0');
      if (bits & 7) hex += (bytes[whole] >> (8 - (bits & 7))).toString(16);
      return `b${bits}:${hex}`;
    }
    case MAP: return `#{${data.map(([k, v]) => [termKey(k), termKey(v)]).sort((a, b) => a[0] < b[0] ? -1 : 1)
      .map(([k, v]) => `${k}=>${v}`).join(',')}}`;
    case PID: return `p${data}`;
    case REFERENCE: return `r${data}`;
    case FUN: return data.external ? `F${data.module}:${data.name}/${data.arity}`
      : `f${data.module}:${data.name}/${data.arity}(${data.environment.map(termKey).join(',')})`;
    case HOST_HANDLE: return `h${data.id}`;
    default: throw new TypeError('termKey: unexpected term');
  }
}

// erts_internal:cmp_term/2 order (map-key order): the standard term order,
// except that every integer sorts before every float, at any depth.
export function compareExact(rt, left, right) {
  if (left === right) return 0;
  if (typeof left === 'bigint' && typeof right === 'bigint') return left < right ? -1 : 1;
  if (typeof left === 'symbol' && typeof right === 'symbol') return rt.compare(left, right);
  if (is(left, FLOAT) && is(right, FLOAT) && left[1] === 0 && right[1] === 0) {
    if (Object.is(left[1], right[1])) return 0;
    return Object.is(left[1], -0) ? -1 : 1;
  }
  const leftInt = typeof left === 'bigint';
  const rightInt = typeof right === 'bigint';
  if (leftInt && is(right, FLOAT)) return -1;
  if (is(left, FLOAT) && rightInt) return 1;
  if (is(left, TUPLE) && is(right, TUPLE) && left[1].length === right[1].length) {
    for (let i = 0; i < left[1].length; i++) {
      const c = compareExact(rt, left[1][i], right[1][i]);
      if (c) return c;
    }
    return 0;
  }
  if (is(left, CONS) && is(right, CONS)) {
    let a = left;
    let b = right;
    while (is(a, CONS) && is(b, CONS)) {
      const c = compareExact(rt, a[1][0], b[1][0]);
      if (c) return c;
      a = a[1][1];
      b = b[1][1];
    }
    return compareExact(rt, a, b);
  }
  if (is(left, MAP) && is(right, MAP) && left[1].length === right[1].length) {
    const a = sortedMapEntries(rt, left);
    const b = sortedMapEntries(rt, right);
    for (let i = 0; i < a.length; i++) {
      const c = compareExact(rt, a[i][0], b[i][0]);
      if (c) return c;
    }
    for (let i = 0; i < a.length; i++) {
      const c = compareExact(rt, a[i][1], b[i][1]);
      if (c) return c;
    }
    return 0;
  }
  return rt.compare(left, right);
}

// Map entries in the order OTP iterates small (flat) maps: by key, exactly.
export function sortedMapEntries(rt, map) {
  // The runtime keeps map entries in this order already.
  return map[1];
}

// --- Hashing (erl_term_hashing.c, 64-bit emulator) ---------------------------

const u32 = value => value >>> 0;

// atom.c atom_hash: hashpjw over the name, folding two-byte UTF-8 sequences
// of Latin-1 characters into the character.
export function atomHash(name) {
  const bytes = utf8.encode(name);
  let h = 0;
  for (let i = 0; i < bytes.length; i++) {
    let v = bytes[i];
    if (i + 1 < bytes.length && (v & 0xfe) === 0xc2 && (bytes[i + 1] & 0xc0) === 0x80) {
      v = ((v << 6) | (bytes[i + 1] & 0x3f)) & 0xff;
      i++;
    }
    h = u32((h << 4) + v);
    const g = h & 0xf0000000;
    if (g) h = u32((h ^ (g >>> 24)) ^ g);
  }
  return h;
}

function mix(s) {
  let {a, b, c} = s;
  a = u32(a - b - c); a = u32(a ^ (c >>> 13));
  b = u32(b - c - a); b = u32(b ^ (a << 8));
  c = u32(c - a - b); c = u32(c ^ (b >>> 13));
  a = u32(a - b - c); a = u32(a ^ (c >>> 12));
  b = u32(b - c - a); b = u32(b ^ (a << 16));
  c = u32(c - a - b); c = u32(c ^ (b >>> 5));
  a = u32(a - b - c); a = u32(a ^ (c >>> 3));
  b = u32(b - c - a); b = u32(b ^ (a << 10));
  c = u32(c - a - b); c = u32(c ^ (b >>> 15));
  s.a = a; s.b = b; s.c = c;
}

const HCONST = 0x9e3779b9;
const HC = n => u32(Math.imul(HCONST, n));

function blockHash(bytes, length, initval) {
  const s = {a: HCONST, b: HCONST, c: initval};
  const word = i => u32(bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24));
  let k = 0;
  let len = length;
  while (len >= 12) {
    s.a = u32(s.a + word(k));
    s.b = u32(s.b + word(k + 4));
    s.c = u32(s.c + word(k + 8));
    mix(s);
    k += 12;
    len -= 12;
  }
  s.c = u32(s.c + length);
  const add = (field, index, shift) => { s[field] = u32(s[field] + u32(bytes[k + index] << shift)); };
  /* eslint-disable no-fallthrough */
  switch (len) {
    case 11: add('c', 10, 24);
    case 10: add('c', 9, 16);
    case 9: add('c', 8, 8);
    case 8: add('b', 7, 24);
    case 7: add('b', 6, 16);
    case 6: add('b', 5, 8);
    case 5: add('b', 4, 0);
    case 4: add('a', 3, 24);
    case 3: add('a', 2, 16);
    case 2: add('a', 1, 8);
    case 1: add('a', 0, 0);
  }
  mix(s);
  return s.c;
}

function floatWords(value) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Object.is(value, -0) ? 0 : value);
  return [view.getUint32(0), view.getUint32(4)];
}

const MAP_TAIL = Symbol('map tail');
const MAP_PAIR = Symbol('map pair');

// make_hash2: erlang:phash2/1,2. Pids, references and local funs hash
// runtime-specific numbers, as their OTP hashes are node-specific too.
export function phash2(root) {
  let hash = 0;
  let xorPairs = 0;
  const hash2 = (x, y, constant) => {
    const s = {a: u32(constant + u32(x)), b: u32(constant + u32(y)), c: hash};
    mix(s);
    hash = s.c;
  };
  const hash1 = (x, constant) => hash2(x, 0, constant);
  const integer = value => {
    if (value >= -(1n << 27n) && value < (1n << 27n)) {
      const y = Number(value) | 0;
      if (y < 0) hash1(-y, HCONST);
      hash1(y, HCONST);
      return;
    }
    const constant = value < 0n ? HC(10) : HC(11);
    let magnitude = value < 0n ? -value : value;
    do {
      hash2(Number(magnitude & 0xffffffffn), Number((magnitude >> 32n) & 0xffffffffn), constant);
      magnitude >>= 64n;
    } while (magnitude > 0n);
  };
  if (typeof root === 'symbol') return atomHash(Symbol.keyFor(root));
  const stack = [];
  let term = root;
  for (;;) {
    let common = true;
    if (typeof term === 'bigint') {
      integer(term);
    } else if (typeof term === 'symbol') {
      const value = atomHash(Symbol.keyFor(term));
      if (hash === 0) hash = value; else hash1(value, HC(3));
    } else {
      const [tag, data] = term;
      if (tag === NIL) {
        if (hash === 0) hash = 3468870702; else hash1(2, HC(2));
      } else if (tag === CONS) {
        let count = 0;
        let shifted = 0;
        let cursor = term;
        while (is(cursor, CONS) && typeof cursor[1][0] === 'bigint' && cursor[1][0] >= 0n && cursor[1][0] <= 255n) {
          shifted = u32((shifted << 8) + Number(cursor[1][0]));
          if (count === 3) {
            hash1(shifted, HC(4));
            count = 0;
            shifted = 0;
          } else {
            count++;
          }
          cursor = cursor[1][1];
        }
        if (count > 0) hash1(shifted, HC(4));
        if (is(cursor, CONS)) {
          stack.push(cursor[1][1]);
          term = cursor[1][0];
        } else {
          term = cursor;
        }
        common = false;
      } else if (tag === TUPLE) {
        hash1(data.length, HC(9));
        if (data.length > 0) {
          for (let i = data.length - 1; i >= 1; i--) stack.push(data[i]);
          term = data[0];
          common = false;
        }
      } else if (tag === MAP) {
        hash1(data.length, HC(16));
        if (data.length > 0) {
          stack.push(xorPairs, hash, MAP_TAIL);
          hash = 0;
          xorPairs = 0;
          for (let i = data.length - 1; i >= 0; i--) stack.push(MAP_PAIR, data[i][1], data[i][0]);
        }
      } else if (tag === FLOAT) {
        const [high, low] = floatWords(data);
        hash2(high, low, HC(12));
      } else if (tag === BITSTRING) {
        const [bytes, bits] = data;
        const size = bits >> 3;
        const tail = bits & 7;
        const constant = u32(HC(13) + hash);
        if (bits === 0) {
          hash = constant;
        } else {
          hash = blockHash(bytes, size, constant);
          if (tail > 0) hash2(tail, bytes[size] >> (8 - tail), HC(15));
        }
      } else if (tag === FUN) {
        const moduleHash = atomHash(data.module);
        if (data.external) {
          hash2(data.arity, moduleHash, HCONST);
          hash1(atomHash(data.name), HC(14));
        } else {
          hash2(data.environment.length, moduleHash, HCONST);
          hash2(atomHash(data.name), data.arity, HCONST);
          if (data.environment.length > 0) {
            for (let i = data.environment.length - 1; i >= 1; i--) stack.push(data.environment[i]);
            term = data.environment[0];
            common = false;
          }
        }
      } else if (tag === PID) {
        hash1(Number(data), HC(5));
      } else {
        hash1(Number(tag === REFERENCE ? data : data?.id ?? 0), HC(7));
      }
    }
    if (!common) continue;
    for (;;) {
      if (stack.length === 0) return hash;
      term = stack.pop();
      if (term === MAP_TAIL) {
        hash = stack.pop();
        hash1(xorPairs, HC(19));
        xorPairs = stack.pop();
      } else if (term === MAP_PAIR) {
        xorPairs = u32(xorPairs ^ hash);
        hash = 0;
      } else {
        break;
      }
    }
  }
}

const F1 = 268440163;
const F2 = 268439161;
const F3 = 268435459;
const F4 = 268436141;
const F5 = 268438633;
const F6 = 268437017;
const F8 = 268437511;
const F9 = 268439627;
const F10 = 268440479;
const F11 = 268440577;
const F12 = 268440581;
const F13 = 268440593;
const F14 = 268440611;

// make_hash: erlang:phash/2.
export function phash(root) {
  let hash = 0;
  const mul = (h, k) => u32(Math.imul(h, k));
  const step = (value, prime) => {
    const x = u32(value);
    hash = u32(mul(hash, prime) + (x & 0xff));
    hash = u32(mul(hash, prime) + ((x >>> 8) & 0xff));
    hash = u32(mul(hash, prime) + ((x >>> 16) & 0xff));
    hash = u32(mul(hash, prime) + (x >>> 24));
  };
  const CDR_POST = Symbol('cdr post');
  const CDR_PRE = Symbol('cdr pre');
  const TUPLE_END = Symbol('tuple end');
  const stack = [];
  let term = root;
  for (;;) {
    let next = false;
    if (typeof term === 'bigint') {
      let magnitude = term < 0n ? -term : term;
      if (magnitude < (1n << 59n)) {
        step(Number(magnitude & 0xffffffffn), F2);
        if (magnitude >> 32n) step(Number(magnitude >> 32n), F2);
      } else {
        while (magnitude > 0n) {
          const digit = magnitude & 0xffffffffffffffffn;
          magnitude >>= 64n;
          const count = magnitude === 0n && (digit >> 32n) === 0n ? 4 : 8;
          for (let j = 0; j < count; j++) {
            hash = u32(mul(hash, F2) + Number((digit >> BigInt(8 * j)) & 0xffn));
          }
        }
      }
      hash = mul(hash, term < 0n ? F4 : F3);
    } else if (typeof term === 'symbol') {
      hash = u32(mul(hash, F1) + atomHash(Symbol.keyFor(term)));
    } else {
      const [tag, data] = term;
      if (tag === NIL) {
        hash = u32(mul(hash, F3) + 1);
      } else if (tag === CONS) {
        let cursor = term;
        next = true;
        while (is(cursor, CONS) && typeof cursor[1][0] === 'bigint' && cursor[1][0] >= 0n && cursor[1][0] <= 255n) {
          hash = u32(mul(hash, F2) + Number(cursor[1][0]));
          if (!is(cursor[1][1], CONS)) {
            stack.push(CDR_POST);
            term = cursor[1][1];
            cursor = null;
            break;
          }
          cursor = cursor[1][1];
        }
        if (cursor !== null) {
          stack.push(cursor[1][1], CDR_PRE);
          term = cursor[1][0];
        }
      } else if (tag === TUPLE) {
        stack.push(data.length, TUPLE_END);
        for (let i = data.length - 1; i >= 0; i--) stack.push(data[i]);
      } else if (tag === FLOAT) {
        const [high, low] = floatWords(data);
        hash = u32(mul(hash, F6) + u32(high ^ low));
      } else if (tag === BITSTRING) {
        const [bytes, bits] = data;
        const size = bits >> 3;
        for (let i = 0; i < size; i++) hash = u32(mul(hash, F1) + bytes[i]);
        const tail = bits & 7;
        if (tail > 0) hash = u32(mul(u32(mul(hash, F1) + (bytes[size] >> (8 - tail))), F12) + tail);
        hash = u32(mul(hash, F4) + size);
      } else if (tag === MAP) {
        hash = u32(mul(hash, F13) + F14 + phash2(term));
      } else if (tag === FUN) {
        if (data.external) {
          hash = u32(mul(hash, F11) + data.arity);
          hash = u32(mul(hash, F1) + atomHash(data.module));
          hash = u32(mul(hash, F1) + atomHash(data.name));
        } else {
          hash = u32(mul(hash, F10) + data.environment.length);
          hash = u32(mul(hash, F1) + atomHash(data.module));
          hash = u32(mul(hash, F2) + atomHash(data.name));
          for (let i = data.environment.length - 1; i >= 0; i--) stack.push(data.environment[i]);
        }
      } else if (tag === PID) {
        step(Number(data), F5);
        hash = mul(hash, F6);
      } else {
        step(Number(tag === REFERENCE ? data : data?.id ?? 0), F9);
        hash = mul(hash, F10);
      }
    }
    if (next) continue;
    for (;;) {
      if (stack.length === 0) return hash;
      term = stack.pop();
      if (term === CDR_POST) {
        hash = mul(hash, F8);
      } else if (term === CDR_PRE) {
        term = stack.pop();
        if (!is(term, CONS)) stack.push(CDR_POST);
        break;
      } else if (term === TUPLE_END) {
        hash = u32(mul(hash, F9) + stack.pop());
      } else {
        break;
      }
    }
  }
}

// --- Checksums ---------------------------------------------------------------

let crcTable;
export function crc32(bytes, crc = 0) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = (crc ^ 0xffffffff) >>> 0;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function adler32(bytes, adler = 1) {
  let a = adler & 0xffff;
  let b = (adler >>> 16) & 0xffff;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const md5Shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const md5K = Array.from({length: 64}, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

// Incremental MD5 context: {state, buffer, length}; contexts are immutable.
export function md5Init() {
  return {state: [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476], buffer: [], length: 0};
}

function md5Block(state, block) {
  const words = new Array(16);
  for (let i = 0; i < 16; i++) {
    words[i] = block[i * 4] | (block[i * 4 + 1] << 8) | (block[i * 4 + 2] << 16) | (block[i * 4 + 3] << 24);
  }
  let [a, b, c, d] = state;
  for (let i = 0; i < 64; i++) {
    let f;
    let g;
    if (i < 16) { f = (b & c) | (~b & d); g = i; }
    else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
    else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
    else { f = c ^ (b | ~d); g = (7 * i) % 16; }
    const shift = md5Shifts[(i >> 4) * 4 + (i & 3)];
    const sum = (a + f + md5K[i] + words[g]) | 0;
    a = d;
    d = c;
    c = b;
    b = (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0;
  }
  state[0] = (state[0] + a) | 0;
  state[1] = (state[1] + b) | 0;
  state[2] = (state[2] + c) | 0;
  state[3] = (state[3] + d) | 0;
}

export function md5Update(context, bytes) {
  const next = {state: context.state.slice(), buffer: context.buffer.slice(), length: context.length + bytes.length};
  for (const byte of bytes) {
    next.buffer.push(byte);
    if (next.buffer.length === 64) {
      md5Block(next.state, next.buffer);
      next.buffer = [];
    }
  }
  return next;
}

export function md5Final(context) {
  const bitLength = BigInt(context.length) * 8n;
  const padding = [0x80];
  while ((context.buffer.length + padding.length) % 64 !== 56) padding.push(0);
  for (let i = 0n; i < 8n; i++) padding.push(Number((bitLength >> (8n * i)) & 0xffn));
  const done = md5Update(context, padding);
  const out = new Uint8Array(16);
  done.state.forEach((word, i) => {
    for (let j = 0; j < 4; j++) out[i * 4 + j] = (word >>> (8 * j)) & 0xff;
  });
  return out;
}

export function md5(bytes) {
  return md5Final(md5Update(md5Init(), bytes));
}

// --- Float formatting --------------------------------------------------------

// The exact decimal value of a finite double: digits * 10^-scale.
function exactDecimal(value) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(value));
  const bits = view.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  let mantissa = bits & ((1n << 52n) - 1n);
  let power;
  if (exponent === 0) {
    power = -1074;
  } else {
    mantissa |= 1n << 52n;
    power = exponent - 1075;
  }
  if (power >= 0) return {digits: mantissa << BigInt(power), scale: 0};
  return {digits: mantissa * 5n ** BigInt(-power), scale: -power};
}

function roundHalfEven(numerator, divisor) {
  const quotient = numerator / divisor;
  const twice = (numerator % divisor) * 2n;
  if (twice > divisor || (twice === divisor && quotient % 2n === 1n)) return quotient + 1n;
  return quotient;
}

// printf("%.*f"): exact, round-half-even.
export function formatFixed(value, decimals) {
  const sign = value < 0 || Object.is(value, -0) ? '-' : '';
  const {digits, scale} = exactDecimal(value);
  const scaled = scale <= decimals
    ? digits * 10n ** BigInt(decimals - scale)
    : roundHalfEven(digits, 10n ** BigInt(scale - decimals));
  let text = scaled.toString().padStart(decimals + 1, '0');
  if (decimals > 0) text = `${text.slice(0, -decimals)}.${text.slice(-decimals)}`;
  return sign + text;
}

// printf("%.*e"): exact, round-half-even.
export function formatScientific(value, decimals) {
  const sign = value < 0 || Object.is(value, -0) ? '-' : '';
  const {digits, scale} = exactDecimal(value);
  if (digits === 0n) return `${sign}0${decimals > 0 ? `.${'0'.repeat(decimals)}` : ''}e+00`;
  let exponent = digits.toString().length - 1 - scale;
  const scaledFor = exp => {
    const shift = decimals - exp - scale;
    return shift >= 0 ? digits * 10n ** BigInt(shift) : roundHalfEven(digits, 10n ** BigInt(-shift));
  };
  let scaled = scaledFor(exponent);
  if (scaled.toString().length > decimals + 1) scaled = scaledFor(++exponent);
  const text = scaled.toString();
  const mantissa = decimals > 0 ? `${text[0]}.${text.slice(1)}` : text;
  return `${sign}${mantissa}e${exponent < 0 ? '-' : '+'}${String(Math.abs(exponent)).padStart(2, '0')}`;
}

// float_to_list(F, [short]): the shortest round-tripping digits, laid out
// like OTP's adapted ryu to_chars.
export function formatShort(value) {
  const sign = value < 0 || Object.is(value, -0) ? '-' : '';
  if (value === 0) return `${sign}0.0`;
  const [mantissa, exponentText] = Math.abs(value).toExponential().split('e');
  const digits = mantissa.replace('.', '');
  const length = digits.length;
  const scientificExponent = Number(exponentText);
  const exponent = scientificExponent - length + 1;
  const output = BigInt(digits);
  let lower = -(length + 2);
  let upper = 1;
  if (length === 1) {
    lower = -4;
    upper = 2;
  } else if (scientificExponent >= 10) {
    upper = 2;
  }
  const fixed = lower <= exponent && exponent <= upper &&
    !((output >= 1n << 53n && exponent === 0) || (output > (1n << 52n) / 5n && exponent === 1) ||
      (output > (1n << 51n) / 25n && exponent === 2));
  if (!fixed) return `${sign}${digits[0]}.${length > 1 ? digits.slice(1) : '0'}e${scientificExponent}`;
  if (exponent >= 0) return `${sign}${digits}${'0'.repeat(exponent)}.0`;
  const whole = length + exponent;
  if (whole > 0) return `${sign}${digits.slice(0, whole)}.${digits.slice(whole)}`;
  return `${sign}0.${'0'.repeat(-whole)}${digits}`;
}

const stripTrailingZeros = text => {
  let end = text.length;
  while (text[end - 1] === '0') end--;
  if (text[end - 1] === '.') end++;
  return text.slice(0, end);
};

// sys_double_to_chars_fast: doubles up to 2^53 with fewer than 19 decimals
// use double arithmetic and round-half-away-from-zero; others use printf.
function formatDecimals(value, decimals, compact) {
  const negative = value < 0 || Object.is(value, -0);
  const absolute = Math.abs(value);
  let text;
  if (absolute > 2 ** 53 || decimals >= 19) {
    text = formatFixed(value, decimals);
    if (compact) text = stripTrailingZeros(text);
    return text;
  }
  if (decimals > 0) {
    const whole = Math.floor(absolute);
    const scale = 10 ** decimals;
    const fraction = Math.round((absolute - whole) * scale);
    let intPart = BigInt(whole);
    let fracPart = BigInt(fraction);
    if (fraction >= scale) {
      intPart++;
      fracPart = 0n;
    }
    text = `${intPart}.${fracPart.toString().padStart(decimals, '0')}`;
    if (compact) text = stripTrailingZeros(text);
  } else {
    text = String(BigInt(Math.round(absolute)));
  }
  return (negative ? '-' : '') + text;
}

// float_to_list/2 and float_to_binary/2: the text, or null for badarg.
export function floatToText(value, options) {
  let format = 'scientific';
  let decimals = 20;
  let compact = false;
  for (const option of options) {
    if (option === Symbol.for('compact')) {
      compact = true;
    } else if (option === Symbol.for('short')) {
      format = 'short';
    } else if (is(option, TUPLE) && option[1].length === 2 && typeof option[1][1] === 'bigint' &&
               (option[1][0] === Symbol.for('decimals') || option[1][0] === Symbol.for('scientific'))) {
      if (option[1][1] < -(1n << 59n) || option[1][1] >= (1n << 59n)) return null;
      decimals = Number(option[1][1]);
      format = Symbol.keyFor(option[1][0]);
    } else {
      return null;
    }
  }
  if (format === 'short') return formatShort(value);
  if (decimals < 0) return null;
  if (format === 'decimals') {
    if (decimals > 255) return null;
    const text = formatDecimals(value, decimals, compact);
    return text.length > 0 && text.length < 256 ? text : null;
  }
  if (decimals > 255) return null;
  const text = formatScientific(value, decimals);
  return text.length < 256 ? text : null;
}

// --- Number parsing ----------------------------------------------------------

// Erlang float syntax: [+-]digits.digits[(e|E)[+-]digits]
const floatPattern = /^[+-]?[0-9]+\.[0-9]+(?:[eE][+-]?[0-9]+)?/;

export function parseFloatPrefix(text) {
  const match = text.match(floatPattern);
  if (!match) return null;
  const value = Number(match[0]);
  if (!Number.isFinite(value)) return null;
  return {value, length: match[0].length};
}

export function parseIntegerPrefix(text, base) {
  const digits = '0123456789abcdefghijklmnopqrstuvwxyz'.slice(0, base);
  let i = 0;
  let negative = false;
  if (text[0] === '+' || text[0] === '-') {
    negative = text[0] === '-';
    i = 1;
  }
  const start = i;
  let value = 0n;
  const bigBase = BigInt(base);
  while (i < text.length) {
    const digit = digits.indexOf(text[i].toLowerCase());
    if (digit < 0) break;
    value = value * bigBase + BigInt(digit);
    i++;
  }
  if (i === start) return null;
  return {value: negative ? -value : value, length: i};
}

// BEAM allows 4194240-bit integers, but SpiderMonkey caps BigInts at 2^20 bits and
// reserves an extra 64-bit digit for arithmetic results. Use one portable limit for
// every engine; larger results raise system_limit.
export const MAX_INTEGER_BITS = 1048512n;
export const MAX_INTEGER = (1n << MAX_INTEGER_BITS) - 1n;
