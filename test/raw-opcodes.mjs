import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';

const dir = mkdtempSync(join(tmpdir(), 'beam2js-raw-opcodes-'));
const integerCases = [
  ['0', [0x01]], ['15', [0xf1]], ['16', [0x09, 0x10]],
  ['2047', [0xe9, 0xff]], ['2048', [0x19, 0x08, 0x00]],
  ['-1', [0x19, 0xff, 0xff]], ['-32768', [0x19, 0x80, 0x00]],
  ['-32769', [0x39, 0xff, 0x7f, 0xff]],
  ['18446744073709551616', [0xf9, 0x00, 0x01, 0, 0, 0, 0, 0, 0, 0, 0]],
  ['340282366920938463463374607431768211455', [0xf9, 0x80, 0, ...Array(16).fill(0xff)]],
  ['-340282366920938463463374607431768211455', [0xf9, 0x80, 0xff, ...Array(15).fill(0), 1]],
  ['340282366920938463463374607431768211456', [0x47, 0x00]],
  ['-340282366920938463463374607431768211456', [0x47, 0x00]],
];
const cases = [
  {op: 'is_integer', opcode: 45, arity: 1, operands: '{x,0}', bytes: [0x03], yes: '1', no: 'no'},
  {op: 'is_number', opcode: 47, arity: 1, operands: '{x,0}', bytes: [0x03],
    yes: '1', no: 'no', alsoYes: ['1.5']},
  {op: 'is_atom', opcode: 48, arity: 1, operands: '{x,0}', bytes: [0x03], yes: 'yes', no: '1'},
  {op: 'is_boolean', opcode: 114, arity: 1, operands: '{x,0}', bytes: [0x03],
    yes: 'true', no: 'no', alsoYes: ['false']},
  {op: 'is_float', opcode: 46, arity: 1, operands: '{x,0}', bytes: [0x03], yes: '1.5', no: '1'},
  {op: 'is_lt', opcode: 39, arity: 2, operands: '{x,0},{x,1}', bytes: [0x03, 0x13],
    yes: '1,2', no: '2,1', alsoNo: ['1,1']},
  {op: 'is_ge', opcode: 40, arity: 2, operands: '{x,0},{x,1}', bytes: [0x03, 0x13],
    yes: '2,1', no: '1,2', alsoYes: ['1,1']},
  {op: 'is_eq', opcode: 41, arity: 2, operands: '{x,0},{x,1}', bytes: [0x03, 0x13],
    yes: '1,1.0', no: '1,2', alsoYes: ['0.0,-0.0']},
  {op: 'is_ne', opcode: 42, arity: 2, operands: '{x,0},{x,1}', bytes: [0x03, 0x13],
    yes: '1,2', no: '1,1.0', alsoNo: ['0.0,-0.0']},
  {op: 'is_eq_exact', opcode: 43, arity: 2, operands: '{x,0},{x,1}', bytes: [0x03, 0x13],
    yes: '1,1', no: '1,2', alsoNo: ['1,1.0', '0.0,-0.0']},
  {op: 'is_ne_exact', opcode: 44, arity: 2, operands: '{x,0},{x,1}', bytes: [0x03, 0x13],
    yes: '1,1.0', no: '1,1', alsoYes: ['0.0,-0.0']},
  {op: 'is_eq_exact', opcode: 43, arity: 1, operands: '{x,0},{atom,yes}', bytes: [0x03, 0x32],
    yes: 'yes', no: 'no'},
  {op: 'is_eq_exact', opcode: 43, arity: 1, operands: '{x,0},nil', bytes: [0x03, 0x02],
    yes: '[]', no: 'no'},
  {op: 'is_eq_exact', opcode: 43, arity: 1, operands: '{x,0},{float,1.5}', bytes: [0x03, 0x47, 0x00],
    yes: '1.5', no: 'no'},
  ...integerCases.map(([value, bytes]) => ({
    op: 'is_eq_exact', opcode: 43, arity: 1,
    operands: `{x,0},{integer,${value}}`, bytes: [0x03, ...bytes], yes: value, no: 'different',
  })),
  {op: 'is_binary', opcode: 53, arity: 1, operands: '{x,0}', bytes: [0x03],
    yes: '<<0>>', no: '<<1:1>>', alsoYes: ['<<>>'], alsoNo: ['no']},
  {op: 'is_bitstr', opcode: 129, arity: 1, operands: '{x,0}', bytes: [0x03],
    yes: '<<1:1>>', no: 'no', alsoYes: ['<<>>', '<<0>>']},
];

