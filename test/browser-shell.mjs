import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {chromium} from 'playwright';
import {Runtime} from '../runtime/beam2js.mjs';
import {charlist} from '../runtime/otp/term.mjs';

// IO errors must return Erlang errors, and a suspended fetch must not block
// another process or resurrect one killed while the request was in flight.
{
  let release, requested;
  const pending = new Promise(resolve => { requested = resolve; });
  const rt = new Runtime({fileBaseURL: 'https://files.invalid/', fetch: async path => {
    const url = new URL(path);
    if (url.pathname === '/offline') throw new TypeError('network unavailable');
    if (url.pathname === '/broken-body') return new Response(new ReadableStream({
      start(controller) { controller.error(new TypeError('connection lost')); },
    }));
    if (url.pathname === '/pending') {
      requested();
      return new Promise(resolve => { release = () => resolve(new Response('done')); });
    }
    if (url.pathname === '/stat' && url.search) return new Response('{bad json', {
      headers: {'content-type': 'application/vnd.beam2js.file+json'},
    });
    return new Response('', {status: url.pathname === '/denied' ? 403 : 404});
  }});
  for (const [file, reason] of [['offline', 'eio'], ['broken-body', 'eio'], ['denied', 'eacces'], ['missing', 'enoent']]) {
    const result = await rt.invokeAsync('prim_file', 'read_file', [charlist(rt, file)]);
    assert.deepEqual(result, rt.tuple([rt.atom('error'), rt.atom(reason)]));
  }
  assert.deepEqual(await rt.invokeAsync('prim_file', 'read_file_info', [charlist(rt, 'stat')]),
    rt.tuple([rt.atom('error'), rt.atom('eio')]));
  assert.throws(() => rt.invoke('prim_file', 'read_file', [charlist(rt, 'missing')]), /asynchronous IO/);
  const process = rt.spawnProcess('prim_file', 'read_file', [charlist(rt, 'pending')]);
  const exited = assert.rejects(process.result, error => error.reason === rt.atom('kill'));
  await pending;
  assert.equal(await rt.invokeAsync('erlang', 'length', [rt.nil()]), 0n);
  rt.terminateProcess(process.pid, rt.atom('kill'));
  await exited;
  release();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(rt.isProcessAlive(process.pid), false);
}

const dir = mkdtempSync(join(tmpdir(), 'beam2js-browser-shell-'));
let server, browser, page;
try {
  execFileSync('erlc', ['-o', dir, 'fixtures/browser_shell.erl']);
  let log = '';
  server = spawn(resolve('_build/default/bin/beam2js'), ['serve', '--port', '0', '--pa', dir],
    {stdio: ['ignore', 'pipe', 'pipe']});
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server startup timed out: ${log}`)), 30000);
    const read = chunk => {
      log += chunk;
      const match = /Serving on (http:\/\/127\.0\.0\.1:\d+)\//.exec(log);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    };
    server.stdout.on('data', read);
    server.stderr.on('data', read);
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`server exited (${code}): ${log}`)); });
  });
  browser = await chromium.launch({headless: true, args: ['--no-sandbox']});
  page = await browser.newPage();
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.goto(`${base}/examples/shell/`);
  const output = page.locator('#terminal pre');
  await output.getByText('1>', {exact: false}).waitFor({timeout: 60000});
  const input = page.getByRole('textbox', {name: 'Erlang shell input'});
  let prompt = 1;
  const waitPrompt = () => page.waitForFunction(({prompt}) =>
    document.querySelector('#terminal pre').textContent.trimEnd().endsWith(`${prompt}>`), {prompt},
  {timeout: 60000});
  const expression = async (text, expected) => {
    await input.pressSequentially(text);
    await input.press('Enter');
    prompt++;
    await waitPrompt();
    assert.ok((await output.innerText()).includes(expected), `missing shell result ${expected}`);
  };
  await expression('X = 21, X * 2.', '\n42\n');
  await expression('browser_shell:echo(hello).', '{loaded_on_demand,hello}');
  assert.ok(requests.some(url => url.endsWith('/modules/browser_shell.mjs')));
  assert.ok(!requests.some(url => url.endsWith('.beam')), 'shell must never download BEAM files');
  await expression('browser_shell:files("fixtures/browser_shell.terms").', '[{hello,"browser"},#{answer => 42}]');
  await expression('browser_shell:loader().', '\nok\n');
  await expression('browser_shell:tty().', '\nok\n');
  await expression('file:read_file("no-such-shell-file").', '{error,enoent}');
  await expression('file:write_file("forbidden", <<"no">>).', '{error,erofs}');
  await expression('erlang:error(shell_test).', '** exception error: shell_test');
  await expression('X.', '\n21\n');
  // OTP's edlin, not the DOM element, edits and recalls the command.
  await input.pressSequentially('10+3.');
  await input.press('ArrowLeft');
  await input.press('ArrowLeft');
  await input.press('Delete');
  await input.pressSequentially('4');
  await input.press('End');
  await input.press('Enter');
  prompt++;
  await waitPrompt();
  assert.ok((await output.innerText()).includes('\n14\n'));
  await input.press('ArrowUp');
  await input.press('Enter');
  prompt++;
  await waitPrompt();
  assert.equal((await output.innerText()).split('\n14\n').length, 3);
  // An evaluator can suspend for input without blocking the browser.
  await input.pressSequentially('io:get_line("Name: ").');
  await input.press('Enter');
  await page.waitForFunction(() => document.querySelector('#terminal pre').textContent.endsWith('Name: '));
  await input.pressSequentially('héllo');
  await input.press('Enter');
  prompt++;
  await waitPrompt();
  assert.ok((await output.innerText()).includes('"héllo\\n"'));
  await page.setViewportSize({width: 700, height: 800});
  const columns = await page.evaluate(async () => {
    const {shell} = await import('/examples/shell/main.mjs');
    return shell.terminal.size().columns;
  });
  await expression('io:columns().', `{ok,${columns}}`);
  await input.pressSequentially('lists:rev');
  await input.press('Tab');
  await page.waitForFunction(() => document.querySelector('#terminal pre').textContent.endsWith('lists:reverse('));
  await expression('[1,2]).', '\n[2,1]\n');
  await input.press('Control+g');
  await page.waitForFunction(() => document.querySelector('#terminal pre').textContent.trimEnd().endsWith('-->'));
  await input.pressSequentially('c');
  await input.press('Enter');
  await waitPrompt();
  assert.ok(!requests.some(url => new URL(url).pathname.endsWith('.beam')), 'loader must fetch JavaScript, not BEAM');
  assert.deepEqual(errors, []);
  await page.getByRole('button', {name: 'Stop shell'}).click();
  await page.getByText('Shell stopped.', {exact: true}).waitFor();
  assert.equal(await page.locator('#terminal textarea').count(), 0);
  assert.equal(await page.evaluate(async () => {
    const {shell} = await import('/examples/shell/main.mjs');
    const {runtime: rt} = shell;
    const list = await rt.invokeAsync('erlang', 'processes', []);
    let live = 0;
    for (let cursor = list; cursor !== rt.nil(); cursor = rt.listTail(cursor)) {
      if (rt.isProcessAlive(rt.listHead(cursor))) live++;
    }
    return live;
  }), 0, 'stopping the shell must terminate its processes');
  console.log('OTP shell passed interactive browser editing, IO, file and dynamic-module tests');
} catch (error) {
  if (page) console.error(await page.locator('#terminal').innerText());
  throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await exited;
  }
  rmSync(dir, {recursive: true, force: true});
}
