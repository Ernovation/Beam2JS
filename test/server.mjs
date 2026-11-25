import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {chromium} from 'playwright';

const compiler = resolve('_build/default/bin/beam2js');
const dir = mkdtempSync(join(tmpdir(), 'beam2js-server-'));
const servers = [];

function serve(args) {
  const child = spawn(compiler, ['serve', '--port', '0', ...args], {stdio: ['ignore', 'pipe', 'pipe']});
  servers.push(child);
  let output = '';
  return new Promise((resolvePort, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start: ${output}`)), 30000);
    const read = chunk => {
      output += chunk;
      const match = /Serving on (http:\/\/127\.0\.0\.1:\d+)\//.exec(output);
      if (match) {
        clearTimeout(timer);
        resolvePort(match[1]);
      }
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.on('exit', code => reject(new Error(`server exited with ${code}: ${output}`)));
  });
}

async function get(base, path, method = 'GET') {
  const response = await fetch(base + path, {method});
  return {status: response.status, type: response.headers.get('content-type'), body: await response.text()};
}

try {
  const beams = join(dir, 'beams');
  const browserBeams = join(dir, 'browser');
  const nifs = join(dir, 'nifs');
  for (const path of [beams, browserBeams, nifs, join(dir, 'v1'), join(dir, 'v2')]) mkdirSync(path);
  execFileSync('erlc', ['-o', beams, 'examples/server/server_demo.erl']);
  execFileSync('erlc', ['-o', browserBeams, 'examples/browser/browser_demo.erl', 'examples/browser/dom.erl']);
  writeFileSync(join(dir, 'v1', 'versioned.erl'), '-module(versioned).\n-export([v/0]).\nv() -> one.\n');
  writeFileSync(join(dir, 'v2', 'versioned.erl'),
    '-module(versioned).\n-export([v/0, w/0]).\nv() -> two.\nw() -> {two, 2}.\n');
  for (const version of ['v1', 'v2']) {
    execFileSync('erlc', ['-o', join(dir, version), join(dir, version, 'versioned.erl')]);
  }
  writeFileSync(join(nifs, 'probe.nif.mjs'), 'export function nif() { return []; }\n');
  writeFileSync(join(beams, 'beside.nif.mjs'), 'export function nif() { return []; }\n');
  // Every OTP module compiles, so a hand-assembled BEAM provides an unsupported instruction.
  execFileSync('erl', ['-noshell', '-eval',
    'Is=[{label,1},{func_info,{atom,unsupported_demo},{atom,f},0},{label,2},{trim,2000,0},return], ' +
    '{ok,B}=beam_asm:module({unsupported_demo,[{f,0}],[],#{},[{function,f,0,2,Is}],3},[],[],[]), ' +
    `ok=file:write_file("${join(beams, 'unsupported_demo.beam')}",B), halt().`]);

  // Default mode: every module on the code path, plus a static document root.
  const base = await serve(['--pa', beams, '--nif-dir', nifs]);
  const ordsets = await get(base, '/modules/ordsets.mjs');
  assert.equal(ordsets.status, 200);
  assert.equal(ordsets.type, 'text/javascript; charset=utf-8');
  const ordsetsBeam = execFileSync('erl', ['-noshell', '-eval',
    'io:format("~s", [code:which(ordsets)]), halt().'], {encoding: 'utf8'});
  const expected = join(dir, 'ordsets.mjs');
  execFileSync(compiler, [ordsetsBeam, expected]);
  assert.equal(ordsets.body, readFileSync(expected, 'utf8'));
  assert.equal((await get(base, '/modules/server_demo.mjs')).status, 200);
  const head = await get(base, '/modules/ordsets.mjs', 'HEAD');
  assert.deepEqual([head.status, head.type, head.body], [200, 'text/javascript; charset=utf-8', '']);

  assert.equal((await get(base, '/modules/lists.mjs')).status, 200);
  const unsupported = await get(base, '/modules/unsupported_demo.mjs');
  assert.equal(unsupported.status, 500);
  assert.match(unsupported.body, /^beam2js: unsupported_demo: .*unsupported instruction/);
  // Object files are served too, for code:which/1 and tools such as beam_disasm.
  const beam = await get(base, '/modules/ordsets.beam');
  assert.equal(beam.status, 200);
  assert.ok(beam.body.startsWith('FOR1'));
  for (const path of ['/modules/no_such_module.mjs', '/modules/no_such_module.beam', '/modules/..%2Fpackage.mjs',
    '/modules/%2E%2E.mjs', '/modules/.hidden.mjs', '/modules/a%00b.mjs', '/modules/.nif.mjs',
    '/modules/..%2F..%2F..%2Fetc%2Fpasswd', '/modules/no_such.nif.mjs']) {
    assert.equal((await get(base, path)).status, 404, path);
  }
  assert.equal((await get(base, '/modules/probe.nif.mjs')).body, readFileSync(join(nifs, 'probe.nif.mjs'), 'utf8'));
  assert.equal((await get(base, '/modules/beside.nif.mjs')).status, 200);
  const runtime = await get(base, '/runtime/beam2js.mjs');
  assert.equal(runtime.status, 200);
  assert.equal(runtime.type, 'text/javascript; charset=utf-8');
  assert.equal((await get(base, '/examples/server/')).type, 'text/html; charset=utf-8');
  const welcome = await get(base, '/');
  assert.equal(welcome.status, 200);
  assert.match(welcome.body, /href="\/modules\/"/);
  const listing = await get(base, '/examples/shell/?beam2js=list');
  assert.equal(listing.type, 'application/vnd.beam2js.file+json');
  assert.ok(JSON.parse(listing.body).includes('index.html'));
  const metadata = JSON.parse((await get(base, '/examples/shell/index.html?beam2js=stat')).body);
  assert.equal(metadata.type, 'regular');
  assert.equal(metadata.size, readFileSync('examples/shell/index.html').length);
  assert.equal(JSON.parse((await get(base, '/examples/shell/?beam2js=stat')).body).type, 'directory');
  assert.equal(JSON.parse((await get(base, '/README.md?beam2js=list')).body).error, 'enotdir');
  for (const path of ['/..%2fREADME.md?beam2js=stat', '/a%00b?beam2js=list',
    '/%5c..%5cREADME.md?beam2js=stat']) {
    assert.equal((await get(base, path)).status, 404, path);
  }

  // Restricted mode: only listed directories; NIFs may sit beside the BEAM files.
  const restricted = await serve(['--beam-dir', beams, '--beam-dir', join(dir, 'v1'), '--no-root',
    '--module-root', 'js']);
  assert.equal((await get(restricted, '/js/server_demo.mjs')).status, 200);
  assert.equal((await get(restricted, '/js/beside.nif.mjs')).status, 200);
  assert.equal((await get(restricted, '/?beam2js=list')).status, 404);
  assert.equal((await get(restricted, '/README.md?beam2js=stat')).status, 404);
  for (const path of ['/js/ordsets.mjs', '/js/probe.nif.mjs', '/modules/server_demo.mjs', '/runtime/beam2js.mjs']) {
    assert.equal((await get(restricted, path)).status, 404, path);
  }

  // Compiled output is cached until the BEAM file changes.
  const first = await get(restricted, '/js/versioned.mjs');
  assert.equal((await get(restricted, '/js/versioned.mjs')).body, first.body);
  copyFileSync(join(dir, 'v2', 'versioned.beam'), join(dir, 'v1', 'versioned.beam'));
  const second = await get(restricted, '/js/versioned.mjs');
  assert.notEqual(second.body, first.body);
  assert.match(second.body, /name: "w"/);

  // The browser demo is served from its own folder: modules are compiled,
  // while main.mjs and dom.nif.mjs fall through to the document root.
  const demo = await serve(['--beam-dir', browserBeams, '--module-root', '/examples/browser/']);
  const demoModule = await get(demo, '/examples/browser/browser_demo.mjs');
  execFileSync(compiler, [join(browserBeams, 'browser_demo.beam'), join(dir, 'browser_demo.mjs')]);
  assert.equal(demoModule.body, readFileSync(join(dir, 'browser_demo.mjs'), 'utf8'));
  assert.equal((await get(demo, '/examples/browser/main.mjs')).body,
    readFileSync('examples/browser/main.mjs', 'utf8'));
  assert.equal((await get(demo, '/examples/browser/dom.nif.mjs')).status, 200);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    const requested = [];
    page.on('pageerror', error => errors.push(error));
    page.on('request', request => requested.push(new URL(request.url()).pathname));
    await page.goto(`${base}/examples/server/`);
    await page.waitForFunction(() => document.getElementById('status').textContent !== 'Loading...' &&
      !document.getElementById('status').textContent.startsWith('Calling'), null, {timeout: 30000});
    assert.equal(await page.textContent('#status'), 'Done.');
    assert.deepEqual(await page.$$eval('#result dd', nodes => nodes.map(node => node.textContent)),
      ['[1, 3, 4, 5, 6, 7]', '[1, 5]', '[3, 7]', '[4, 6]']);
    assert.ok(requested.includes('/modules/server_demo.mjs'));
    assert.ok(requested.includes('/modules/ordsets.mjs'));
    await page.fill('#a', '9 2');
    await page.fill('#b', '2');
    await page.click('button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#result dd')?.textContent === '[2, 9]');
    assert.deepEqual(errors, []);

    const demoPage = await browser.newPage();
    demoPage.on('pageerror', error => errors.push(error));
    await demoPage.goto(`${demo}/examples/browser/`);
    await demoPage.click('#button');
    await demoPage.waitForFunction(() => document.getElementById('message').textContent !== '',
      null, {timeout: 30000});
    await demoPage.click('#stop');
    await demoPage.waitForFunction(() => document.getElementById('status').textContent === 'Stopped.');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
  console.log('Server compiled modules on request and served them to Node and Chromium');
} finally {
  for (const child of servers) child.kill();
  rmSync(dir, {recursive: true, force: true});
}