for (const test of [...cases.slice(0, 11), ...cases.filter(({op}) => op === 'is_binary' || op === 'is_bitstr')]) {
  for (const {register, bytes, stack} of [
    {register: '{y,0}', bytes: [0x04], stack: 0},
    {register: '{tr,{x,0},any}', bytes: [0x57, 0x03, 0x00]},
    {register: '{tr,{y,0},any}', bytes: [0x57, 0x04, 0x00], stack: 0},
  ]) {
    cases.push({
      ...test, operands: test.operands.replace('{x,0}', register),
      bytes: [...bytes, ...test.bytes.slice(1)], stack,
    });
  }
  if (test.arity === 2) {
    for (const {register, bytes} of [
      {register: '{y,0}', bytes: [0x04]},
      {register: '{tr,{y,0},any}', bytes: [0x57, 0x04, 0x00]},
    ]) {
      cases.push({
        ...test, operands: test.operands.replace('{x,1}', register),
        bytes: [0x03, ...bytes], stack: 1,
      });
    }
  }
}

function chunk(beam, name) {
  assert.equal(beam.toString('ascii', 0, 4), 'FOR1');
  assert.equal(beam.toString('ascii', 8, 12), 'BEAM');
  for (let offset = 12; offset < beam.length;) {
    const size = beam.readUInt32BE(offset + 4);
    const start = offset + 8;
    if (beam.toString('ascii', offset, offset + 4) === name) return beam.subarray(start, start + size);
    offset = start + ((size + 3) & ~3);
  }
  throw new Error(`fixture has no ${name} chunk`);
}

function codeChunk(beam) {
  const code = chunk(beam, 'Code');
  assert.equal(code.readUInt32BE(0), 16);
  return code.subarray(20);
}

function uncompressed(beam) {
  return beam.readUInt16BE(0) === 0x1f8b ? gunzipSync(beam) : beam;
}

function compact(bytes, offset) {
  const first = bytes.readUInt8(offset++);
  const tag = first & 7;
  if ((first & 8) === 0) return {tag, value: first >> 4, offset};
  assert.equal(first & 16, 0, 'unexpected long operand in guards fixture');
  const value = ((first >> 5) << 8) | bytes.readUInt8(offset++);
  return {tag, value, offset};
}

function guardInstructions(beam) {
  const table = chunk(beam, 'AtU8');
  const count = table.readInt32BE(0);
  const atoms = [null];
  let offset = 4;
  for (let i = 0; i < Math.abs(count); i++) {
    let length;
    if (count < 0) {
      const encoded = compact(table, offset);
      assert.equal(encoded.tag, 0);
      length = encoded.value;
      offset = encoded.offset;
    } else {
      length = table.readUInt8(offset++);
    }
    assert.ok(offset + length <= table.length);
    atoms.push(table.toString('utf8', offset, offset + length));
    offset += length;
  }
  assert.equal(offset, table.length);

  const arities = new Map([
    [1, 1], [2, 3], [3, 0], [19, 0], [39, 3], [43, 3],
    [45, 2], [46, 2], [47, 2], [48, 2], [53, 2], [64, 2], [78, 2], [114, 2], [129, 2], [153, 1],
  ]);
  const guardOpcodes = new Set([39, 43, 45, 46, 47, 48, 53, 114, 129]);
  const code = codeChunk(beam);
  const guards = [];
  let functionName;
  offset = 0;
  while (offset < code.length) {
    const opcode = code.readUInt8(offset++);
    const arity = arities.get(opcode);
    assert.notEqual(arity, undefined, `unexpected opcode ${opcode} in guards fixture`);
    const operands = [];
    for (let i = 0; i < arity; i++) {
      const arg = compact(code, offset);
      operands.push([arg.tag, arg.value]);
      offset = arg.offset;
    }
    if (opcode === 2) {
      assert.equal(operands[1][0], 2);
      functionName = atoms[operands[1][1]];
      assert.ok(functionName);
    }
    if (guardOpcodes.has(opcode)) guards.push([functionName, opcode, ...operands]);
    if (opcode === 3) {
      assert.equal(offset, code.length, 'unexpected bytes after int_code_end');
      return guards;
    }
  }
  throw new Error('guards fixture has no int_code_end');
}

