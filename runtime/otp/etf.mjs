// The external term format: term_to_binary/1,2 and binary_to_term/1,2.
import {
  CONS, FLOAT, TUPLE, BITSTRING, PID, REFERENCE, MAP, FUN, NIL,
  is, utf8, decodeUtf8, compareExact,
} from './term.mjs';

const NODE = 'nonode@nohost';
// Local funs are encoded with an index into this table, which only this
// JavaScript realm can decode; OTP cannot decode local funs of other code either.
const localFuns = [];
const localFunIndexes = new Map();

class Writer {
  constructor() {
    this.bytes = new Uint8Array(64);
    this.length = 0;
  }

  ensure(extra) {
    if (this.length + extra <= this.bytes.length) return;
    let size = this.bytes.length * 2;
    while (size < this.length + extra) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.bytes.subarray(0, this.length));
    this.bytes = grown;
  }

  u8(value) {
    this.ensure(1);
    this.bytes[this.length++] = value;
  }

  u16(value) {
    this.u8((value >>> 8) & 0xff);
    this.u8(value & 0xff);
  }

  u32(value) {
    this.u16((value >>> 16) & 0xffff);
    this.u16(value & 0xffff);
  }

  raw(bytes) {
    this.ensure(bytes.length);
    this.bytes.set(bytes, this.length);
    this.length += bytes.length;
  }

  result() {
    return this.bytes.slice(0, this.length);
  }
}

function writeAtom(writer, name) {
  const bytes = utf8.encode(name);
  if (bytes.length < 256) {
    writer.u8(119);
    writer.u8(bytes.length);
  } else {
    writer.u8(118);
    writer.u16(bytes.length);
  }
  writer.raw(bytes);
}

function writeInteger(writer, value) {
  if (value >= 0n && value < 256n) {
    writer.u8(97);
    writer.u8(Number(value));
  } else if (value >= -(2n ** 31n) && value < 2n ** 31n) {
    writer.u8(98);
    writer.u32(Number(value) >>> 0);
  } else {
    let magnitude = value < 0n ? -value : value;
    const digits = [];
    while (magnitude > 0n) {
      digits.push(Number(magnitude & 0xffn));
      magnitude >>= 8n;
    }
    if (digits.length < 256) {
      writer.u8(110);
      writer.u8(digits.length);
    } else {
      writer.u8(111);
      writer.u32(digits.length);
    }
    writer.u8(value < 0n ? 1 : 0);
    writer.raw(digits);
  }
}

function localFunIndex(data) {
  const key = `${data.module}:${data.name}/${data.arity}`;
  let index = localFunIndexes.get(key);
  if (index === undefined) {
    index = localFuns.length;
    localFuns.push({module: data.module, name: data.name, arity: data.arity});
    localFunIndexes.set(key, index);
  }
  return index;
}

