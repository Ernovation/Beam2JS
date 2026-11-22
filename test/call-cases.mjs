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
          runtime.equalExact(runtime.invoke('raw_stack', name, [list]), expected)) &&
        runtime.equalExact(runtime.invoke('calls', 'stack_hd', [list, tail]), expected) &&
        runtime.equalExact(runtime.invoke('calls', 'stack_tl', [list, head]), runtime.tuple([tail, head])) &&
        runtime.equalExact(runtime.invoke('raw_stack', 'list_parts_y', [list]), expected) &&
        runtime.equalExact(runtime.invoke('calls', 'stack_list', [head, tail]), runtime.tuple([list, head])) &&
        runtime.equalExact(runtime.invoke('raw_stack', 'list_put_y', [head, tail]),
          runtime.tuple([list, list, runtime.cons(head, head)]));
    });
  const rejectsNonLists = [runtime.nil(), runtime.atom('not_list'), runtime.tuple([])]
    .every(value => [
      ['stack_list_head', [value]], ['stack_list_tail', [value]],
      ['stack_hd', [value, 1n]], ['stack_tl', [value, 1n]],
    ].every(([name, args]) => {
      try {
        runtime.invoke('calls', name, args);
        return false;
      } catch (error) {
        return error.erlangClass === 'error' && error.reason === runtime.atom('function_clause');
      }
    }) && ['list_head_y', 'list_tail_y', 'list_parts_y'].every(name =>
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
  const generatedPut = runtime.spawnProcess('calls', 'stack_list', [9n, runtime.atom('tail')]);
  const rawPut = runtime.spawnProcess('raw_stack', 'list_put_y', [9n, runtime.atom('tail')]);
  const generatedHd = runtime.spawnProcess('calls', 'stack_hd', [list, 7n]);
  const generatedTl = runtime.spawnProcess('calls', 'stack_tl', [list, 7n]);
  const rawParts = runtime.spawnProcess('raw_stack', 'list_parts_y', [list]);
  const tagged = runtime.tuple([5n, 6n]);
  const binary = runtime.bitstring([1, 2, 3], 24);
  const bifs = [
    runtime.spawnProcess('bif_body', 'stack_head', [list, 7n]),
    runtime.spawnProcess('bif_body', 'stack_tail', [list, 7n]),
    runtime.spawnProcess('bif_body', 'stack_size', [tagged, 7n]),
    runtime.spawnProcess('bif_body', 'stack_element', [tagged, 7n]),
    runtime.spawnProcess('raw_bif_body', 'head_guard_stack', [runtime.nil()]),
    runtime.spawnProcess('raw_bif_body', 'tail_guard_stack', [list]),
    runtime.spawnProcess('raw_bif_body', 'size_guard_stack', [runtime.atom('bad')]),
    runtime.spawnProcess('raw_bif_body', 'element_guard_stack', [0n, tagged]),
    runtime.spawnProcess('raw_bif_body', 'element_guard_index_stack', [0n, tagged]),
    runtime.spawnProcess('bif_body', 'stack_length', [runtime.cons(9n, runtime.nil()), 7n]),
    runtime.spawnProcess('raw_bif_body', 'length_guard_stack', [list]),
    runtime.spawnProcess('raw_bif_body', 'length_guard_stack', [runtime.nil()]),
    runtime.spawnProcess('bif_body', 'stack_bits', [runtime.bitstring([1, 128], 9), 7n]),
    runtime.spawnProcess('bif_body', 'stack_bytes', [runtime.bitstring([1, 128], 9), 7n]),
    runtime.spawnProcess('raw_bif_body', 'bits_guard_stack', [runtime.atom('bad')]),
    runtime.spawnProcess('raw_bif_body', 'bytes_guard_stack', [runtime.bitstring([128], 1)]),
    runtime.spawnProcess('bif_body', 'stack_part', [binary, 3n, -2n, 7n]),
    runtime.spawnProcess('bif_body', 'stack_part2', [binary, runtime.tuple([3n, -2n]), 7n]),
    runtime.spawnProcess('raw_bif_body', 'part2_guard_range', [binary, runtime.tuple([0n, -1n])]),
    runtime.spawnProcess('raw_bif_body', 'part3_guard_length', [binary, 0n, -1n]),
    runtime.spawnProcess('bif_body', 'stack_predicates', [runtime.bitstring([128], 1), runtime.atom('ok')]),
    runtime.spawnProcess('raw_bif_body', 'predicates_stack', [runtime.bitstring([128], 1)]),
    runtime.spawnProcess('arithmetic_body', 'stack_and', [-5n, 3n, 7n]),
    runtime.spawnProcess('arithmetic_body', 'stack_not', [0n, 7n]),
    runtime.spawnProcess('raw_arithmetic_body', 'band_stack_left', [1n, runtime.atom('bad')]),
    runtime.spawnProcess('raw_arithmetic_body', 'bor_stack_right', [runtime.atom('bad'), 5n]),
    runtime.spawnProcess('arithmetic_body', 'stack_or', [-5n, 2n, 7n]),
    runtime.spawnProcess('arithmetic_body', 'stack_xor', [-5n, 3n, 7n]),
    runtime.spawnProcess('raw_arithmetic_body', 'bxor_stack_both', [runtime.atom('bad')]),
    runtime.spawnProcess('raw_arithmetic_body', 'bnot_stack', [runtime.atom('bad')]),
    runtime.spawnProcess('arithmetic_body', 'stack_div', [-7n, 3n, 7n]),
    runtime.spawnProcess('arithmetic_body', 'stack_rem', [-7n, 3n, 7n]),
    runtime.spawnProcess('raw_arithmetic_body', 'div_stack_left', [7n, 0n]),
    runtime.spawnProcess('raw_arithmetic_body', 'rem_stack_right', [runtime.atom('bad'), 3n]),
    runtime.spawnProcess('raw_arithmetic_body', 'div_stack_both', [0n]),
    runtime.spawnProcess('raw_arithmetic_body', 'rem_stack_both', [0n]),
    runtime.spawnProcess('arithmetic_body', 'stack_add', [3n, 4n, 7n]),
    runtime.spawnProcess('arithmetic_body', 'stack_subtract', [3n, 4n, 7n]),
    runtime.spawnProcess('arithmetic_body', 'stack_multiply', [3n, 4n, 7n]),
    runtime.spawnProcess('raw_arithmetic_body', 'divide_stack_body', [5n, 2n]),
    runtime.spawnProcess('raw_arithmetic_body', 'add_stack_left', [9n, runtime.atom('bad')]),
    runtime.spawnProcess('raw_arithmetic_body', 'subtract_stack_right', [runtime.atom('bad'), 9n]),
    runtime.spawnProcess('raw_arithmetic_body', 'multiply_stack_both', [runtime.atom('bad')]),
    runtime.spawnProcess('raw_arithmetic_body', 'divide_stack_right', [5n, 0n]),
    runtime.spawnProcess('arithmetic_body', 'stack_negate', [-3n, 7n]),
    runtime.spawnProcess('arithmetic_body', 'stack_absolute', [-3n, 7n]),
    runtime.spawnProcess('raw_arithmetic_body', 'negate_stack_guard', [runtime.atom('bad')]),
    runtime.spawnProcess('raw_arithmetic_body', 'abs_stack_guard', [runtime.atom('bad')]),
    runtime.spawnProcess('raw_arithmetic_body', 'abs_stack_distinct', [runtime.atom('bad'), 7n]),
    runtime.spawnProcess('arithmetic_body', 'stack_trunc', [runtime.float(-1.9), 7n]),
    runtime.spawnProcess('arithmetic_body', 'stack_round', [runtime.float(-1.5), 7n]),
    runtime.spawnProcess('arithmetic_body', 'stack_floor', [runtime.float(-1.9), 7n]),
    runtime.spawnProcess('arithmetic_body', 'stack_ceil', [runtime.float(1.9), 7n]),
    runtime.spawnProcess('arithmetic_body', 'stack_float', [3n, 7n]),
    runtime.spawnProcess('raw_arithmetic_body', 'trunc_stack_guard', [runtime.atom('bad')]),
    runtime.spawnProcess('raw_arithmetic_body', 'round_stack_guard', [runtime.atom('bad')]),
    runtime.spawnProcess('raw_arithmetic_body', 'floor_stack_guard', [runtime.atom('bad')]),
    runtime.spawnProcess('raw_arithmetic_body', 'ceil_stack_guard', [runtime.atom('bad')]),
    runtime.spawnProcess('raw_arithmetic_body', 'float_stack_guard', [runtime.atom('bad')]),
    runtime.spawnProcess('raw_arithmetic_body', 'float_stack_distinct', [1n << 1024n, 7n]),
    runtime.spawnProcess('erlang', '+', [2n, 3n]),
    runtime.spawnProcess('raw_bif_body', 'subtract_call_last', [7n, 3n]),
    runtime.spawnProcess('raw_bif_body', 'divide_call_tail', [5n, 2n]),
    runtime.spawnProcess('calls', 'arithmetic_bif_remote', [6n, 7n]),
  ];
  let timer;
  const [first, second, third, fourth, ...lists] = await Promise.race([
    Promise.all([generated.result, raw.result, generatedElement.result, rawElement.result,
      generatedHead.result, generatedTail.result, rawHead.result, rawTail.result,
      generatedPut.result, rawPut.result, generatedHd.result, generatedTl.result, rawParts.result,
      ...bifs.map(process => process.result)]),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('stack yield test timed out')), 5000);
    }),
  ]).finally(() => clearTimeout(timer));
  const predicateValues = [...Array(8).fill(runtime.atom('false')), runtime.atom('true'),
    runtime.atom('false'), runtime.atom('false')];
  const results = [
    runtime.equalExact(first, runtime.tuple([runtime.tuple([1n, 2n]), 1n])),
    runtime.equalExact(second, runtime.tuple([3n, 4n, 3n, runtime.atom('tag')])),
    runtime.equalExact(third, runtime.tuple([5n, 6n])),
    runtime.equalExact(fourth, 7n),
    ...lists.slice(0, 4).map(value => runtime.equalExact(value, runtime.tuple([9n, runtime.atom('tail')]))),
    runtime.equalExact(lists[4], runtime.tuple([list, 9n])),
    runtime.equalExact(lists[5], runtime.tuple([list, list, runtime.cons(9n, 9n)])),
    runtime.equalExact(lists[6], runtime.tuple([9n, 7n])),
    runtime.equalExact(lists[7], runtime.tuple([runtime.atom('tail'), 7n])),
    runtime.equalExact(lists[8], runtime.tuple([9n, runtime.atom('tail')])),
    runtime.equalExact(lists[9], runtime.tuple([9n, 7n])),
    runtime.equalExact(lists[10], runtime.tuple([runtime.atom('tail'), 7n])),
    runtime.equalExact(lists[11], runtime.tuple([2n, 7n])),
    runtime.equalExact(lists[12], runtime.tuple([5n, 7n])),
    runtime.equalExact(lists[13], runtime.tuple([runtime.atom('failed'), runtime.nil()])),
    runtime.equalExact(lists[14], runtime.atom('tail')),
    runtime.equalExact(lists[15], runtime.tuple([runtime.atom('failed'), runtime.atom('bad')])),
    runtime.equalExact(lists[16], runtime.tuple([runtime.atom('failed'), tagged])),
    runtime.equalExact(lists[17], runtime.tuple([runtime.atom('failed'), 0n])),
    runtime.equalExact(lists[18], runtime.tuple([1n, 7n])),
    runtime.equalExact(lists[19], runtime.tuple([runtime.atom('failed'), list])),
    runtime.equalExact(lists[20], 0n),
    runtime.equalExact(lists[21], runtime.tuple([9n, 7n])),
    runtime.equalExact(lists[22], runtime.tuple([2n, 7n])),
    runtime.equalExact(lists[23], runtime.tuple([runtime.atom('failed'), runtime.atom('bad')])),
    runtime.equalExact(lists[24], 1n),
    runtime.equalExact(lists[25], runtime.tuple([runtime.bitstring([2, 3], 16), 7n])),
    runtime.equalExact(lists[26], runtime.tuple([runtime.bitstring([2, 3], 16), 7n])),
    runtime.equalExact(lists[27], runtime.tuple([runtime.atom('failed'), runtime.tuple([0n, -1n])])),
    runtime.equalExact(lists[28], runtime.tuple([runtime.atom('failed'), -1n])),
    runtime.equalExact(lists[29], runtime.tuple([...predicateValues, runtime.atom('ok')])),
    runtime.equalExact(lists[30], runtime.tuple(predicateValues)),
    runtime.equalExact(lists[31], runtime.tuple([3n, 7n])),
    runtime.equalExact(lists[32], runtime.tuple([-1n, 7n])),
    runtime.equalExact(lists[33], runtime.tuple([runtime.atom('failed'), 1n])),
    runtime.equalExact(lists[34], runtime.tuple([runtime.atom('failed'), 5n])),
    runtime.equalExact(lists[35], runtime.tuple([-5n, 7n])),
    runtime.equalExact(lists[36], runtime.tuple([-8n, 7n])),
    runtime.equalExact(lists[37], runtime.tuple([runtime.atom('failed'), runtime.atom('bad')])),
    runtime.equalExact(lists[38], runtime.tuple([runtime.atom('failed'), runtime.atom('bad')])),
    runtime.equalExact(lists[39], runtime.tuple([-2n, 7n])),
    runtime.equalExact(lists[40], runtime.tuple([-1n, 7n])),
    runtime.equalExact(lists[41], runtime.tuple([runtime.atom('failed'), 7n])),
    runtime.equalExact(lists[42], runtime.tuple([runtime.atom('failed'), 3n])),
    runtime.equalExact(lists[43], runtime.tuple([runtime.atom('failed'), 0n])),
    runtime.equalExact(lists[44], runtime.tuple([runtime.atom('failed'), 0n])),
    runtime.equalExact(lists[45], runtime.tuple([7n, 7n])),
    runtime.equalExact(lists[46], runtime.tuple([-1n, 7n])),
    runtime.equalExact(lists[47], runtime.tuple([12n, 7n])),
    runtime.equalExact(lists[48], runtime.float(2.5)),
    runtime.equalExact(lists[49], runtime.tuple([runtime.atom('failed'), 9n])),
    runtime.equalExact(lists[50], runtime.tuple([runtime.atom('failed'), 9n])),
    runtime.equalExact(lists[51], runtime.tuple([runtime.atom('failed'), runtime.atom('bad')])),
    runtime.equalExact(lists[52], runtime.tuple([runtime.atom('failed'), 0n])),
    runtime.equalExact(lists[53], runtime.tuple([3n, 7n])),
    runtime.equalExact(lists[54], runtime.tuple([3n, 7n])),
    runtime.equalExact(lists[55], runtime.tuple([runtime.atom('failed'), runtime.atom('bad')])),
    runtime.equalExact(lists[56], runtime.tuple([runtime.atom('failed'), runtime.atom('bad')])),
    runtime.equalExact(lists[57], runtime.tuple([runtime.atom('failed'), 7n])),
    runtime.equalExact(lists[58], runtime.tuple([-1n, 7n])),
    runtime.equalExact(lists[59], runtime.tuple([-2n, 7n])),
    runtime.equalExact(lists[60], runtime.tuple([-2n, 7n])),
    runtime.equalExact(lists[61], runtime.tuple([2n, 7n])),
    runtime.equalExact(lists[62], runtime.tuple([runtime.float(3), 7n])),
    ...lists.slice(63, 68).map(value =>
      runtime.equalExact(value, runtime.tuple([runtime.atom('failed'), runtime.atom('bad')]))),
    runtime.equalExact(lists[68], runtime.tuple([runtime.atom('failed'), 7n])),
    runtime.equalExact(lists[69], 5n),
    runtime.equalExact(lists[70], 4n),
    runtime.equalExact(lists[71], runtime.float(2.5)),
    runtime.equalExact(lists[72], runtime.tuple([runtime.atom('ok'),
      runtime.tuple([runtime.atom('result'), 42n])])),
  ];
  return `[${results.join(',')}]`;
}
