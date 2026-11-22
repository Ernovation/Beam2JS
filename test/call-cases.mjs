export function callResults(runtime) {
  const pair = value => `{${runtime.tupleElement(value, 1)},${runtime.tupleElement(value, 2)}}`;
  const heap = runtime.invoke('calls', 'heap', [23n, 99n]);
  const stack = runtime.invoke('calls', 'stack', [11n, 22n, 33n, 44n]);
  const shifted = runtime.invoke('raw_stack', 'shift', [11n, 22n, 33n]);
  const stackedTuple = runtime.invoke('calls', 'stack_tuple', [11n, 22n]);
  const rawTuple = runtime.invoke('raw_stack', 'tuple_y', [11n, 22n]);
  const operands = [
    [runtime.tuple([1n, runtime.nil()]), runtime.cons(2n, runtime.atom('tail'))],
    [runtime.float(-0), runtime.bitstring([0xa0], 3)],
    [runtime.makeRef(), runtime.invoke('erlang', 'self', [])],
  ];
  const richTuples = operands.every(([first, second]) =>
    runtime.equalExact(runtime.invoke('calls', 'stack_tuple', [first, second]),
      runtime.tuple([runtime.tuple([first, second]), first])) &&
    runtime.equalExact(runtime.invoke('raw_stack', 'tuple_y', [first, second]),
      runtime.tuple([first, second, first, runtime.atom('tag')])) &&
    runtime.equalExact(runtime.invoke('calls', 'stack_element', [runtime.tuple([first, second])]),
      runtime.tuple([first, second])) &&
    runtime.equalExact(runtime.invoke('raw_stack', 'element_y', [runtime.tuple([first, second])]),
      first));
  const invalidElements = [runtime.nil(), runtime.tuple([]), runtime.tuple([1n, 2n, 3n])];
  const rejectsNonPairs = invalidElements.every(value => {
    try {
      runtime.invoke('calls', 'stack_element', [value]);
      return false;
    } catch (error) {
      return error.erlangClass === 'error' && error.reason === runtime.atom('function_clause') &&
        runtime.invoke('raw_stack', 'element_y', [value]) === runtime.atom('not_pair');
    }
  });
  const richLists = [...operands, [1n, runtime.nil()], [2n, runtime.cons(3n, runtime.nil())]]
    .every(([head, tail]) => {
      const list = runtime.cons(head, tail);
      const expected = runtime.tuple([head, tail]);
      return ['stack_list_head', 'stack_list_tail'].every(name =>
        runtime.equalExact(runtime.invoke('calls', name, [list]), expected)) &&
        ['list_head_y', 'list_tail_y'].every(name =>
          runtime.equalExact(runtime.invoke('raw_stack', name, [list]), expected));
    });
  const rejectsNonLists = [runtime.nil(), runtime.atom('not_list'), runtime.tuple([])]
    .every(value => ['stack_list_head', 'stack_list_tail'].every(name => {
      try {
        runtime.invoke('calls', name, [value]);
        return false;
      } catch (error) {
        return error.erlangClass === 'error' && error.reason === runtime.atom('function_clause');
      }
    }) && ['list_head_y', 'list_tail_y'].every(name =>
      runtime.invoke('raw_stack', name, [value]) === runtime.atom('not_list')));
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
    `{${pair(runtime.tupleElement(stackedTuple, 1))},${runtime.tupleElement(stackedTuple, 2)}}`,
    `{${[1, 2, 3].map(i => runtime.tupleElement(rawTuple, i)).join(',')},tag}`,
    String(runtime.tupleSize(runtime.invoke('raw_stack', 'empty_y', [])) === 0),
    String(richTuples),
    String(rejectsNonPairs),
    String(richLists),
    String(rejectsNonLists),
    Symbol.keyFor(runtime.invoke('calls', 'depth', [list])),
  ];
}

export async function stackYieldChecks(Runtime, registerModules) {
  const runtime = new Runtime({schedulers: 2, reductionLimit: 1});
  registerModules(runtime);
  const generated = runtime.spawnProcess('calls', 'stack_tuple', [1n, 2n]);
  const raw = runtime.spawnProcess('raw_stack', 'tuple_y', [3n, 4n]);
  const generatedElement = runtime.spawnProcess('calls', 'stack_element', [runtime.tuple([5n, 6n])]);
  const rawElement = runtime.spawnProcess('raw_stack', 'element_y', [runtime.tuple([7n, 8n])]);
  const list = runtime.cons(9n, runtime.atom('tail'));
  const generatedHead = runtime.spawnProcess('calls', 'stack_list_head', [list]);
  const generatedTail = runtime.spawnProcess('calls', 'stack_list_tail', [list]);
  const rawHead = runtime.spawnProcess('raw_stack', 'list_head_y', [list]);
  const rawTail = runtime.spawnProcess('raw_stack', 'list_tail_y', [list]);
  let timer;
  const [first, second, third, fourth, ...lists] = await Promise.race([
    Promise.all([generated.result, raw.result, generatedElement.result, rawElement.result,
      generatedHead.result, generatedTail.result, rawHead.result, rawTail.result]),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('stack yield test timed out')), 5000);
    }),
  ]).finally(() => clearTimeout(timer));
  const results = [
    runtime.equalExact(first, runtime.tuple([runtime.tuple([1n, 2n]), 1n])),
    runtime.equalExact(second, runtime.tuple([3n, 4n, 3n, runtime.atom('tag')])),
    runtime.equalExact(third, runtime.tuple([5n, 6n])),
    runtime.equalExact(fourth, 7n),
    ...lists.map(value => runtime.equalExact(value, runtime.tuple([9n, runtime.atom('tail')]))),
  ];
  return `[${results.join(',')}]`;
}
