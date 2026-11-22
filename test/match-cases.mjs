import {ErlangError} from '../runtime/beam2js.mjs';

export function matchResults(runtime) {
  const atom = name => runtime.atom(name);
  const tuple = (...values) => runtime.tuple(values);
  const tagged = tuple(atom('tag'), 5n);
  const nil = runtime.nil();
  const proper = runtime.cons(atom('first'), runtime.cons(atom('second'), nil));
  const improper = runtime.cons(atom('first'), atom('tail'));
  const binary = runtime.bitstring([0, 1, 2, 255], 32);
  const emptyBinary = runtime.bitstring([], 0);
  const partial = runtime.bitstring([1, 128], 9);
  const oneBit = runtime.bitstring([128], 1);
  let longProper = nil;
  let longImproper = atom('tail');
  for (let i = 0; i < 10000; i++) {
    longProper = runtime.cons(BigInt(i), longProper);
    longImproper = runtime.cons(BigInt(i), longImproper);
  }
  const cases = [
    ['match_failures', 'case_value', [atom('yes')]],
    ['match_failures', 'case_value', [atom('no')]],
    ['match_failures', 'case_value', [atom('other')]],
    ['match_failures', 'case_value', [17n]],
    ['match_failures', 'case_value', [tagged]],
    ['match_failures', 'case_value', [runtime.bitstring([160], 3)]],
    ['match_failures', 'match_value', [tuple(atom('ok'), 42n)]],
    ['match_failures', 'match_value', [tuple(atom('error'), 42n)]],
    ['match_failures', 'match_value', [17n]],
    ['match_failures', 'match_value', [runtime.cons(1n, atom('tail'))]],
    ['match_failures', 'match_value', [runtime.bitstring([1, 255], 16)]],
    ['match_failures', 'if_value', [atom('yes')]],
    ['match_failures', 'if_value', [atom('no')]],
    ['match_failures', 'if_value', [atom('other')]],
    ['match_failures', 'only', [atom('ok')]],
    ['match_failures', 'only', [atom('other')]],
    ['match_failures', 'across', [atom('yes')]],
    ['match_failures', 'across', [atom('other')]],
    ['calls', 'match_remote', [atom('yes')]],
    ['calls', 'match_remote', [atom('other')]],
    ['raw_failures', 'case_y', [tagged]],
    ['raw_failures', 'bad_literal', []],
    ['bif_body', 'head', [proper]],
    ['bif_body', 'head', [improper]],
    ['bif_body', 'head', [nil]],
    ['bif_body', 'head', [atom('bad')]],
    ['bif_body', 'tail', [runtime.cons(atom('first'), nil)]],
    ['bif_body', 'tail', [improper]],
    ['bif_body', 'tail', [nil]],
    ['bif_body', 'tail', [17n]],
    ['bif_body', 'size', [tuple()]],
    ['bif_body', 'size', [tagged]],
    ['bif_body', 'size', [nil]],
    ['bif_body', 'element', [1n, tagged]],
    ['bif_body', 'element', [2n, tagged]],
    ['bif_body', 'element', [0n, tagged]],
    ['bif_body', 'element', [-1n, tagged]],
    ['bif_body', 'element', [3n, tagged]],
    ['bif_body', 'element', [1n << 80n, tagged]],
    ['bif_body', 'element', [runtime.float(1), tagged]],
    ['bif_body', 'element', [1n, atom('bad')]],
    ['bif_body', 'length', [nil]],
    ['bif_body', 'length', [proper]],
    ['bif_body', 'length', [improper]],
    ['bif_body', 'length', [atom('bad')]],
    ['bif_body', 'length', [longProper]],
    ['bif_body', 'length', [longImproper]],
    ['bif_body', 'head_across', [proper]],
    ['bif_body', 'head_across', [nil]],
    ['calls', 'bif_remote', [proper]],
    ['calls', 'bif_remote', [nil]],
    ['bif_body', 'stack_head', [improper, 7n]],
    ['bif_body', 'stack_head', [nil, 7n]],
    ['bif_body', 'stack_tail', [improper, 7n]],
    ['bif_body', 'stack_tail', [nil, 7n]],
    ['bif_body', 'stack_size', [tagged, 7n]],
    ['bif_body', 'stack_size', [nil, 7n]],
    ['bif_body', 'stack_element', [tagged, 7n]],
    ['bif_body', 'stack_element', [tuple(), 7n]],
    ['bif_body', 'stack_length', [nil, 7n]],
    ['bif_body', 'stack_length', [proper, 7n]],
    ['bif_body', 'stack_length', [improper, 7n]],
    ['bif_body', 'stack_length', [atom('bad'), 7n]],
    ['bif_body', 'stack_length', [longProper, 7n]],
    ['bif_body', 'stack_length', [longImproper, 7n]],
    ['raw_bif_body', 'length_guard_stack', [nil]],
    ['raw_bif_body', 'length_guard_stack', [proper]],
    ['raw_bif_body', 'length_guard_stack', [improper]],
    ['raw_bif_body', 'length_guard_stack', [atom('bad')]],
    ['raw_bif_body', 'length_guard_stack', [longProper]],
    ['bif_body', 'stack_bits', [emptyBinary, 7n]],
    ['bif_body', 'stack_bits', [oneBit, 7n]],
    ['bif_body', 'stack_bits', [partial, 7n]],
    ['bif_body', 'stack_bits', [binary, 7n]],
    ['bif_body', 'stack_bits', [atom('bad'), 7n]],
    ['bif_body', 'stack_bytes', [emptyBinary, 7n]],
    ['bif_body', 'stack_bytes', [oneBit, 7n]],
    ['bif_body', 'stack_bytes', [partial, 7n]],
    ['bif_body', 'stack_bytes', [binary, 7n]],
    ['bif_body', 'stack_bytes', [atom('bad'), 7n]],
    ['raw_bif_body', 'bits_guard_stack', [emptyBinary]],
    ['raw_bif_body', 'bits_guard_stack', [partial]],
    ['raw_bif_body', 'bits_guard_stack', [atom('bad')]],
    ['raw_bif_body', 'bytes_guard_stack', [emptyBinary]],
    ['raw_bif_body', 'bytes_guard_stack', [oneBit]],
    ['raw_bif_body', 'bytes_guard_stack', [partial]],
    ['raw_bif_body', 'bytes_guard_stack', [atom('bad')]],
    ['bif_body', 'stack_part', [binary, 1n, 2n, 7n]],
    ['bif_body', 'stack_part', [binary, 4n, -2n, 7n]],
    ['bif_body', 'stack_part', [binary, 4n, 0n, 7n]],
    ['bif_body', 'stack_part', [binary, 0n, -1n, 7n]],
    ['bif_body', 'stack_part', [partial, 0n, 1n, 7n]],
    ['bif_body', 'stack_part', [binary, runtime.float(1), 1n, 7n]],
    ['bif_body', 'stack_part2', [binary, tuple(1n, 2n), 7n]],
    ['bif_body', 'stack_part2', [binary, tuple(4n, -2n), 7n]],
    ['bif_body', 'stack_part2', [binary, tuple(4n, 0n), 7n]],
    ['bif_body', 'stack_part2', [binary, tuple(0n, -1n), 7n]],
    ['bif_body', 'stack_part2', [binary, tuple(1n), 7n]],
    ['bif_body', 'stack_part2', [partial, tuple(0n, 0n), 7n]],
    ['raw_bif_body', 'part2_guard_source', [binary, tuple(4n, -2n)]],
    ['raw_bif_body', 'part2_guard_source', [binary, tuple(0n, -1n)]],
    ['raw_bif_body', 'part2_guard_range', [binary, tuple(4n, -2n)]],
    ['raw_bif_body', 'part2_guard_range', [binary, tuple(0n, -1n)]],
    ['raw_bif_body', 'part2_guard_range', [binary, tuple(1n)]],
    ['raw_bif_body', 'part2_guard_x', [binary, tuple(4n, -2n)]],
    ['raw_bif_body', 'part2_guard_x', [binary, tuple(0n, -1n)]],
    ['raw_bif_body', 'part3_guard_source', [binary, 4n, -2n]],
    ['raw_bif_body', 'part3_guard_source', [partial, 0n, 1n]],
    ['raw_bif_body', 'part3_guard_position', [binary, 1n, 2n]],
    ['raw_bif_body', 'part3_guard_position', [binary, -1n, 1n]],
    ['raw_bif_body', 'part3_guard_length', [binary, 1n, 2n]],
    ['raw_bif_body', 'part3_guard_length', [binary, 0n, -1n]],
    ['raw_bif_body', 'part3_guard_length', [binary, 1n, 1n << 80n]],
    ['raw_bif_body', 'head_guard_stack', [improper]],
    ['raw_bif_body', 'head_guard_stack', [nil]],
    ['raw_bif_body', 'tail_guard_stack', [improper]],
    ['raw_bif_body', 'tail_guard_stack', [atom('bad')]],
    ['raw_bif_body', 'size_guard_stack', [tagged]],
    ['raw_bif_body', 'size_guard_stack', [atom('bad')]],
    ['raw_bif_body', 'element_guard_stack', [2n, tagged]],
    ['raw_bif_body', 'element_guard_stack', [0n, tagged]],
    ['raw_bif_body', 'element_guard_stack', [3n, tagged]],
    ['raw_bif_body', 'element_guard_stack', [runtime.float(1), tagged]],
    ['raw_bif_body', 'element_guard_stack', [1n, atom('bad')]],
    ['raw_bif_body', 'element_guard_index_stack', [2n, tagged]],
    ['raw_bif_body', 'element_guard_index_stack', [0n, tagged]],
    ['raw_bif_body', 'element_guard_index_stack', [1n << 80n, tagged]],
    ['raw_bif_body', 'head_y', [improper]],
    ['raw_bif_body', 'head_y', [nil]],
    ['raw_bif_body', 'element_alias', [2n, tagged]],
    ['raw_bif_body', 'element_alias', [-1n, tagged]],
    ['raw_bif_body', 'length_y', [proper]],
    ['raw_bif_body', 'length_y', [improper]],
    ['raw_bif_body', 'length_literal', []],
    ['bif_body', 'bits', [emptyBinary]],
    ['bif_body', 'bits', [partial]],
    ['bif_body', 'bits', [binary]],
    ['bif_body', 'bits', [atom('bad')]],
    ['bif_body', 'bytes', [emptyBinary]],
    ['bif_body', 'bytes', [partial]],
    ['bif_body', 'bytes', [binary]],
    ['bif_body', 'bytes', [17n]],
    ['bif_body', 'part', [binary, 1n, 2n]],
    ['bif_body', 'part', [binary, 4n, -2n]],
    ['bif_body', 'part', [binary, 0n, 0n]],
    ['bif_body', 'part', [binary, 4n, 0n]],
    ['bif_body', 'part', [binary, -1n, 1n]],
    ['bif_body', 'part', [binary, 0n, -1n]],
    ['bif_body', 'part', [binary, 4n, 1n]],
    ['bif_body', 'part', [binary, 1n << 80n, 0n]],
    ['bif_body', 'part', [binary, 1n, -(1n << 80n)]],
    ['bif_body', 'part', [binary, runtime.float(1), 1n]],
    ['bif_body', 'part', [partial, 0n, 1n]],
    ['bif_body', 'part', [atom('bad'), 0n, 0n]],
    ['bif_body', 'part2', [binary, tuple(1n, 2n)]],
    ['bif_body', 'part2', [binary, tuple(4n, -2n)]],
    ['bif_body', 'part2', [binary, tuple(4n, 0n)]],
    ['bif_body', 'part2', [binary, tuple(0n, -1n)]],
    ['bif_body', 'part2', [binary, tuple(1n)]],
    ['bif_body', 'part2', [binary, tuple(1n, 2n, 3n)]],
    ['bif_body', 'part2', [binary, tuple(atom('bad'), 1n)]],
    ['bif_body', 'part2', [binary, atom('bad')]],
    ['bif_body', 'part2', [partial, tuple(0n, 0n)]],
    ['bif_body', 'part_across', [binary, 1n, 2n]],
    ['bif_body', 'part_across', [binary, 5n, 0n]],
    ['raw_bif_body', 'bits_y', [partial]],
    ['raw_bif_body', 'bits_y', [atom('bad')]],
    ['raw_bif_body', 'part_alias', [binary, 1n, 2n]],
    ['raw_bif_body', 'part_alias', [binary, 0n, -1n]],
    ['raw_bif_body', 'part2_alias', [binary, tuple(4n, -2n)]],
    ['raw_bif_body', 'part2_alias', [binary, tuple(4n, 1n)]],
    ['raw_bif_body', 'part_literal', []],
    ['raw_bif_body', 'predicate_tail', [binary]],
    ['raw_bif_body', 'predicate_tail', [partial]],
    ['raw_bif_body', 'predicate_last', [improper]],
    ['raw_bif_body', 'predicate_last', [atom('bad')]],
    ['raw_bif_body', 'predicate_call', [atom('yes')]],
    ['raw_bif_body', 'predicate_call', [1n]],
  ];
  for (const value of [0n, runtime.float(1.5), atom('true'), atom('other'),
    nil, improper, tagged, emptyBinary, binary, partial, runtime.invoke('erlang', 'self', []), runtime.makeRef()]) {
    cases.push(['bif_body', 'stack_predicates', [value, atom('ok')]]);
    cases.push(['raw_bif_body', 'predicates_stack', [value]]);
  }
  cases.push(['raw_bif_body', 'predicate_x_stack', [0n]], ['raw_bif_body', 'predicate_x_stack', [atom('bad')]]);
  for (const name of ['is_integer', 'is_number', 'is_atom', 'is_boolean', 'is_float',
    'is_list', 'is_tuple', 'is_binary', 'is_bitstring']) {
    for (const value of [0n, runtime.float(1.5), atom('true'), atom('other'),
      nil, improper, tuple(), binary, partial]) {
      cases.push(['erlang', name, [value]]);
    }
  }
  cases.push(
    ['erlang', 'hd', [proper]], ['erlang', 'hd', [improper]],
    ['erlang', 'hd', [nil]], ['erlang', 'hd', [atom('bad')]],
    ['erlang', 'tl', [runtime.cons(atom('first'), nil)]], ['erlang', 'tl', [improper]],
    ['erlang', 'tl', [nil]], ['erlang', 'tl', [tuple()]],
    ['erlang', 'length', [nil]], ['erlang', 'length', [proper]],
    ['erlang', 'length', [improper]], ['erlang', 'length', [atom('bad')]],
    ['erlang', 'length', [longProper]], ['erlang', 'length', [longImproper]],
    ['erlang', 'tuple_size', [tuple()]], ['erlang', 'tuple_size', [tagged]],
    ['erlang', 'tuple_size', [nil]],
    ['erlang', 'element', [1n, tagged]], ['erlang', 'element', [2n, tagged]],
    ['erlang', 'element', [0n, tagged]], ['erlang', 'element', [-1n, tagged]],
    ['erlang', 'element', [3n, tagged]], ['erlang', 'element', [1n << 80n, tagged]],
    ['erlang', 'element', [runtime.float(1), tagged]], ['erlang', 'element', [1n, atom('bad')]],
    ['raw_bif_body', 'head_call_tail', [improper]], ['raw_bif_body', 'head_call_tail', [nil]],
    ['raw_bif_body', 'element_call_last', [2n, tagged]], ['raw_bif_body', 'element_call_last', [0n, tagged]],
    ['raw_bif_body', 'length_call', [proper]], ['raw_bif_body', 'length_call', [improper]],
    ['calls', 'callable_bif_remote', [proper]], ['calls', 'callable_bif_remote', [improper]],
    ['erlang', 'bit_size', [emptyBinary]], ['erlang', 'bit_size', [partial]],
    ['erlang', 'bit_size', [binary]], ['erlang', 'bit_size', [atom('bad')]],
    ['erlang', 'byte_size', [emptyBinary]], ['erlang', 'byte_size', [partial]],
    ['erlang', 'byte_size', [binary]], ['erlang', 'byte_size', [17n]],
    ['erlang', 'binary_part', [binary, 1n, 2n]], ['erlang', 'binary_part', [binary, 4n, -2n]],
    ['erlang', 'binary_part', [binary, 0n, 0n]], ['erlang', 'binary_part', [binary, 4n, 0n]],
    ['erlang', 'binary_part', [binary, -1n, 1n]], ['erlang', 'binary_part', [binary, 0n, -1n]],
    ['erlang', 'binary_part', [binary, 4n, 1n]], ['erlang', 'binary_part', [binary, 1n << 80n, 0n]],
    ['erlang', 'binary_part', [binary, 1n, -(1n << 80n)]],
    ['erlang', 'binary_part', [binary, runtime.float(1), 1n]],
    ['erlang', 'binary_part', [partial, 0n, 1n]], ['erlang', 'binary_part', [atom('bad'), 0n, 0n]],
    ['erlang', 'binary_part', [binary, tuple(1n, 2n)]], ['erlang', 'binary_part', [binary, tuple(4n, -2n)]],
    ['erlang', 'binary_part', [binary, tuple(4n, 0n)]], ['erlang', 'binary_part', [binary, tuple(0n, -1n)]],
    ['erlang', 'binary_part', [binary, tuple(1n)]], ['erlang', 'binary_part', [binary, tuple(1n, 2n, 3n)]],
    ['erlang', 'binary_part', [binary, tuple(atom('bad'), 1n)]], ['erlang', 'binary_part', [binary, atom('bad')]],
    ['erlang', 'binary_part', [partial, tuple(0n, 0n)]],
    ['raw_bif_body', 'bits_call_tail', [partial]], ['raw_bif_body', 'bits_call_tail', [atom('bad')]],
    ['raw_bif_body', 'part2_call_last', [binary, tuple(4n, -2n)]],
    ['raw_bif_body', 'part2_call_last', [binary, tuple(0n, -1n)]],
    ['raw_bif_body', 'part3_call', [binary, 1n, 2n]], ['raw_bif_body', 'part3_call', [binary, 4n, 1n]],
    ['calls', 'binary_bif_remote', [binary, 4n, -2n]], ['calls', 'binary_bif_remote', [binary, 0n, -1n]],
  );

  function format(value) {
    if (typeof value === 'bigint') return String(value);
    if (typeof value === 'symbol') return Symbol.keyFor(value);
    if (runtime.isBitstring(value)) {
      const length = runtime.bitstringSize(value);
      const bytes = Array.from(runtime.bitstringBytes(value));
      const remainder = length % 8;
      if (remainder) bytes[bytes.length - 1] = `${bytes.at(-1) >> (8 - remainder)}:${remainder}`;
      return `<<${bytes.join(',')}>>`;
    }
    if (runtime.isType('is_nil', value)) return '[]';
    if (runtime.isType('is_nonempty_list', value)) {
      return `[${format(runtime.listHead(value))}|${format(runtime.listTail(value))}]`;
    }
    if (runtime.isType('is_tuple', value)) {
      return `{${Array.from({length: runtime.tupleSize(value)},
        (_, i) => format(runtime.tupleElement(value, i + 1))).join(',')}}`;
    }
    throw new TypeError('unexpected test term');
  }

  return cases.map(([module, name, args]) => {
    try {
      return `{ok,${format(runtime.invoke(module, name, args))}}`;
    } catch (error) {
      if (!(error instanceof ErlangError)) throw error;
      return `{${error.erlangClass},${format(error.reason)}}`;
    }
  });
}