// Returns the encoded bytes, or null when the term cannot be encoded.
export function encodeTerm(rt, root) {
  const writer = new Writer();
  writer.u8(131);
  const stack = [root];
  while (stack.length) {
    const term = stack.pop();
    if (typeof term === 'bigint') {
      writeInteger(writer, term);
      continue;
    }
    if (typeof term === 'symbol') {
      writeAtom(writer, Symbol.keyFor(term));
      continue;
    }
    if (typeof term === 'function') {
      // Deferred patch, e.g. a fun's byte size.
      term();
      continue;
    }
    const [tag, data] = term;
    switch (tag) {
      case NIL:
        writer.u8(106);
        break;
      case FLOAT: {
        writer.u8(70);
        const view = new DataView(new ArrayBuffer(8));
        view.setFloat64(0, data);
        writer.raw(new Uint8Array(view.buffer));
        break;
      }
      case TUPLE:
        if (data.length < 256) {
          writer.u8(104);
          writer.u8(data.length);
        } else {
          writer.u8(105);
          writer.u32(data.length);
        }
        for (let i = data.length - 1; i >= 0; i--) stack.push(data[i]);
        break;
      case CONS: {
        const elements = [];
        let cursor = term;
        while (is(cursor, CONS)) {
          elements.push(cursor[1][0]);
          cursor = cursor[1][1];
        }
        if (is(cursor, NIL) && elements.length < 65536 &&
            elements.every(e => typeof e === 'bigint' && e >= 0n && e < 256n)) {
          writer.u8(107);
          writer.u16(elements.length);
          writer.raw(elements.map(Number));
          break;
        }
        writer.u8(108);
        writer.u32(elements.length);
        stack.push(cursor);
        for (let i = elements.length - 1; i >= 0; i--) stack.push(elements[i]);
        break;
      }
      case BITSTRING: {
        const [bytes, bits] = data;
        const size = Math.ceil(bits / 8);
        if (bits % 8 === 0) {
          writer.u8(109);
          writer.u32(size);
        } else {
          writer.u8(77);
          writer.u32(size);
          writer.u8(bits % 8);
        }
        const out = bytes.slice(0, size);
        if (bits % 8) out[size - 1] &= (0xff << (8 - bits % 8)) & 0xff;
        writer.raw(out);
        break;
      }
      case MAP: {
        writer.u8(116);
        writer.u32(data.length);
        const entries = data.map(([k, v]) => [k, v]).sort((a, b) => compareExact(rt, a[0], b[0]));
        for (let i = entries.length - 1; i >= 0; i--) stack.push(entries[i][1], entries[i][0]);
        break;
      }
      case PID:
        writer.u8(88);
        writeAtom(writer, NODE);
        writer.u32(Number(BigInt.asUintN(32, BigInt(data))));
        writer.u32(0);
        writer.u32(0);
        break;
      case REFERENCE: {
        writer.u8(90);
        writer.u16(3);
        writeAtom(writer, NODE);
        writer.u32(0);
        const value = BigInt(data);
        writer.u32(Number(value & 0x3ffffn));
        writer.u32(Number((value >> 18n) & 0xffffffffn));
        writer.u32(Number((value >> 50n) & 0xffffffffn));
        break;
      }
      case FUN:
        if (data.external) {
          writer.u8(113);
          writeAtom(writer, data.module);
          writeAtom(writer, data.name);
          writeInteger(writer, BigInt(data.arity));
        } else {
          writer.u8(112);
          const start = writer.length;
          writer.u32(0);
          writer.u8(data.arity - data.environment.length);
          writer.raw(new Uint8Array(16));
          writer.u32(localFunIndex(data));
          writer.u32(data.environment.length);
          writeAtom(writer, data.module);
          writeInteger(writer, 0n);
          writeInteger(writer, 0n);
          writer.u8(88);
          writeAtom(writer, NODE);
          writer.u32(0);
          writer.u32(0);
          writer.u32(0);
          stack.push(() => {
            const size = writer.length - start;
            writer.bytes[start] = size >>> 24;
            writer.bytes[start + 1] = (size >>> 16) & 0xff;
            writer.bytes[start + 2] = (size >>> 8) & 0xff;
            writer.bytes[start + 3] = size & 0xff;
          });
          for (let i = data.environment.length - 1; i >= 0; i--) stack.push(data.environment[i]);
        }
        break;
      default:
        return null;
    }
  }
  return writer.result();
}

class DecodeError extends Error {}

