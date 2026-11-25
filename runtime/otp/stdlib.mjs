// Overrides for the NIF stubs of OTP library modules (unicode, string, io,
// error_logger, file, os, math and binary). The compiled OTP modules
// supply everything else.
import {
  CONS, FLOAT, TUPLE, BITSTRING, NIL,
  is, isAtom, listToArray, arrayToList, bool, charlist, charlistText, binary, utf8,
  iolistBytes, parseFloatPrefix,
} from './term.mjs';

const badarg = rt => rt.raiseError(rt.atom('badarg'));

function bytesOf(rt, term) {
  if (!is(term, BITSTRING) || term[1][1] % 8 !== 0) badarg(rt);
  return term[1][0].subarray(0, term[1][1] / 8);
}

// --- unicode -----------------------------------------------------------------

const validCodePoint = cp => cp >= 0 && cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff);

// Decodes UTF-8 into `out`; returns the offset where decoding stopped and
// whether the stop was an incomplete (truncated but valid so far) sequence.
function decodeUtf8Into(bytes, out) {
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) {
      out.push(b);
      i++;
      continue;
    }
    let need, cp, min;
    if (b >= 0xc2 && b <= 0xdf) [need, cp, min] = [1, b & 0x1f, 0x80];
    else if (b >= 0xe0 && b <= 0xef) [need, cp, min] = [2, b & 0x0f, 0x800];
    else if (b >= 0xf0 && b <= 0xf4) [need, cp, min] = [3, b & 0x07, 0x10000];
    else return {stop: i, incomplete: false};
    let j = 1;
    for (; j <= need && i + j < bytes.length; j++) {
      const c = bytes[i + j];
      if ((c & 0xc0) !== 0x80) return {stop: i, incomplete: false};
      cp = (cp << 6) | (c & 0x3f);
      // Reject overlong forms, surrogates and values above U+10FFFF as soon as they are determined.
      if (j === 1 && ((need === 2 && b === 0xe0 && c < 0xa0) || (need === 2 && b === 0xed && c >= 0xa0) ||
          (need === 3 && b === 0xf0 && c < 0x90) || (need === 3 && b === 0xf4 && c >= 0x90))) {
        return {stop: i, incomplete: false};
      }
    }
    if (j <= need) return {stop: i, incomplete: true};
    if (cp < min || !validCodePoint(cp)) return {stop: i, incomplete: false};
    out.push(cp);
    i += need + 1;
  }
  return null;
}

// Converts chardata into code points. Returns {status, rest}; status is ok,
// error or incomplete, mirroring unicode:characters_to_binary/2.
function chardataCodePoints(rt, data, latin1, out) {
  const walkBinary = term => {
    const bytes = bytesOf(rt, term);
    if (latin1) {
      for (const byte of bytes) out.push(byte);
      return null;
    }
    const stopped = decodeUtf8Into(bytes, out);
    if (!stopped) return null;
    const rest = stopped.stop === 0 ? term : binary(rt, bytes.slice(stopped.stop));
    return {status: stopped.incomplete ? 'incomplete' : 'error', rest};
  };
  const walk = term => {
    if (is(term, BITSTRING)) return walkBinary(term);
    let cursor = term;
    while (is(cursor, CONS)) {
      const [head, tail] = cursor[1];
      if (typeof head === 'bigint') {
        const cp = Number(head);
        if (head < 0n || head > 0x10ffffn || !validCodePoint(cp) || (latin1 && cp > 255)) {
          if (!is(tail, CONS) && !is(tail, NIL) && !is(tail, BITSTRING)) badarg(rt);
          return {status: 'error', rest: cursor};
        }
        out.push(cp);
      } else if (is(head, BITSTRING) || is(head, CONS) || is(head, NIL)) {
        const result = walk(head);
        if (result) {
          if (result.status === 'incomplete' && is(tail, NIL)) return result;
          if (result.status === 'incomplete') return {status: 'error', rest: rt.cons(result.rest, rt.cons(tail, rt.nil()))};
          return {status: 'error', rest: rt.cons(result.rest, tail)};
        }
      } else {
        badarg(rt);
      }
      cursor = tail;
    }
    if (is(cursor, BITSTRING)) return walkBinary(cursor);
    if (!is(cursor, NIL)) badarg(rt);
    return null;
  };
  if (typeof data === 'bigint' || (!is(data, BITSTRING) && !is(data, CONS) && !is(data, NIL))) badarg(rt);
  const result = walk(data);
  if (!result) return {status: 'ok'};
  let rest = result.rest;
  if (is(rest, CONS) && is(rest[1][1], NIL) && is(rest[1][0], BITSTRING)) rest = rest[1][0];
  return {status: result.status, rest};
}

