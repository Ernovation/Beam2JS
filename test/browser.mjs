import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {Runtime} from '../runtime/beam2js.mjs';
import {registerDom} from '../examples/browser/dom.mjs';
import {callResults} from './call-cases.mjs';

const dir = mkdtempSync(join(tmpdir(), 'beam2js-browser-'));
const compiler = resolve('_build/default/bin/beam2js');
const run = (command, args) => execFileSync(command, args, {encoding: 'utf8', timeout: 30000});
const source = path => readFileSync(resolve(path), 'utf8');

try {
  run('erlc', ['-o', dir, 'examples/browser/browser_demo.erl', 'fixtures/calls.erl',
    'fixtures/slice_helper.erl']);
  const calls = join(dir, 'calls.beam');
  const stripped = join(dir, 'calls-stripped.beam');
  run('erl', ['-noshell', '-eval',
    '[Dir]=init:get_plain_arguments(), {ok,raw_stack}=compile:file("fixtures/raw_stack.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{beam_file,calls,_,_,_,Fs}=beam_disasm:file(filename:join(Dir,"calls.beam")), ' +
    '{function,stack,4,_,Is}=lists:keyfind(stack,2,Fs), ' +
    'true=lists:any(fun({init_yregs,_})->true;(_)->false end,Is), ' +
    'true=lists:any(fun({trim,_,_})->true;(_)->false end,Is), ' +
    'lists:foreach(fun(Name) -> Input=filename:join(Dir,Name++".beam"), ' +
    '{ok,B}=file:read_file(Input), {ok,{_,S}}=beam_lib:strip(B), ' +
    'ok=file:write_file(filename:join(Dir,Name++"-stripped.beam"),S) end, ' +
    '["calls","raw_stack"]), halt().', '-extra', dir]);
  for (const [input, output] of [
    [calls, 'calls.mjs'], [stripped, 'calls-stripped.mjs'],
    [join(dir, 'raw_stack.beam'), 'raw_stack.mjs'],
    [join(dir, 'raw_stack-stripped.beam'), 'raw_stack-stripped.mjs'],
    [join(dir, 'slice_helper.beam'), 'slice_helper.mjs'],
    [join(dir, 'browser_demo.beam'), 'browser_demo.mjs'],
  ]) {
    run(compiler, [input, join(dir, output)]);
  }
  const oracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    'io:format("~w~n~w~n~w~n~w~n~w~n~w~n~w~n~w~n~w~n",' +
    '[calls:local(42),calls:remote(42),calls:nested(42,99),calls:wrapped(23),' +
    'calls:heap(23,99),calls:stack(11,22,33,44),raw_stack:shift(11,22,33),' +
    'raw_stack:empty(42),calls:depth(lists:seq(1,20000))]),halt().'
  ]).trimEnd().split('\n');

  for (const [file, raw] of [['calls.mjs', 'raw_stack.mjs'], ['calls-stripped.mjs', 'raw_stack-stripped.mjs']]) {
    const rt = new Runtime();
    (await import(pathToFileURL(join(dir, file)))).register(rt);
    (await import(pathToFileURL(join(dir, raw)))).register(rt);
    (await import(pathToFileURL(join(dir, 'slice_helper.mjs')))).register(rt);
    assert.deepEqual(callResults(rt), oracle);
    assert.throws(() => rt.invoke('calls', 'depth', [1n]), /function_clause/);
  }

  const missingDependency = new Runtime();
  (await import(pathToFileURL(join(dir, 'calls.mjs')))).register(missingDependency);
  assert.throws(() => missingDependency.invoke('calls', 'remote', [1n]),
    /undefined or unsupported function: slice_helper:id\/1/);

  const rt = new Runtime();
  const object = {};
  const handle = rt.hostHandle(object);
  const another = rt.hostHandle({});
  assert.equal(rt.hostHandle(object), handle);
  assert.equal(rt.hostValue(handle), object);
  assert.ok(rt.equalExact(handle, rt.hostHandle(object)));
  assert.ok(!rt.equalExact(handle, another));
  assert.ok(rt.compare(handle, another) < 0);
  assert.equal(rt.compare(rt.tuple([handle]), rt.tuple([handle])), 0);
  assert.ok(rt.equalExact(rt.tuple([handle]), rt.tuple([rt.hostHandle(object)])));
  assert.ok(!rt.isType('is_tuple', handle));
  assert.throws(() => rt.hostHandle(null), /object or function/);
  assert.throws(() => rt.hostValue({}), /host handle/);
  assert.throws(() => new Runtime().hostValue(handle), /host handle/);
  assert.throws(() => rt.invoke('missing', 'f', [{}]), /supported Erlang terms/);
  rt.registerModule(14, 'bad_host', [{
    name: 'invalid', arity: 0, exported: true,
    run: () => ({type: 'return', value: {}}),
  }]);
  assert.throws(() => rt.invoke('bad_host', 'invalid', []), /return value/);
  const stack = rt.allocate(null, 3);
  rt.writeY(stack, 0, 1n);
  rt.writeY(stack, 2, 3n);
  rt.initYregs(stack, [0]);
  assert.equal(rt.readY(stack, 0), rt.nil());
  const shifted = rt.trim(stack, 1, 2);
  assert.throws(() => rt.readY(shifted, 0), /uninitialized/);
  assert.equal(rt.readY(shifted, 1), 3n);
  assert.throws(() => rt.initYregs(stack, [2, 1]), /invalid y register initialization/);
  rt.writeY(stack, 0, 9n);
  assert.throws(() => rt.initYregs(stack, [0, 3]), /invalid y register initialization/);
  assert.equal(rt.readY(stack, 0), 9n);
  assert.equal(rt.readY(stack, 2), 3n);
  assert.throws(() => rt.initYregs(null, [0]), /invalid y register initialization/);
  assert.throws(() => rt.trim(null, 0, 0), /invalid stack trim/);
  assert.throws(() => rt.trim(stack, 2, 2), /invalid stack trim/);

  run('erl', ['-noshell', '-eval',
    '[Dir]=init:get_plain_arguments(), ' +
    'Build=fun(Name,Op) -> Is=[{label,1},{func_info,{atom,Name},{atom,check},0},' +
    '{label,2},Op,return], {ok,B}=beam_asm:module({Name,[{check,0}],[],#{},' +
    '[{function,check,0,2,Is}],3},[],[],[]), ' +
    'ok=file:write_file(filename:join(Dir,atom_to_list(Name)++".beam"),B) end, ' +
    'Build(init_empty,{init_yregs,{list,[]}}), ' +
    'Build(init_duplicate,{init_yregs,{list,[{y,0},{y,0}]}}), ' +
    'Build(init_unsorted,{init_yregs,{list,[{y,1},{y,0}]}}), ' +
    'Build(init_limit,{init_yregs,{list,[{y,1024}]}}), ' +
    'Build(trim_limit,{trim,1025,0}), halt().', '-extra', dir]);
  const preserved = join(dir, 'preserved.mjs');
  for (const [file, message] of [
    ['init_empty', /unsupported instruction \{init_yregs/],
    ['init_duplicate', /invalid y register initialization order/],
    ['init_unsorted', /invalid y register initialization order/],
    ['init_limit', /invalid y register initialization/],
    ['trim_limit', /unsupported instruction \{trim/],
  ]) {
    writeFileSync(preserved, 'existing output');
    const invalid = spawnSync(compiler, [join(dir, `${file}.beam`), preserved],
      {encoding: 'utf8', timeout: 30000});
    assert.notEqual(invalid.status, 0, file);
    assert.match(invalid.stderr, message, file);
    assert.equal(readFileSync(preserved, 'utf8'), 'existing output');
  }

  const element = {value: '', append(value) { this.value += value; }};
  registerDom(rt, {getElementById: id => id === 'message' ? element : null});
  const binary = value => {
    const bytes = new TextEncoder().encode(value);
    return rt.bitstring(bytes, bytes.length * 8);
  };
  const elementHandle = rt.invoke('dom', 'element_by_id', [binary('message')]);
  assert.equal(elementHandle, rt.invoke('dom', 'element_by_id', [binary('message')]));
  assert.equal(rt.invoke('dom', 'append_text', [elementHandle, binary('héllo')]), rt.atom('ok'));
  assert.equal(element.value, 'héllo');
  assert.throws(() => rt.invoke('dom', 'element_by_id', [binary('absent')]), /not found/);
  assert.throws(() => rt.invoke('dom', 'append_text', [handle, binary('x')]), /not obtained/);
  assert.throws(() => rt.invoke('dom', 'append_text', [elementHandle, rt.bitstring([128], 1)]), /UTF-8 binary/);
  assert.throws(() => rt.invoke('dom', 'element_by_id', [rt.bitstring([255], 8)]), TypeError);
  const brokenElement = {append() { throw new Error('DOM append failed'); }};
  const brokenRuntime = new Runtime();
  registerDom(brokenRuntime, {getElementById: () => brokenElement});
  const brokenHandle = brokenRuntime.invoke('dom', 'element_by_id', [binary('message')]);
  assert.throws(() => brokenRuntime.invoke('dom', 'append_text', [brokenHandle, binary('x')]),
    /DOM append failed/);
  (await import(pathToFileURL(join(dir, 'browser_demo.mjs')))).register(rt);
  assert.equal(rt.invoke('browser_demo', 'run', []), rt.atom('ok'));
  assert.equal(element.value, 'hélloHello from Erlang!');

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const resources = new Map([
      ['/examples/browser/', ['text/html', source('examples/browser/index.html')]],
      ['/examples/browser/main.mjs', ['text/javascript', source('examples/browser/main.mjs')]],
      ['/examples/browser/dom.mjs', ['text/javascript', source('examples/browser/dom.mjs')]],
      ['/examples/browser/browser_demo.mjs', ['text/javascript', readFileSync(join(dir, 'browser_demo.mjs'), 'utf8')]],
      ['/runtime/beam2js.mjs', ['text/javascript', source('runtime/beam2js.mjs')]],
      ['/test/call-cases.mjs', ['text/javascript', source('test/call-cases.mjs')]],
      ...['calls.mjs', 'calls-stripped.mjs', 'raw_stack.mjs', 'raw_stack-stripped.mjs', 'slice_helper.mjs'].map(file =>
        [`/${file}`, ['text/javascript', readFileSync(join(dir, file), 'utf8')]]),
    ]);
    await page.route('http://beam2js.test/**', async route => {
      const resource = resources.get(new URL(route.request().url()).pathname);
      if (!resource) return route.abort();
      await route.fulfill({contentType: resource[0], body: resource[1]});
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://beam2js.test/examples/browser/', {timeout: 30000});
    await page.waitForFunction(() => document.getElementById('message').textContent === 'Hello from Erlang!',
      null, {timeout: 30000});
    assert.deepEqual(errors, []);
    let timer;
    const browserResults = await Promise.race([page.evaluate(async () => {
      const {Runtime} = await import('/runtime/beam2js.mjs');
      const {registerDom} = await import('/examples/browser/dom.mjs');
      const {callResults} = await import('/test/call-cases.mjs');
      const results = [];
      for (const [file, raw] of [
        ['/calls.mjs', '/raw_stack.mjs'], ['/calls-stripped.mjs', '/raw_stack-stripped.mjs']
      ]) {
        const runtime = new Runtime();
        (await import(file)).register(runtime);
        (await import(raw)).register(runtime);
        (await import('/slice_helper.mjs')).register(runtime);
        results.push(callResults(runtime));
      }
      const runtime = new Runtime();
      registerDom(runtime, document);
      const binary = value => {
        const bytes = new TextEncoder().encode(value);
        return runtime.bitstring(bytes, bytes.length * 8);
      };
      const handle = runtime.invoke('dom', 'element_by_id', [binary('message')]);
      const sameHandle = handle === runtime.invoke('dom', 'element_by_id', [binary('message')]);
      runtime.invoke('dom', 'append_text', [handle, binary(' <b>å</b>')]);
      const element = document.getElementById('message');
      return {results, sameHandle, text: element.textContent, children: element.children.length};
    }), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('browser call tests timed out')), 30000);
    })]).finally(() => clearTimeout(timer));
    assert.deepEqual(browserResults, {
      results: [oracle, oracle], sameHandle: true,
      text: 'Hello from Erlang! <b>å</b>', children: 0,
    });
  } finally {
    await browser.close();
  }
  console.log('Browser interop and call tests passed in Node and Chromium');
} finally {
  rmSync(dir, {recursive: true, force: true});
}
