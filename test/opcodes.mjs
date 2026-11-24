import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {Runtime} from '../runtime/beam2js.mjs';

const dir = mkdtempSync(join(tmpdir(), 'beam2js-opcodes-'));
const run = (command, args) => execFileSync(command, args, {encoding: 'utf8', timeout: 30000});
const compiler = resolve('_build/default/bin/beam2js');
const unary = ['is_integer', 'is_number', 'is_atom', 'is_boolean', 'is_float',
  'is_nil', 'is_list', 'is_nonempty_list', 'is_tuple', 'is_binary', 'is_bitstr'];
const binary = ['is_eq_exact', 'is_ne_exact', 'is_eq', 'is_ne', 'is_lt', 'is_ge'];
const functions = [...unary.map(name => ({name, arity: 1})), ...binary.map(name => ({name, arity: 2})),
  {name: 'literal_atom', arity: 1, op: 'is_eq_exact', operands: '{x,0},{atom,yes}'},
  {name: 'literal_integer', arity: 1, op: 'is_lt', operands: '{x,0},{integer,-9999999999999}'},
  {name: 'literal_float', arity: 1, op: 'is_eq_exact', operands: '{x,0},{float,-0.0}'},
  {name: 'literal_nil', arity: 1, op: 'is_eq_exact', expectedOp: 'is_nil', operands: '{x,0},nil'}];

const integer = value => ({type: 'integer', value: String(value)});
const float = value => ({type: 'float', value});
const atom = value => ({type: 'atom', value});
const nil = {type: 'nil'};
const cons = (head, tail) => ({type: 'cons', head, tail});
const tuple = (...elements) => ({type: 'tuple', elements});
const bits = (bytes, length) => ({type: 'bitstring', bytes, length});
const bitValues = [bits([], 0), bits([0], 1), bits([128], 1), bits([128], 2), bits([160], 3),
  bits([176], 4), bits([168], 5), bits([168], 6), bits([170], 7), bits([170], 8), bits([170, 0], 9),
  bits([170, 128], 9), bits([170, 255], 16), bits([255], 8),
  {...bits([170], 8), erlang: '(fun(<<_:3,B:8/bitstring,_/bitstring>>) -> B end)(<<0:3,170:8,0:1013>>)'},
  {...bits([160], 3), erlang: '(fun(<<_:3,B:3/bitstring,_/bitstring>>) -> B end)(<<0:3,5:3,0:1018>>)'}];
const unalignedLong = [
  {...bits(Array(80).fill(0), 640), erlang: '(fun(<<_:3,B:640/bitstring,_/bitstring>>) -> B end)(<<0:3,0:640,0:381>>)'},
  {...bits(Array(81).fill(0), 641), erlang: '(fun(<<_:3,B:641/bitstring,_/bitstring>>) -> B end)(<<0:3,0:641,0:380>>)'},
];
const large = integer('123456789012345678901234567890');
const bitwiseValues = [integer(-6), integer(-1), integer(0), integer(5), integer(6),
  integer('18446744073709551616'), integer('-340282366920938463463374607431768211456'),
  integer('340282366920938463463374607431768211457'),
  float('5.0'), atom('no'), nil, tuple()];
const bitwisePairs = [
  [integer(5), integer(7)], [integer(4), integer(1)], [integer(-6), integer(-1)],
  [integer(-6), integer(5)], [integer(0), integer(-1)],
  [integer('18446744073709551616'), integer(5)],
  [integer('-340282366920938463463374607431768211456'),
    integer('340282366920938463463374607431768211457')],
  [integer(5), float('1.0')], [float('1.0'), integer(5)],
  [integer(5), atom('no')], [atom('no'), integer(5)], [nil, tuple()],
];
const divisionPairs = [
  [integer(7), integer(3)], [integer(-7), integer(3)],
  [integer(7), integer(-3)], [integer(-7), integer(-3)],
  [integer(1), integer(3)], [integer(-1), integer(3)],
  [integer(0), integer(-3)], [integer(6), integer(-3)],
  [integer('340282366920938463463374607431768211457'), integer(-3)],
  [integer('-340282366920938463463374607431768211457'), integer(3)],
  [integer(3), integer('340282366920938463463374607431768211457')],
  [integer('-9223372036854775808'), integer(-1)],
  [integer(7), integer(0)], [integer(0), integer(0)],
  [float('7.0'), integer(3)], [integer(7), float('3.0')],
  [integer(7), float('-0.0')], [atom('bad'), integer(3)],
  [integer(7), atom('bad')], [nil, tuple()],
];
const maxFloatInteger = (1n << 1024n) - (1n << 971n);
const floatOverflowTie = (1n << 1024n) - (1n << 970n);
const floatDivisionPairs = [
  [integer(5), integer(2)], [integer(-5), integer(2)],
  [integer(5), integer(-2)], [integer(-5), integer(-2)],
  [integer(0), integer(-3)], [integer(6), integer(3)],
  [float('5.0'), integer(2)], [integer(5), float('2.0')],
  [float('5.0'), float('2.0')], [float('-0.0'), float('-2.0')],
  [float('-0.0'), float('2.0')], [float('0.0'), float('-2.0')],
  [float('5.0e-324'), float('2.0')], [float('-5.0e-324'), float('2.0')],
  [float('1.7976931348623157e308'), float('0.5')],
  [float('-1.7976931348623157e308'), float('0.5')],
  [integer('9007199254740993'), integer(3)],
  [integer('9007199254740995'), float('3.0')],
  [integer(maxFloatInteger), integer(1)], [integer(floatOverflowTie - 1n), integer(2)],
  [integer(floatOverflowTie), integer(2)], [integer(1), integer(floatOverflowTie)],
  [integer(1n << 1024n), integer(1n << 1024n)],
  [integer(1), integer(0)], [integer(0), integer(0)],
  [float('1.0'), float('0.0')], [float('1.0'), float('-0.0')],
  [float('-0.0'), float('-0.0')], [integer(5), float('-0.0')],
  [atom('bad'), integer(2)], [integer(1), nil], [tuple(), float('1.0')],
];
const arithmeticPairs = [
  [integer(2), integer(3)], [integer(-8), integer(-3)], [large, large],
  [integer('9007199254740993'), float('1.0')],
  [integer('9007199254740995'), float('1.0')],
  [integer('-9007199254740993'), float('-1.0')],
  [float('1.5'), integer(2)], [integer(-1), float('1.5')],
  [float('0.0'), float('-0.0')], [float('-0.0'), float('-0.0')],
  [integer(0), float('-0.0')], [float('-0.0'), integer(0)],
  [float('5.0e-324'), float('0.5')], [float('-5.0e-324'), float('0.5')],
  [float('1.7976931348623157e308'), float('2.0')],
  [float('-1.7976931348623157e308'), float('2.0')],
  [integer(maxFloatInteger), float('0.0')],
  [integer(floatOverflowTie - 1n), float('0.0')],
  [integer(floatOverflowTie), float('0.0')],
  [integer(1n << 1024n), float('0.0')],
  [float('0.0'), integer(1n << 1024n)],
  [atom('bad'), integer(1)], [integer(1), nil], [tuple(), float('1.0')],
];
for (const value of [
  (1n << 53n) + 1n, (1n << 53n) + 3n,
  (1n << 100n) + (1n << 47n), (1n << 100n) + (1n << 47n) + 1n,
  -(floatOverflowTie - 1n), -floatOverflowTie,
]) {
  arithmeticPairs.push([integer(value), float('1.0')], [float('-1.0'), integer(value)]);
}
const values = [integer(-1), integer(0), large, atom('true'), atom('false'), atom('yes'),
  float('0.0'), float('-0.0'), float('1.5'), float('5.0e-324'),
  nil, cons(integer(1), nil), cons(atom('a'), atom('b')), cons(cons(integer(1), nil), nil),
  tuple(), tuple(integer(1)), tuple(atom('a'), integer(1)), tuple(cons(integer(1), nil)),
  ...bitValues];
const cases = [];
const partInputs = [];
const partBinary = bits([0, 1, 2, 3], 32);
for (let start = -1; start <= 5; start++) {
  for (let length = -5; length <= 5; length++) {
    partInputs.push([partBinary, integer(start), integer(length)]);
  }
}
partInputs.push(
  [bits([], 0), integer(0), integer(0)],
  [bits([], 0), integer(1), integer(-1)],
  [bits([160], 3), integer(0), integer(0)],
  [unalignedLong[0], integer(80), integer(-2)],
  [unalignedLong[1], integer(0), integer(0)],
  [partBinary, integer(1n << 128n), integer(-(1n << 128n))],
  [partBinary, integer(2), integer(1n << 128n)],
  [partBinary, integer(2), integer(-(1n << 128n))],
  [partBinary, float('1.0'), integer(1)], [partBinary, integer(0), float('1.0')],
  [atom('bad'), integer(0), integer(0)], [nil, integer(0), integer(0)],
  [partBinary, atom('bad'), integer(0)], [partBinary, integer(0), nil],
);
for (const args of partInputs) {
  for (const module of ['guard_bifs', 'raw_guard_bifs']) cases.push({module, name: 'part', args});
  for (const module of ['guard_bifs', 'raw_guard_bifs']) {
    cases.push({module, name: 'part2', args: [args[0], tuple(args[1], args[2])]});
  }
}
const invalidPartRanges = [atom('bad'), nil, integer(0), bits([], 0), tuple(),
  tuple(integer(0)), tuple(integer(0), integer(1), integer(2)),
  tuple(float('0.0'), integer(1)), tuple(integer(0), atom('bad')),
  cons(integer(0), cons(integer(1), nil))];
for (const range of invalidPartRanges) {
  for (const module of ['guard_bifs', 'raw_guard_bifs']) {
    cases.push({module, name: 'part2', args: [partBinary, range]});
  }
}
for (const name of unary) {
  for (const value of values) cases.push({module: 'opcode_tests', name, args: [value]});
}
const pairs = [
  [integer(1), integer(1)], [integer(-1), integer(1)], [large, integer(1)],
  [atom('yes'), atom('yes')], [atom('a'), atom('aa')],
  [atom('\uE000'), atom('\u{10000}')], [integer(1), atom('1')], [atom('1'), integer(1)],
];
for (const [a, b] of [
  [float('0.0'), float('-0.0')], [float('1.5'), float('1.5')],
  [float('-1.5'), float('1.5')], [integer(0), float('-0.0')],
  [integer(1), float('1.0')], [integer(1), float('1.5')],
  [integer('9007199254740992'), float('9007199254740992.0')],
  [integer('9007199254740993'), float('9007199254740992.0')],
  [integer('-9007199254740993'), float('-9007199254740992.0')],
  [integer((1n << 1024n).toString()), float('1.7976931348623157e308')],
  [float('5.0e-324'), float('0.0')], [float('1.5'), atom('yes')],
  [nil, nil], [atom('yes'), nil], [nil, cons(integer(1), nil)],
  [cons(integer(1), nil), cons(integer(1), nil)],
  [cons(integer(1), nil), cons(float('1.0'), nil)],
  [cons(float('0.0'), nil), cons(float('-0.0'), nil)],
  [cons(atom('a'), atom('b')), cons(atom('a'), atom('c'))],
  [cons(atom('a'), integer(1)), cons(atom('a'), nil)],
  [cons(atom('a'), integer(1)), cons(atom('a'), cons(integer(0), nil))],
  [cons(atom('a'), float('0.0')), cons(atom('a'), float('-0.0'))],
  [cons(atom('a'), integer(1)), cons(atom('a'), float('1.0'))],
  [cons(cons(integer(1), nil), nil), cons(cons(float('1.0'), nil), nil)],
  [atom('yes'), tuple()], [float('1.0'), tuple()], [tuple(), nil],
  [tuple(), cons(integer(1), nil)], [tuple(integer(1)), tuple(integer(1))],
  [tuple(integer(1)), tuple(float('1.0'))], [tuple(float('0.0')), tuple(float('-0.0'))],
  [tuple(atom('z')), tuple(integer(0), integer(0))],
  [tuple(atom('a'), integer(3)), tuple(atom('a'), integer(4))],
  [tuple(cons(integer(1), nil)), tuple(cons(float('1.0'), nil))],
  [cons(tuple(integer(1)), nil), cons(tuple(float('1.0')), nil)],
]) {
  pairs.push([a, b], [b, a]);
}
const list = (...elements) => elements.reduceRight((tail, head) => cons(head, tail), nil);
const nestedTuple = (value, tail = atom('tail')) => tuple(
  atom('root'),
  list(tuple(list(atom('node'), tuple(bits([160], 3), value)), tail), float('-0.0')),
  tuple(nil, integer('123456789012345678901234567890')),
);
const nestedList = (value, tail = atom('end')) => list(
  tuple(atom('entry'), list(tuple(integer(1), list(value, bits([170, 128], 9))), nil)),
  cons(tuple(atom('last'), list(integer(2), integer(3))), tail),
);
for (const [left, right] of [
  [nestedTuple(integer(42)), nestedTuple(integer(42))],
  [nestedTuple(integer(42)), nestedTuple(integer(43))],
  [nestedTuple(integer(42)), nestedTuple(float('42.0'))],
  [nestedTuple(integer(42)), nestedTuple(integer(42), atom('other_tail'))],
  [nestedList(atom('value')), nestedList(atom('value'))],
  [nestedList(atom('value')), nestedList(atom('other'))],
  [nestedList(atom('value')), nestedList(atom('value'), nil)],
  [nestedList(tuple(list(integer(1)), float('0.0'))),
    nestedList(tuple(list(integer(1)), float('-0.0')))],
  [nestedList(bits([160], 3)), nestedList(bits([176], 4))],
  [tuple(list(tuple(atom('a'), list(integer(1), integer(2))))),
    tuple(cons(tuple(atom('a'), cons(integer(1), cons(integer(2), nil))), nil))],
  [list(tuple(list(atom('a')), tuple(integer(1), nil))),
    cons(tuple(cons(atom('a'), nil), tuple(integer(1), nil)), nil)],
]) {
  pairs.push([left, right], [right, left]);
}
for (const a of bitValues) {
  for (const b of bitValues) pairs.push([a, b]);
}
pairs.push([nil, bitValues[0]], [bitValues[0], nil],
  [cons(integer(1), nil), bitValues[0]], [bitValues[0], cons(integer(1), nil)],
  [tuple(bits([160], 3)), tuple(bits([176], 4))],
  [cons(bits([160], 3), nil), cons(bits([176], 4), nil)]);
