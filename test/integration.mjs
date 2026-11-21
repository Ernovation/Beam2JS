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
  const firstOutput = readFileSync(output, 'utf8');
  assert.match(firstOutput, /runtime\.registerModule\(13,/);
  run(compiler, [slice, output]);
  assert.equal(readFileSync(output, 'utf8'), firstOutput, 'emission must be deterministic');

  const runtime = new Runtime();
  (await import(pathToFileURL(output))).register(runtime);
  (await import(pathToFileURL(helperOutput))).register(runtime);
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
  assert.throws(() => runtime.invoke('slice', 'only', [no]), /function_clause/);
  assert.throws(() => runtime.invoke('slice', 'private', [42n]), /undefined or unsupported/);
  assert.throws(() => runtime.invoke('slice', 'module_info', []), /undefined or unsupported/);
  assert.throws(() => runtime.invoke('slice', 'id', [42]), /supported Erlang terms/);
  assert.throws(() => runtime.registerModule(14, 'bad', []), /unsupported runtime ABI/);
  runtime.registerModule(1, 'abi1', [{
    name: 'id', arity: 1, exported: true,
    run: (rt, x) => ({type: 'return', value: rt.read(x, 0)}),
  }]);
  assert.equal(runtime.invoke('abi1', 'id', [42n]), 42n);
  runtime.registerModule(2, 'abi2', [{
    name: 'id', arity: 1, exported: true,
    run: (rt, x) => ({type: 'return', value: rt.read(x, 0)}),
  }]);
  assert.equal(runtime.invoke('abi2', 'id', [42n]), 42n);
  runtime.registerModule(3, 'abi3', [{
    name: 'id', arity: 1, exported: true,
    run: (rt, x) => ({type: 'return', value: rt.read(x, 0)}),
  }]);
  assert.equal(runtime.invoke('abi3', 'id', [42n]), 42n);
  runtime.registerModule(4, 'abi4', [{
    name: 'id', arity: 1, exported: true,
    run: (rt, x) => ({type: 'return', value: rt.read(x, 0)}),
  }]);
  assert.equal(runtime.invoke('abi4', 'id', [42n]), 42n);
  runtime.registerModule(5, 'abi5', [{
    name: 'id', arity: 1, exported: true,
    run: (rt, x) => ({type: 'return', value: rt.read(x, 0)}),
  }]);
  assert.equal(runtime.invoke('abi5', 'id', [42n]), 42n);
  runtime.registerModule(6, 'abi6', [{
    name: 'id', arity: 1, exported: true,
    run: (rt, x) => ({type: 'return', value: rt.read(x, 0)}),
  }]);
  assert.equal(runtime.invoke('abi6', 'id', [42n]), 42n);
  runtime.registerModule(7, 'abi7', [{
    name: 'id', arity: 1, exported: true,
    run: (rt, x) => ({type: 'return', value: rt.read(x, 0)}),
  }]);
  assert.equal(runtime.invoke('abi7', 'id', [42n]), 42n);
  runtime.registerModule(8, 'abi8', [{
    name: 'id', arity: 1, exported: true,
    run: (rt, x) => ({type: 'return', value: rt.read(x, 0)}),
  }]);
  assert.equal(runtime.invoke('abi8', 'id', [42n]), 42n);
  runtime.registerModule(9, 'abi9', [{
    name: 'id', arity: 1, exported: true,
    run: (rt, x) => ({type: 'return', value: rt.read(x, 0)}),
  }]);
  assert.equal(runtime.invoke('abi9', 'id', [42n]), 42n);
  runtime.registerModule(10, 'abi10', [{
    name: 'id', arity: 1, exported: true,
    run: (rt, x) => ({type: 'return', value: rt.read(x, 0)}),
  }]);
  assert.equal(runtime.invoke('abi10', 'id', [42n]), 42n);
  runtime.registerModule(11, 'abi11', [{
    name: 'id', arity: 1, exported: true,
    run: (rt, x) => ({type: 'return', value: rt.read(x, 0)}),
  }]);
  assert.equal(runtime.invoke('abi11', 'id', [42n]), 42n);
  runtime.registerModule(12, 'abi12', [{
    name: 'id', arity: 1, exported: true,
    run: (rt, x) => ({type: 'return', value: rt.read(x, 0)}),
  }]);
  assert.equal(runtime.invoke('abi12', 'id', [42n]), 42n);

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
  const unsupported = spawnSync(compiler, [join(dir, 'unsupported.beam'), output],
    {encoding: 'utf8', timeout: 30000});
  assert.notEqual(unsupported.status, 0);
  assert.match(unsupported.stderr, /add\/2 instruction .*invalid branch label 0/);
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
  console.log('Integration tests passed');
} finally {
  rmSync(dir, {recursive: true, force: true});
}
