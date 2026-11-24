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

  function propertyMap(entries) {
    return runtime.map(entries.map(([name, value]) => [runtime.atom(name), value]));
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
          if (!['click', 'mousemove', 'input', 'keydown', 'submit'].includes(type)) {
            return {type: 'return', value: rt.tuple([rt.atom('error'), rt.atom('unsupported_event')])};
          }
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
            let entries;
            if (type === 'click') {
              entries = [
                ['button', BigInt(event.button ?? 0)],
                ['client_x', rt.float(Number(event.clientX ?? 0))],
                ['client_y', rt.float(Number(event.clientY ?? 0))],
                ['alt_key', rt.atom(event.altKey ? 'true' : 'false')],
                ['ctrl_key', rt.atom(event.ctrlKey ? 'true' : 'false')],
                ['meta_key', rt.atom(event.metaKey ? 'true' : 'false')],
                ['shift_key', rt.atom(event.shiftKey ? 'true' : 'false')],
              ];
            } else if (type === 'mousemove') {
              entries = [
                ['client_x', rt.float(Number(event.clientX ?? 0))],
                ['client_y', rt.float(Number(event.clientY ?? 0))],
                ['offset_x', rt.float(Number(event.offsetX ?? 0))],
                ['offset_y', rt.float(Number(event.offsetY ?? 0))],
              ];
            } else if (type === 'input') {
              entries = [
                ['value', binary(event.target?.value ?? '')],
                ['is_composing', rt.atom(event.isComposing ? 'true' : 'false')],
              ];
            } else if (type === 'keydown') {
              entries = [
                ['key', binary(event.key ?? '')],
                ['code', binary(event.code ?? '')],
                ['repeat', rt.atom(event.repeat ? 'true' : 'false')],
                ['alt_key', rt.atom(event.altKey ? 'true' : 'false')],
                ['ctrl_key', rt.atom(event.ctrlKey ? 'true' : 'false')],
                ['meta_key', rt.atom(event.metaKey ? 'true' : 'false')],
                ['shift_key', rt.atom(event.shiftKey ? 'true' : 'false')],
              ];
            } else {
              entries = [];
            }
            const message = rt.tuple([
              rt.atom('dom_event'), ref, rt.atom(type), propertyMap(entries),
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
