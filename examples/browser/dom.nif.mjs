export function nif(runtime, _loadInfo) {
  return domFunctions(runtime, globalThis.document);
}

// Exported separately so tests can supply a stand-in document.
export function domFunctions(runtime, document) {
  const elements = new WeakSet();
  const subscriptions = new Map();
  const decoder = new TextDecoder('utf-8', {fatal: true});
  const encoder = new TextEncoder();

  function text(term) {
    if (!runtime.isBitstring(term) || runtime.bitstringSize(term) % 8 !== 0) {
      throw new TypeError('DOM text must be a UTF-8 binary');
    }
    return decoder.decode(runtime.bitstringBytes(term));
  }

  function binary(value) {
    if (typeof value !== 'string') throw new TypeError('DOM binary value must be a string');
    const bytes = encoder.encode(value);
    return runtime.bitstring(bytes, bytes.length * 8);
  }

  function element(rt, handle) {
    const value = rt.hostValue(handle);
    if (!elements.has(value)) throw new TypeError('element was not obtained from this DOM adapter');
    return value;
  }

  // Converts a property value to an Erlang term, or undefined to omit it.
  // Objects become host handles that the DOM functions accept.
  function propertyTerm(rt, value) {
    switch (typeof value) {
      case 'string': return binary(value);
      case 'boolean': return rt.atom(value ? 'true' : 'false');
      case 'bigint': return value;
      case 'number':
        if (Number.isInteger(value)) return BigInt(value);
        return Number.isFinite(value) ? rt.float(value) : undefined;
      case 'object':
        if (value === null) return undefined;
        elements.add(value);
        return rt.hostHandle(value);
      default: return undefined;
    }
  }

  // Snapshots every readable property of the event, including inherited ones.
  function eventMap(rt, event) {
    const entries = [];
    for (const name in event) {
      let value;
      try {
        value = event[name];
      } catch {
        continue;
      }
      const term = propertyTerm(rt, value);
      if (term !== undefined) entries.push([rt.atom(name), term]);
    }
    return rt.map(entries);
  }

  function list(term) {
    const values = [];
    while (runtime.isType('is_list', term) && runtime.isType('is_nonempty_list', term)) {
      values.push(runtime.listHead(term));
      term = runtime.listTail(term);
    }
    if (term !== runtime.nil()) throw new TypeError('DOM options must be a proper list');
    return values;
  }

  return [
    {
      name: 'element_by_id', arity: 1, exported: true,
      run: (rt, args) => {
        const id = text(rt.read(args, 0));
        const found = document.getElementById(id);
        if (found === null) throw new Error(`DOM element not found: ${id}`);
        elements.add(found);
        return {type: 'return', value: rt.hostHandle(found)};
      },
    },
    {
      name: 'append_text', arity: 2, exported: true,
      run: (rt, args) => {
        const found = element(rt, rt.read(args, 0));
        found.append(text(rt.read(args, 1)));
        return {type: 'return', value: rt.atom('ok')};
      },
    },
    {
      name: 'read_text', arity: 1, exported: true,
      run: (rt, args) => {
        const found = element(rt, rt.read(args, 0));
        return {type: 'return', value: binary(found.textContent ?? '')};
      },
    },
    {
      name: 'read_value', arity: 1, exported: true,
      run: (rt, args) => {
        const found = element(rt, rt.read(args, 0));
        if (!('value' in found)) return {type: 'return', value: rt.atom('undefined')};
        return {type: 'return', value: binary(found.value ?? '')};
      },
    },
    {
      name: 'get_attribute', arity: 2, exported: true,
      run: (rt, args) => {
        const found = element(rt, rt.read(args, 0));
        const name = text(rt.read(args, 1));
        if (typeof found.getAttribute !== 'function') return {type: 'return', value: rt.atom('undefined')};
        const value = found.getAttribute(name);
        return {type: 'return', value: value === null ? rt.atom('undefined') : binary(value)};
      },
    },
    {
      name: 'set_text', arity: 2, exported: true,
      run: (rt, args) => {
        const found = element(rt, rt.read(args, 0));
        found.textContent = text(rt.read(args, 1));
        return {type: 'return', value: rt.atom('ok')};
      },
    },
    {
      name: 'listen', arity: 3, exported: true,
      run: (rt, args, state, budget, pid) => {
        let detach = () => {};
        try {
          const found = element(rt, rt.read(args, 0));
          const eventType = rt.read(args, 1);
          if (!rt.isType('is_atom', eventType)) rt.raiseError(rt.atom('badarg'));
          const type = Symbol.keyFor(eventType);
          if (!type) rt.raiseError(rt.atom('badarg'));
          if (typeof found.addEventListener !== 'function') {
            return {type: 'return', value: rt.tuple([rt.atom('error'), rt.atom('unsupported_target')])};
          }
          const options = list(rt.read(args, 2));
          const flags = {capture: false, prevent_default: false, stop_propagation: false};
          for (const option of options) {
            if (!rt.isType('is_tuple', option)) rt.raiseError(rt.atom('badarg'));
            const parts = option[1];
            if (parts.length !== 2 || !rt.isType('is_atom', parts[0]) ||
                !rt.isType('is_boolean', parts[1])) rt.raiseError(rt.atom('badarg'));
            const name = Symbol.keyFor(parts[0]);
            if (!Object.hasOwn(flags, name)) rt.raiseError(rt.atom('badarg'));
            if (Object.prototype.hasOwnProperty.call(flags, name + '__set')) rt.raiseError(rt.atom('badarg'));
            flags[name] = parts[1] === rt.atom('true');
            flags[name + '__set'] = true;
          }
          const ref = rt.makeRef();
          const callback = event => {
            if (!subscriptions.has(ref) || !runtime.isProcessAlive(pid)) return;
            if (flags.prevent_default) event.preventDefault?.();
            if (flags.stop_propagation) event.stopPropagation?.();
            const message = rt.tuple([
              rt.atom('dom_event'), ref, rt.atom(type), eventMap(rt, event),
            ]);
            runtime.sendMessage(runtime.processHandle(pid), message);
          };
          found.addEventListener(type, callback, {capture: flags.capture});
          subscriptions.set(ref, {pid, found, callback, capture: flags.capture, type});
          try {
            detach = runtime.onProcessExit(pid, () => {
              const record = subscriptions.get(ref);
              if (!record) return;
              subscriptions.delete(ref);
              record.found.removeEventListener(type, record.callback, {capture: flags.capture});
            });
          } catch (error) {
            found.removeEventListener(type, callback, {capture: flags.capture});
            subscriptions.delete(ref);
            if (error?.reason === runtime.atom('badarg') || String(error).includes('badarg')) {
              return {type: 'return', value: rt.tuple([rt.atom('error'), rt.atom('scheduled_process_required')])};
            }
            throw error;
          }
          subscriptions.get(ref).detach = detach;
          return {type: 'return', value: rt.tuple([rt.atom('ok'), ref])};
        } catch (error) {
          if (error?.reason === runtime.atom('badarg')) rt.raiseError(rt.atom('badarg'));
          throw error;
        }
      },
    },
    {
      name: 'unlisten', arity: 1, exported: true,
      run: (rt, args, state, budget, pid) => {
        const ref = rt.read(args, 0);
        const record = subscriptions.get(ref);
        if (!record || record.pid !== pid) rt.raiseError(rt.atom('badarg'));
        subscriptions.delete(ref);
        record.found.removeEventListener(record.type, record.callback, {capture: record.capture});
        record.detach();
        return {type: 'return', value: rt.atom('ok')};
      },
    },
  ];
}