const encodeCodePoints = codePoints => utf8.encode(String.fromCodePoint(...codePoints));

function encodeLarge(codePoints) {
  const chunks = [];
  let size = 0;
  for (let i = 0; i < codePoints.length; i += 8192) {
    const chunk = encodeCodePoints(codePoints.slice(i, i + 8192));
    chunks.push(chunk);
    size += chunk.length;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function charactersTo(rt, data, encoding, asList, fallback) {
  if (!isAtom(encoding)) badarg(rt);
  const name = Symbol.keyFor(encoding);
  if (name !== 'latin1' && name !== 'unicode' && name !== 'utf8') {
    return {type: 'tail', module: 'unicode', name: fallback, args: [data, encoding], external: true};
  }
  const codePoints = [];
  const {status, rest} = chardataCodePoints(rt, data, name === 'latin1', codePoints);
  const converted = asList
    ? arrayToList(rt, codePoints.map(cp => BigInt(cp)))
    : binary(rt, encodeLarge(codePoints));
  if (status === 'ok') return converted;
  return rt.tuple([rt.atom(status), converted, rest]);
}

// --- binary ------------------------------------------------------------------

function patternList(rt, pattern) {
  if (is(pattern, TUPLE) && pattern[1].length === 2 && pattern[1][0] === rt.atom('beam2js_cp')) {
    return listToArray(pattern[1][1]).map(item => bytesOf(rt, item));
  }
  const list = is(pattern, BITSTRING) ? [pattern] : listToArray(pattern);
  if (list === null || list.length === 0) badarg(rt);
  return list.map(item => {
    const bytes = bytesOf(rt, item);
    if (bytes.length === 0) badarg(rt);
    return bytes;
  });
}

function scopeOf(rt, size, options) {
  let start = 0;
  let end = size;
  const list = listToArray(options);
  if (list === null) badarg(rt);
  const flags = new Set();
  for (const option of list) {
    if (is(option, TUPLE) && option[1].length === 2 && option[1][0] === rt.atom('scope')) {
      [start, end] = partRange(rt, size, option[1][1]);
    } else if (isAtom(option)) {
      flags.add(Symbol.keyFor(option));
    } else {
      badarg(rt);
    }
  }
  return {start, end, flags};
}

function partRange(rt, size, part) {
  if (!is(part, TUPLE) || part[1].length !== 2) badarg(rt);
  const [position, length] = part[1];
  if (typeof position !== 'bigint' || typeof length !== 'bigint') badarg(rt);
  let start = Number(position);
  let end = start + Number(length);
  if (end < start) [start, end] = [end, start];
  if (start < 0 || end > size) badarg(rt);
  return [start, end];
}

// Earliest match in [from, end); among patterns starting there, the longest.
function findMatch(bytes, patterns, from, end) {
  for (let i = from; i < end; i++) {
    let best = null;
    for (const pattern of patterns) {
      if (i + pattern.length > end || (best && pattern.length <= best.length)) continue;
      let j = 0;
      while (j < pattern.length && bytes[i + j] === pattern[j]) j++;
      if (j === pattern.length) best = pattern;
    }
    if (best) return [i, best.length];
  }
  return null;
}

function allMatches(bytes, patterns, start, end) {
  const found = [];
  let from = start;
  for (;;) {
    const match = findMatch(bytes, patterns, from, end);
    if (!match) return found;
    found.push(match);
    from = match[0] + match[1];
  }
}

function slice(rt, bytes, start, end) {
  return binary(rt, bytes.slice(start, end));
}

function unsignedEndian(rt, endian) {
  if (endian === rt.atom('big')) return false;
  if (endian === rt.atom('little')) return true;
  return badarg(rt);
}

function decodeUnsigned(rt, value, endian) {
  const bytes = bytesOf(rt, value);
  const little = unsignedEndian(rt, endian);
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[little ? bytes.length - 1 - i : i]);
  }
  return result;
}

function encodeUnsigned(rt, value, endian) {
  if (typeof value !== 'bigint' || value < 0n) badarg(rt);
  const little = unsignedEndian(rt, endian);
  const out = [];
  let rest = value;
  do {
    out.push(Number(rest & 0xffn));
    rest >>= 8n;
  } while (rest > 0n);
  if (!little) out.reverse();
  return binary(rt, Uint8Array.from(out));
}