for (const name of binary) {
  for (const args of pairs) cases.push({module: 'opcode_tests', name, args});
}
cases.push(
  {module: 'opcode_tests', name: 'literal_atom', args: [atom('yes')]},
  {module: 'opcode_tests', name: 'literal_atom', args: [integer(1)]},
  {module: 'opcode_tests', name: 'literal_integer', args: [integer('-10000000000000')]},
  {module: 'opcode_tests', name: 'literal_integer', args: [integer(0)]},
  {module: 'opcode_tests', name: 'literal_float', args: [float('0.0')]},
  {module: 'opcode_tests', name: 'literal_float', args: [float('-0.0')]},
  {module: 'opcode_tests', name: 'literal_nil', args: [nil]},
  {module: 'opcode_tests', name: 'literal_nil', args: [cons(atom('a'), nil)]},
);
for (const name of ['integer', 'number', 'atom', 'boolean', 'float', 'binary', 'bitstring']) {
  for (const value of values) cases.push({module: 'guards', name, args: [value]});
  for (const value of values) cases.push({module: 'bif_predicates', name, args: [value]});
}
for (const value of unalignedLong) {
  for (const [module, name] of [['opcode_tests', 'is_binary'], ['opcode_tests', 'is_bitstr'],
    ['guards', 'binary'], ['guards', 'bitstring'], ['bif_predicates', 'binary'],
    ['bif_predicates', 'bitstring'], ['raw_typed', 'binary'], ['raw_typed', 'bits']]) {
    cases.push({module, name, args: [value]});
  }
}
for (const name of ['less', 'different']) {
  for (const args of pairs) cases.push({module: 'guards', name, args});
}
cases.push(
  {module: 'raw_control_flow', name: 'id', args: [large]},
  {module: 'raw_control_flow', name: 'id', args: [float('-0.0')]},
  {module: 'raw_control_flow', name: 'id', args: [float('5.0e-324')]},
  {module: 'raw_control_flow', name: 'local', args: [large]},
  {module: 'raw_control_flow', name: 'local', args: [atom('yes')]},
  {module: 'raw_control_flow', name: 'remote', args: [integer(42)]},
  {module: 'raw_control_flow', name: 'remote', args: [atom('yes')]},
  {module: 'raw_control_flow', name: 'jump', args: []},
  {module: 'raw_control_flow', name: 'move_atom', args: []},
  {module: 'raw_control_flow', name: 'move_integer', args: []},
  {module: 'raw_control_flow', name: 'pick', args: [integer(1), integer(2)]},
  {module: 'raw_predicate_bifs', name: 'register', args: [atom('ignored'), integer(1)]},
  {module: 'raw_predicate_bifs', name: 'register', args: [integer(1), atom('no')]},
  {module: 'raw_predicate_bifs', name: 'register', args: [integer(1), float('1.0')]},
  {module: 'raw_predicate_bifs', name: 'literal_atom', args: []},
  {module: 'raw_predicate_bifs', name: 'literal_integer', args: []},
  ...['binary_register', 'bits_register'].flatMap(name => values.map(value =>
    ({module: 'raw_predicate_bifs', name, args: [atom('ignored'), value]}))),
  ...['binary_literal', 'bits_literal'].map(name => ({module: 'raw_predicate_bifs', name, args: []})),
  ...['positive_zero', 'negative_zero', 'smallest', 'largest']
    .map(name => ({module: 'float_literals', name, args: []})),
  {module: 'list_slice', name: 'empty', args: []},
  {module: 'list_slice', name: 'prepend', args: [integer(1), nil]},
  {module: 'list_slice', name: 'prepend', args: [float('-0.0'), atom('tail')]},
  {module: 'list_slice', name: 'swap', args: [cons(atom('head'), atom('tail'))]},
  ...['head', 'tail', 'is_empty', 'list', 'swap']
    .flatMap(name => values.map(value => ({module: 'list_slice', name, args: [value]}))),
  {module: 'tuple_slice', name: 'empty', args: []},
  {module: 'tuple_slice', name: 'pair', args: [integer(1), cons(float('-0.0'), nil)]},
  {module: 'tuple_slice', name: 'pair', args: [tuple(), atom('tail')]},
  ...['first', 'second', 'is_pair', 'tuple']
    .flatMap(name => values.map(value => ({module: 'tuple_slice', name, args: [value]}))),
  ...[...values, tuple(atom('tag'), integer(42)), tuple(atom('tag')),
    tuple(atom('wrong'), integer(42)), tuple(atom('tag'), integer(42), nil)]
    .map(value => ({module: 'tuple_slice', name: 'tagged', args: [value]})),
  ...[atom('first'), atom('second'), atom('missing'), integer(1), nil]
    .flatMap(value => ['raw_select', 'select_slice']
      .map(module => ({module, name: module === 'raw_select' ? 'atom_choice' : 'choose', args: [value]}))),
  ...[integer(-1), integer(2048), integer(0), float('-1.0'), atom('first')]
    .map(value => ({module: 'raw_select', name: 'integer_choice', args: [value]})),
  ...[float('1.5'), float('2.5'), float('1.0'), integer(1), float('-0.0')]
    .map(value => ({module: 'raw_select', name: 'float_choice', args: [value]})),
  ...[tuple(), tuple(atom('a')), tuple(atom('a'), atom('b')), tuple(atom('a'), atom('b'), nil), atom('no')]
    .map(value => ({module: 'raw_select', name: 'tuple_arity', args: [value]})),
  ...[...values, tuple(atom('a'), atom('b'), nil)]
    .map(value => ({module: 'typed_select_slice', name: 'choose', args: [value]})),
  ...values.map(value => ({module: 'raw_typed', name: 'check', args: [value]})),
  ...['binary', 'bits'].flatMap(name => values.map(value => ({module: 'raw_typed', name, args: [value]}))),
  ...pairs.map(args => ({module: 'raw_typed', name: 'compare', args})),
  ...values.map(value => ({module: 'raw_typed', name: 'stack_check', args: [value]})),
  ...pairs.flatMap(args => ['stack_compare', 'stack_equal']
    .map(name => ({module: 'raw_typed', name, args}))),
  ...[[integer(1), integer(2)], [integer(-1), integer(3)], [float('1.5'), integer(2)]]
    .map(args => ({module: 'raw_typed', name: 'stack_add', args})),
  ...[...values, cons(atom('yes'), nil), cons(atom('x'), atom('yes')),
    tuple(atom('yes'), integer(2))]
    .flatMap(value => ['head', 'tail', 'size'].flatMap(name =>
      ['raw_guard_bifs', 'guard_bifs'].map(module => ({module, name, args: [value]})))),
  ...[integer(-1), integer(0), integer(1), integer(2), integer(3), large,
    float('1.0'), atom('yes')].flatMap(index =>
    [tuple(), tuple(atom('yes')), tuple(atom('no'), atom('yes')), nil, atom('no')]
      .flatMap(value => ['raw_guard_bifs', 'guard_bifs'].map(module =>
        ({module, name: 'element', args: [index, value]})))),
  ...[
    [integer(1), tuple(atom('result')), atom('original')],
    [integer(0), tuple(atom('result')), atom('original')],
    [large, tuple(atom('result')), tuple(atom('original'))],
    [integer(1), nil, cons(atom('original'), nil)],
  ].map(args => ({module: 'raw_guard_bifs', name: 'keep', args})),
  ...[
    [integer(1), tuple(atom('result'))],
    [integer(2), tuple(atom('result'))],
    [atom('bad'), tuple(atom('original'))],
    [integer(1), atom('original')],
  ].map(args => ({module: 'raw_guard_bifs', name: 'element_alias', args})),
  ...[tuple(atom('first'), atom('second')), tuple(atom('first')), nil]
    .map(value => ({module: 'raw_guard_bifs', name: 'literal_index', args: [value]})),
  ...[
    [partBinary, integer(3), integer(-2), atom('original')],
    [partBinary, integer(0), integer(0), atom('original')],
    [partBinary, integer(1), integer(-2), tuple(atom('original'))],
    [bits([160], 3), integer(0), integer(0), cons(atom('original'), nil)],
    [partBinary, float('1.0'), integer(1), atom('original')],
  ].map(args => ({module: 'raw_guard_bifs', name: 'part_keep', args})),
  ...['part_alias_start', 'part_alias_length'].flatMap(name =>
    [[partBinary, integer(3), integer(-2)], [partBinary, integer(1), integer(-2)],
      [bits([160], 3), integer(0), integer(0)], [partBinary, float('1.0'), integer(1)]]
      .map(args => ({module: 'raw_guard_bifs', name, args}))),
  {module: 'raw_guard_bifs', name: 'part_literal', args: []},
  ...[[partBinary, tuple(integer(3), integer(-2)), atom('original')],
    [partBinary, tuple(integer(1), integer(-2)), tuple(atom('original'))],
    [partBinary, tuple(integer(0)), cons(atom('original'), nil)],
    [bits([160], 3), tuple(integer(0), integer(0)), atom('original')]]
    .map(args => ({module: 'raw_guard_bifs', name: 'part2_keep', args})),
  ...[[partBinary, tuple(integer(3), integer(-2))],
    [partBinary, tuple(integer(1), integer(-2))], [partBinary, tuple(integer(0))],
    [bits([160], 3), tuple(integer(0), integer(0))]]
    .map(args => ({module: 'raw_guard_bifs', name: 'part2_alias_range', args})),
  {module: 'raw_guard_bifs', name: 'part2_literal', args: []},
  ...[...values, cons(atom('a'), cons(atom('b'), nil)),
    cons(nil, cons(tuple(), nil)), cons(atom('a'), cons(atom('b'), atom('tail')))]
    .flatMap(value => [
      {module: 'raw_length_guards', name: 'size', args: [value]},
      {module: 'length_guards', name: 'two', args: [value]},
    ]),
  ...[
    [nil, atom('original')],
    [cons(atom('a'), nil), atom('original')],
    [cons(atom('a'), atom('tail')), tuple(atom('original'))],
    [atom('bad'), cons(atom('original'), nil)],
  ].map(args => ({module: 'raw_length_guards', name: 'keep', args})),
  {module: 'raw_length_guards', name: 'literal', args: []},
  ...[...values, ...unalignedLong].flatMap(value =>
    ['bits', 'bytes'].flatMap(name => ['raw_length_guards', 'length_guards']
      .map(module => ({module, name, args: [value]})))),
  ...['keep_bits', 'keep_bytes'].flatMap(name =>
    [[bits([160], 3), atom('original')], [bits([170, 128], 9), tuple(atom('original'))],
      [atom('bad'), cons(atom('original'), nil)], [nil, atom('original')]]
      .map(args => ({module: 'raw_length_guards', name, args}))),
  ...['literal_bits', 'literal_bytes'].map(name => ({module: 'raw_length_guards', name, args: []})),
  ...['both', 'either', 'different'].flatMap(name => bitwisePairs.flatMap(args =>
    ['raw_bitwise_guards', 'bitwise_guards'].map(module => ({module, name, args})))),
  ...bitwiseValues.flatMap(value => ['raw_bitwise_guards', 'bitwise_guards']
    .map(module => ({module, name: 'invert', args: [value]}))),
  ...bitwiseValues.map(value => ({module: 'raw_bitwise_guards', name: 'literal', args: [value]})),
  ...bitwiseValues.map(value => ({module: 'raw_bitwise_guards', name: 'literal_big', args: [value]})),
  ...[
    [integer(1), integer(3), atom('original')],
    [atom('bad'), integer(3), atom('original')],
    [integer(3), float('1.0'), tuple(atom('original'))],
  ].map(args => ({module: 'raw_bitwise_guards', name: 'keep', args})),
  ...['quotient', 'remainder'].flatMap(name => divisionPairs.flatMap(args =>
    ['raw_integer_guards', 'integer_guards'].map(module => ({module, name, args})))),
  ...[
    [integer(7), integer(-3), atom('original')],
    [integer(7), integer(0), atom('original')],
    [atom('bad'), integer(3), tuple(atom('original'))],
    [integer(7), float('3.0'), cons(atom('original'), nil)],
  ].flatMap(args => ['keep', 'keep_rem']
    .map(name => ({module: 'raw_integer_guards', name, args}))),
  ...[integer(-7), integer(7), integer(0), large, atom('bad'), float('1.0')]
    .flatMap(value => ['literal', 'literal_big']
      .map(name => ({module: 'raw_integer_guards', name, args: [value]}))),
  ...['add', 'subtract', 'multiply'].flatMap(name => arithmeticPairs.flatMap(args =>
    ['arithmetic_guards', 'raw_arithmetic_guards'].map(module => ({module, name, args})))),
  ...[integer(0), integer(-5), large, float('0.0'), float('-0.0'), float('5.0e-324'),
    float('-1.5'), atom('bad'), nil, tuple()].flatMap(value =>
    ['arithmetic_guards', 'raw_arithmetic_guards']
      .map(module => ({module, name: 'negate', args: [value]}))),
  ...[integer(-1), integer(0), float('0.0'), float('-0.0'), float('1.5'), atom('bad')]
    .map(value => ({module: 'raw_arithmetic_guards', name: 'literal', args: [value]})),
  ...[
    [integer(2), integer(3), atom('original')],
    [atom('bad'), integer(3), tuple(atom('original'))],
    [integer(1n << 1024n), float('0.0'), cons(atom('original'), nil)],
    [float('1.7976931348623157e308'), float('1.7976931348623157e308'), atom('original')],
  ].map(args => ({module: 'raw_arithmetic_guards', name: 'keep', args})),
  ...floatDivisionPairs.flatMap(args => ['arithmetic_guards', 'raw_arithmetic_guards']
    .map(module => ({module, name: 'divide', args}))),
  ...[
    [integer(5), integer(2), atom('original')],
    [integer(5), integer(0), atom('original')],
    [integer(5), float('-0.0'), tuple(atom('original'))],
    [float('1.7976931348623157e308'), float('0.5'), atom('original')],
    [integer(1n << 1024n), integer(2), cons(atom('original'), nil)],
    [atom('bad'), integer(2), atom('original')],
  ].map(args => ({module: 'raw_arithmetic_guards', name: 'keep_divide', args})),
  ...[integer(5), integer(0), float('-0.0'), float('5.0e-324'), large, atom('bad')]
    .map(value => ({module: 'raw_arithmetic_guards', name: 'divide_literal', args: [value]})),
  ...[integer(-5), integer(5), integer(0), large, integer(-(1n << 1024n)),
    float('-0.0'), float('0.0'), float('-5.0e-324'), float('5.0e-324'),
    float('-1.7976931348623157e308'), float('5.0'), atom('bad'), nil, tuple()]
    .flatMap(value => ['arithmetic_guards', 'raw_arithmetic_guards']
      .map(module => ({module, name: 'absolute', args: [value]}))),
  ...[
    [integer(-5), atom('original')],
    [float('-0.0'), tuple(atom('original'))],
    [atom('bad'), cons(atom('original'), nil)],
    [nil, atom('original')],
  ].map(args => ({module: 'raw_arithmetic_guards', name: 'keep_abs', args})),
  {module: 'raw_arithmetic_guards', name: 'abs_literal', args: []},
  ...['truncate', 'round_value', 'floor_value', 'ceil_value'].flatMap(name =>
    [integer(0), integer(-5), integer(5), large, integer(-(1n << 1024n)),
      float('0.0'), float('-0.0'), float('5.0e-324'), float('-5.0e-324'),
      float('0.49999999999999994'), float('-0.49999999999999994'),
      float('0.5'), float('-0.5'), float('0.5000000000000001'), float('-0.5000000000000001'),
      float('1.4999999999999998'), float('-1.4999999999999998'),
      float('1.5'), float('-1.5'), float('5.1'), float('-5.1'),
      float('4503599627370495.5'), float('-4503599627370495.5'),
      float('9007199254740991.0'), float('1.7976931348623157e308'),
      float('-1.7976931348623157e308'), atom('bad'), nil, tuple()].flatMap(value =>
      ['arithmetic_guards', 'raw_arithmetic_guards']
        .map(module => ({module, name, args: [value]})))),
  ...['keep_trunc', 'keep_round', 'keep_floor', 'keep_ceil'].flatMap(name =>
    [[float('-1.5'), atom('original')], [atom('bad'), tuple(atom('original'))],
      [nil, cons(atom('original'), nil)]]
      .map(args => ({module: 'raw_arithmetic_guards', name, args}))),
  {module: 'raw_arithmetic_guards', name: 'round_literal', args: []},
  ...[integer(0), integer(5), integer(-5), integer('9007199254740993'),
    integer('9007199254740995'), integer('-9007199254740993'),
    integer('-9007199254740995'), integer(maxFloatInteger), integer(-maxFloatInteger),
    integer(floatOverflowTie - 1n), integer(-(floatOverflowTie - 1n)),
    integer(floatOverflowTie), integer(-floatOverflowTie),
    integer(1n << 1024n), integer(-(1n << 1024n)), integer(1n << 4096n),
    float('0.0'), float('-0.0'), float('5.0e-324'), float('-5.0e-324'),
    float('1.7976931348623157e308'), float('-1.7976931348623157e308'),
    float('5.0'), atom('bad'), nil, tuple()].flatMap(value =>
    ['arithmetic_guards', 'raw_arithmetic_guards']
      .map(module => ({module, name: 'convert_float', args: [value]}))),
  ...[[integer(5), atom('original')], [float('-0.0'), atom('original')],
    [integer(1n << 1024n), tuple(atom('original'))], [atom('bad'), cons(atom('original'), nil)]]
    .map(args => ({module: 'raw_arithmetic_guards', name: 'keep_float', args})),
  {module: 'raw_arithmetic_guards', name: 'float_literal', args: []},
  ...[float('-0.0'), float('0.0'), integer(0), float('1.0'), atom('no')]
    .map(value => ({module: 'raw_select_zero', name: 'zeros', args: [value]})),
  ...[integer('340282366920938463463374607431768211456'),
    integer('340282366920938463463374607431768211457'),
    integer('340282366920938463463374607431768211458'), float('1.0')]
    .map(value => ({module: 'raw_select_zero', name: 'big', args: [value]})),
  {module: 'literal_terms', name: 'nested', args: []},
  {module: 'literal_terms', name: 'improper', args: []},
  {module: 'literal_terms', name: 'escaped', args: [tuple(atom('quote"back\\slash'), atom('\u{1f600}'))]},
  {module: 'literal_terms', name: 'escaped', args: [tuple(atom('wrong'), atom('\u{1f600}'))]},
  {module: 'literal_terms', name: 'exact', args: [tuple(atom('key'), cons(integer(1), cons(integer(2), nil)))]},
  {module: 'literal_terms', name: 'exact', args: [tuple(atom('key'), cons(integer(1), cons(float('2.0'), nil)))]},
  {module: 'literal_terms', name: 'numeric', args: [tuple(atom('key'), cons(integer(1), cons(float('0.0'), nil)))]},
  {module: 'literal_terms', name: 'numeric', args: [tuple(atom('key'), cons(integer(1), cons(integer(2), nil)))]},
  {module: 'literal_terms', name: 'prepend', args: [atom('tail')]},
  {module: 'literal_terms', name: 'pair', args: [tuple()]},
  ...['binary', 'bits', 'empty_binary', 'partial_bits'].map(name => ({module: 'literal_terms', name, args: []})),
  {module: 'unsupported_literal', name: 'value', args: []},
  ...[tuple(atom('bits'), bits([171, 160], 11)),
    tuple(atom('bits'), bits([171, 128], 11)),
    tuple(atom('bits'), bits([171, 160], 16))]
    .map(value => ({module: 'literal_terms', name: 'bits_match', args: [value]})),
);

