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
    'Build(list_no_frame,{get_list,{x,0},{x,0},{y,0}}),halt().',
    '-extra', dir]);
  for (const [module, register] of [['tuple_bad_x', 'x'], ['tuple_bad_y', 'y'],
    ['element_bad_x', 'x'], ['element_bad_y', 'y'],
    ['list_bad_head', 'x'], ['list_bad_tail', 'y']]) {
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
  console.log('Integration tests passed');
} finally {
  rmSync(dir, {recursive: true, force: true});
}