function commonAffix(rt, list, suffix) {
  const binaries = listToArray(list);
  if (binaries === null || binaries.length === 0) badarg(rt);
  const all = binaries.map(item => bytesOf(rt, item));
  let length = Math.min(...all.map(bytes => bytes.length));
  for (let i = 0; i < length; i++) {
    const at = bytes => bytes[suffix ? bytes.length - 1 - i : i];
    if (all.some(bytes => at(bytes) !== at(all[0]))) {
      length = i;
      break;
    }
  }
  return BigInt(length);
}

function split(rt, subject, pattern, options) {
  const bytes = bytesOf(rt, subject);
  const patterns = patternList(rt, pattern);
  const {start, end, flags} = scopeOf(rt, bytes.length, options);
  for (const flag of flags) if (!['global', 'trim', 'trim_all'].includes(flag)) badarg(rt);
  const matches = flags.has('global') ? allMatches(bytes, patterns, start, end)
    : [findMatch(bytes, patterns, start, end)].filter(Boolean);
  const parts = [];
  let from = 0;
  for (const [position, length] of matches) {
    parts.push(slice(rt, bytes, from, position));
    from = position + length;
  }
  parts.push(slice(rt, bytes, from, bytes.length));
  let result = parts;
  if (flags.has('trim_all')) result = parts.filter(part => part[1][1] > 0);
  else if (flags.has('trim')) {
    while (result.length && result[result.length - 1][1][1] === 0) result = result.slice(0, -1);
  }
  return arrayToList(rt, result);
}

// --- math --------------------------------------------------------------------

function mathNumber(rt, value) {
  if (typeof value === 'bigint') return Number(value);
  if (is(value, FLOAT)) return value[1];
  return rt.raiseError(rt.atom('badarg'));
}

function mathResult(rt, value) {
  if (!Number.isFinite(value)) rt.raiseError(rt.atom('badarith'));
  return rt.float(value);
}

// Abramowitz-Stegun 7.1.26 is not precise enough; this is the W. J. Cody
// rational approximation used by many libm implementations.
function erf(x) {
  if (Number.isNaN(x)) return x;
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  if (a < 0.5) {
    const t = a * a;
    const p = [3.16112374387056560e00, 1.13864154151050156e02, 3.77485237685302021e02, 3.20937758913846947e03,
      1.85777706184603153e-1];
    const q = [2.36012909523441209e01, 2.44024637934444173e02, 1.28261652607737228e03, 2.84423683343917062e03];
    let num = p[4] * t;
    let den = t;
    for (let i = 0; i < 3; i++) {
      num = (num + p[i]) * t;
      den = (den + q[i]) * t;
    }
    return sign * a * (num + p[3]) / (den + q[3]);
  }
  return sign * (1 - erfc(a));
}

function erfc(x) {
  if (Number.isNaN(x)) return x;
  const a = Math.abs(x);
  if (a < 0.5) return 1 - erf(x);
  let result;
  if (a < 4) {
    const c = [5.64188496988670089e-1, 8.88314979438837594e00, 6.61191906371416295e01, 2.98635138197400131e02,
      8.81952221241769090e02, 1.71204761263407058e03, 2.05107837782607147e03, 1.23033935479799725e03,
      2.15311535474403846e-8];
    const d = [1.57449261107098347e01, 1.17693950891312499e02, 5.37181101862009858e02, 1.62138957456669019e03,
      3.29079923573345963e03, 4.36261909014324716e03, 3.43936767414372164e03, 1.23033935480374942e03];
    let num = c[8] * a;
    let den = a;
    for (let i = 0; i < 7; i++) {
      num = (num + c[i]) * a;
      den = (den + d[i]) * a;
    }
    result = (num + c[7]) / (den + d[7]);
  } else {
    const p = [3.05326634961232344e-1, 3.60344899949804439e-1, 1.25781726111229246e-1, 1.60837851487422766e-2,
      6.58749161529837803e-4, 1.63153871373020978e-2];
    const q = [2.56852019228982242e00, 1.87295284992346725e00, 5.27905102951428412e-1, 6.05183413124413191e-2,
      2.33520497626869185e-3];
    const z = 1 / (a * a);
    let num = p[5] * z;
    let den = z;
    for (let i = 0; i < 4; i++) {
      num = (num + p[i]) * z;
      den = (den + q[i]) * z;
    }
    result = z * (num + p[4]) / (den + q[4]);
    result = (1 / Math.sqrt(Math.PI) - result) / a;
  }
  const squared = Math.trunc(a * 16) / 16;
  result *= Math.exp(-squared * squared) * Math.exp(-(a - squared) * (a + squared));
  return x < 0 ? 2 - result : result;
}