function term(value, runtime) {
  if (value.type === 'integer') return BigInt(value.value);
  if (value.type === 'float') return runtime.float(Number(value.value));
  if (value.type === 'nil') return runtime.nil();
  if (value.type === 'cons') return runtime.cons(term(value.head, runtime), term(value.tail, runtime));
  if (value.type === 'tuple') return runtime.tuple(value.elements.map(element => term(element, runtime)));
  if (value.type === 'bitstring') return runtime.bitstring(value.bytes, value.length);
  return runtime.atom(value.value);
}
function result(value, runtime) {
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'symbol') return Symbol.keyFor(value);
  if (runtime.isBitstring(value)) {
    return `bits:${runtime.bitstringSize(value)}:[${Array.from(runtime.bitstringBytes(value)).join(',')}]`;
  }
  if (runtime.isType('is_nil', value)) return '[]';
  if (runtime.isType('is_nonempty_list', value)) {
    return `[${result(runtime.listHead(value), runtime)}|${result(runtime.listTail(value), runtime)}]`;
  }
  if (runtime.isType('is_tuple', value)) {
    return `{${Array.from({length: runtime.tupleSize(value)}, (_, i) =>
      result(runtime.tupleElement(value, i + 1), runtime)).join(',')}}`;
  }
  const bytes = new DataView(new ArrayBuffer(8));
  bytes.setFloat64(0, runtime.floatValue(value));
  return `float:${bytes.getBigUint64(0)}`;
}
function erlangTerm(value) {
  if (value.erlang) return value.erlang;
  if (value.type === 'integer' || value.type === 'float') return value.value;
  if (value.type === 'nil') return '[]';
  if (value.type === 'cons') return `[${erlangTerm(value.head)}|${erlangTerm(value.tail)}]`;
  if (value.type === 'tuple') return `{${value.elements.map(erlangTerm).join(',')}}`;
  if (value.type === 'bitstring') {
    const full = Math.floor(value.length / 8);
    const segments = value.bytes.slice(0, full).map(byte => `${byte}:8`);
    if (value.length % 8) segments.push(`${value.bytes[full] >> (8 - value.length % 8)}:${value.length % 8}`);
    return `<<${segments.join(',')}>>`;
  }
  const codepoints = Array.from(value.value, char => char.codePointAt(0));
  return `list_to_atom([${codepoints.join(',')}])`;
}

