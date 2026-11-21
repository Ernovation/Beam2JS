const floats = new WeakMap();
const consCells = new WeakMap();
const tuples = new WeakMap();
const bitstrings = new WeakMap();
const hostHandles = new WeakMap();
let nextHostHandleId = 0n;
const nil = Object.freeze({});

function isAtom(value) {
  return typeof value === 'symbol' && Symbol.keyFor(value) !== undefined;
}

function isTerm(value) {
  return typeof value === 'bigint' || isAtom(value) || floats.has(value) ||
    value === nil || consCells.has(value) || tuples.has(value) || bitstrings.has(value) ||
    hostHandles.has(value);
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

export class Runtime {
  #hostObjects = new WeakMap();

  constructor() {
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
    const rank = {integer: 0, float: 0, atom: 1, host_handle: 2, tuple: 3, nil: 4, cons: 5, bitstring: 6};
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
      case 'is_binary':
        return actual === 'bitstring' && bitstrings.get(value)[1] % 8 === 0;
      case 'is_bitstr':
      case 'is_bitstring': return actual === 'bitstring';
      default: throw new Error(`unsupported type test: ${type}`);
    }
  }

  registerModule(version, name, functions) {
    if (version !== 1 && version !== 2 && version !== 3 && version !== 4 &&
        version !== 5 && version !== 6 && version !== 7 && version !== 8 &&
        version !== 9 && version !== 10 && version !== 11 && version !== 12 && version !== 13 &&
        version !== 14 && version !== 15) {
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
    if (!Array.isArray(args) || args.some(value => !isTerm(value))) {
      throw new TypeError('arguments must be supported Erlang terms');
    }
    let external = true;
    let fn;
    let state;
    const continuations = [];
    while (true) {
      if (!fn) {
        if (!Array.isArray(args) || args.some(value => !isTerm(value))) {
          throw new TypeError('arguments must be supported Erlang terms');
        }
        fn = this.modules.get(module)?.get(JSON.stringify([name, args.length]));
        if (!fn || (external && !fn.exported)) {
          throw new Error(`undefined or unsupported function: ${module}:${name}/${args.length}`);
        }
      }
      const action = fn.run(this, args.slice(), state);
      if (action.type === 'return') {
        if (!isTerm(action.value)) throw new TypeError('return value must be a supported Erlang term');
        if (continuations.length === 0) return action.value;
        ({fn, state} = continuations.pop());
        args = [action.value];
      } else if (action.type === 'call' || action.type === 'tail') {
        if (action.type === 'call') continuations.push({fn, state: action.state});
        ({module, name, args, external} = action);
        fn = undefined;
        state = undefined;
      } else {
        throw new Error(`unsupported runtime action: ${action.type}`);
      }
    }
  }
}
