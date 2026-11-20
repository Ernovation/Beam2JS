const floats = new WeakMap();
const consCells = new WeakMap();
const tuples = new WeakMap();
const nil = Object.freeze({});

function isAtom(value) {
  return typeof value === 'symbol' && Symbol.keyFor(value) !== undefined;
}

function isTerm(value) {
  return typeof value === 'bigint' || isAtom(value) || floats.has(value) ||
    value === nil || consCells.has(value) || tuples.has(value);
}

function termType(value) {
  if (typeof value === 'bigint') return 'integer';
  if (isAtom(value)) return 'atom';
  if (floats.has(value)) return 'float';
  if (value === nil) return 'nil';
  if (consCells.has(value)) return 'cons';
  if (tuples.has(value)) return 'tuple';
  throw new TypeError('unsupported Erlang term');
}

export class Runtime {
  constructor() {
    this.modules = new Map();
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

  read(registers, index) {
    if (!(index in registers)) throw new Error(`uninitialized x register ${index}`);
    return registers[index];
  }

  args(registers, arity) {
    return Array.from({length: arity}, (_, index) => this.read(registers, index));
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
    const rank = {integer: 0, float: 0, atom: 1, tuple: 2, nil: 3, cons: 4};
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
      default: throw new Error(`unsupported type test: ${type}`);
    }
  }

  registerModule(version, name, functions) {
    if (version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5) {
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
    while (true) {
      const fn = this.modules.get(module)?.get(JSON.stringify([name, args.length]));
      if (!fn || (external && !fn.exported)) {
        throw new Error(`undefined or unsupported function: ${module}:${name}/${args.length}`);
      }
      const action = fn.run(this, args.slice());
      if (action.type === 'return') return action.value;
      if (action.type !== 'tail') throw new Error(`unsupported runtime action: ${action.type}`);
      ({module, name, args, external} = action);
    }
  }
}
