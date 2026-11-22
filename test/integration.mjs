import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Runtime} from '../runtime/beam2js.mjs';

const dir = mkdtempSync(join(tmpdir(), 'beam2js-test-'));
const compiler = resolve('_build/default/bin/beam2js');
const run = (command, args) => execFileSync(command, args, {encoding: 'utf8', timeout: 30000});

try {
  run('erlc', ['-o', dir, 'fixtures/slice.erl', 'fixtures/slice_helper.erl',
    'fixtures/unsupported.erl', 'fixtures/on_load.erl']);
  const slice = join(dir, 'slice.beam');
  const output = join(dir, 'slice.mjs');
  const helperOutput = join(dir, 'slice_helper.mjs');
  run(compiler, [slice, output]);
  run(compiler, [join(dir, 'slice_helper.beam'), helperOutput]);
  const arithmeticOutput = join(dir, 'arithmetic.mjs');
  run(compiler, [join(dir, 'unsupported.beam'), arithmeticOutput]);
  const firstOutput = readFileSync(output, 'utf8');
  assert.match(firstOutput, /runtime\.registerModule\(26,/);
  run(compiler, [slice, output]);
  assert.equal(readFileSync(output, 'utf8'), firstOutput, 'emission must be deterministic');

  const runtime = new Runtime();
  (await import(pathToFileURL(output))).register(runtime);
  (await import(pathToFileURL(helperOutput))).register(runtime);
  (await import(pathToFileURL(arithmeticOutput))).register(runtime);
  const yes = runtime.atom('yes');
  const no = runtime.atom('no');
  const large = 123456789012345678901234567890n;
  const results = [
    runtime.invoke('slice', 'id', [large]),
    runtime.invoke('slice', 'value', []),
    runtime.invoke('slice', 'choose', [yes]),
    runtime.invoke('slice', 'choose', [no]),
    runtime.invoke('slice', 'only', [yes]),
    runtime.invoke('slice', 'local', [42n]),
    runtime.invoke('slice', 'remote', [42n]),
    runtime.invoke('slice', 'choose_number', [1n]),
    runtime.invoke('slice', 'choose_number', [runtime.atom('1')]),
  ];
  const oracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    'io:format("~w~n~w~n~w~n~w~n~w~n~w~n~w~n~w~n~w~n", ' +
    '[slice:id(123456789012345678901234567890),slice:value(),slice:choose(yes),' +
    'slice:choose(no),slice:only(yes),slice:local(42),slice:remote(42),' +
    "slice:choose_number(1),slice:choose_number('1')]),halt()."]);
  assert.equal(results.map(String).join('\n') + '\n', oracle);
  assert.equal(runtime.invoke('slice', 'strange', []), runtime.atom('quote"back\\slash'));
  assert.equal(runtime.invoke('slice', 'unicode_atom', []), runtime.atom('\u{1f600}'));
  assert.equal(runtime.invoke('unsupported', 'add', [2n, 3n]), 5n);
  assert.throws(() => runtime.invoke('unsupported', 'add', [yes, 3n]), /badarith/);
  assert.throws(() => runtime.invoke('slice', 'only', [no]), /function_clause/);
  assert.throws(() => runtime.invoke('slice', 'private', [42n]), /undefined or unsupported/);
  assert.throws(() => runtime.invoke('slice', 'module_info', []), /undefined or unsupported/);
  assert.throws(() => runtime.invoke('slice', 'id', [42]), /supported Erlang terms/);
  for (const version of [1, 18, 19, 20, 21, 22, 23, 24, 25, 27]) {
    assert.throws(() => runtime.registerModule(version, 'bad', []), /unsupported runtime ABI/);
  }

  const stripped = join(dir, 'stripped.beam');
  run('erl', ['-noshell', '-eval',
    '[Input,Output]=init:get_plain_arguments(), {ok,B}=file:read_file(Input), ' +
    '{ok,{_,S}}=beam_lib:strip(B), ok=file:write_file(Output,S), halt().',
    '-extra', slice, stripped]);
  const strippedOutput = join(dir, 'stripped.mjs');
  run(compiler, [stripped, strippedOutput]);
  const strippedRuntime = new Runtime();
  (await import(pathToFileURL(strippedOutput))).register(strippedRuntime);
  assert.equal(strippedRuntime.invoke('slice', 'choose', [yes]), 1n);

  writeFileSync(output, 'existing output');
  const unsupported = spawnSync(compiler, [join(dir, 'on_load.beam'), output],
    {encoding: 'utf8', timeout: 30000});
  assert.notEqual(unsupported.status, 0);
  assert.match(unsupported.stderr, /unsupported instruction on_load/);
  assert.equal(readFileSync(output, 'utf8'), 'existing output');
  const missingOutput = join(dir, 'should-not-exist.mjs');
  const onLoad = spawnSync(compiler, [join(dir, 'on_load.beam'), missingOutput],
    {encoding: 'utf8', timeout: 30000});
  assert.notEqual(onLoad.status, 0);
  assert.match(onLoad.stderr, /unsupported instruction on_load/);
  assert.throws(() => readFileSync(missingOutput), {code: 'ENOENT'});
  const malformed = join(dir, 'malformed.beam');
  writeFileSync(malformed, 'not a BEAM file');
  const invalid = spawnSync(compiler, [malformed, output], {encoding: 'utf8', timeout: 30000});
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /cannot disassemble BEAM/);
  assert.equal(readFileSync(output, 'utf8'), 'existing output');
  run('erl', ['-noshell', '-eval',
    '[Dir]=init:get_plain_arguments(), Build=fun(Module,Instruction)->' +
    'Is=[{label,1},{func_info,{atom,Module},{atom,f},1},{label,2},' +
    'Instruction,return], ' +
    '{ok,B}=beam_asm:module({Module,[{f,1}],[],#{},[{function,f,1,2,Is}],3},[],[],[]), ' +
    'ok=file:write_file(filename:join(Dir,atom_to_list(Module)++".beam"),B) end, ' +
    'Build(tuple_bad_x,{put_tuple2,{x,1024},{list,[{x,0}]}}), ' +
    'Build(tuple_bad_y,{put_tuple2,{y,1024},{list,[{x,0}]}}), ' +
    'Build(tuple_no_frame,{put_tuple2,{y,0},{list,[{x,0}]}}), ' +
    'Build(element_bad_x,{get_tuple_element,{x,0},0,{x,1024}}), ' +
    'Build(element_bad_y,{get_tuple_element,{x,0},0,{y,1024}}), ' +
    'Build(element_no_frame,{get_tuple_element,{x,0},0,{y,0}}), ' +
    'Build(list_bad_head,{get_list,{x,0},{x,1024},{y,0}}), ' +
    'Build(list_bad_tail,{get_list,{x,0},{x,0},{y,1024}}), ' +
    'Build(list_same_x,{get_list,{x,0},{x,0},{x,0}}), ' +
    'Build(list_same_y,{get_list,{x,0},{y,0},{y,0}}), ' +
    'Build(list_no_frame,{get_list,{x,0},{x,0},{y,0}}), ' +
    'Build(put_bad_x,{put_list,{x,0},nil,{x,1024}}), ' +
    'Build(put_bad_y,{put_list,{x,0},nil,{y,1024}}), ' +
    'Build(put_bad_head,{put_list,{x,1024},nil,{y,0}}), ' +
    'Build(put_bad_tail,{put_list,{x,0},{y,1024},{y,0}}), ' +
    'Build(put_no_frame,{put_list,{x,0},nil,{y,0}}), ' +
    'Build(put_no_source,{put_list,{y,0},nil,{x,0}}), ' +
    'Build(hd_bad_x,{get_hd,{x,0},{x,1024}}), ' +
    'Build(hd_bad_y,{get_hd,{x,0},{y,1024}}), ' +
    'Build(tl_bad_x,{get_tl,{x,0},{x,1024}}), ' +
    'Build(tl_bad_y,{get_tl,{x,0},{y,1024}}), ' +
    'Build(hd_bad_source,{get_hd,{x,1024},{y,0}}), ' +
    'Build(tl_bad_source,{get_tl,{y,1024},{y,0}}), ' +
    'Build(hd_no_frame,{get_hd,{x,0},{y,0}}), ' +
    'Build(tl_no_frame,{get_tl,{x,0},{y,0}}), ' +
    'Build(hd_bif_bad_x,{bif,hd,{f,0},[{x,0}],{x,1024}}), ' +
    'Build(hd_bif_bad_y,{bif,hd,{f,0},[{x,0}],{y,1024}}), ' +
    'Build(tl_bif_bad_y,{bif,tl,{f,0},[{x,0}],{y,1024}}), ' +
    'Build(size_bif_bad_y,{bif,tuple_size,{f,0},[{x,0}],{y,1024}}), ' +
    'Build(element_bif_bad_y,{bif,element,{f,0},[{integer,1},{x,0}],{y,1024}}), ' +
    'Build(hd_bif_missing_label,{bif,hd,{f,3},[{x,0}],{y,0}}), ' +
    'Build(hd_bif_no_frame,{bif,hd,{f,0},[{x,0}],{y,0}}), ' +
    'Build(tl_bif_no_frame,{bif,tl,{f,0},[{x,0}],{y,0}}), ' +
    'Build(size_bif_no_frame,{bif,tuple_size,{f,0},[{x,0}],{y,0}}), ' +
    'Build(element_bif_no_frame,{bif,element,{f,0},[{integer,1},{x,0}],{y,0}}), ' +
    'Build(length_bif_y,{gc_bif,length,{f,0},1,[{x,0}],{y,0}}), ' +
    'Build(length_bif_bad_x,{gc_bif,length,{f,0},1,[{x,0}],{x,1024}}), ' +
    'Build(length_bif_bad_y,{gc_bif,length,{f,0},1,[{x,0}],{y,1024}}), ' +
    'Build(length_bif_bad_source,{gc_bif,length,{f,0},1,[{y,1024}],{y,0}}), ' +
    'Build(length_bif_missing_label,{gc_bif,length,{f,3},1,[{x,0}],{y,0}}), ' +
    'Build(length_bif_live_limit,{gc_bif,length,{f,0},1025,[{x,0}],{y,0}}), ' +
    'Build(length_bif_live_max,{gc_bif,length,{f,0},1024,[{x,0}],{y,0}}), ' +
    'Build(bits_bif_bad_x,{gc_bif,bit_size,{f,0},1,[{x,0}],{x,1024}}), ' +
    'Build(bits_bif_bad_y,{gc_bif,bit_size,{f,0},1,[{x,0}],{y,1024}}), ' +
    'Build(bytes_bif_bad_y,{gc_bif,byte_size,{f,0},1,[{x,0}],{y,1024}}), ' +
    'Build(bits_bif_bad_source,{gc_bif,bit_size,{f,0},1,[{y,1024}],{y,0}}), ' +
    'Build(bits_bif_missing_label,{gc_bif,bit_size,{f,3},1,[{x,0}],{y,0}}), ' +
    'Build(bytes_bif_live_limit,{gc_bif,byte_size,{f,0},1025,[{x,0}],{y,0}}), ' +
    'Build(bits_bif_live_max,{gc_bif,bit_size,{f,0},1024,[{x,0}],{y,0}}), ' +
    'Build(bytes_bif_no_frame,{gc_bif,byte_size,{f,0},1,[{x,0}],{y,0}}), ' +
    'Build(part2_bif_bad_x,{gc_bif,binary_part,{f,0},1,[{x,0},{literal,{0,0}}],{x,1024}}), ' +
    'Build(part2_bif_bad_y,{gc_bif,binary_part,{f,0},1,[{x,0},{literal,{0,0}}],{y,1024}}), ' +
    'Build(part3_bif_bad_y,{gc_bif,binary_part,{f,0},1,[{x,0},{integer,0},{integer,0}],{y,1024}}), ' +
    'Build(part2_bif_bad_source,{gc_bif,binary_part,{f,0},1,[{x,0},{y,1024}],{y,0}}), ' +
    'Build(part3_bif_bad_source,{gc_bif,binary_part,{f,0},1,[{x,0},{integer,0},{y,1024}],{y,0}}), ' +
    'Build(part2_bif_missing_label,{gc_bif,binary_part,{f,3},1,[{x,0},{literal,{0,0}}],{y,0}}), ' +
    'Build(part2_bif_live_limit,{gc_bif,binary_part,{f,0},1025,[{x,0},{literal,{0,0}}],{y,0}}), ' +
    'Build(part3_bif_live_limit,{gc_bif,binary_part,{f,0},1025,[{x,0},{integer,0},{integer,0}],{y,0}}), ' +
    'Build(part2_bif_live_max,{gc_bif,binary_part,{f,0},1024,[{x,0},{literal,{0,0}}],{y,0}}), ' +
    'Build(part3_bif_no_frame,{gc_bif,binary_part,{f,0},1,[{x,0},{integer,0},{integer,0}],{y,0}}), ' +
    'Build(bnot_bif_bad_x,{gc_bif,\'bnot\',{f,0},1,[{x,0}],{x,1024}}), ' +
    'Build(bnot_bif_bad_y,{gc_bif,\'bnot\',{f,0},1,[{x,0}],{y,1024}}), ' +
    'Build(band_bif_bad_y,{gc_bif,\'band\',{f,0},1,[{x,0},{integer,1}],{y,1024}}), ' +
    'Build(bnot_bif_bad_source,{gc_bif,\'bnot\',{f,0},1,[{y,1024}],{y,0}}), ' +
    'Build(band_bif_bad_source,{gc_bif,\'band\',{f,0},1,[{x,0},{y,1024}],{y,0}}), ' +
    'Build(band_bif_missing_label,{gc_bif,\'band\',{f,3},1,[{x,0},{integer,1}],{y,0}}), ' +
    'Build(bnot_bif_live_limit,{gc_bif,\'bnot\',{f,0},1025,[{x,0}],{y,0}}), ' +
    'Build(band_bif_live_limit,{gc_bif,\'band\',{f,0},1025,[{x,0},{integer,1}],{y,0}}), ' +
    'Build(bnot_bif_live_max,{gc_bif,\'bnot\',{f,0},1024,[{x,0}],{y,0}}), ' +
    'Build(band_bif_no_frame,{gc_bif,\'band\',{f,0},1,[{x,0},{integer,1}],{y,0}}), ' +
    'Build(div_bif_bad_x,{gc_bif,\'div\',{f,0},1,[{x,0},{integer,1}],{x,1024}}), ' +
    'Build(div_bif_bad_y,{gc_bif,\'div\',{f,0},1,[{x,0},{integer,1}],{y,1024}}), ' +
    'Build(rem_bif_bad_y,{gc_bif,\'rem\',{f,0},1,[{x,0},{integer,1}],{y,1024}}), ' +
    'Build(div_bif_bad_source,{gc_bif,\'div\',{f,0},1,[{x,1024},{integer,1}],{y,0}}), ' +
    'Build(rem_bif_bad_source,{gc_bif,\'rem\',{f,0},1,[{x,0},{y,1024}],{y,0}}), ' +
    'Build(div_bif_missing_label,{gc_bif,\'div\',{f,3},1,[{x,0},{integer,1}],{y,0}}), ' +
    'Build(rem_bif_missing_label,{gc_bif,\'rem\',{f,3},1,[{x,0},{integer,1}],{y,0}}), ' +
    'Build(div_bif_live_limit,{gc_bif,\'div\',{f,0},1025,[{x,0},{integer,1}],{y,0}}), ' +
    'Build(rem_bif_live_limit,{gc_bif,\'rem\',{f,0},1025,[{x,0},{integer,1}],{y,0}}), ' +
    'Build(div_bif_live_max,{gc_bif,\'div\',{f,0},1024,[{x,0},{integer,1}],{y,0}}), ' +
    'Build(rem_bif_no_frame,{gc_bif,\'rem\',{f,0},1,[{x,0},{x,0}],{y,0}}), ' +
    'Build(add_bif_bad_x,{gc_bif,\'+\',{f,0},1,[{x,0},{integer,1}],{x,1024}}), ' +
    'Build(add_bif_bad_y,{gc_bif,\'+\',{f,0},1,[{x,0},{integer,1}],{y,1024}}), ' +
    'Build(subtract_bif_bad_y,{gc_bif,\'-\',{f,0},1,[{x,0},{integer,1}],{y,1024}}), ' +
    'Build(multiply_bif_bad_y,{gc_bif,\'*\',{f,0},1,[{x,0},{integer,1}],{y,1024}}), ' +
    'Build(divide_bif_bad_y,{gc_bif,\'/\',{f,0},1,[{x,0},{integer,1}],{y,1024}}), ' +
    'Build(add_bif_bad_source,{gc_bif,\'+\',{f,0},1,[{x,1024},{integer,1}],{y,0}}), ' +
    'Build(divide_bif_bad_source,{gc_bif,\'/\',{f,0},1,[{x,0},{y,1024}],{y,0}}), ' +
    'Build(add_bif_missing_label,{gc_bif,\'+\',{f,3},1,[{x,0},{integer,1}],{y,0}}), ' +
    'Build(divide_bif_missing_label,{gc_bif,\'/\',{f,3},1,[{x,0},{integer,1}],{y,0}}), ' +
    'Build(add_bif_live_limit,{gc_bif,\'+\',{f,0},1025,[{x,0},{integer,1}],{y,0}}), ' +
    'Build(divide_bif_live_limit,{gc_bif,\'/\',{f,0},1025,[{x,0},{integer,1}],{y,0}}), ' +
    'Build(add_bif_live_max,{gc_bif,\'+\',{f,0},1024,[{x,0},{integer,1}],{y,0}}), ' +
    'Build(divide_bif_no_frame,{gc_bif,\'/\',{f,0},1,[{x,0},{x,0}],{y,0}}), ' +
    'Build(negate_bif_bad_x,{gc_bif,\'-\',{f,0},1,[{x,0}],{x,1024}}), ' +
    'Build(negate_bif_bad_y,{gc_bif,\'-\',{f,0},1,[{x,0}],{y,1024}}), ' +
    'Build(abs_bif_bad_y,{gc_bif,abs,{f,0},1,[{x,0}],{y,1024}}), ' +
    'Build(negate_bif_bad_source,{gc_bif,\'-\',{f,0},1,[{x,1024}],{y,0}}), ' +
    'Build(abs_bif_bad_source,{gc_bif,abs,{f,0},1,[{y,1024}],{y,0}}), ' +
    'Build(negate_bif_missing_label,{gc_bif,\'-\',{f,3},1,[{x,0}],{y,0}}), ' +
    'Build(abs_bif_missing_label,{gc_bif,abs,{f,3},1,[{x,0}],{y,0}}), ' +
    'Build(negate_bif_live_limit,{gc_bif,\'-\',{f,0},1025,[{x,0}],{y,0}}), ' +
    'Build(abs_bif_live_limit,{gc_bif,abs,{f,0},1025,[{x,0}],{y,0}}), ' +
    'Build(negate_bif_live_max,{gc_bif,\'-\',{f,0},1024,[{x,0}],{y,0}}), ' +
    'Build(abs_bif_no_frame,{gc_bif,abs,{f,0},1,[{x,0}],{y,0}}), ' +
    'Build(trunc_bif_bad_x,{gc_bif,trunc,{f,0},1,[{x,0}],{x,1024}}), ' +
    'Build(trunc_bif_bad_y,{gc_bif,trunc,{f,0},1,[{x,0}],{y,1024}}), ' +
    'Build(round_bif_bad_y,{gc_bif,round,{f,0},1,[{x,0}],{y,1024}}), ' +
    'Build(floor_bif_bad_y,{gc_bif,floor,{f,0},1,[{x,0}],{y,1024}}), ' +
    'Build(ceil_bif_bad_y,{gc_bif,ceil,{f,0},1,[{x,0}],{y,1024}}), ' +
    'Build(float_bif_bad_y,{gc_bif,float,{f,0},1,[{x,0}],{y,1024}}), ' +
    'Build(round_bif_bad_source,{gc_bif,round,{f,0},1,[{x,1024}],{y,0}}), ' +
    'Build(float_bif_bad_source,{gc_bif,float,{f,0},1,[{y,1024}],{y,0}}), ' +
    'Build(round_bif_missing_label,{gc_bif,round,{f,3},1,[{x,0}],{y,0}}), ' +
    'Build(float_bif_missing_label,{gc_bif,float,{f,3},1,[{x,0}],{y,0}}), ' +
    'Build(trunc_bif_live_limit,{gc_bif,trunc,{f,0},1025,[{x,0}],{y,0}}), ' +
    'Build(float_bif_live_limit,{gc_bif,float,{f,0},1025,[{x,0}],{y,0}}), ' +
    'Build(trunc_bif_live_max,{gc_bif,trunc,{f,0},1024,[{x,0}],{y,0}}), ' +
    'Build(round_bif_no_frame,{gc_bif,round,{f,0},1,[{x,0}],{y,0}}), ' +
    'Build(floor_bif_no_frame,{gc_bif,floor,{f,0},1,[{x,0}],{y,0}}), ' +
    'Build(ceil_bif_no_frame,{gc_bif,ceil,{f,0},1,[{x,0}],{y,0}}), ' +
    'Build(float_bif_no_frame,{gc_bif,float,{f,0},1,[{x,0}],{y,0}}), ' +
    'Build(exact_bif_bad_x,{bif,\'=:=\',{f,0},[{x,0},{integer,1}],{x,1024}}), ' +
    'Build(exact_bif_bad_y,{bif,\'=:=\',{f,0},[{x,0},{integer,1}],{y,1024}}), ' +
    'Build(exact_bif_bad_source,{bif,\'=:=\',{f,0},[{x,0},{y,1024}],{y,0}}), ' +
    'Build(exact_bif_nonzero,{bif,\'=:=\',{f,3},[{x,0},{integer,1}],{y,0}}), ' +
    'Build(exact_bif_no_frame,{bif,\'=:=\',{f,0},[{x,0},{integer,1}],{y,0}}), ' +
    'Build(predicate_bad_x,{bif,is_number,{f,0},[{x,0}],{x,1024}}), ' +
    'Build(predicate_bad_y,{bif,is_number,{f,0},[{x,0}],{y,1024}}), ' +
    'Build(predicate_bad_source,{bif,is_number,{f,0},[{y,1024}],{y,0}}), ' +
    'Build(predicate_nonzero,{bif,is_number,{f,3},[{x,0}],{y,0}}), ' +
    'Build(predicate_no_frame,{bif,is_number,{f,0},[{x,0}],{y,0}}), ' +
    'Build(predicate_max_y,{bif,is_number,{f,0},[{x,0}],{y,1023}}),halt().',
    '-extra', dir]);
  for (const [module, register] of [['tuple_bad_x', 'x'], ['tuple_bad_y', 'y'],
    ['element_bad_x', 'x'], ['element_bad_y', 'y'],
    ['list_bad_head', 'x'], ['list_bad_tail', 'y'], ['put_bad_x', 'x'], ['put_bad_y', 'y'],
    ['hd_bad_x', 'x'], ['hd_bad_y', 'y'], ['tl_bad_x', 'x'], ['tl_bad_y', 'y'],
    ['hd_bif_bad_x', 'x'], ['hd_bif_bad_y', 'y'], ['tl_bif_bad_y', 'y'],
    ['size_bif_bad_y', 'y'], ['element_bif_bad_y', 'y'],
    ['length_bif_bad_x', 'x'], ['length_bif_bad_y', 'y'],
    ['bits_bif_bad_x', 'x'], ['bits_bif_bad_y', 'y'], ['bytes_bif_bad_y', 'y'],
    ['part2_bif_bad_x', 'x'], ['part2_bif_bad_y', 'y'], ['part3_bif_bad_y', 'y'],
    ['bnot_bif_bad_x', 'x'], ['bnot_bif_bad_y', 'y'], ['band_bif_bad_y', 'y'],
    ['div_bif_bad_x', 'x'], ['div_bif_bad_y', 'y'], ['rem_bif_bad_y', 'y'],
    ['add_bif_bad_x', 'x'], ['add_bif_bad_y', 'y'], ['subtract_bif_bad_y', 'y'],
    ['multiply_bif_bad_y', 'y'], ['divide_bif_bad_y', 'y'],
    ['negate_bif_bad_x', 'x'], ['negate_bif_bad_y', 'y'], ['abs_bif_bad_y', 'y'],
    ['trunc_bif_bad_x', 'x'], ['trunc_bif_bad_y', 'y'], ['round_bif_bad_y', 'y'],
    ['floor_bif_bad_y', 'y'], ['ceil_bif_bad_y', 'y'], ['float_bif_bad_y', 'y'],
    ['exact_bif_bad_x', 'x'], ['exact_bif_bad_y', 'y'],
    ['predicate_bad_x', 'x'], ['predicate_bad_y', 'y']]) {
    const result = spawnSync(compiler, [join(dir, `${module}.beam`), output],
      {encoding: 'utf8', timeout: 30000});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`unsupported register \\{${register},1024\\}`));
    assert.equal(readFileSync(output, 'utf8'), 'existing output');
  }
  const missingFrameOutput = join(dir, 'tuple_no_frame.mjs');
  run(compiler, [join(dir, 'tuple_no_frame.beam'), missingFrameOutput]);
  (await import(pathToFileURL(missingFrameOutput))).register(runtime);
  assert.throws(() => runtime.invoke('tuple_no_frame', 'f', [1n]), /invalid y register 0/);
  const missingElementFrameOutput = join(dir, 'element_no_frame.mjs');
  run(compiler, [join(dir, 'element_no_frame.beam'), missingElementFrameOutput]);
  (await import(pathToFileURL(missingElementFrameOutput))).register(runtime);
  assert.throws(() => runtime.invoke('element_no_frame', 'f', [runtime.tuple([1n])]), /invalid y register 0/);
  assert.throws(() => runtime.invoke('element_no_frame', 'f', [1n]), /expected Erlang tuple/);
  assert.throws(() => runtime.invoke('element_no_frame', 'f', [runtime.tuple([])]), /invalid tuple index/);
  for (const module of ['list_same_x', 'list_same_y']) {
    const result = spawnSync(compiler, [join(dir, `${module}.beam`), output],
      {encoding: 'utf8', timeout: 30000});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unsupported instruction \{get_list/);
    assert.equal(readFileSync(output, 'utf8'), 'existing output');
  }
  const missingListFrameOutput = join(dir, 'list_no_frame.mjs');
  run(compiler, [join(dir, 'list_no_frame.beam'), missingListFrameOutput]);
  (await import(pathToFileURL(missingListFrameOutput))).register(runtime);
  assert.throws(() => runtime.invoke('list_no_frame', 'f', [runtime.cons(1n, runtime.nil())]), /invalid y register 0/);
  assert.throws(() => runtime.invoke('list_no_frame', 'f', [runtime.nil()]), /expected nonempty Erlang list/);
  for (const [module, register] of [['put_bad_head', 'x'], ['put_bad_tail', 'y'],
    ['hd_bad_source', 'x'], ['tl_bad_source', 'y'], ['length_bif_bad_source', 'y'],
    ['bits_bif_bad_source', 'y'], ['part2_bif_bad_source', 'y'], ['part3_bif_bad_source', 'y'],
    ['bnot_bif_bad_source', 'y'], ['band_bif_bad_source', 'y'],
    ['div_bif_bad_source', 'x'], ['rem_bif_bad_source', 'y'],
    ['add_bif_bad_source', 'x'], ['divide_bif_bad_source', 'y'],
    ['negate_bif_bad_source', 'x'], ['abs_bif_bad_source', 'y'],
    ['round_bif_bad_source', 'x'], ['float_bif_bad_source', 'y'],
    ['exact_bif_bad_source', 'y'],
    ['predicate_bad_source', 'y']]) {
    const result = spawnSync(compiler, [join(dir, `${module}.beam`), output],
      {encoding: 'utf8', timeout: 30000});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`unsupported operand \\{${register},1024\\}`));
    assert.equal(readFileSync(output, 'utf8'), 'existing output');
  }
  for (const [module, message] of [['put_no_frame', /invalid y register 0/],
    ['put_no_source', /uninitialized y register 0/]]) {
    const generated = join(dir, `${module}.mjs`);
    run(compiler, [join(dir, `${module}.beam`), generated]);
    (await import(pathToFileURL(generated))).register(runtime);
    assert.throws(() => runtime.invoke(module, 'f', [1n]), message);
  }
  for (const module of ['hd_no_frame', 'tl_no_frame']) {
    const generated = join(dir, `${module}.mjs`);
    run(compiler, [join(dir, `${module}.beam`), generated]);
    (await import(pathToFileURL(generated))).register(runtime);
    assert.throws(() => runtime.invoke(module, 'f', [runtime.cons(1n, runtime.nil())]), /invalid y register 0/);
    assert.throws(() => runtime.invoke(module, 'f', [runtime.nil()]), /expected nonempty Erlang list/);
  }
  for (const [module, message] of [['hd_bif_missing_label', /invalid branch label 3/],
    ['length_bif_missing_label', /invalid branch label 3/],
    ['length_bif_live_limit', /unsupported instruction \{gc_bif,length/],
    ['bits_bif_missing_label', /invalid branch label 3/],
    ['bytes_bif_live_limit', /unsupported instruction \{gc_bif,byte_size/],
    ['part2_bif_missing_label', /invalid branch label 3/],
    ['part2_bif_live_limit', /unsupported instruction \{gc_bif,binary_part/],
    ['part3_bif_live_limit', /unsupported instruction \{gc_bif,binary_part/],
    ['band_bif_missing_label', /invalid branch label 3/],
    ['bnot_bif_live_limit', /unsupported instruction \{gc_bif,'?bnot'?/],
    ['band_bif_live_limit', /unsupported instruction \{gc_bif,'?band'?/],
    ['div_bif_missing_label', /invalid branch label 3/],
    ['rem_bif_missing_label', /invalid branch label 3/],
    ['div_bif_live_limit', /unsupported instruction \{gc_bif,'?div'?/],
    ['rem_bif_live_limit', /unsupported instruction \{gc_bif,'?rem'?/],
    ['add_bif_missing_label', /invalid branch label 3/],
    ['divide_bif_missing_label', /invalid branch label 3/],
    ['add_bif_live_limit', /unsupported instruction \{gc_bif,'\+'/],
    ['divide_bif_live_limit', /unsupported instruction \{gc_bif,'\/'/],
    ['negate_bif_missing_label', /invalid branch label 3/],
    ['abs_bif_missing_label', /invalid branch label 3/],
    ['negate_bif_live_limit', /unsupported instruction \{gc_bif,'-'/],
    ['abs_bif_live_limit', /unsupported instruction \{gc_bif,abs/],
    ['round_bif_missing_label', /invalid branch label 3/],
    ['float_bif_missing_label', /invalid branch label 3/],
    ['trunc_bif_live_limit', /unsupported instruction \{gc_bif,trunc/],
    ['float_bif_live_limit', /unsupported instruction \{gc_bif,float/],
    ['exact_bif_nonzero', /unsupported instruction \{bif,'=:='/],
    ['predicate_nonzero', /unsupported instruction \{bif,is_number/]]) {
    const result = spawnSync(compiler, [join(dir, `${module}.beam`), output],
      {encoding: 'utf8', timeout: 30000});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, message);
    assert.equal(readFileSync(output, 'utf8'), 'existing output');
  }
  for (const [module, value] of [
    ['hd_bif_no_frame', runtime.cons(1n, runtime.nil())],
    ['tl_bif_no_frame', runtime.cons(1n, runtime.nil())],
    ['size_bif_no_frame', runtime.tuple([])],
    ['element_bif_no_frame', runtime.tuple([1n])],
    ['length_bif_y', runtime.nil()],
    ['length_bif_live_max', runtime.nil()],
    ['bits_bif_live_max', runtime.bitstring([128], 1)],
    ['bytes_bif_no_frame', runtime.bitstring([128], 1)],
    ['part2_bif_live_max', runtime.bitstring([], 0)],
    ['part3_bif_no_frame', runtime.bitstring([], 0)],
  ]) {
    const generated = join(dir, `${module}.mjs`);
    run(compiler, [join(dir, `${module}.beam`), generated]);
    (await import(pathToFileURL(generated))).register(runtime);
    assert.throws(() => runtime.invoke(module, 'f', [value]), /invalid y register 0/);
    assert.throws(() => runtime.invoke(module, 'f', [1n]), /badarg/);
  }
  for (const [module, register] of [['predicate_no_frame', 0], ['predicate_max_y', 1023]]) {
    const generated = join(dir, `${module}.mjs`);
    run(compiler, [join(dir, `${module}.beam`), generated]);
    (await import(pathToFileURL(generated))).register(runtime);
    assert.throws(() => runtime.invoke(module, 'f', [1n]), new RegExp(`invalid y register ${register}`));
  }
  for (const module of ['bnot_bif_live_max', 'band_bif_no_frame', 'div_bif_live_max', 'rem_bif_no_frame',
    'add_bif_live_max', 'divide_bif_no_frame', 'negate_bif_live_max']) {
    const generated = join(dir, `${module}.mjs`);
    run(compiler, [join(dir, `${module}.beam`), generated]);
    (await import(pathToFileURL(generated))).register(runtime);
    assert.throws(() => runtime.invoke(module, 'f', [1n]), /invalid y register 0/);
    assert.throws(() => runtime.invoke(module, 'f', [runtime.atom('bad')]), /badarith/);
  }
  assert.throws(() => runtime.invoke('rem_bif_no_frame', 'f', [0n]), /badarith/);
  assert.throws(() => runtime.invoke('divide_bif_no_frame', 'f', [0n]), /badarith/);
  for (const module of ['abs_bif_no_frame', 'trunc_bif_live_max', 'round_bif_no_frame',
    'floor_bif_no_frame', 'ceil_bif_no_frame', 'float_bif_no_frame']) {
    const generated = join(dir, `${module}.mjs`);
    run(compiler, [join(dir, `${module}.beam`), generated]);
    (await import(pathToFileURL(generated))).register(runtime);
    assert.throws(() => runtime.invoke(module, 'f', [1n]), /invalid y register 0/);
    assert.throws(() => runtime.invoke(module, 'f', [runtime.atom('bad')]), /badarg/);
  }
  assert.throws(() => runtime.invoke('float_bif_no_frame', 'f', [1n << 1024n]), /badarg/);
  const missingExactFrame = join(dir, 'exact_bif_no_frame.mjs');
  run(compiler, [join(dir, 'exact_bif_no_frame.beam'), missingExactFrame]);
  (await import(pathToFileURL(missingExactFrame))).register(runtime);
  assert.throws(() => runtime.invoke('exact_bif_no_frame', 'f', [1n]), /invalid y register 0/);
  console.log('Integration tests passed');
} finally {
  rmSync(dir, {recursive: true, force: true});
}