// Decodes {term, used} from bytes; `existingAtom(name)` decides whether a
// new atom may be created (the `safe` option). Throws DecodeError on bad input.
export function decodeTerm(rt, bytes, {safe = false, existingAtom = () => true} = {}) {
  let offset = 0;
  const need = count => {
    if (offset + count > bytes.length) throw new DecodeError('truncated');
  };
  const u8 = () => {
    need(1);
    return bytes[offset++];
  };
  const u16 = () => (u8() << 8) | u8();
  const u32 = () => ((u16() << 16) >>> 0) + u16();
  const take = count => {
    need(count);
    const out = bytes.subarray(offset, offset + count);
    offset += count;
    return out;
  };
  const atomFrom = (raw, isUtf8) => {
    let name;
    if (isUtf8) {
      name = decodeUtf8(raw);
      if (name === null) throw new DecodeError('bad atom');
    } else {
      name = String.fromCharCode(...raw);
    }
    if ([...name].length > 255) throw new DecodeError('atom too long');
    if (safe && !existingAtom(name)) throw new DecodeError('unsafe atom');
    return rt.atom(name);
  };
  if (u8() !== 131) throw new DecodeError('bad version');

  const decode = () => {
    const tag = u8();
    switch (tag) {
      case 97: return BigInt(u8());
      case 98: {
        const value = u32();
        return BigInt(value | 0);
      }
      case 110:
      case 111: {
        const count = tag === 110 ? u8() : u32();
        const sign = u8();
        const digits = take(count);
        let value = 0n;
        for (let i = digits.length - 1; i >= 0; i--) value = (value << 8n) | BigInt(digits[i]);
        return sign ? -value : value;
      }
      case 70: {
        const view = new DataView(take(8).slice().buffer);
        const value = view.getFloat64(0);
        if (!Number.isFinite(value)) throw new DecodeError('bad float');
        return rt.float(value);
      }
      case 99: {
        const text = String.fromCharCode(...take(31)).replace(/\0.*$/s, '');
        const value = Number(text);
        if (!Number.isFinite(value)) throw new DecodeError('bad float');
        return rt.float(value);
      }
      case 119: return atomFrom(take(u8()), true);
      case 118: return atomFrom(take(u16()), true);
      case 115: return atomFrom(take(u8()), false);
      case 100: return atomFrom(take(u16()), false);
      case 104:
      case 105: {
        const arity = tag === 104 ? u8() : u32();
        const elements = [];
        for (let i = 0; i < arity; i++) elements.push(decode());
        return rt.tuple(elements);
      }
      case 106: return rt.nil();
      case 107: {
        const chars = take(u16());
        let list = rt.nil();
        for (let i = chars.length - 1; i >= 0; i--) list = rt.cons(BigInt(chars[i]), list);
        return list;
      }
      case 108: {
        const count = u32();
        const elements = [];
        for (let i = 0; i < count; i++) elements.push(decode());
        let list = decode();
        for (let i = elements.length - 1; i >= 0; i--) list = rt.cons(elements[i], list);
        return list;
      }
      case 109: {
        const data = take(u32()).slice();
        return rt.bitstring(data, data.length * 8);
      }
      case 77: {
        const size = u32();
        const bits = u8();
        if (bits < 1 || bits > 8 || size === 0) throw new DecodeError('bad bitstring');
        const data = take(size).slice();
        data[size - 1] &= (0xff << (8 - bits)) & 0xff;
        return rt.bitstring(data, (size - 1) * 8 + bits);
      }
      case 116: {
        const count = u32();
        const entries = [];
        for (let i = 0; i < count; i++) {
          const key = decode();
          entries.push([key, decode()]);
        }
        const map = rt.map(entries);
        if (rt.mapSize(map) !== BigInt(count)) throw new DecodeError('duplicate map key');
        return map;
      }
      case 88:
      case 103: {
        decode();
        const id = u32();
        u32();
        if (tag === 88) u32(); else u8();
        return rt.lookupPid(BigInt(id));
      }
      case 90:
      case 114: {
        const count = u16();
        decode();
        if (tag === 90) u32(); else u8();
        const words = [];
        for (let i = 0; i < count; i++) words.push(BigInt(u32()));
        const value = (words[0] ?? 0n) | ((words[1] ?? 0n) << 18n) | ((words[2] ?? 0n) << 50n);
        return rt.lookupRef(value);
      }
      case 101: {
        decode();
        const id = u32();
        u8();
        return rt.lookupRef(BigInt(id));
      }
      case 113: {
        const module = decode();
        const name = decode();
        const arity = decode();
        if (typeof module !== 'symbol' || typeof name !== 'symbol' || typeof arity !== 'bigint' ||
            arity < 0n || arity > 255n) throw new DecodeError('bad export');
        return rt.externalFun(Symbol.keyFor(module), Symbol.keyFor(name), Number(arity));
      }
      case 112: {
        u32();
        u8();
        take(16);
        const index = u32();
        const free = u32();
        decode();
        decode();
        decode();
        decode();
        const environment = [];
        for (let i = 0; i < free; i++) environment.push(decode());
        const fun = localFuns[index];
        if (!fun) throw new DecodeError('unknown fun');
        return rt.makeFun(fun.module, fun.name, fun.arity, environment);
      }
      default:
        throw new DecodeError(`unsupported tag ${tag}`);
    }
  };
  const term = decode();
  return {term, used: offset};
}

export {DecodeError};