// --- os ----------------------------------------------------------------------

const environments = new WeakMap();
function environment(rt) {
  let env = environments.get(rt);
  if (!env) {
    env = new Map(Object.entries(globalThis.process?.env ?? {}));
    environments.set(rt, env);
  }
  return env;
}

function osText(rt, term) {
  if (isAtom(term)) return Symbol.keyFor(term);
  const text = is(term, BITSTRING) ? new TextDecoder().decode(bytesOf(rt, term)) : charlistText(term);
  if (text === null || text.includes('\0')) badarg(rt);
  return text;
}

// --- definitions -------------------------------------------------------------

export function stdlibBifs() {
  const modules = new Map();
  const def = (module, name, arity, fn) => {
    if (!modules.has(module)) modules.set(module, []);
    modules.get(module).push([name, arity, fn]);
  };

  def('unicode', 'characters_to_binary', 2, (rt, [data, encoding]) =>
    charactersTo(rt, data, encoding, false, 'characters_to_binary_int'));
  def('unicode', 'characters_to_list', 2, (rt, [data, encoding]) =>
    charactersTo(rt, data, encoding, true, 'characters_to_list_int'));
  def('unicode', 'bin_is_7bit', 1, (rt, [value]) =>
    bool(rt, is(value, BITSTRING) && value[1][1] % 8 === 0 && bytesOf(rt, value).every(byte => byte < 128)));

  def('string', 'list_to_float', 1, (rt, [list]) => {
    const text = charlistText(list);
    if (text === null) badarg(rt);
    const parsed = parseFloatPrefix(text);
    if (!parsed) return rt.tuple([rt.atom('error'), rt.atom('no_float')]);
    return rt.tuple([rt.float(parsed.value), charlist(rt, text.slice(parsed.length))]);
  });
  def('io', 'printable_range', 0, rt => rt.atom('latin1'));
  def('error_logger', 'warning_map', 0, rt => rt.atom('warning'));
  def('file', 'native_name_encoding', 0, rt => rt.atom('utf8'));

  def('os', 'env', 0, rt => arrayToList(rt, [...environment(rt)].map(([key, value]) =>
    rt.tuple([charlist(rt, key), charlist(rt, value)]))));
  def('os', 'getenv', 1, (rt, [name]) => {
    const value = environment(rt).get(osText(rt, name));
    return value === undefined ? rt.atom('false') : charlist(rt, value);
  });
  def('os', 'putenv', 2, (rt, [name, value]) => {
    const key = osText(rt, name);
    if (!key || key.includes('=')) badarg(rt);
    environment(rt).set(key, osText(rt, value));
    return rt.atom('true');
  });
  def('os', 'unsetenv', 1, (rt, [name]) => {
    environment(rt).delete(osText(rt, name));
    return rt.atom('true');
  });
  def('os', 'getpid', 0, rt => charlist(rt, String(globalThis.process?.pid ?? 1)));
  def('os', 'perf_counter', 0, rt => rt.monotonicTime(rt.atom('native')));
  def('os', 'system_time', 0, () => BigInt(Date.now()) * 1000000n);
  def('os', 'system_time', 1, (rt, [unit]) => rt.callBif('system_time', [unit]));
  def('os', 'timestamp', 0, rt => rt.callBif('timestamp', []));
  def('os', 'set_signal', 2, rt => rt.atom('ok'));

  const unary = {
    acos: Math.acos, acosh: Math.acosh, asin: Math.asin, asinh: Math.asinh, atan: Math.atan, atanh: Math.atanh,
    ceil: Math.ceil, cos: Math.cos, cosh: Math.cosh, erf, erfc, exp: Math.exp, floor: Math.floor, log: Math.log,
    log2: Math.log2, log10: Math.log10, sin: Math.sin, sinh: Math.sinh, sqrt: Math.sqrt, tan: Math.tan,
    tanh: Math.tanh,
  };
  for (const [name, fn] of Object.entries(unary)) {
    def('math', name, 1, (rt, [value]) => mathResult(rt, fn(mathNumber(rt, value))));
  }
  def('math', 'atan2', 2, (rt, [y, x]) => mathResult(rt, Math.atan2(mathNumber(rt, y), mathNumber(rt, x))));
  def('math', 'pow', 2, (rt, [x, y]) => mathResult(rt, Math.pow(mathNumber(rt, x), mathNumber(rt, y))));
  def('math', 'fmod', 2, (rt, [x, y]) => mathResult(rt, mathNumber(rt, x) % mathNumber(rt, y)));


  def('binary', 'at', 2, (rt, [subject, position]) => {
    const bytes = bytesOf(rt, subject);
    if (typeof position !== 'bigint' || position < 0n || position >= BigInt(bytes.length)) badarg(rt);
    return BigInt(bytes[Number(position)]);
  });
  def('binary', 'compile_pattern', 1, (rt, [pattern]) =>
    rt.tuple([rt.atom('beam2js_cp'), arrayToList(rt, patternList(rt, pattern).map(bytes => binary(rt, bytes)))]));
  def('binary', 'copy', 1, (rt, [subject]) => binary(rt, bytesOf(rt, subject).slice()));
  def('binary', 'copy', 2, (rt, [subject, count]) => {
    const bytes = bytesOf(rt, subject);
    if (typeof count !== 'bigint' || count < 0n) badarg(rt);
    const out = new Uint8Array(bytes.length * Number(count));
    for (let i = 0; i < Number(count); i++) out.set(bytes, i * bytes.length);
    return binary(rt, out);
  });
  def('binary', 'decode_unsigned', 1, (rt, [value]) => decodeUnsigned(rt, value, rt.atom('big')));
  def('binary', 'decode_unsigned', 2, (rt, [value, endian]) => decodeUnsigned(rt, value, endian));
  def('binary', 'encode_unsigned', 1, (rt, [value]) => encodeUnsigned(rt, value, rt.atom('big')));
  def('binary', 'encode_unsigned', 2, (rt, [value, endian]) => encodeUnsigned(rt, value, endian));
  def('binary', 'first', 1, (rt, [subject]) => {
    const bytes = bytesOf(rt, subject);
    if (!bytes.length) badarg(rt);
    return BigInt(bytes[0]);
  });
  def('binary', 'last', 1, (rt, [subject]) => {
    const bytes = bytesOf(rt, subject);
    if (!bytes.length) badarg(rt);
    return BigInt(bytes[bytes.length - 1]);
  });
  def('binary', 'list_to_bin', 1, (rt, [list]) => {
    if (!is(list, CONS) && !is(list, NIL)) badarg(rt);
    const bytes = iolistBytes(list);
    if (bytes === null) badarg(rt);
    return binary(rt, bytes);
  });
  def('binary', 'longest_common_prefix', 1, (rt, [list]) => commonAffix(rt, list, false));
  def('binary', 'longest_common_suffix', 1, (rt, [list]) => commonAffix(rt, list, true));
  const match = (rt, subject, pattern, options) => {
    const bytes = bytesOf(rt, subject);
    const patterns = patternList(rt, pattern);
    const {start, end, flags} = scopeOf(rt, bytes.length, options);
    if (flags.size) badarg(rt);
    const found = findMatch(bytes, patterns, start, end);
    return found ? rt.tuple(found.map(BigInt)) : rt.atom('nomatch');
  };
  def('binary', 'match', 2, (rt, [subject, pattern]) => match(rt, subject, pattern, rt.nil()));
  def('binary', 'match', 3, (rt, [subject, pattern, options]) => match(rt, subject, pattern, options));
  const matches = (rt, subject, pattern, options) => {
    const bytes = bytesOf(rt, subject);
    const patterns = patternList(rt, pattern);
    const {start, end, flags} = scopeOf(rt, bytes.length, options);
    if (flags.size) badarg(rt);
    return arrayToList(rt, allMatches(bytes, patterns, start, end).map(found => rt.tuple(found.map(BigInt))));
  };
  def('binary', 'matches', 2, (rt, [subject, pattern]) => matches(rt, subject, pattern, rt.nil()));
  def('binary', 'matches', 3, (rt, [subject, pattern, options]) => matches(rt, subject, pattern, options));
  const part = (rt, subject, range) => {
    const bytes = bytesOf(rt, subject);
    const [start, end] = partRange(rt, bytes.length, range);
    return slice(rt, bytes, start, end);
  };
  def('binary', 'part', 2, (rt, [subject, range]) => part(rt, subject, range));
  def('binary', 'part', 3, (rt, [subject, position, length]) => part(rt, subject, rt.tuple([position, length])));
  def('binary', 'referenced_byte_size', 1, (rt, [subject]) => BigInt(bytesOf(rt, subject).length));
  def('binary', 'split', 2, (rt, [subject, pattern]) => split(rt, subject, pattern, rt.nil()));
  def('binary', 'split', 3, (rt, [subject, pattern, options]) => split(rt, subject, pattern, options));

  return modules;
}
