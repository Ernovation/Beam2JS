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
  const ref = runtime.makeRef();
  const pid = runtime.invoke('erlang', 'self', []);
  const otherPid = runtime.invoke('erlang', 'self', []);
  let longCopy = nil;
  for (let i = 0; i < 10000; i++) longCopy = runtime.cons(BigInt(i), longCopy);
  cases.push(
    ['erlang', '=:=', [1n, 1n]], ['erlang', '=:=', [1n, runtime.float(1)]],
    ['erlang', '=:=', [runtime.float(0), runtime.float(-0)]],
    ['erlang', '=:=', [1n << 100n, 1n << 100n]],
    ['erlang', '=:=', [tuple(proper, partial), tuple(proper, runtime.bitstring([1, 128], 9))]],
    ['erlang', '=:=', [tuple(improper), tuple(runtime.cons(atom('first'), atom('other')))]],
    ['erlang', '=:=', [binary, partial]], ['erlang', '=:=', [nil, atom('nil')]],
    ['erlang', '=:=', [ref, ref]], ['erlang', '=:=', [ref, runtime.makeRef()]],
    ['erlang', '=:=', [pid, pid]], ['erlang', '=:=', [pid, otherPid]],
    ['erlang', '=:=', [pid, ref]], ['erlang', '=:=', [longProper, longCopy]],
    ['raw_bif_body', 'exact_call_tail', [1n, 1n]],
    ['raw_bif_body', 'exact_call_tail', [1n, runtime.float(1)]],
    ['raw_bif_body', 'exact_call_last', [partial, runtime.bitstring([1, 128], 9)]],
    ['raw_bif_body', 'exact_call_last', [partial, binary]],
    ['raw_bif_body', 'exact_call', [improper, improper]],
    ['raw_bif_body', 'exact_call', [improper, proper]],
    ['calls', 'exact_bif_remote', [1n, 1n]],
    ['calls', 'exact_bif_remote', [1n, runtime.float(1)]],
  );
  const comparisonOps = ['==', '/=', '=/=', '<', '=<', '>', '>='];
  const comparisonPairs = [
    [1n, 1n], [1n, runtime.float(1)], [runtime.float(0), runtime.float(-0)],
    [9007199254740993n, runtime.float(9007199254740992)],
    [-(1n << 100n), 1n << 100n], [atom('a'), atom('b')], [1n, atom('a')],
    [tuple(1n, proper), tuple(runtime.float(1), proper)],
    [proper, improper], [improper, proper], [binary, partial],
    [partial, runtime.bitstring([1, 128], 9)], [nil, nil],
    [ref, ref], [pid, pid], [ref, pid], [longProper, longCopy],
  ];
  for (const name of comparisonOps) {
    for (const args of comparisonPairs) cases.push(['erlang', name, args]);
  }
  cases.push(
    ['raw_bif_body', 'eq_call_tail', [1n, runtime.float(1)]],
    ['raw_bif_body', 'eq_call_tail', [1n, 2n]],
    ['raw_bif_body', 'ne_call_last', [1n, runtime.float(1)]],
    ['raw_bif_body', 'ne_call_last', [1n, 2n]],
    ['raw_bif_body', 'exact_ne_call', [1n, runtime.float(1)]],
    ['raw_bif_body', 'exact_ne_call', [1n, 1n]],
    ['raw_bif_body', 'lt_call_tail', [1n, 2n]], ['raw_bif_body', 'lt_call_tail', [2n, 1n]],
    ['raw_bif_body', 'le_call_last', [1n, runtime.float(1)]], ['raw_bif_body', 'le_call_last', [2n, 1n]],
    ['raw_bif_body', 'gt_call', [2n, 1n]], ['raw_bif_body', 'gt_call', [1n, 2n]],
    ['raw_bif_body', 'ge_call_tail', [2n, 1n]], ['raw_bif_body', 'ge_call_tail', [1n, 2n]],
    ['calls', 'comparison_bif_remote', [2n, 1n]], ['calls', 'comparison_bif_remote', [1n, 2n]],
  );
  const nested = runtime.cons(tagged, runtime.cons(partial, nil));
  cases.push(
    ['erlang', 'list_to_tuple', [nil]], ['erlang', 'list_to_tuple', [proper]],
    ['erlang', 'list_to_tuple', [nested]], ['erlang', 'list_to_tuple', [improper]],
    ['erlang', 'list_to_tuple', [longImproper]], ['erlang', 'list_to_tuple', [atom('bad')]],
    ['erlang', 'list_to_tuple', [tuple()]],
    ['erlang', 'tuple_to_list', [tuple()]], ['erlang', 'tuple_to_list', [tagged]],
    ['erlang', 'tuple_to_list', [tuple(tagged, partial)]], ['erlang', 'tuple_to_list', [nil]],
    ['erlang', 'tuple_to_list', [proper]], ['erlang', 'tuple_to_list', [atom('bad')]],
    ['bif_body', 'from_list', [proper]], ['bif_body', 'from_list', [improper]],
    ['bif_body', 'to_list', [tagged]], ['bif_body', 'to_list', [nil]],
    ['bif_body', 'tuple_roundtrip', [nested]], ['bif_body', 'tuple_roundtrip', [improper]],
    ['raw_bif_body', 'list_to_tuple_last', [proper]],
    ['raw_bif_body', 'list_to_tuple_last', [improper]],
    ['raw_bif_body', 'tuple_to_list_last', [tagged]],
    ['raw_bif_body', 'tuple_to_list_last', [nil]],
  );
  const booleanValues = [atom('true'), atom('false'), atom('bad'), 0n, nil];
  for (const [module, name] of [
    ['erlang', 'not'], ['bif_body', 'bool_not'], ['bif_body', 'guard_not'],
    ['raw_bif_body', 'bool_not_y'], ['raw_bif_body', 'bool_not_guard'],
    ['raw_bif_body', 'bool_not_call'],
  ]) {
    for (const value of booleanValues) cases.push([module, name, [value]]);
  }
  for (const op of ['and', 'or', 'xor']) {
    for (const [module, name] of [
      ['erlang', op], ['bif_body', `bool_${op}`], ['bif_body', `guard_${op}`],
      ['raw_bif_body', `bool_${op}_y`], ['raw_bif_body', `bool_${op}_guard`],
      ['raw_bif_body', `bool_${op}_call`],
    ]) {
      for (const left of booleanValues) {
        for (const right of booleanValues) cases.push([module, name, [left, right]]);
      }
    }
  }
  for (const value of booleanValues) cases.push(['raw_bif_body', 'bool_xor_same', [value]]);
  const huge = 1n << 512n;
  for (const name of ['integer_to_list', 'integer_to_binary']) {
    for (const value of [0n, -123n, huge, -huge, runtime.float(1), atom('bad'), tuple()]) {
      cases.push(['erlang', name, [value]]);
    }
    for (let base = 2; base <= 36; base++) {
      for (const value of [0n, huge + 123n, -huge - 123n]) {
        cases.push(['erlang', name, [value, BigInt(base)]]);
      }
    }
    for (const args of [
      [42n, 0n], [42n, 1n], [42n, 37n], [42n, 1n << 1024n],
      [42n, runtime.float(10)], [42n, atom('bad')], [runtime.float(1), 10n],
      [atom('bad'), 10n], [nil, 10n],
    ]) cases.push(['erlang', name, args]);
  }
  cases.push(
    ['bif_body', 'integer_chars', [-123n]], ['bif_body', 'integer_chars', [atom('bad')]],
    ['bif_body', 'integer_chars_base', [-255n, 16n]], ['bif_body', 'integer_chars_base', [1n, 1n]],
    ['bif_body', 'integer_binary', [-123n]], ['bif_body', 'integer_binary', [runtime.float(1)]],
    ['bif_body', 'integer_binary_base', [35n, 36n]], ['bif_body', 'integer_binary_base', [1n, 37n]],
    ['bif_body', 'integer_text_pair', [-255n, 16n]], ['bif_body', 'integer_text_pair', [1n, 1n]],
    ['raw_bif_body', 'integer_chars_last', [255n, 16n]], ['raw_bif_body', 'integer_chars_last', [1n, 1n]],
    ['raw_bif_body', 'integer_binary_last', [-255n, 16n]], ['raw_bif_body', 'integer_binary_last', [nil, 10n]],
  );
  const longTuple = runtime.invoke('erlang', 'list_to_tuple', [longProper]);
  const longRoundtrip = runtime.tupleSize(longTuple) === 10000 &&
    runtime.tupleElement(longTuple, 1) === 9999n && runtime.tupleElement(longTuple, 10000) === 0n &&
    runtime.equalExact(runtime.invoke('erlang', 'tuple_to_list', [longTuple]), longProper);
  const identityTerms = [runtime.hostHandle({}), ref, pid];
  const identityList = identityTerms.reduceRight((tail, value) => runtime.cons(value, tail), nil);
  const identityTuple = runtime.invoke('erlang', 'list_to_tuple', [identityList]);
  if (!identityTerms.every((value, i) => runtime.tupleElement(identityTuple, i + 1) === value) ||
      !runtime.equalExact(runtime.invoke('erlang', 'tuple_to_list', [identityTuple]), identityList)) {
    throw new Error('list/tuple conversion changed term identities');
  }

  const shadow = new runtime.constructor();
  shadow.registerModule(26, 'erlang', [
    ...['=:=', ...comparisonOps].map(name => ({name, arity: 2})), {name: '=:=', arity: 1},
    {name: '<', arity: 1}, {name: 'list_to_tuple', arity: 1},
    {name: 'tuple_to_list', arity: 1}, {name: 'list_to_tuple', arity: 2},
    ...['and', 'or', 'xor'].map(name => ({name, arity: 2})), {name: 'not', arity: 1},
    {name: 'not', arity: 2},
    ...['integer_to_list', 'integer_to_binary'].flatMap(name => [1, 2, 3].map(arity => ({name, arity}))),
  ].map(entry => ({
    ...entry, exported: true,
    run: rt => ({type: 'return', value: rt.atom('shadow')}),
  })));
  if (shadow.invoke('erlang', '=:=', [1n, 1n]) !== shadow.atom('true') ||
      shadow.invoke('erlang', '=:=', [1n]) !== shadow.atom('shadow')) {
    throw new Error('incorrect exact equality BIF dispatch');
  }
  for (const name of comparisonOps) {
    if (shadow.invoke('erlang', name, [1n, 1n]) === shadow.atom('shadow')) {
      throw new Error(`incorrect comparison BIF dispatch: ${name}/2`);
    }
  }
  if (shadow.invoke('erlang', '<', [1n]) !== shadow.atom('shadow')) {
    throw new Error('incorrect comparison BIF arity dispatch');
  }
  const singleton = shadow.cons(1n, shadow.nil());
  if (!shadow.equalExact(shadow.invoke('erlang', 'list_to_tuple', [singleton]), shadow.tuple([1n])) ||
      !shadow.equalExact(shadow.invoke('erlang', 'tuple_to_list', [shadow.tuple([1n])]), singleton) ||
      shadow.invoke('erlang', 'list_to_tuple', [1n, 2n]) !== shadow.atom('shadow')) {
    throw new Error('incorrect list/tuple conversion BIF dispatch');
  }
  for (const [name, args, expected] of [
    ['not', [shadow.atom('false')], shadow.atom('true')],
    ['and', [shadow.atom('true'), shadow.atom('false')], shadow.atom('false')],
    ['or', [shadow.atom('true'), shadow.atom('false')], shadow.atom('true')],
    ['xor', [shadow.atom('true'), shadow.atom('true')], shadow.atom('false')],
    ['not', [1n, 2n], shadow.atom('shadow')],
  ]) {
    if (shadow.invoke('erlang', name, args) !== expected) {
      throw new Error(`incorrect boolean BIF dispatch: ${name}/${args.length}`);
    }
  }
  const charsFF = shadow.cons(70n, shadow.cons(70n, shadow.nil()));
  if (!shadow.equalExact(shadow.invoke('erlang', 'integer_to_list', [255n, 16n]), charsFF) ||
      !shadow.equalExact(shadow.invoke('erlang', 'integer_to_binary', [255n, 16n]),
        shadow.bitstring([70, 70], 16)) ||
      shadow.invoke('erlang', 'integer_to_list', [1n, 2n, 3n]) !== shadow.atom('shadow')) {
    throw new Error('incorrect integer conversion BIF dispatch');
  }
  const handle = shadow.hostHandle({});
  if (shadow.invoke('erlang', '=:=', [handle, handle]) !== shadow.atom('true') ||
      shadow.invoke('erlang', '=:=', [handle, shadow.hostHandle({})]) !== shadow.atom('false')) {
    throw new Error('incorrect exact equality for host handles');
  }

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
      const elements = [];
      while (runtime.isType('is_nonempty_list', value)) {
        elements.push(format(runtime.listHead(value)));
        value = runtime.listTail(value);
      }
      return `[${elements.join(',')}${runtime.isType('is_nil', value) ? '' : `|${format(value)}`}]`;
    }
    if (runtime.isType('is_tuple', value)) {
      return `{${Array.from({length: runtime.tupleSize(value)},
        (_, i) => format(runtime.tupleElement(value, i + 1))).join(',')}}`;
    }
    throw new TypeError('unexpected test term');
  }

  const results = cases.map(([module, name, args]) => {
    try {
      return `{ok,${format(runtime.invoke(module, name, args))}}`;
    } catch (error) {
      if (!(error instanceof ErlangError)) throw error;
      return `{${error.erlangClass},${format(error.reason)}}`;
    }
  });
  results.push(`{ok,${longRoundtrip}}`);
  return results;
}