try {
  const builds = cases.map(({op, arity, operands, stack, yes, no, alsoYes = [], alsoNo = []}, index) => {
    const mod = `raw_encoding_${index}`;
    const setup = stack === undefined ? '' : `{allocate,1,${arity}},{move,{x,${stack}},{y,0}},`;
    const cleanup = stack === undefined ? '' : '{deallocate,1},';
    return `(fun() -> Mod=${mod}, Is=[{label,1},` +
      `{func_info,{atom,Mod},{atom,check},${arity}},{label,2},` +
      setup +
      `{test,${op},{f,3},[${operands}]},` +
      `{move,{atom,yes},{x,0}},${cleanup}return,{label,3},{move,{atom,no},{x,0}},${cleanup}return],` +
      `{ok,B}=beam_asm:module({Mod,[{check,${arity}}],[],#{},` +
      `[{function,check,${arity},2,Is}],4},[],[],[]),` +
      `Path=filename:join(Dir,atom_to_list(Mod)++".beam"),ok=file:write_file(Path,B),` +
      `{module,Mod}=code:load_binary(Mod,Path,B),` +
      [...[yes, ...alsoYes].map(args => `yes=apply(Mod,check,[${args}])`),
        ...[no, ...alsoNo].map(args => `no=apply(Mod,check,[${args}])`)].join(',') + ' end)()';
  }).join(',');
  const noTypeIndices = ['{tr,{x,0},any}', '{tr,{y,0},any}'].map(operand => {
    const index = cases.findIndex(test => test.op === 'is_integer' && test.operands === operand);
    assert.notEqual(index, -1);
    return index;
  });
  const noTypeBuilds = noTypeIndices.map(index => {
    const mod = `raw_encoding_${index}`;
    return `(fun() -> Path=filename:join(Dir,"${mod}.beam"), {ok,B}=file:read_file(Path), ` +
      `{ok,${mod},Chunks}=beam_lib:all_chunks(B), true=lists:keymember("Type",1,Chunks), ` +
      '{ok,Without}=beam_lib:build_module(lists:keydelete("Type",1,Chunks)), ' +
      `ok=file:write_file(filename:join(Dir,"${mod}-no-type.beam"),Without), ` +
      `{module,${mod}}=code:load_binary(${mod},Path,Without), ` +
      `yes=${mod}:check(1), no=${mod}:check(no), ` +
      "case catch beam_disasm:file(Without) of {'EXIT',{beam_disasm,_," +
      '{cannot_disasm_instr,{is_integer,2,function_clause}}}} -> ok; ' +
      'Other -> erlang:error({unexpected_disassembly,Other}) end end)()';
  }).join(',');
  execFileSync('erl', ['+S', '1:1', '-noshell', '-eval',
    `[Dir]=init:get_plain_arguments(), ${builds}, ${noTypeBuilds}, ` +
    '{ok,guards,Guards}=compile:file("fixtures/guards.erl",[binary,return_errors]), ' +
    'ok=file:write_file(filename:join(Dir,"guards.beam"),Guards), ' +
    '{ok,{guards,Stripped}}=beam_lib:strip(Guards), ' +
    'ok=file:write_file(filename:join(Dir,"guards-stripped.beam"),Stripped), ' +
    '{module,guards}=code:load_binary(guards,"guards-stripped.beam",Stripped), ' +
    'yes=guards:integer(1), no=guards:integer(no), ' +
    'yes=guards:binary(<<>>), no=guards:binary(<<1:1>>), ' +
    'yes=guards:bitstring(<<1:1>>), no=guards:bitstring(no), ' +
    'yes=guards:different(1,2), no=guards:different(1,1), ' +
    '{ok,slice_helper,Helper}=compile:file("fixtures/slice_helper.erl",[binary]), ' +
    '{module,slice_helper}=code:load_binary(slice_helper,"slice_helper",Helper), ' +
    '{ok,raw_control_flow,Flow}=compile:file("fixtures/raw_control_flow.S",' +
    '[binary,from_asm,no_postopt,report_errors]), ' +
    'ok=file:write_file(filename:join(Dir,"raw_control_flow.beam"),Flow), ' +
    '{ok,{raw_control_flow,StrippedFlow}}=beam_lib:strip(Flow), ' +
    'ok=file:write_file(filename:join(Dir,"raw_control_flow-stripped.beam"),StrippedFlow), ' +
    '{module,raw_control_flow}=code:load_binary(raw_control_flow,"raw_control_flow",Flow), ' +
    '7=raw_control_flow:id(7), 7=raw_control_flow:local(7), 7=raw_control_flow:remote(7), ' +
    '42=raw_control_flow:jump(), answer=raw_control_flow:move_atom(), ' +
    '-1=raw_control_flow:move_integer(), second=raw_control_flow:pick(first,second), ' +
    '{beam_file,raw_control_flow,_,_,_,Fs}=beam_disasm:file(Flow), ' +
    '{function,local,1,_,Local}=lists:keyfind(local,2,Fs), ' +
    'true=lists:member({call_only,1,{raw_control_flow,id,1}},Local), ' +
    '{function,remote,1,_,Remote}=lists:keyfind(remote,2,Fs), ' +
    'true=lists:member({call_ext_only,1,{extfunc,slice_helper,id,1}},Remote), ' +
    '{ok,raw_select,Select}=compile:file("fixtures/raw_select.S",' +
    '[binary,from_asm,no_postopt,report_errors]), ' +
    'ok=file:write_file(filename:join(Dir,"raw_select.beam"),Select), ' +
    '{ok,{raw_select,StrippedSelect}}=beam_lib:strip(Select), ' +
    'ok=file:write_file(filename:join(Dir,"raw_select-stripped.beam"),StrippedSelect), ' +
    '{module,raw_select}=code:load_binary(raw_select,"raw_select",Select), ' +
    'CheckSelect=fun() -> [' +
    'raw_select:atom_choice(first),raw_select:atom_choice(second),raw_select:atom_choice(missing),' +
    'raw_select:integer_choice(-1),raw_select:integer_choice(2048),raw_select:integer_choice(-1.0),' +
    'raw_select:tuple_arity({a}),raw_select:tuple_arity({a,b}),raw_select:tuple_arity({}),' +
    'raw_select:tuple_arity(no),raw_select:float_choice(1.5),raw_select:float_choice(2.5),' +
    'raw_select:float_choice(1)] end, ' +
    'ExpectedSelect=[one,two,other,one,two,other,one,two,other,other,one,two,other], ' +
    'ExpectedSelect=CheckSelect(), ' +
    '{module,raw_select}=code:load_binary(raw_select,"raw_select-stripped",StrippedSelect), ' +
    'ExpectedSelect=CheckSelect(), ' +
    '{beam_file,raw_select,_,_,_,SelectFs}=beam_disasm:file(Select), ' +
    '{function,atom_choice,1,_,AtomSelect}=lists:keyfind(atom_choice,2,SelectFs), ' +
    'true=lists:member({select_val,{x,0},{f,3},' +
    '{list,[{atom,first},{f,4},{atom,second},{f,5}]}},AtomSelect), ' +
    '{function,tuple_arity,1,_,TupleSelect}=lists:keyfind(tuple_arity,2,SelectFs), ' +
    'true=lists:member({select_tuple_arity,{x,0},{f,13},' +
    '{list,[1,{f,14},2,{f,15}]}},TupleSelect), ' +
    'BadSelectIs=[{label,1},{func_info,{atom,bad_select},{atom,f},1},{label,2},' +
    '{select_val,{x,0},{f,3},{list,[{atom,a},{f,3},{integer,1},{f,3}]}},' +
    '{label,3},{move,{atom,ok},{x,0}},return], ' +
    'BadSelect={bad_select,[{f,1}],[],#{},[{function,f,1,2,BadSelectIs}],4}, ' +
    '{error,[{"bad_select",[{1,beam_validator,{{bad_select,f,1},{_,_,bad_select_list}}}]}]}=' +
    'beam_validator:validate(BadSelect,weak), ' +
    'BadTupleIs=[{label,1},{func_info,{atom,bad_tuple},{atom,f},1},{label,2},' +
    '{select_tuple_arity,{x,0},{f,3},{list,[1,{f,3}]}},' +
    '{label,3},{move,{atom,ok},{x,0}},return], ' +
    'BadTuple={bad_tuple,[{f,1}],[],#{},[{function,f,1,2,BadTupleIs}],4}, ' +
    '{error,[{"bad_tuple",[{1,beam_validator,{{bad_tuple,f,1},' +
    '{_,_,{bad_type,{needed,_},{actual,any}}}}}]}]}=beam_validator:validate(BadTuple,weak), ' +
    '{ok,raw_bifs,Bifs}=compile:file("fixtures/raw_bifs.S",' +
    '[binary,from_asm,no_postopt,report_errors]), ' +
    'ok=file:write_file(filename:join(Dir,"raw_bifs.beam"),Bifs), ' +
    '{ok,{raw_bifs,StrippedBifs}}=beam_lib:strip(Bifs), ' +
    'ok=file:write_file(filename:join(Dir,"raw_bifs-stripped.beam"),StrippedBifs), ' +
    '{module,raw_bifs}=code:load_binary(raw_bifs,"raw_bifs",Bifs), ' +
    'Exception=fun(F) -> try F() of V -> {returned,V} catch C:R -> {C,R} end end, ' +
    'CheckBifs=fun() -> [self()=:=raw_bifs:self_pid(), ' +
    'raw_bifs:head_guard([7]),raw_bifs:head_guard([]),raw_bifs:head_guard(no), ' +
    'raw_bifs:head_body([7]),Exception(fun() -> raw_bifs:head_body(no) end), ' +
    'raw_bifs:element_guard(2,{a,b}),raw_bifs:element_guard(3,{a,b}), ' +
    'raw_bifs:neg_guard(4),raw_bifs:neg_guard(no), ' +
    'raw_bifs:add_guard(1,2),raw_bifs:add_guard(1 bsl 80,1),raw_bifs:add_guard(no,2), ' +
    'raw_bifs:add_body(1,2),Exception(fun() -> raw_bifs:add_body(no,2) end), ' +
    'raw_bifs:part_guard(<<"abc">>,1,2),raw_bifs:part_guard(<<"abc">>,2,2),' +
    'raw_bifs:part_guard(no,1,1)] end, ' +
    'ExpectedBifs=[true,7,failed,failed,7,{error,badarg},b,failed,-4,failed,' +
    '3,(1 bsl 80)+1,failed,3,{error,badarith},<<"bc">>,failed,failed], ' +
    'ExpectedBifs=CheckBifs(), ' +
    '{module,raw_bifs}=code:load_binary(raw_bifs,"raw_bifs-stripped",StrippedBifs), ' +
    'ExpectedBifs=CheckBifs(), ' +
    '{beam_file,raw_bifs,_,_,_,BifFs}=beam_disasm:file(Bifs), ' +
    'lists:foreach(fun({Name,Op}) -> {function,Name,_,_,Ops}=lists:keyfind(Name,2,BifFs), ' +
    'true=lists:member(Op,Ops) end, [' +
    '{self_pid,{bif,self,nofail,[],{x,0}}},' +
    '{head_guard,{bif,hd,{f,5},[{x,0}],{x,0}}},' +
    '{head_body,{bif,hd,{f,0},[{x,0}],{x,0}}},' +
    '{element_guard,{bif,element,{f,10},[{x,0},{x,1}],{x,0}}},' +
    "{neg_guard,{gc_bif,'-',{f,13},1,[{x,0}],{x,0}}}," +
    "{add_guard,{gc_bif,'+',{f,16},2,[{x,0},{x,1}],{x,0}}}," +
    "{add_body,{gc_bif,'+',{f,0},2,[{x,0},{x,1}],{x,0}}}," +
    '{part_guard,{gc_bif,binary_part,{f,21},3,[{x,0},{x,1},{x,2}],{x,0}}}]), halt().',
    '-extra', dir],
  {encoding: 'utf8', timeout: 30000});

  for (const [index, {op, opcode, arity, bytes, stack}] of cases.entries()) {
    const code = codeChunk(readFileSync(join(dir, `raw_encoding_${index}.beam`)));
    const setup = stack === undefined ? [] : [12, 0x10, arity << 4, 64, stack << 4 | 3, 0x04];
    const cleanup = stack === undefined ? [] : [18, 0x10];
    assert.deepEqual(code, Buffer.from([
      1, 0x10, 2, 0x12, 0x22, arity << 4, 1, 0x20,
      ...setup,
      opcode, 0x35, ...bytes,
      64, 0x32, 0x03, ...cleanup, 19, 1, 0x30, 64, 0x42, 0x03, ...cleanup, 19, 3,
    ]), `raw encoding case ${index} (${op})`);
  }
  for (const index of noTypeIndices) {
    const original = readFileSync(join(dir, `raw_encoding_${index}.beam`));
    const without = uncompressed(readFileSync(join(dir, `raw_encoding_${index}-no-type.beam`)));
    assert.throws(() => chunk(without, 'Type'), /fixture has no Type chunk/);
    assert.deepEqual(codeChunk(without), codeChunk(original), 'removing Type preserves the raw code stream');
  }
  const flow = readFileSync(join(dir, 'raw_control_flow.beam'));
  assert.deepEqual(codeChunk(flow), Buffer.from([
    1, 0x10, 2, 0x12, 0x22, 0x10, 1, 0x20, 19,
    1, 0x30, 2, 0x12, 0x32, 0x10, 1, 0x40, 6, 0x10, 0x25,
    1, 0x50, 2, 0x12, 0x42, 0x10, 1, 0x60, 78, 0x10, 0x00,
    1, 0x70, 2, 0x12, 0x62, 0x00, 1, 0x80, 61, 0x95,
    64, 0x72, 0x03, 19, 1, 0x90, 64, 0x09, 0x2a, 0x03, 19,
    1, 0xa0, 2, 0x12, 0x82, 0x00, 1, 0xb0, 64, 0x92, 0x03, 19,
    1, 0xc0, 2, 0x12, 0xa2, 0x00, 1, 0xd0, 64, 0x19, 0xff, 0xff, 0x03, 19,
    1, 0xe0, 2, 0x12, 0xb2, 0x20, 1, 0xf0, 64, 0x13, 0x03, 19, 3,
  ]), 'raw control-flow instruction stream');
  assert.deepEqual(chunk(flow, 'ImpT'), Buffer.from([
    0, 0, 0, 1, 0, 0, 0, 5, 0, 0, 0, 2, 0, 0, 0, 1,
  ]), 'external tail-call import table entry');
  const strippedFlow = uncompressed(readFileSync(join(dir, 'raw_control_flow-stripped.beam')));
  assert.deepEqual(codeChunk(strippedFlow), codeChunk(flow), 'stripping preserves the control-flow code stream');
  assert.deepEqual(chunk(strippedFlow, 'ImpT'), chunk(flow, 'ImpT'), 'stripping preserves the import table');
  const select = readFileSync(join(dir, 'raw_select.beam'));
  assert.deepEqual(codeChunk(select), Buffer.from([
    // Atom choices.
    1, 16, 2, 18, 34, 16, 1, 32, 59, 3, 53, 23, 64, 50, 69, 66, 85,
    1, 48, 64, 82, 3, 19, 1, 64, 64, 98, 3, 19, 1, 80, 64, 114, 3, 19,
    // Integer choices.
    1, 96, 2, 18, 130, 16, 1, 112, 59, 3, 133, 23, 64,
    25, 255, 255, 149, 25, 8, 0, 165, 1, 128, 64, 82, 3, 19,
    1, 144, 64, 98, 3, 19, 1, 160, 64, 114, 3, 19,
    // Tuple arities.
    1, 176, 2, 18, 146, 16, 1, 192, 57, 213, 3,
    60, 3, 213, 23, 64, 16, 229, 32, 245,
    1, 208, 64, 82, 3, 19, 1, 224, 64, 98, 3, 19, 1, 240, 64, 114, 3, 19,
    // Float choices use literal-table indexes.
    1, 8, 16, 2, 18, 162, 16, 1, 8, 17, 59, 3, 13, 18, 23, 64,
    71, 0, 13, 19, 71, 16, 13, 20, 1, 8, 18, 64, 82, 3, 19,
    1, 8, 19, 64, 98, 3, 19, 1, 8, 20, 64, 114, 3, 19, 3,
  ]), 'raw selection instruction stream');
  const strippedSelect = uncompressed(readFileSync(join(dir, 'raw_select-stripped.beam')));
  assert.deepEqual(codeChunk(strippedSelect), codeChunk(select), 'stripping preserves the selection code stream');
  const bifs = readFileSync(join(dir, 'raw_bifs.beam'));
  assert.deepEqual(codeChunk(bifs), Buffer.from([
    // bif0 self/0.
    1, 16, 2, 18, 34, 0, 1, 32, 9, 0, 3, 19,
    // bif1 hd/1 with a failure label, then with exception label zero.
    1, 48, 2, 18, 82, 16, 1, 64, 10, 85, 16, 3, 3, 19,
    1, 80, 64, 114, 3, 19, 1, 96, 2, 18, 130, 16, 1, 112, 10, 5, 16, 3, 3, 19,
    // bif2 element/2.
    1, 128, 2, 18, 146, 32, 1, 144, 11, 165, 32, 3, 19, 3, 19,
    1, 160, 64, 114, 3, 19,
    // gc_bif1 -/1.
    1, 176, 2, 18, 178, 16, 1, 192, 124, 213, 16, 48, 3, 3, 19,
    1, 208, 64, 114, 3, 19,
    // gc_bif2 +/2 with a failure label, then with exception label zero.
    1, 224, 2, 18, 210, 32, 1, 240, 125, 13, 16, 32, 64, 3, 19, 3, 19,
    1, 8, 16, 64, 114, 3, 19, 1, 8, 17, 2, 18, 242, 32, 1, 8, 18,
    125, 5, 32, 64, 3, 19, 3, 19,
    // gc_bif3 binary_part/3.
    1, 8, 19, 2, 18, 10, 16, 48, 1, 8, 20, 152, 13, 21, 48, 80, 3, 19, 35, 3, 19,
    1, 8, 21, 64, 114, 3, 19, 3,
  ]), 'raw BIF instruction stream');
  assert.deepEqual(chunk(bifs, 'ImpT'), Buffer.from([
    0, 0, 0, 6, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0,
    0, 0, 0, 3, 0, 0, 0, 6, 0, 0, 0, 1,
    0, 0, 0, 3, 0, 0, 0, 10, 0, 0, 0, 2,
    0, 0, 0, 3, 0, 0, 0, 12, 0, 0, 0, 1,
    0, 0, 0, 3, 0, 0, 0, 14, 0, 0, 0, 2,
    0, 0, 0, 3, 0, 0, 0, 17, 0, 0, 0, 3,
  ]), 'raw BIF import table');
  const strippedBifs = uncompressed(readFileSync(join(dir, 'raw_bifs-stripped.beam')));
  assert.deepEqual(codeChunk(strippedBifs), codeChunk(bifs), 'stripping preserves the BIF code stream');
  assert.deepEqual(chunk(strippedBifs, 'ImpT'), chunk(bifs, 'ImpT'), 'stripping preserves the BIF imports');
  const expectedGuards = [
    ['integer', 45, [5, 3], [3, 0]],
    ['number', 47, [5, 6], [3, 0]],
    ['atom', 48, [5, 9], [3, 0]],
    ['boolean', 114, [5, 12], [3, 0]],
    ['float', 46, [5, 15], [3, 0]],
    ['binary', 53, [5, 18], [3, 0]],
    ['bitstring', 129, [5, 21], [3, 0]],
    ['less', 39, [5, 24], [3, 0], [3, 1]],
    ['different', 43, [5, 27], [3, 0], [3, 1]],
  ];
  const guards = readFileSync(join(dir, 'guards.beam'));
  const stripped = uncompressed(readFileSync(join(dir, 'guards-stripped.beam')));
  assert.deepEqual(guardInstructions(guards), expectedGuards, 'raw compiler-generated guard instructions');
  assert.deepEqual(codeChunk(stripped), codeChunk(guards), 'stripping preserves this fixture\'s code stream');
  assert.deepEqual(guardInstructions(stripped), expectedGuards, 'raw stripped guard instructions');
  console.log(`Verified ${cases.length} raw guard encodings, control-flow, selection and BIF forms, and type metadata fallback`);
} finally {
  rmSync(dir, {recursive: true, force: true});
}
