export class Runtime {
  constructor() {
    this.modules = new Map();
  }

  atom(name) {
    if (typeof name !== 'string') throw new TypeError('atom name must be a string');
    return Symbol.for(name);
  }

  read(registers, index) {
    if (!(index in registers)) throw new Error(`uninitialized x register ${index}`);
    return registers[index];
  }

  args(registers, arity) {
    return Array.from({length: arity}, (_, index) => this.read(registers, index));
  }

  registerModule(version, name, functions) {
    if (version !== 1) throw new Error(`unsupported runtime ABI ${version}`);
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
    if (!Array.isArray(args) || args.some(value =>
      typeof value !== 'bigint' && (typeof value !== 'symbol' || Symbol.keyFor(value) === undefined))) {
      throw new TypeError('arguments must be Erlang integers or atoms');
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
