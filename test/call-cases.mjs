export function callResults(runtime) {
  const pair = value => `{${runtime.tupleElement(value, 1)},${runtime.tupleElement(value, 2)}}`;
  const heap = runtime.invoke('calls', 'heap', [23n, 99n]);
  const stack = runtime.invoke('calls', 'stack', [11n, 22n, 33n, 44n]);
  const shifted = runtime.invoke('raw_stack', 'shift', [11n, 22n, 33n]);
  let list = runtime.nil();
  for (let i = 0; i < 20000; i++) list = runtime.cons(BigInt(i), list);
  return [
    String(runtime.invoke('calls', 'local', [42n])),
    pair(runtime.invoke('calls', 'remote', [42n])),
    pair(runtime.invoke('calls', 'nested', [42n, 99n])),
    pair(runtime.invoke('calls', 'wrapped', [23n])),
    `{${pair(runtime.tupleElement(heap, 1))},${runtime.tupleElement(heap, 2)}}`,
    `{${pair(runtime.tupleElement(stack, 1))},${runtime.tupleElement(stack, 2)},${runtime.tupleElement(stack, 3)}}`,
    `{${[1, 2, 3].map(i => runtime.tupleElement(shifted, i)).join(',')}}`,
    String(runtime.invoke('raw_stack', 'empty', [42n])),
    Symbol.keyFor(runtime.invoke('calls', 'depth', [list])),
  ];
}