try {
  const assembly = functions.map(({name, arity, op = name, operands}, index) => {
    const first = 3 * index + 1;
    const args = operands ?? Array.from({length: arity}, (_, reg) => `{x,${reg}}`).join(',');
    return `{function,${name},${arity},${first + 1}}.\n` +
      `{label,${first}}.\n{func_info,{atom,opcode_tests},{atom,${name}},${arity}}.\n` +
      `{label,${first + 1}}.\n{test,${op},{f,${first + 2}},[${args}]}.\n` +
      `{move,{atom,yes},{x,0}}.\nreturn.\n{label,${first + 2}}.\n` +
      `{move,{atom,no},{x,0}}.\nreturn.\n`;
  }).join('\n');
  const asmPath = join(dir, 'opcode_tests.S');
  writeFileSync(asmPath, `{module,opcode_tests}.\n{exports,[${functions.map(({name, arity}) =>
    `{${name},${arity}}`).join(',')}]}.\n{attributes,[]}.\n{labels,${functions.length * 3 + 1}}.\n${assembly}`);
  run('erl', ['-noshell', '-eval',
    '[File,Dir]=init:get_plain_arguments(), {ok,opcode_tests}=' +
    'compile:file(File,[from_asm,no_postopt,{outdir,Dir},report_errors]), halt().',
    '-extra', asmPath, dir]);
  run('erlc', ['-o', dir, 'fixtures/guards.erl', 'fixtures/bif_predicates.erl',
    'fixtures/float_literals.erl', 'fixtures/list_slice.erl', 'fixtures/tuple_slice.erl',
    'fixtures/literal_terms.erl', 'fixtures/select_slice.erl', 'fixtures/typed_select_slice.erl',
    'fixtures/unsupported_literal.erl', 'fixtures/guard_bifs.erl', 'fixtures/bitwise_guards.erl',
    'fixtures/integer_guards.erl', 'fixtures/length_guards.erl', 'fixtures/arithmetic_guards.erl',
    'fixtures/slice_helper.erl']);
  run('erl', ['-noshell', '-eval',
    '[Dir]=init:get_plain_arguments(), {ok,raw_control_flow}=' +
    'compile:file("fixtures/raw_control_flow.S",[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{ok,raw_predicate_bifs}=compile:file("fixtures/raw_predicate_bifs.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{ok,raw_select}=compile:file("fixtures/raw_select.S",[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{ok,raw_select_zero}=compile:file("fixtures/raw_select_zero.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{ok,raw_typed}=compile:file("fixtures/raw_typed.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{ok,raw_guard_bifs}=compile:file("fixtures/raw_guard_bifs.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{ok,raw_bitwise_guards}=compile:file("fixtures/raw_bitwise_guards.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{ok,raw_integer_guards}=compile:file("fixtures/raw_integer_guards.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{ok,raw_length_guards}=compile:file("fixtures/raw_length_guards.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{ok,raw_arithmetic_guards}=compile:file("fixtures/raw_arithmetic_guards.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    'lists:foreach(fun(Module) -> Path=filename:join(Dir,atom_to_list(Module)++".beam"), ' +
    '{ok,Data}=file:read_file(Path), {ok,{Module,Stripped}}=beam_lib:strip(Data), ' +
    'ok=file:write_file(filename:join(Dir,atom_to_list(Module)++"-stripped.beam"),Stripped) end, ' +
    '[guards,guard_bifs,raw_guard_bifs,bitwise_guards,raw_bitwise_guards,integer_guards,raw_integer_guards,' +
    'length_guards,raw_length_guards,arithmetic_guards,raw_arithmetic_guards]), ' +
    '{ok,TypedRaw}=file:read_file(filename:join(Dir,"raw_typed.beam")), ' +
    '{ok,{raw_typed,StrippedTypedRaw}}=beam_lib:strip(TypedRaw), ' +
    'ok=file:write_file(filename:join(Dir,"raw_typed-stripped.beam"),StrippedTypedRaw), ' +
    '{ok,raw_typed,Chunks}=beam_lib:all_chunks(TypedRaw), true=lists:keymember("Type",1,Chunks), ' +
    '{ok,Without}=beam_lib:build_module(lists:keydelete("Type",1,Chunks)), ' +
    'ok=file:write_file(filename:join(Dir,"raw_typed_no_type.beam"),Without), ' +
    '{module,raw_typed}=code:load_binary(raw_typed,"raw_typed_no_type",Without), ' +
    'yes=raw_typed:check(1), no=raw_typed:check(no), ' +
    'Unaligned=(fun(<<_:3,B:640/bitstring,_/bitstring>>) -> B end)(<<0:3,0:640,0:381>>), ' +
    'true=is_binary(Unaligned), 80=byte_size(Unaligned), ' +
    '128=binary:referenced_byte_size(Unaligned), ' +
    '{ok,Select}=file:read_file(filename:join(Dir,"raw_select.beam")), ' +
    '{ok,{raw_select,StrippedSelect}}=beam_lib:strip(Select), ' +
    'ok=file:write_file(filename:join(Dir,"raw_select-stripped.beam"),StrippedSelect), ' +
    '{ok,raw_bifs}=compile:file("fixtures/raw_bifs.S",[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{ok,Bifs}=file:read_file(filename:join(Dir,"raw_bifs.beam")), ' +
    '{ok,{raw_bifs,StrippedBifs}}=beam_lib:strip(Bifs), ' +
    'ok=file:write_file(filename:join(Dir,"raw_bifs-stripped.beam"),StrippedBifs), ' +
    '{ok,Unsupported}=file:read_file(filename:join(Dir,"unsupported_literal.beam")), ' +
    '{ok,{unsupported_literal,StrippedUnsupported}}=beam_lib:strip(Unsupported), ' +
    'ok=file:write_file(filename:join(Dir,"unsupported_literal-stripped.beam"),StrippedUnsupported), ' +
    '{ok,Typed}=file:read_file(filename:join(Dir,"typed_select_slice.beam")), ' +
    '{ok,{typed_select_slice,StrippedTyped}}=beam_lib:strip(Typed), ' +
    'ok=file:write_file(filename:join(Dir,"typed_select_slice-stripped.beam"),StrippedTyped), ' +
    'LongList=lists:seq(1,10000), ' +
    'Improper=lists:foldr(fun(H,T) -> [H|T] end,tail,LongList), ' +
    'lists:foreach(fun(Name) -> Path=filename:join(Dir,Name), {ok,LB}=file:read_file(Path), ' +
    '{module,raw_length_guards}=code:load_binary(raw_length_guards,Path,LB), ' +
    '10000=raw_length_guards:size(LongList), failed=raw_length_guards:size(Improper) end, ' +
    '["raw_length_guards.beam","raw_length_guards-stripped.beam"]), ' +
    'lists:foreach(fun(Name) -> Path=filename:join(Dir,Name), {ok,LB}=file:read_file(Path), ' +
    '{module,length_guards}=code:load_binary(length_guards,Path,LB), ' +
    'no=length_guards:two(LongList), no=length_guards:two(Improper) end, ' +
    '["length_guards.beam","length_guards-stripped.beam"]), ' +
    'LongIs=[{label,1},{func_info,{atom,long_literal},{atom,value},0},{label,2},' +
    '{move,{literal,LongList},{x,0}},return], ' +
    '{ok,Long}=beam_asm:module({long_literal,[{value,0}],[],#{},' +
    '[{function,value,0,2,LongIs}],3},[],[],[]), ' +
    'ok=file:write_file(filename:join(Dir,"long_literal.beam"),Long), ' +
    '{module,long_literal}=code:load_binary(long_literal,"long_literal",Long), ' +
    'LongList=long_literal:value(), ' +
    '{ok,{long_literal,StrippedLong}}=beam_lib:strip(Long), ' +
    'ok=file:write_file(filename:join(Dir,"long_literal-stripped.beam"),StrippedLong), ' +
    '{module,long_literal}=code:load_binary(long_literal,"long_literal-stripped",StrippedLong), ' +
    'LongList=long_literal:value(), halt().',
    '-extra', dir]);

  const asmBeam = join(dir, 'opcode_tests.beam');
  const disassembled = run('erl', ['-noshell', '-eval',
    '[File]=init:get_plain_arguments(), {beam_file,_,_,_,_,Fs}=beam_disasm:file(File), ' +
    'lists:foreach(fun({function,N,_,_,Is}) -> lists:foreach(fun ' +
    '({test,Op,_,_}) -> io:format("~s ~s~n",[N,Op]); (_) -> ok end,Is) end,Fs), halt().',
    '-extra', asmBeam]);
  for (const {name, op = name, expectedOp = op} of functions) {
    assert.ok(disassembled.split('\n').includes(`${name} ${expectedOp}`),
      `fixture must contain ${name}: ${expectedOp}`);
  }
  const predicateForms = run('erl', ['-noshell', '-eval',
    '[File]=init:get_plain_arguments(), {beam_file,_,_,_,_,Fs}=beam_disasm:file(File), ' +
    'lists:foreach(fun({function,N,_,_,Is}) -> lists:foreach(fun ' +
    '({bif,Op,{f,0},[_],{x,_}}) -> io:format("~s ~s~n",[N,Op]); (_) -> ok end,Is) end,Fs), halt().',
    '-extra', join(dir, 'bif_predicates.beam')]);
  for (const name of ['integer', 'number', 'atom', 'boolean', 'float', 'binary', 'bitstring']) {
    assert.ok(predicateForms.split('\n').includes(`${name} is_${name}`), `fixture must contain ${name} BIF`);
  }
  run('erl', ['-noshell', '-eval',
    '[Guards,Raw]=init:get_plain_arguments(), {beam_file,_,_,_,_,GF}=beam_disasm:file(Guards), ' +
    'lists:foreach(fun({Name,Op}) -> {function,Name,1,_,Is}=lists:keyfind(Name,2,GF), ' +
    'true=lists:any(fun({test,Test,{f,Fail},[{x,0}]}) when Test=:=Op, Fail=/=0 -> true; ' +
    '(_) -> false end,Is) end,[{binary,is_binary},{bitstring,is_bitstr}]), ' +
    '{beam_file,_,_,_,_,RF}=beam_disasm:file(Raw), ' +
    '{function,binary_register,2,_,Binary}=lists:keyfind(binary_register,2,RF), ' +
    'true=lists:member({bif,is_binary,{f,0},[{tr,{x,1},any}],{x,1}},Binary), ' +
    '{function,bits_register,2,_,Bits}=lists:keyfind(bits_register,2,RF), ' +
    'true=lists:member({bif,is_bitstring,{f,0},[{x,1}],{x,1}},Bits), ' +
    '{function,binary_literal,0,_,BL}=lists:keyfind(binary_literal,2,RF), ' +
    'true=lists:member({bif,is_binary,{f,0},[{literal,<<5:3>>}],{x,0}},BL), ' +
    '{function,bits_literal,0,_,SL}=lists:keyfind(bits_literal,2,RF), ' +
    'true=lists:member({bif,is_bitstring,{f,0},[{literal,<<>>}],{x,0}},SL), halt().',
    '-extra', join(dir, 'guards.beam'), join(dir, 'raw_predicate_bifs.beam')]);
  run('erl', ['-noshell', '-eval',
    '[File]=init:get_plain_arguments(), {beam_file,_,_,_,_,Fs}=beam_disasm:file(File), ' +
    '{function,swap,1,_,Is}=lists:keyfind(swap,2,Fs), ' +
    'true=lists:member({get_list,{x,0},{x,1},{x,0}},Is), ' +
    'true=lists:member({put_list,{x,0},{x,1},{x,0}},Is), halt().',
    '-extra', join(dir, 'list_slice.beam')]);
  run('erl', ['-noshell', '-eval',
    '[File]=init:get_plain_arguments(), {beam_file,_,_,_,_,Fs}=beam_disasm:file(File), ' +
    '{function,pair,2,_,Pair}=lists:keyfind(pair,2,Fs), ' +
    'true=lists:member({put_tuple2,{x,0},{list,[{x,0},{x,1}]}},Pair), ' +
    '{function,first,1,_,First}=lists:keyfind(first,2,Fs), ' +
    'true=lists:member({get_tuple_element,{x,0},0,{x,0}},First), ' +
    'true=lists:any(fun({test,test_arity,_,[{x,0},2]}) -> true; (_) -> false end,First), ' +
    '{function,empty,0,_,Empty}=lists:keyfind(empty,2,Fs), ' +
    'true=lists:member({move,{literal,{}},{x,0}},Empty), halt().',
    '-extra', join(dir, 'tuple_slice.beam')]);
  run('erl', ['-noshell', '-eval',
    '[File]=init:get_plain_arguments(), {beam_file,_,_,_,_,Fs}=beam_disasm:file(File), ' +
    '{function,bits,0,_,Bits}=lists:keyfind(bits,2,Fs), ' +
    'true=lists:member({move,{literal,{bits,<<16#ab,5:3>>}},{x,0}},Bits), ' +
    '{function,bits_match,1,_,Match}=lists:keyfind(bits_match,2,Fs), ' +
    'true=lists:any(fun({test,is_eq_exact,_,[{x,0},{literal,{bits,<<16#ab,5:3>>}}]}) -> true; ' +
    '(_) -> false end,Match), halt().',
    '-extra', join(dir, 'literal_terms.beam')]);
  run('erl', ['-noshell', '-eval',
    '[Tuple,Select]=init:get_plain_arguments(), {beam_file,_,_,_,_,TF}=beam_disasm:file(Tuple), ' +
    '{function,tagged,1,_,TIs}=lists:keyfind(tagged,2,TF), ' +
    'true=lists:any(fun({test,is_tagged_tuple,_,[{x,0},2,{atom,tag}]}) -> true; (_) -> false end,TIs), ' +
    '{beam_file,_,_,_,_,SF}=beam_disasm:file(Select), ' +
    '{function,choose,1,_,SIs}=lists:keyfind(choose,2,SF), ' +
    'true=lists:any(fun({select_val,{x,0},_,_}) -> true; (_) -> false end,SIs), halt().',
    '-extra', join(dir, 'tuple_slice.beam'), join(dir, 'select_slice.beam')]);
  run('erl', ['-noshell', '-eval',
    '[Select,Raw]=init:get_plain_arguments(), {beam_file,_,_,_,_,SF}=beam_disasm:file(Select), ' +
    '{function,choose,1,_,SIs}=lists:keyfind(choose,2,SF), ' +
    'true=lists:any(fun({select_tuple_arity,{tr,{x,0},_},_,_}) -> true; (_) -> false end,SIs), ' +
    '{beam_file,_,_,_,_,RF}=beam_disasm:file(Raw), ' +
    '{function,check,1,_,Check}=lists:keyfind(check,2,RF), ' +
    'true=lists:any(fun({test,is_integer,_,[{tr,{x,0},any}]}) -> true; (_) -> false end,Check), ' +
    '{function,compare,2,_,Compare}=lists:keyfind(compare,2,RF), ' +
    'true=lists:any(fun({test,is_eq_exact,_,[{tr,{x,0},any},{tr,{x,1},any}]}) -> true; ' +
    '(_) -> false end,Compare), ' +
    'lists:foreach(fun({Name,Op}) -> {function,Name,1,_,Is}=lists:keyfind(Name,2,RF), ' +
    'true=lists:any(fun({test,Test,_,[{tr,{x,0},any}]}) when Test=:=Op -> true; ' +
    '(_) -> false end,Is) end,[{binary,is_binary},{bits,is_bitstr}]), ' +
    '{function,stack_check,1,_,YCheck}=lists:keyfind(stack_check,2,RF), ' +
    'true=lists:any(fun({test,is_integer,_,[{tr,{y,0},any}]}) -> true;(_)->false end,YCheck), ' +
    '{function,stack_add,2,_,YAdd}=lists:keyfind(stack_add,2,RF), ' +
    'true=lists:any(fun({gc_bif,\'+\',{f,0},_,[{tr,{y,0},any},_],{y,0}})->true;(_)->false end,YAdd), ' +
    '{function,stack_equal,2,_,YEqual}=lists:keyfind(stack_equal,2,RF), ' +
    'true=lists:any(fun({bif,\'=:=\',{f,0},[{tr,{y,0},any},_],{y,0}})->true;(_)->false end,YEqual), halt().',
    '-extra', join(dir, 'typed_select_slice.beam'), join(dir, 'raw_typed.beam')]);
  run('erl', ['-noshell', '-eval',
    '[Compiler,Raw]=init:get_plain_arguments(), ' +
    'lists:foreach(fun({Path,Expected}) -> {beam_file,_,_,_,_,Fs}=beam_disasm:file(Path), ' +
    'lists:foreach(fun({Name,Op}) -> {function,Name,_,_,Is}=lists:keyfind(Name,2,Fs), ' +
    'true=lists:any(fun({bif,Bif,{f,Fail},_,_}) when Bif=:=Op, Fail=/=0 -> true; ' +
    '(_) -> false end,Is) end,Expected) end, ' +
    '[{Compiler,[{head,hd},{tail,tl},{element,element}]},' +
    '{Raw,[{head,hd},{tail,tl},{size,tuple_size},{element,element}]}]), ' +
    'lists:foreach(fun(Path) -> {beam_file,_,_,_,_,Fs}=beam_disasm:file(Path), ' +
    '{function,part,3,_,Is}=lists:keyfind(part,2,Fs), ' +
    'true=lists:any(fun({gc_bif,binary_part,{f,Fail},3,_,{x,0}}) when Fail=/=0 -> true; ' +
    '(_) -> false end,Is), ' +
    '{function,part2,2,_,Is2}=lists:keyfind(part2,2,Fs), ' +
    'true=lists:any(fun({gc_bif,binary_part,{f,Fail},2,_,{x,0}}) when Fail=/=0 -> true; ' +
    '(_) -> false end,Is2) end,[Compiler,Raw]), ' +
    '{beam_file,_,_,_,_,RF}=beam_disasm:file(Raw), {function,part,3,_,Part}=lists:keyfind(part,2,RF), ' +
    'true=lists:any(fun({gc_bif,binary_part,_,3,' +
    '[{tr,{x,0},any},{tr,{x,1},any},{tr,{x,2},any}],{x,0}}) -> true; (_) -> false end,Part), ' +
    '{function,part2,2,_,Part2}=lists:keyfind(part2,2,RF), ' +
    'true=lists:any(fun({gc_bif,binary_part,_,2,' +
    '[{tr,{x,0},any},{tr,{x,1},any}],{x,0}}) -> true; (_) -> false end,Part2), ' +
    '{function,part_literal,0,_,Lit}=lists:keyfind(part_literal,2,RF), ' +
    'true=lists:any(fun({gc_bif,binary_part,{f,F},0,[{literal,<<0,1,2>>},{integer,3},{integer,-2}],{x,0}}) ' +
    'when F=/=0 -> true; (_) -> false end,Lit), ' +
    '{function,part2_literal,0,_,Lit2}=lists:keyfind(part2_literal,2,RF), ' +
    'true=lists:any(fun({gc_bif,binary_part,{f,F},0,[{literal,<<0,1,2>>},{literal,{3,-2}}],{x,0}}) ' +
    'when F=/=0 -> true; (_) -> false end,Lit2), halt().',
    '-extra', join(dir, 'guard_bifs.beam'), join(dir, 'raw_guard_bifs.beam')]);
  run('erl', ['-noshell', '-eval',
    '[Compiler,Raw]=init:get_plain_arguments(), ' +
    'lists:foreach(fun(Path) -> {beam_file,_,_,_,_,Fs}=beam_disasm:file(Path), ' +
    'lists:foreach(fun({Name,Op}) -> {function,Name,_,_,Is}=lists:keyfind(Name,2,Fs), ' +
    'true=lists:any(fun({gc_bif,Bif,{f,Fail},_,_,_}) when Bif=:=Op, Fail=/=0 -> true; ' +
    '(_) -> false end,Is) end,[{both,\'band\'},{either,\'bor\'},' +
    '{different,\'bxor\'},{invert,\'bnot\'}]) end,[Compiler,Raw]), ' +
    '{beam_file,_,_,_,_,RawFs}=beam_disasm:file(Raw), ' +
    '{function,either,2,_,EitherIs}=lists:keyfind(either,2,RawFs), ' +
    'true=lists:any(fun({gc_bif,\'bor\',_,_,[{tr,{x,0},any},{tr,{x,1},any}],_}) -> true; ' +
    '(_) -> false end,EitherIs), ' +
    '{function,literal_big,1,_,BigIs}=lists:keyfind(literal_big,2,RawFs), ' +
    'true=lists:any(fun({gc_bif,\'band\',_,_,[_,{literal,N}],_}) when is_integer(N) -> true; ' +
    '(_) -> false end,BigIs), halt().',
    '-extra', join(dir, 'bitwise_guards.beam'), join(dir, 'raw_bitwise_guards.beam')]);
  run('erl', ['-noshell', '-eval',
    '[Compiler,Raw]=init:get_plain_arguments(), ' +
    'lists:foreach(fun(Path) -> {beam_file,_,_,_,_,Fs}=beam_disasm:file(Path), ' +
    'lists:foreach(fun({Name,Op}) -> {function,Name,_,_,Is}=lists:keyfind(Name,2,Fs), ' +
    'true=lists:any(fun({gc_bif,Bif,{f,Fail},_,_,_}) when Bif=:=Op, Fail=/=0 -> true; ' +
    '(_) -> false end,Is) end,[{quotient,\'div\'},{remainder,\'rem\'}]) end,[Compiler,Raw]), ' +
    '{beam_file,_,_,_,_,Fs}=beam_disasm:file(Raw), ' +
    '{function,remainder,2,_,Is}=lists:keyfind(remainder,2,Fs), ' +
    'true=lists:any(fun({gc_bif,\'rem\',_,_,[{tr,{x,0},any},{tr,{x,1},any}],{x,1}}) -> true; ' +
    '(_) -> false end,Is), ' +
    '{function,literal_big,1,_,BigIs}=lists:keyfind(literal_big,2,Fs), ' +
    'true=lists:any(fun({gc_bif,\'div\',_,_,[{literal,N},_],_}) when is_integer(N) -> true; ' +
    '(_) -> false end,BigIs), halt().',
    '-extra', join(dir, 'integer_guards.beam'), join(dir, 'raw_integer_guards.beam')]);
  run('erl', ['-noshell', '-eval',
    '[Compiler,Raw]=init:get_plain_arguments(), ' +
    'lists:foreach(fun({Path,Name}) -> {beam_file,_,_,_,_,Fs}=beam_disasm:file(Path), ' +
    '{function,Name,_,_,Is}=lists:keyfind(Name,2,Fs), ' +
    'true=lists:any(fun({gc_bif,length,{f,Fail},_,_,_}) when Fail=/=0 -> true; ' +
    '(_) -> false end,Is) end,[{Compiler,two},{Raw,size}]), ' +
    '{beam_file,_,_,_,_,RF}=beam_disasm:file(Raw), ' +
    '{function,size,1,_,Size}=lists:keyfind(size,2,RF), ' +
    'true=lists:any(fun({gc_bif,length,_,_,[{tr,{x,0},any}],{x,0}}) -> true; ' +
    '(_) -> false end,Size), ' +
    '{beam_file,_,_,_,_,CF}=beam_disasm:file(Compiler), ' +
    'lists:foreach(fun({Name,Op}) -> ' +
    'lists:foreach(fun(Fs) -> {function,Name,1,_,Is}=lists:keyfind(Name,2,Fs), ' +
    'true=lists:any(fun({gc_bif,Bif,{f,Fail},_,_,_}) when Bif=:=Op, Fail=/=0 -> true; ' +
    '(_) -> false end,Is) end,[CF,RF]), ' +
    '{function,Name,1,_,RawIs}=lists:keyfind(Name,2,RF), ' +
    'true=lists:any(fun({gc_bif,Bif,_,_,[{tr,{x,0},any}],{x,0}}) when Bif=:=Op -> true; ' +
    '(_) -> false end,RawIs) end,[{bits,bit_size},{bytes,byte_size}]), ' +
    '{function,literal_bits,0,_,LB}=lists:keyfind(literal_bits,2,RF), ' +
    'true=lists:any(fun({gc_bif,bit_size,{f,F},0,[{literal,<<5:3>>}],{x,0}}) when F=/=0 -> true; ' +
    '(_) -> false end,LB), ' +
    '{function,literal_bytes,0,_,LY}=lists:keyfind(literal_bytes,2,RF), ' +
    'true=lists:any(fun({gc_bif,byte_size,{f,F},0,[{literal,<<5:9>>}],{x,0}}) when F=/=0 -> true; ' +
    '(_) -> false end,LY), halt().',
    '-extra', join(dir, 'length_guards.beam'), join(dir, 'raw_length_guards.beam')]);
  run('erl', ['-noshell', '-eval',
    '[Compiler,Raw]=init:get_plain_arguments(), ' +
    'lists:foreach(fun(Path) -> {beam_file,_,_,_,_,Fs}=beam_disasm:file(Path), ' +
    'lists:foreach(fun({Name,Op,Arity}) -> {function,Name,Arity,_,Is}=lists:keyfind(Name,2,Fs), ' +
    'true=lists:any(fun({gc_bif,Bif,{f,Fail},_,Args,_}) when Bif=:=Op, Fail=/=0, ' +
    'length(Args)=:=Arity -> true; (_) -> false end,Is) end,' +
    '[{add,\'+\',2},{subtract,\'-\',2},{multiply,\'*\',2},{negate,\'-\',1},' +
    '{divide,\'/\',2},{absolute,abs,1},{truncate,trunc,1},{round_value,round,1},' +
    '{floor_value,floor,1},{ceil_value,ceil,1},{convert_float,float,1}]) end,' +
    '[Compiler,Raw]), {beam_file,_,_,_,_,Fs}=beam_disasm:file(Raw), ' +
    '{function,divide,2,_,Is}=lists:keyfind(divide,2,Fs), ' +
    'true=lists:any(fun({gc_bif,\'/\',_,_,[{tr,{x,0},any},{tr,{x,1},any}],{x,1}}) -> true; ' +
    '(_) -> false end,Is), ' +
    '{function,absolute,1,_,AbsIs}=lists:keyfind(absolute,2,Fs), ' +
    'true=lists:any(fun({gc_bif,abs,_,_,[{tr,{x,0},any}],{x,0}}) -> true; ' +
    '(_) -> false end,AbsIs), ' +
    'lists:foreach(fun({Name,Op}) -> {function,Name,1,_,RoundIs}=lists:keyfind(Name,2,Fs), ' +
    'true=lists:any(fun({gc_bif,Bif,_,_,[{tr,{x,0},any}],{x,0}}) when Bif=:=Op -> true; ' +
    '(_) -> false end,RoundIs) end,' +
    '[{truncate,trunc},{round_value,round},{floor_value,floor},{ceil_value,ceil},' +
    '{convert_float,float}]), halt().',
    '-extra', join(dir, 'arithmetic_guards.beam'), join(dir, 'raw_arithmetic_guards.beam')]);

  for (const module of ['opcode_tests', 'guards', 'bif_predicates', 'raw_predicate_bifs', 'float_literals', 'list_slice', 'tuple_slice',
    'literal_terms', 'unsupported_literal', 'long_literal', 'slice_helper', 'raw_control_flow',
    'raw_select', 'raw_select_zero', 'select_slice', 'typed_select_slice', 'raw_typed',
    'guard_bifs', 'raw_guard_bifs', 'bitwise_guards', 'raw_bitwise_guards',
    'integer_guards', 'raw_integer_guards', 'length_guards', 'raw_length_guards',
    'arithmetic_guards', 'raw_arithmetic_guards']) {
    run(compiler, [join(dir, `${module}.beam`), join(dir, `${module}.mjs`)]);
  }
  const oracleCalls = cases.map(({module, name, args}) =>
    `apply(${module},${name},[${args.map(erlangTerm).join(',')}])`).join(',');
  const oracleCallsPath = join(dir, 'oracle-calls.erl');
  writeFileSync(oracleCallsPath, `[${oracleCalls}].`);
  const evaluateCalls = ' {ok,CallBytes}=file:read_file(Calls), ' +
    '{ok,Tokens,_}=erl_scan:string(binary_to_list(CallBytes)), ' +
    '{ok,Expressions}=erl_parse:parse_exprs(Tokens), ' +
    '{value,Results,_}=erl_eval:exprs(Expressions,erl_eval:new_bindings()), ';
  const printResult = 'Format=fun F([]) -> "[]"; F([H|T]) -> ["[",F(H),"|",F(T),"]"]; ' +
    'F(T) when is_tuple(T) -> ["{",lists:join(",",[F(E) || E <- tuple_to_list(T)]),"}"]; ' +
    'F(B) when is_bitstring(B) -> Size=bit_size(B), Padding=(8-Size rem 8) rem 8, ' +
    'io_lib:format("bits:~B:~w",[Size,binary_to_list(<<B/bitstring,0:Padding>>)]); ' +
    'F(N) when is_float(N) -> <<Bits:64/unsigned-integer>> = <<N:64/float>>, ' +
    'io_lib:format("float:~B",[Bits]); F(Term) -> io_lib:format("~tp",[Term]) end, ' +
    'io:format("~ts~n",[Format(X)])';
  const oracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    `[Calls]=init:get_plain_arguments(), ${evaluateCalls}` +
    `lists:foreach(fun(X)->${printResult} end,Results), halt().`,
    '-extra', oracleCallsPath]).trimEnd().split('\n');

  const runtime = new Runtime();
  for (const module of ['opcode_tests', 'guards', 'bif_predicates', 'raw_predicate_bifs', 'float_literals', 'list_slice', 'tuple_slice',
    'literal_terms', 'unsupported_literal', 'long_literal', 'slice_helper', 'raw_control_flow',
    'raw_select', 'raw_select_zero', 'select_slice', 'typed_select_slice', 'raw_typed',
    'guard_bifs', 'raw_guard_bifs', 'bitwise_guards', 'raw_bitwise_guards',
    'integer_guards', 'raw_integer_guards', 'length_guards', 'raw_length_guards',
    'arithmetic_guards', 'raw_arithmetic_guards']) {
    (await import(pathToFileURL(join(dir, `${module}.mjs`)))).register(runtime);
  }
  const actual = cases.map(({module, name, args}) =>
    result(runtime.invoke(module, name, args.map(value => term(value, runtime))), runtime));
  assert.deepEqual(actual, oracle, 'Node results must match OTP');
  const sourceBytes = runtime.bitstring([0, 1, 2], 24);
  const sliceBytes = runtime.guardBinaryPart(sourceBytes, 2n, -1n);
  const exposedSlice = runtime.bitstringBytes(sliceBytes);
  assert.deepEqual(Array.from(exposedSlice), [1]);
  exposedSlice[0] = 9;
  assert.deepEqual(Array.from(runtime.bitstringBytes(sliceBytes)), [1]);
  assert.deepEqual(Array.from(runtime.bitstringBytes(sourceBytes)), [0, 1, 2]);
  assert.throws(() => runtime.guardBinaryPart(sourceBytes, {}, 1n), /unsupported Erlang term/);
  assert.throws(() => runtime.guardBinaryPart(runtime.atom('bad'), 0n, {}), /unsupported Erlang term/);
  assert.throws(() => runtime.guardArithmetic('no', 1n, 2n), /invalid guard arithmetic operation/);
  assert.throws(() => runtime.guardArithmetic('+', 1n, {}), /unsupported Erlang term/);
  assert.throws(() => runtime.guardArithmetic('abs', 1n, 2n), /invalid guard arithmetic operation/);
  assert.throws(() => runtime.guardArithmetic('abs', {}), /unsupported Erlang term/);
  assert.throws(() => runtime.guardArithmetic('round', 1n, 2n), /invalid guard arithmetic operation/);
  assert.throws(() => runtime.guardArithmetic('float', 1n, 2n), /invalid guard arithmetic operation/);
  assert.throws(() => runtime.guardArithmetic('float', {}), /unsupported Erlang term/);
  assert.ok(Object.is(runtime.floatValue(runtime.float(-0)), -0));
  assert.equal(runtime.equalExact(runtime.float(1.5), runtime.float(1.5)), true);
  assert.equal(runtime.equalExact(runtime.float(0), runtime.float(-0)), false);
  assert.equal(runtime.equalNumeric(runtime.float(0), runtime.float(-0)), true);
  const taggedTerms = [runtime.nil(), runtime.float(1), runtime.cons(1n, runtime.nil()),
    runtime.tuple([1n]), runtime.bitstring([128], 1), runtime.hostHandle({}), runtime.makeRef()];
  assert.ok(taggedTerms.every(value => Array.isArray(value) && value.length === 2 &&
    Number.isInteger(value[0])));
  assert.equal(new Set(taggedTerms.map(value => value[0])).size, taggedTerms.length);
  assert.ok(Object.isFrozen(runtime.float(1)));
  for (const value of [NaN, Infinity, -Infinity, 1n, '1', {}, null]) {
    assert.throws(() => runtime.float(value), /finite number/);
  }
  assert.throws(() => runtime.floatValue({}), /expected Erlang float/);
  assert.throws(() => runtime.equalExact({}, {}), /unsupported Erlang term/);
  assert.throws(() => runtime.invoke('raw_control_flow', 'id', [1.5]), /supported Erlang terms/);
  assert.throws(() => runtime.cons({}, runtime.nil()), /requires Erlang terms/);
  assert.throws(() => runtime.cons(1n, []), /requires Erlang terms/);
  assert.throws(() => runtime.listHead(runtime.nil()), /expected nonempty Erlang list/);
  assert.throws(() => runtime.listTail(1n), /expected nonempty Erlang list/);
  assert.ok(Object.isFrozen(runtime.nil()));
  assert.ok(Object.isFrozen(runtime.cons(1n, runtime.nil())));
  const tupleInput = [1n, runtime.nil()];
  const tupleValue = runtime.tuple(tupleInput);
  tupleInput[0] = 2n;
  tupleInput.push(3n);
  assert.equal(runtime.tupleElement(tupleValue, 1), 1n);
  assert.equal(runtime.tupleSize(tupleValue), 2);
  assert.ok(Object.isFrozen(tupleValue));
  for (const value of [null, {}, 1n, [1], [1n, undefined], new Array(1)]) {
    assert.throws(() => runtime.tuple(value), /array of Erlang terms/);
  }
  assert.throws(() => runtime.tupleSize(runtime.nil()), /expected Erlang tuple/);
  assert.throws(() => runtime.tupleElement(tupleValue, 0), /invalid tuple index/);
  assert.throws(() => runtime.tupleElement(tupleValue, 3), /invalid tuple index/);
  assert.throws(() => runtime.tupleElement(tupleValue, 1.5), /invalid tuple index/);
  assert.throws(() => runtime.tupleElement(runtime.nil(), 1), /expected Erlang tuple/);
  const bitInput = new Uint8Array([0xaf]);
  const bitValue = runtime.bitstring(bitInput, 3);
  bitInput[0] = 0;
  const bitOutput = runtime.bitstringBytes(bitValue);
  assert.deepEqual(Array.from(bitOutput), [0xa0]);
  bitOutput[0] = 0;
  assert.deepEqual(Array.from(runtime.bitstringBytes(bitValue)), [0xa0]);
  assert.equal(runtime.bitstringSize(bitValue), 3);
  assert.ok(Object.isFrozen(bitValue));
  assert.equal(runtime.equalExact(bitValue, runtime.bitstring([0xbf], 3)), true);
  for (const bytes of [null, {}, [256], [-1], [1.5], new Array(1)]) {
    assert.throws(() => runtime.bitstring(bytes, 8), TypeError);
  }
  for (const length of [-1, 0, 9, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => runtime.bitstring([1], length), RangeError);
  }
  assert.throws(() => runtime.bitstringBytes(runtime.nil()), /expected Erlang bitstring/);
  assert.throws(() => runtime.bitstringSize(runtime.nil()), /expected Erlang bitstring/);
  let deepA = runtime.nil();
  let deepB = runtime.nil();
  let deepDifferent = 1n;
  for (let i = 0; i < 20000; i++) {
    deepA = runtime.cons(deepA, runtime.nil());
    deepB = runtime.cons(deepB, runtime.nil());
    deepDifferent = runtime.cons(deepDifferent, runtime.nil());
  }
  assert.equal(runtime.equalExact(deepA, deepB), true);
  assert.equal(runtime.compare(deepA, deepB), 0);
  assert.equal(runtime.equalExact(deepA, deepDifferent), false);
  assert.equal(runtime.compare(deepA, deepDifferent), 1);
  let tupleA = runtime.tuple([]);
  let tupleB = runtime.tuple([]);
  let tupleDifferent = 1n;
  for (let i = 0; i < 20000; i++) {
    tupleA = runtime.tuple([tupleA]);
    tupleB = runtime.tuple([tupleB]);
    tupleDifferent = runtime.tuple([tupleDifferent]);
  }
  assert.equal(runtime.equalExact(tupleA, tupleB), true);
  assert.equal(runtime.compare(tupleA, tupleB), 0);
  assert.equal(runtime.equalExact(tupleA, tupleDifferent), false);
  assert.equal(runtime.compare(tupleA, tupleDifferent), 1);
  let longValue = runtime.invoke('long_literal', 'value', []);
  assert.equal(runtime.invoke('raw_length_guards', 'size', [longValue]), 10000n);
  assert.equal(runtime.invoke('length_guards', 'two', [longValue]), runtime.atom('no'));
  let longImproper = runtime.atom('tail');
  for (let i = 0; i < 10000; i++) longImproper = runtime.cons(1n, longImproper);
  assert.equal(runtime.invoke('raw_length_guards', 'size', [longImproper]), runtime.atom('failed'));
  assert.equal(runtime.invoke('length_guards', 'two', [longImproper]), runtime.atom('no'));
  for (let i = 1; i <= 10000; i++) {
    assert.equal(runtime.listHead(longValue), BigInt(i));
    longValue = runtime.listTail(longValue);
  }
  assert.equal(longValue, runtime.nil());
  assert.throws(() => runtime.compare(1, 1n), /unsupported Erlang term/);
  assert.throws(() => runtime.isType('is_atom', Symbol('not-interned')), /unsupported Erlang term/);
  assert.throws(() => runtime.isType('not_a_test', 1n), /unsupported type test/);

  const stripped = join(dir, 'stripped.beam');
  const strippedFlow = join(dir, 'stripped-flow.beam');
  const strippedPredicates = join(dir, 'stripped-predicates.beam');
  const strippedRawPredicates = join(dir, 'stripped-raw-predicates.beam');
  const strippedFloatLiterals = join(dir, 'stripped-float-literals.beam');
  const strippedList = join(dir, 'stripped-list.beam');
  const strippedTuple = join(dir, 'stripped-tuple.beam');
  const strippedLiterals = join(dir, 'stripped-literals.beam');
  const strippedSelect = join(dir, 'stripped-select.beam');
  const strippedZeroSelect = join(dir, 'stripped-zero-select.beam');
  const strippedSelectSlice = join(dir, 'stripped-select-slice.beam');
  run('erl', ['-noshell', '-eval',
    '[Input,Output,Flow,FlowOutput,Predicates,PredicatesOutput,RawPredicates,RawPredicatesOutput,' +
    'FloatLiterals,FloatLiteralsOutput,List,ListOutput,Tuple,TupleOutput,Literals,LiteralsOutput,' +
    'Select,SelectOutput,ZeroSelect,ZeroSelectOutput,SelectSlice,SelectSliceOutput]=' +
    'init:get_plain_arguments(), ' +
    'lists:foreach(fun({In,Out}) -> {ok,B}=file:read_file(In), ' +
    '{ok,{_,S}}=beam_lib:strip(B), ok=file:write_file(Out,S) end, ' +
    '[{Input,Output},{Flow,FlowOutput},{Predicates,PredicatesOutput},' +
    '{RawPredicates,RawPredicatesOutput},{FloatLiterals,FloatLiteralsOutput},' +
    '{List,ListOutput},{Tuple,TupleOutput},{Literals,LiteralsOutput},' +
    '{Select,SelectOutput},{ZeroSelect,ZeroSelectOutput},{SelectSlice,SelectSliceOutput}]), halt().',
    '-extra', asmBeam, stripped, join(dir, 'raw_control_flow.beam'), strippedFlow,
    join(dir, 'bif_predicates.beam'), strippedPredicates,
    join(dir, 'raw_predicate_bifs.beam'), strippedRawPredicates,
    join(dir, 'float_literals.beam'), strippedFloatLiterals,
    join(dir, 'list_slice.beam'), strippedList,
    join(dir, 'tuple_slice.beam'), strippedTuple,
    join(dir, 'literal_terms.beam'), strippedLiterals,
    join(dir, 'raw_select.beam'), strippedSelect,
    join(dir, 'raw_select_zero.beam'), strippedZeroSelect,
    join(dir, 'select_slice.beam'), strippedSelectSlice]);
  const strippedOutput = join(dir, 'stripped.mjs');
  const strippedFlowOutput = join(dir, 'stripped-flow.mjs');
  const strippedPredicatesOutput = join(dir, 'stripped-predicates.mjs');
  const strippedRawPredicatesOutput = join(dir, 'stripped-raw-predicates.mjs');
  const strippedFloatLiteralsOutput = join(dir, 'stripped-float-literals.mjs');
  const strippedListOutput = join(dir, 'stripped-list.mjs');
  const strippedTupleOutput = join(dir, 'stripped-tuple.mjs');
  const strippedLiteralsOutput = join(dir, 'stripped-literals.mjs');
  const strippedLongOutput = join(dir, 'stripped-long.mjs');
  const strippedSelectOutput = join(dir, 'stripped-select.mjs');
  const strippedZeroSelectOutput = join(dir, 'stripped-zero-select.mjs');
  const strippedSelectSliceOutput = join(dir, 'stripped-select-slice.mjs');
  const strippedTypedSelectOutput = join(dir, 'stripped-typed-select.mjs');
  const strippedTypedOutput = join(dir, 'stripped-typed.mjs');
  const strippedGuardBifsOutput = join(dir, 'stripped-guard-bifs.mjs');
  const strippedRawGuardBifsOutput = join(dir, 'stripped-raw-guard-bifs.mjs');
  const strippedBitwiseOutput = join(dir, 'stripped-bitwise.mjs');
  const strippedRawBitwiseOutput = join(dir, 'stripped-raw-bitwise.mjs');
  const strippedIntegerOutput = join(dir, 'stripped-integer.mjs');
  const strippedRawIntegerOutput = join(dir, 'stripped-raw-integer.mjs');
  const strippedLengthOutput = join(dir, 'stripped-length.mjs');
  const strippedRawLengthOutput = join(dir, 'stripped-raw-length.mjs');
  const strippedArithmeticOutput = join(dir, 'stripped-arithmetic.mjs');
  const strippedRawArithmeticOutput = join(dir, 'stripped-raw-arithmetic.mjs');
  run(compiler, [stripped, strippedOutput]);
  run(compiler, [join(dir, 'guards-stripped.beam'), join(dir, 'guards-stripped.mjs')]);
  run(compiler, [strippedFlow, strippedFlowOutput]);
  run(compiler, [strippedPredicates, strippedPredicatesOutput]);
  run(compiler, [strippedRawPredicates, strippedRawPredicatesOutput]);
  run(compiler, [strippedFloatLiterals, strippedFloatLiteralsOutput]);
  run(compiler, [strippedList, strippedListOutput]);
  run(compiler, [strippedTuple, strippedTupleOutput]);
  run(compiler, [strippedLiterals, strippedLiteralsOutput]);
  run(compiler, [join(dir, 'unsupported_literal-stripped.beam'), join(dir, 'unsupported_literal-stripped.mjs')]);
  run(compiler, [join(dir, 'long_literal-stripped.beam'), strippedLongOutput]);
  run(compiler, [strippedSelect, strippedSelectOutput]);
  run(compiler, [strippedZeroSelect, strippedZeroSelectOutput]);
  run(compiler, [strippedSelectSlice, strippedSelectSliceOutput]);
  run(compiler, [join(dir, 'typed_select_slice-stripped.beam'), strippedTypedSelectOutput]);
  run(compiler, [join(dir, 'raw_typed-stripped.beam'), strippedTypedOutput]);
  run(compiler, [join(dir, 'guard_bifs-stripped.beam'), strippedGuardBifsOutput]);
  run(compiler, [join(dir, 'raw_guard_bifs-stripped.beam'), strippedRawGuardBifsOutput]);
  run(compiler, [join(dir, 'bitwise_guards-stripped.beam'), strippedBitwiseOutput]);
  run(compiler, [join(dir, 'raw_bitwise_guards-stripped.beam'), strippedRawBitwiseOutput]);
  run(compiler, [join(dir, 'integer_guards-stripped.beam'), strippedIntegerOutput]);
  run(compiler, [join(dir, 'raw_integer_guards-stripped.beam'), strippedRawIntegerOutput]);
  run(compiler, [join(dir, 'length_guards-stripped.beam'), strippedLengthOutput]);
  run(compiler, [join(dir, 'raw_length_guards-stripped.beam'), strippedRawLengthOutput]);
  run(compiler, [join(dir, 'arithmetic_guards-stripped.beam'), strippedArithmeticOutput]);
  run(compiler, [join(dir, 'raw_arithmetic_guards-stripped.beam'), strippedRawArithmeticOutput]);
  const strippedRuntime = new Runtime();
  (await import(pathToFileURL(strippedOutput))).register(strippedRuntime);
  (await import(pathToFileURL(join(dir, 'guards-stripped.mjs')))).register(strippedRuntime);
  (await import(pathToFileURL(join(dir, 'slice_helper.mjs')))).register(strippedRuntime);
  (await import(pathToFileURL(strippedFlowOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedPredicatesOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedRawPredicatesOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedFloatLiteralsOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedListOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedTupleOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedLiteralsOutput))).register(strippedRuntime);
  (await import(pathToFileURL(join(dir, 'unsupported_literal-stripped.mjs')))).register(strippedRuntime);
  (await import(pathToFileURL(strippedLongOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedSelectOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedZeroSelectOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedSelectSliceOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedTypedSelectOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedTypedOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedGuardBifsOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedRawGuardBifsOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedBitwiseOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedRawBitwiseOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedIntegerOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedRawIntegerOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedLengthOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedRawLengthOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedArithmeticOutput))).register(strippedRuntime);
  (await import(pathToFileURL(strippedRawArithmeticOutput))).register(strippedRuntime);
  const strippedModules = new Set(['opcode_tests', 'guards', 'raw_control_flow', 'bif_predicates',
    'raw_predicate_bifs', 'float_literals', 'list_slice', 'tuple_slice', 'literal_terms', 'unsupported_literal',
    'raw_select', 'raw_select_zero', 'select_slice', 'typed_select_slice', 'raw_typed',
    'guard_bifs', 'raw_guard_bifs', 'bitwise_guards', 'raw_bitwise_guards',
    'integer_guards', 'raw_integer_guards', 'length_guards', 'raw_length_guards',
    'arithmetic_guards', 'raw_arithmetic_guards']);
  const strippedCases = cases.filter(({module}) => strippedModules.has(module));
  const strippedCalls = strippedCases.map(({module, name, args}) =>
    `apply(${module},${name},[${args.map(erlangTerm).join(',')}])`).join(',');
  const strippedCallsPath = join(dir, 'stripped-oracle-calls.erl');
  writeFileSync(strippedCallsPath, `[${strippedCalls}].`);
  const strippedOracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    `[File,Guards,Flow,Predicates,RawPredicates,FloatLiterals,List,Tuple,Literals,UnsupportedLiteral,Select,ZeroSelect,SelectSlice,TypedSelect,Typed,GuardBifs,RawGuardBifs,Bitwise,RawBitwise,Integer,RawInteger,Length,RawLength,Arithmetic,RawArithmetic,Calls]=` +
    `init:get_plain_arguments(), ` +
    `lists:foreach(fun({Module,Path}) -> {ok,B}=file:read_file(Path), ` +
    `{module,Module}=code:load_binary(Module,Path,B) end, ` +
    `[{opcode_tests,File},{guards,Guards},{raw_control_flow,Flow},{bif_predicates,Predicates},` +
    `{raw_predicate_bifs,RawPredicates},{float_literals,FloatLiterals},{list_slice,List},` +
    `{tuple_slice,Tuple},{literal_terms,Literals},{unsupported_literal,UnsupportedLiteral},{raw_select,Select},` +
    `{raw_select_zero,ZeroSelect},{select_slice,SelectSlice},` +
    `{typed_select_slice,TypedSelect},{raw_typed,Typed},` +
    `{guard_bifs,GuardBifs},{raw_guard_bifs,RawGuardBifs},` +
    `{bitwise_guards,Bitwise},{raw_bitwise_guards,RawBitwise},` +
    `{integer_guards,Integer},{raw_integer_guards,RawInteger},` +
    `{length_guards,Length},{raw_length_guards,RawLength},` +
    `{arithmetic_guards,Arithmetic},{raw_arithmetic_guards,RawArithmetic}]), ` +
    evaluateCalls +
    `lists:foreach(fun(X)->${printResult} end,Results), halt().`,
    '-extra', stripped, join(dir, 'guards-stripped.beam'), strippedFlow, strippedPredicates, strippedRawPredicates,
    strippedFloatLiterals, strippedList, strippedTuple, strippedLiterals, join(dir, 'unsupported_literal-stripped.beam'),
    strippedSelect, strippedZeroSelect, strippedSelectSlice,
    join(dir, 'typed_select_slice-stripped.beam'), join(dir, 'raw_typed-stripped.beam'),
    join(dir, 'guard_bifs-stripped.beam'), join(dir, 'raw_guard_bifs-stripped.beam'),
    join(dir, 'bitwise_guards-stripped.beam'), join(dir, 'raw_bitwise_guards-stripped.beam'),
    join(dir, 'integer_guards-stripped.beam'), join(dir, 'raw_integer_guards-stripped.beam'),
    join(dir, 'length_guards-stripped.beam'), join(dir, 'raw_length_guards-stripped.beam'),
    join(dir, 'arithmetic_guards-stripped.beam'), join(dir, 'raw_arithmetic_guards-stripped.beam'),
    strippedCallsPath]).trimEnd().split('\n');
  assert.deepEqual(strippedOracle, oracle.filter((_, index) =>
    strippedModules.has(cases[index].module)),
    'stripping must preserve OTP results');
  const strippedResults = strippedCases.map(({module, name, args}) =>
    result(strippedRuntime.invoke(module, name, args.map(value => term(value, strippedRuntime))), strippedRuntime));
  assert.deepEqual(strippedResults, strippedOracle, 'stripped Node results must match OTP');
  let strippedLong = strippedRuntime.invoke('long_literal', 'value', []);
  assert.equal(strippedRuntime.invoke('raw_length_guards', 'size', [strippedLong]), 10000n);
  assert.equal(strippedRuntime.invoke('raw_length_guards', 'size', [longImproper]), strippedRuntime.atom('failed'));
  assert.equal(strippedRuntime.invoke('length_guards', 'two', [strippedLong]), strippedRuntime.atom('no'));
  assert.equal(strippedRuntime.invoke('length_guards', 'two', [longImproper]), strippedRuntime.atom('no'));
  for (let i = 1; i <= 10000; i++) {
    assert.equal(strippedRuntime.listHead(strippedLong), BigInt(i));
    strippedLong = strippedRuntime.listTail(strippedLong);
  }
  assert.equal(strippedLong, strippedRuntime.nil());

  const mapLiteralAsm = join(dir, 'map_literal.S');
  writeFileSync(mapLiteralAsm, '{module,map_literal}.\n{exports,[{f,1}]}.\n{attributes,[]}.\n{labels,4}.\n' +
    '{function,f,1,2}.\n{label,1}.\n{func_info,{atom,map_literal},{atom,f},1}.\n{label,2}.\n' +
    '{test,is_eq,{f,3},[{x,0},{literal,{outer,[1,#{x=>1}]}}]}.\n{move,{atom,yes},{x,0}}.\nreturn.\n' +
    '{label,3}.\n{move,{atom,no},{x,0}}.\nreturn.\n');
  run('erl', ['-noshell', '-eval',
    '[File,Dir]=init:get_plain_arguments(), {ok,map_literal}=' +
    'compile:file(File,[from_asm,no_postopt,{outdir,Dir},report_errors]), halt().',
    '-extra', mapLiteralAsm, dir]);
  const mapLiteralOutput = join(dir, 'map_literal.mjs');
  const compiledMapLiteral = spawnSync(compiler, [join(dir, 'map_literal.beam'), mapLiteralOutput],
    {encoding: 'utf8', timeout: 30000});
  assert.equal(compiledMapLiteral.status, 0, compiledMapLiteral.stderr);
  const generatedMapLiteral = readFileSync(mapLiteralOutput, 'utf8');
  assert.match(generatedMapLiteral, /rt\.map\(/);
  assert.match(generatedMapLiteral, /rt\.atom\("outer"\)/);
  const preserved = join(dir, 'preserved.mjs');
  writeFileSync(preserved, 'existing output');
  run('erl', ['+S', '1:1', '-noshell', '-eval',
    '[Dir]=init:get_plain_arguments(), ' +
    'Build=fun(Module,Select) -> Is=[{label,1},{func_info,{atom,Module},{atom,f},1},' +
    '{label,2},Select,{label,3},{move,{atom,ok},{x,0}},return], ' +
    '{ok,B}=beam_asm:module({Module,[{f,1}],[],#{},[{function,f,1,2,Is}],4},[],[],[]), ' +
    'ok=file:write_file(filename:join(Dir,atom_to_list(Module)++".beam"),B) end, ' +
    'Build(mixed_select,{select_val,{x,0},{f,3},{list,[{atom,a},{f,3},{integer,1},{f,3}]}}), ' +
    'Build(duplicate_select,{select_val,{x,0},{f,3},{list,[{atom,a},{f,3},{atom,a},{f,3}]}}), ' +
    'Build(duplicate_arity,{select_tuple_arity,{x,0},{f,3},{list,[1,{f,3},1,{f,3}]}}), ' +
    'Build(zero_select,{select_val,{x,0},{f,0},{list,[{atom,a},{f,3}]}}), ' +
    'Build(zero_binary_test,{test,is_binary,{f,0},[{x,0}]}), ' +
    'Build(missing_bits_test,{test,is_bitstr,{f,4},[{x,0}]}), ' +
    'Build(missing_binary_part2_label,{gc_bif,binary_part,{f,4},1,[{x,0},{x,0}],{x,0}}), ' +
    'Build(binary_part2_live_limit,{gc_bif,binary_part,{f,3},1025,[{x,0},{x,0}],{x,0}}), ' +
    'Build(missing_binary_part_label,{gc_bif,binary_part,{f,4},1,[{x,0},{x,0},{x,0}],{x,0}}), ' +
    'Build(binary_part_live_limit,{gc_bif,binary_part,{f,3},1025,[{x,0},{x,0},{x,0}],{x,0}}), ' +
    'Build(missing_bit_size_label,{gc_bif,bit_size,{f,4},1,[{x,0}],{x,0}}), ' +
    'Build(missing_byte_size_label,{gc_bif,byte_size,{f,4},1,[{x,0}],{x,0}}), ' +
    'Build(bit_size_live_limit,{gc_bif,bit_size,{f,3},1025,[{x,0}],{x,0}}), ' +
    'Build(byte_size_live_limit,{gc_bif,byte_size,{f,3},1025,[{x,0}],{x,0}}), ' +
    'Build(missing_float_divide_label,{gc_bif,\'/\',{f,4},1,[{x,0},{integer,1}],{x,0}}), ' +
    'Build(float_divide_live_limit,{gc_bif,\'/\',{f,3},1025,[{x,0},{integer,1}],{x,0}}), ' +
    'Build(missing_abs_label,{gc_bif,abs,{f,4},1,[{x,0}],{x,0}}), ' +
    'Build(abs_live_limit,{gc_bif,abs,{f,3},1025,[{x,0}],{x,0}}), ' +
    'Build(missing_round_label,{gc_bif,round,{f,4},1,[{x,0}],{x,0}}), ' +
    'Build(round_live_limit,{gc_bif,round,{f,3},1025,[{x,0}],{x,0}}), ' +
    'Build(missing_float_label,{gc_bif,float,{f,4},1,[{x,0}],{x,0}}), ' +
    'Build(float_live_limit,{gc_bif,float,{f,3},1025,[{x,0}],{x,0}}), ' +
    'Build(missing_arith_label,{gc_bif,\'+\',{f,4},1,[{x,0},{integer,1}],{x,0}}), ' +
    'Build(missing_length_label,{gc_bif,length,{f,4},1,[{x,0}],{x,0}}), ' +
    'Build(length_live_limit,{gc_bif,length,{f,3},1025,[{x,0}],{x,0}}), ' +
    'Build(missing_div_label,{gc_bif,\'div\',{f,4},1,[{x,0},{integer,1}],{x,0}}), ' +
    'Build(missing_bitwise_label,{gc_bif,\'bor\',{f,4},1,[{x,0},{integer,1}],{x,0}}), ' +
    'Build(bitwise_live_limit,{gc_bif,\'bxor\',{f,3},1025,[{x,0},{integer,1}],{x,0}}), ' +
    'Build(missing_guard_label,{bif,tl,{f,4},[{x,0}],{x,0}}), halt().',
    '-extra', dir]);
  for (const file of ['mixed_select.beam', 'duplicate_select.beam', 'duplicate_arity.beam']) {
    const selection = spawnSync(compiler, [join(dir, file), preserved], {encoding: 'utf8', timeout: 30000});
    assert.notEqual(selection.status, 0, file);
    assert.match(selection.stderr, /mixed or duplicate selection choices/, file);
    assert.equal(readFileSync(preserved, 'utf8'), 'existing output');
  }
  for (const [file, label] of [['zero_select.beam', 0],
    ['zero_binary_test.beam', 0], ['missing_bits_test.beam', 4],
    ['missing_bitwise_label.beam', 4], ['missing_div_label.beam', 4],
    ['missing_length_label.beam', 4],
    ['missing_binary_part_label.beam', 4], ['missing_binary_part2_label.beam', 4],
    ['missing_bit_size_label.beam', 4], ['missing_byte_size_label.beam', 4],
    ['missing_float_divide_label.beam', 4], ['missing_arith_label.beam', 4],
    ['missing_abs_label.beam', 4],
    ['missing_round_label.beam', 4],
    ['missing_float_label.beam', 4],
    ['missing_guard_label.beam', 4]]) {
    const invalidBranch = spawnSync(compiler, [join(dir, file), preserved],
      {encoding: 'utf8', timeout: 30000});
    assert.notEqual(invalidBranch.status, 0, file);
    assert.match(invalidBranch.stderr, new RegExp(`invalid branch label ${label}`), file);
    assert.equal(readFileSync(preserved, 'utf8'), 'existing output');
  }
  for (const [file, error] of [
    ['bitwise_live_limit.beam', /unsupported instruction \{gc_bif/],
    ['length_live_limit.beam', /unsupported instruction \{gc_bif,length/],
    ['bit_size_live_limit.beam', /unsupported instruction \{gc_bif,bit_size/],
    ['byte_size_live_limit.beam', /unsupported instruction \{gc_bif,byte_size/],
    ['binary_part_live_limit.beam', /unsupported instruction \{gc_bif,binary_part/],
    ['binary_part2_live_limit.beam', /unsupported instruction \{gc_bif,binary_part/],
    ['float_divide_live_limit.beam', /unsupported instruction \{gc_bif,'\/'/],
    ['abs_live_limit.beam', /unsupported instruction \{gc_bif,abs/],
    ['round_live_limit.beam', /unsupported instruction \{gc_bif,round/],
    ['float_live_limit.beam', /unsupported instruction \{gc_bif,float/],
  ]) {
    const bif = spawnSync(compiler, [join(dir, file), preserved], {encoding: 'utf8', timeout: 30000});
    assert.notEqual(bif.status, 0, file);
    assert.match(bif.stderr, error, file);
    assert.equal(readFileSync(preserved, 'utf8'), 'existing output');
  }
  run('erl', ['+S', '1:1', '-noshell', '-eval',
    '[Dir]=init:get_plain_arguments(), ' +
    'Fail=[{label,1},{func_info,{atom,predicate_fail},{atom,check},1},{label,2},' +
    '{bif,is_integer,{f,3},[{x,0}],{x,0}},return,{label,3},' +
    '{move,{atom,failed},{x,0}},return], ' +
    '{ok,B}=beam_asm:module({predicate_fail,[{check,1}],[],#{},' +
    '[{function,check,1,2,Fail}],4},[],[],[]), ' +
    'ok=file:write_file(filename:join(Dir,"predicate_fail.beam"),B), ' +
    '{module,predicate_fail}=code:load_binary(predicate_fail,"predicate_fail",B), ' +
    'true=predicate_fail:check(1), false=predicate_fail:check(no), halt().', '-extra', dir]);
  const predicateFail = spawnSync(compiler, [join(dir, 'predicate_fail.beam'), preserved],
    {encoding: 'utf8', timeout: 30000});
  assert.notEqual(predicateFail.status, 0);
  assert.match(predicateFail.stderr, /unsupported instruction \{bif,is_integer,\{f,3\}/);
  assert.equal(readFileSync(preserved, 'utf8'), 'existing output');

  run('erl', ['+S', '1:1', '-noshell', '-eval',
    '[Dir]=init:get_plain_arguments(), ' +
    'lists:foreach(fun({Module,Op}) -> ' +
    'Is=[{label,1},{func_info,{atom,Module},{atom,check},1},{label,2},' +
    '{bif,Op,{f,3},[{x,0}],{x,0}},return,{label,3},{move,{atom,failed},{x,0}},return], ' +
    '{ok,B}=beam_asm:module({Module,[{check,1}],[],#{},[{function,check,1,2,Is}],4},[],[],[]), ' +
    'ok=file:write_file(filename:join(Dir,atom_to_list(Module)++".beam"),B), ' +
    '{module,Module}=code:load_binary(Module,"predicate",B), ' +
    'true=Module:check(<<>>), false=Module:check(no) end, ' +
    '[{binary_predicate_fail,is_binary},{bits_predicate_fail,is_bitstring}]), halt().', '-extra', dir]);
  for (const [module, op] of [['binary_predicate_fail', 'is_binary'], ['bits_predicate_fail', 'is_bitstring']]) {
    const invalid = spawnSync(compiler, [join(dir, `${module}.beam`), preserved],
      {encoding: 'utf8', timeout: 30000});
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, new RegExp(`unsupported instruction \\{bif,${op},\\{f,3\\}`));
    assert.equal(readFileSync(preserved, 'utf8'), 'existing output');
  }

  run('erl', ['+S', '1:1', '-noshell', '-eval',
    '[Dir]=init:get_plain_arguments(), ' +
    'Is=[{label,1},{func_info,{atom,typed_y},{atom,check},1},{label,2},' +
    '{test,is_integer,{f,3},[{tr,{y,0},any}]},{move,{atom,yes},{x,0}},return,' +
    '{label,3},{move,{atom,no},{x,0}},return], ' +
    '{ok,B}=beam_asm:module({typed_y,[{check,1}],[],#{},' +
    '[{function,check,1,2,Is}],4},[],[],[]), ' +
    'ok=file:write_file(filename:join(Dir,"typed_y.beam"),B), ' +
    'BigIs=[case I of {func_info,{atom,typed_y},{atom,check},1} -> ' +
    '{func_info,{atom,typed_x_limit},{atom,check},1}; ' +
    '{test,is_integer,F,[_]} -> {test,is_integer,F,[{tr,{x,1024},any}]}; _ -> I end || I <- Is], ' +
    '{ok,Big}=beam_asm:module({typed_x_limit,[{check,1}],[],#{},' +
    '[{function,check,1,2,BigIs}],4},[],[],[]), ' +
    'ok=file:write_file(filename:join(Dir,"typed_x_limit.beam"),Big), ' +
    'YBigIs=[case I of {func_info,{atom,typed_y},{atom,check},1} -> ' +
    '{func_info,{atom,typed_y_limit},{atom,check},1}; ' +
    '{test,is_integer,F,[_]} -> {test,is_integer,F,[{tr,{y,1024},any}]}; _ -> I end || I <- Is], ' +
    '{ok,YBig}=beam_asm:module({typed_y_limit,[{check,1}],[],#{},' +
    '[{function,check,1,2,YBigIs}],4},[],[],[]), ' +
    'ok=file:write_file(filename:join(Dir,"typed_y_limit.beam"),YBig), halt().', '-extra', dir]);
  const typedNoFrame = join(dir, 'typed_y.mjs');
  run(compiler, [join(dir, 'typed_y.beam'), typedNoFrame]);
  (await import(pathToFileURL(typedNoFrame))).register(runtime);
  assert.throws(() => runtime.invoke('typed_y', 'check', [1n]), /uninitialized y register 0/);
  for (const [file, error] of [
    ['typed_y_limit.beam', /unsupported operand \{tr,\{y,1024\},any\}/],
    ['typed_x_limit.beam', /unsupported operand \{tr,\{x,1024\},any\}/],
    ['raw_typed_no_type.beam', /cannot disassemble BEAM/],
  ]) {
    const result = spawnSync(compiler, [join(dir, file), preserved], {encoding: 'utf8', timeout: 30000});
    assert.notEqual(result.status, 0, file);
    assert.match(result.stderr, error, file);
    assert.equal(readFileSync(preserved, 'utf8'), 'existing output');
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const resources = new Map([
      ['/', '<!doctype html><title>Opcode tests</title>'],
      ['/runtime.mjs', readFileSync(resolve('runtime/beam2js.mjs'), 'utf8')],
      ['/opcode_tests.mjs', readFileSync(join(dir, 'opcode_tests.mjs'), 'utf8')],
      ['/guards.mjs', readFileSync(join(dir, 'guards.mjs'), 'utf8')],
      ['/bif_predicates.mjs', readFileSync(join(dir, 'bif_predicates.mjs'), 'utf8')],
      ['/raw_predicate_bifs.mjs', readFileSync(join(dir, 'raw_predicate_bifs.mjs'), 'utf8')],
      ['/float_literals.mjs', readFileSync(join(dir, 'float_literals.mjs'), 'utf8')],
      ['/list_slice.mjs', readFileSync(join(dir, 'list_slice.mjs'), 'utf8')],
      ['/tuple_slice.mjs', readFileSync(join(dir, 'tuple_slice.mjs'), 'utf8')],
      ['/literal_terms.mjs', readFileSync(join(dir, 'literal_terms.mjs'), 'utf8')],
      ['/unsupported_literal.mjs', readFileSync(join(dir, 'unsupported_literal.mjs'), 'utf8')],
      ['/long_literal.mjs', readFileSync(join(dir, 'long_literal.mjs'), 'utf8')],
      ['/raw_select.mjs', readFileSync(join(dir, 'raw_select.mjs'), 'utf8')],
      ['/raw_select_zero.mjs', readFileSync(join(dir, 'raw_select_zero.mjs'), 'utf8')],
      ['/select_slice.mjs', readFileSync(join(dir, 'select_slice.mjs'), 'utf8')],
      ['/typed_select_slice.mjs', readFileSync(join(dir, 'typed_select_slice.mjs'), 'utf8')],
      ['/raw_typed.mjs', readFileSync(join(dir, 'raw_typed.mjs'), 'utf8')],
      ['/guard_bifs.mjs', readFileSync(join(dir, 'guard_bifs.mjs'), 'utf8')],
      ['/raw_guard_bifs.mjs', readFileSync(join(dir, 'raw_guard_bifs.mjs'), 'utf8')],
      ['/bitwise_guards.mjs', readFileSync(join(dir, 'bitwise_guards.mjs'), 'utf8')],
      ['/raw_bitwise_guards.mjs', readFileSync(join(dir, 'raw_bitwise_guards.mjs'), 'utf8')],
      ['/integer_guards.mjs', readFileSync(join(dir, 'integer_guards.mjs'), 'utf8')],
      ['/raw_integer_guards.mjs', readFileSync(join(dir, 'raw_integer_guards.mjs'), 'utf8')],
      ['/length_guards.mjs', readFileSync(join(dir, 'length_guards.mjs'), 'utf8')],
      ['/raw_length_guards.mjs', readFileSync(join(dir, 'raw_length_guards.mjs'), 'utf8')],
      ['/arithmetic_guards.mjs', readFileSync(join(dir, 'arithmetic_guards.mjs'), 'utf8')],
      ['/raw_arithmetic_guards.mjs', readFileSync(join(dir, 'raw_arithmetic_guards.mjs'), 'utf8')],
      ['/slice_helper.mjs', readFileSync(join(dir, 'slice_helper.mjs'), 'utf8')],
      ['/raw_control_flow.mjs', readFileSync(join(dir, 'raw_control_flow.mjs'), 'utf8')],
      ['/stripped.mjs', readFileSync(strippedOutput, 'utf8')],
      ['/guards-stripped.mjs', readFileSync(join(dir, 'guards-stripped.mjs'), 'utf8')],
      ['/stripped-flow.mjs', readFileSync(strippedFlowOutput, 'utf8')],
      ['/stripped-predicates.mjs', readFileSync(strippedPredicatesOutput, 'utf8')],
      ['/stripped-raw-predicates.mjs', readFileSync(strippedRawPredicatesOutput, 'utf8')],
      ['/stripped-float-literals.mjs', readFileSync(strippedFloatLiteralsOutput, 'utf8')],
      ['/stripped-list.mjs', readFileSync(strippedListOutput, 'utf8')],
      ['/stripped-tuple.mjs', readFileSync(strippedTupleOutput, 'utf8')],
      ['/stripped-literals.mjs', readFileSync(strippedLiteralsOutput, 'utf8')],
      ['/unsupported_literal-stripped.mjs', readFileSync(join(dir, 'unsupported_literal-stripped.mjs'), 'utf8')],
      ['/stripped-long.mjs', readFileSync(strippedLongOutput, 'utf8')],
      ['/stripped-select.mjs', readFileSync(strippedSelectOutput, 'utf8')],
      ['/stripped-zero-select.mjs', readFileSync(strippedZeroSelectOutput, 'utf8')],
      ['/stripped-select-slice.mjs', readFileSync(strippedSelectSliceOutput, 'utf8')],
      ['/stripped-typed-select.mjs', readFileSync(strippedTypedSelectOutput, 'utf8')],
      ['/stripped-typed.mjs', readFileSync(strippedTypedOutput, 'utf8')],
      ['/stripped-guard-bifs.mjs', readFileSync(strippedGuardBifsOutput, 'utf8')],
      ['/stripped-raw-guard-bifs.mjs', readFileSync(strippedRawGuardBifsOutput, 'utf8')],
      ['/stripped-bitwise.mjs', readFileSync(strippedBitwiseOutput, 'utf8')],
      ['/stripped-raw-bitwise.mjs', readFileSync(strippedRawBitwiseOutput, 'utf8')],
      ['/stripped-integer.mjs', readFileSync(strippedIntegerOutput, 'utf8')],
      ['/stripped-raw-integer.mjs', readFileSync(strippedRawIntegerOutput, 'utf8')],
      ['/stripped-length.mjs', readFileSync(strippedLengthOutput, 'utf8')],
      ['/stripped-raw-length.mjs', readFileSync(strippedRawLengthOutput, 'utf8')],
      ['/stripped-arithmetic.mjs', readFileSync(strippedArithmeticOutput, 'utf8')],
      ['/stripped-raw-arithmetic.mjs', readFileSync(strippedRawArithmeticOutput, 'utf8')],
    ]);
    await page.route('http://beam2js.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (!resources.has(path)) return route.abort();
      await route.fulfill({contentType: path === '/' ? 'text/html' : 'text/javascript', body: resources.get(path)});
    });
    await page.goto('http://beam2js.test/', {timeout: 30000});
    const browserResults = await Promise.race([
      page.evaluate(async ({inputs, strippedInputs}) => {
        const {Runtime} = await import('/runtime.mjs');
        const rt = new Runtime();
        (await import('/opcode_tests.mjs')).register(rt);
        (await import('/guards.mjs')).register(rt);
        (await import('/bif_predicates.mjs')).register(rt);
        (await import('/raw_predicate_bifs.mjs')).register(rt);
        (await import('/float_literals.mjs')).register(rt);
        (await import('/list_slice.mjs')).register(rt);
        (await import('/tuple_slice.mjs')).register(rt);
        (await import('/literal_terms.mjs')).register(rt);
        (await import('/unsupported_literal.mjs')).register(rt);
        (await import('/long_literal.mjs')).register(rt);
        (await import('/raw_select.mjs')).register(rt);
        (await import('/raw_select_zero.mjs')).register(rt);
        (await import('/select_slice.mjs')).register(rt);
        (await import('/typed_select_slice.mjs')).register(rt);
        (await import('/raw_typed.mjs')).register(rt);
        (await import('/guard_bifs.mjs')).register(rt);
        (await import('/raw_guard_bifs.mjs')).register(rt);
        (await import('/bitwise_guards.mjs')).register(rt);
        (await import('/raw_bitwise_guards.mjs')).register(rt);
        (await import('/integer_guards.mjs')).register(rt);
        (await import('/raw_integer_guards.mjs')).register(rt);
        (await import('/length_guards.mjs')).register(rt);
        (await import('/raw_length_guards.mjs')).register(rt);
        (await import('/arithmetic_guards.mjs')).register(rt);
        (await import('/raw_arithmetic_guards.mjs')).register(rt);
        (await import('/slice_helper.mjs')).register(rt);
        (await import('/raw_control_flow.mjs')).register(rt);
        const strippedRt = new Runtime();
        (await import('/stripped.mjs')).register(strippedRt);
        (await import('/guards-stripped.mjs')).register(strippedRt);
        (await import('/slice_helper.mjs')).register(strippedRt);
        (await import('/stripped-flow.mjs')).register(strippedRt);
        (await import('/stripped-predicates.mjs')).register(strippedRt);
        (await import('/stripped-raw-predicates.mjs')).register(strippedRt);
        (await import('/stripped-float-literals.mjs')).register(strippedRt);
        (await import('/stripped-list.mjs')).register(strippedRt);
        (await import('/stripped-tuple.mjs')).register(strippedRt);
        (await import('/stripped-literals.mjs')).register(strippedRt);
        (await import('/unsupported_literal-stripped.mjs')).register(strippedRt);
        (await import('/stripped-long.mjs')).register(strippedRt);
        (await import('/stripped-select.mjs')).register(strippedRt);
        (await import('/stripped-zero-select.mjs')).register(strippedRt);
        (await import('/stripped-select-slice.mjs')).register(strippedRt);
        (await import('/stripped-typed-select.mjs')).register(strippedRt);
        (await import('/stripped-typed.mjs')).register(strippedRt);
        (await import('/stripped-guard-bifs.mjs')).register(strippedRt);
        (await import('/stripped-raw-guard-bifs.mjs')).register(strippedRt);
        (await import('/stripped-bitwise.mjs')).register(strippedRt);
        (await import('/stripped-raw-bitwise.mjs')).register(strippedRt);
        (await import('/stripped-integer.mjs')).register(strippedRt);
        (await import('/stripped-raw-integer.mjs')).register(strippedRt);
        (await import('/stripped-length.mjs')).register(strippedRt);
        (await import('/stripped-raw-length.mjs')).register(strippedRt);
        (await import('/stripped-arithmetic.mjs')).register(strippedRt);
        (await import('/stripped-raw-arithmetic.mjs')).register(strippedRt);
        const term = (runtime, arg) => {
          if (arg.type === 'integer') return BigInt(arg.value);
          if (arg.type === 'float') return runtime.float(Number(arg.value));
          if (arg.type === 'nil') return runtime.nil();
          if (arg.type === 'cons') return runtime.cons(term(runtime, arg.head), term(runtime, arg.tail));
          if (arg.type === 'tuple') return runtime.tuple(arg.elements.map(element => term(runtime, element)));
          if (arg.type === 'bitstring') return runtime.bitstring(arg.bytes, arg.length);
          return runtime.atom(arg.value);
        };
        const result = (runtime, value) => {
          if (typeof value === 'bigint') return String(value);
          if (typeof value === 'symbol') return Symbol.keyFor(value);
          if (runtime.isBitstring(value)) {
            return `bits:${runtime.bitstringSize(value)}:[${Array.from(runtime.bitstringBytes(value)).join(',')}]`;
          }
          if (runtime.isType('is_nil', value)) return '[]';
          if (runtime.isType('is_nonempty_list', value)) {
            return `[${result(runtime, runtime.listHead(value))}|${result(runtime, runtime.listTail(value))}]`;
          }
          if (runtime.isType('is_tuple', value)) {
            return `{${Array.from({length: runtime.tupleSize(value)}, (_, i) =>
              result(runtime, runtime.tupleElement(value, i + 1))).join(',')}}`;
          }
          const bytes = new DataView(new ArrayBuffer(8));
          bytes.setFloat64(0, runtime.floatValue(value));
          return `float:${bytes.getBigUint64(0)}`;
        };
        const invoke = (runtime, {module, name, args}) => {
          return result(runtime, runtime.invoke(module, name, args.map(arg => term(runtime, arg))));
        };
        let deepA = rt.nil();
        let deepB = rt.nil();
        let deepDifferent = 1n;
        for (let i = 0; i < 20000; i++) {
          deepA = rt.cons(deepA, rt.nil());
          deepB = rt.cons(deepB, rt.nil());
          deepDifferent = rt.cons(deepDifferent, rt.nil());
        }
        const checkLong = runtime => {
          let list = runtime.invoke('long_literal', 'value', []);
          if (runtime.invoke('raw_length_guards', 'size', [list]) !== 10000n) return false;
          if (runtime.invoke('length_guards', 'two', [list]) !== runtime.atom('no')) return false;
          let improper = runtime.atom('tail');
          for (let i = 0; i < 10000; i++) improper = runtime.cons(1n, improper);
          if (runtime.invoke('raw_length_guards', 'size', [improper]) !== runtime.atom('failed')) return false;
          if (runtime.invoke('length_guards', 'two', [improper]) !== runtime.atom('no')) return false;
          for (let i = 1; i <= 10000; i++) {
            if (runtime.listHead(list) !== BigInt(i)) return false;
            list = runtime.listTail(list);
          }
          return list === runtime.nil();
        };
        let tupleA = rt.tuple([]);
        let tupleB = rt.tuple([]);
        let tupleDifferent = 1n;
        for (let i = 0; i < 20000; i++) {
          tupleA = rt.tuple([tupleA]);
          tupleB = rt.tuple([tupleB]);
          tupleDifferent = rt.tuple([tupleDifferent]);
        }
        return {
          regular: inputs.map(input => invoke(rt, input)),
          stripped: strippedInputs.map(input => invoke(strippedRt, input)),
          deepLists: rt.equalExact(deepA, deepB) && rt.compare(deepA, deepB) === 0 &&
            !rt.equalExact(deepA, deepDifferent) && rt.compare(deepA, deepDifferent) === 1,
          deepTuples: rt.equalExact(tupleA, tupleB) && rt.compare(tupleA, tupleB) === 0 &&
            !rt.equalExact(tupleA, tupleDifferent) && rt.compare(tupleA, tupleDifferent) === 1,
          longLiterals: checkLong(rt) && checkLong(strippedRt),
          tupleCopy: (() => {
            const values = [1n];
            const term = rt.tuple(values);
            values[0] = 2n;
            return Object.isFrozen(term) && rt.tupleElement(term, 1) === 1n;
          })(),
          tupleRejectsInvalid: (() => {
            try { rt.tupleElement(rt.tuple([]), 1); return false; }
            catch (error) { return error instanceof RangeError; }
          })(),
          bitstringCopy: (() => {
            const input = new Uint8Array([0xaf]);
            const term = rt.bitstring(input, 3);
            input[0] = 0;
            const output = rt.bitstringBytes(term);
            output[0] = 0;
            return Object.isFrozen(term) && rt.bitstringSize(term) === 3 &&
              rt.bitstringBytes(term)[0] === 0xa0 &&
              rt.equalExact(term, rt.bitstring([0xbf], 3));
          })(),
          bitstringRejectsInvalid: (() => {
            try { rt.bitstring([256], 8); return false; }
            catch (error) { if (!(error instanceof TypeError)) return false; }
            try { rt.bitstring([0], 9); return false; }
            catch (error) { return error instanceof RangeError; }
          })(),
          binaryPartCopy: (() => {
            const source = rt.bitstring([0, 1, 2], 24);
            const part = rt.guardBinaryPart(source, 2n, -1n);
            const output = rt.bitstringBytes(part);
            output[0] = 9;
            return rt.bitstringBytes(part)[0] === 1 && rt.bitstringBytes(source)[1] === 1;
          })(),
          floatBoundary: {
            negativeZero: Object.is(rt.floatValue(rt.float(-0)), -0),
            frozen: Object.isFrozen(rt.float(1)),
            rejectsNonFinite: [NaN, Infinity, -Infinity].every(value => {
              try { rt.float(value); return false; } catch (error) { return error instanceof TypeError; }
            }),
            rejectsHostNumber: (() => {
              try { rt.invoke('raw_control_flow', 'id', [1.5]); return false; }
              catch (error) { return error instanceof TypeError; }
            })(),
          },
        };
      }, {inputs: cases, strippedInputs: strippedCases}),
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('browser opcode tests timed out')), 30000);
        timer.unref();
      }),
    ]);
    assert.deepEqual(browserResults.regular, oracle, 'browser results must match OTP');
    assert.deepEqual(browserResults.stripped, strippedOracle, 'stripped browser results must match OTP');
    assert.equal(browserResults.deepLists, true, 'deep list comparisons must not overflow');
    assert.equal(browserResults.deepTuples, true, 'deep tuple comparisons must not overflow');
    assert.equal(browserResults.longLiterals, true, 'long literals must preserve every element');
    assert.equal(browserResults.tupleCopy, true, 'tuple contents must be immutable');
    assert.equal(browserResults.tupleRejectsInvalid, true, 'invalid tuple indices must be rejected');
    assert.equal(browserResults.bitstringCopy, true, 'bitstring contents must be immutable');
    assert.equal(browserResults.bitstringRejectsInvalid, true, 'invalid bitstrings must be rejected');
    assert.equal(browserResults.binaryPartCopy, true, 'binary parts must be immutable');
    assert.deepEqual(browserResults.floatBoundary,
      {negativeZero: true, frozen: true, rejectsNonFinite: true, rejectsHostNumber: true});
  } finally {
    await browser.close();
  }
  console.log(`Opcode tests passed in Node and Chromium (${cases.length} OTP comparisons each)`);
} finally {
  rmSync(dir, {recursive: true, force: true});
}
