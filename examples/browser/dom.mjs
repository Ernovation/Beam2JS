export function registerDom(runtime, document) {
  const elements = new WeakSet();
  const decoder = new TextDecoder('utf-8', {fatal: true});

  function text(term) {
    if (!runtime.isBitstring(term) || runtime.bitstringSize(term) % 8 !== 0) {
      throw new TypeError('DOM text must be a UTF-8 binary');
    }
    return decoder.decode(runtime.bitstringBytes(term));
  }

  runtime.registerModule(19, 'dom', [
    {
      name: 'element_by_id', arity: 1, exported: true,
      run: (rt, args) => {
        const id = text(rt.read(args, 0));
        const element = document.getElementById(id);
        if (element === null) throw new Error(`DOM element not found: ${id}`);
        elements.add(element);
        return {type: 'return', value: rt.hostHandle(element)};
      },
    },
    {
      name: 'append_text', arity: 2, exported: true,
      run: (rt, args) => {
        const element = rt.hostValue(rt.read(args, 0));
        if (!elements.has(element)) throw new TypeError('element was not obtained from this DOM adapter');
        element.append(text(rt.read(args, 1)));
        return {type: 'return', value: rt.atom('ok')};
      },
    },
  ]);
}
