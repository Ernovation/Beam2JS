import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {Runtime} from '../runtime/beam2js.mjs';
import {loaderChecks} from './loader-cases.mjs';

const dir = mkdtempSync(join(tmpdir(), 'beam2js-loader-'));
const source = path => readFileSync(resolve(path), 'utf8');
const within = promise => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('loader tests timed out')), 30000);
  })]).finally(() => clearTimeout(timer));
};
try {
  execFileSync('erlc', ['-o', dir, 'fixtures/loader_fixture.erl', 'fixtures/loader_helper.erl',
    'examples/browser/browser_demo.erl', 'examples/browser/dom.erl']);
  for (const module of ['loader_fixture', 'loader_helper', 'browser_demo', 'dom']) {
    execFileSync(resolve('_build/default/bin/beam2js'), [join(dir, `${module}.beam`), join(dir, `${module}.mjs`)]);
  }
  const nif = source('fixtures/loader_fixture.nif.mjs');
  for (const name of ['loader_fixture', 'invalid', 'throws']) writeFileSync(join(dir, `${name}.nif.mjs`), nif);
  writeFileSync(join(dir, 'bad_init.mjs'), `
    export function register(rt) {
      rt.registerModule(26, 'bad_init', [{
        name: 'init', arity: 0, run: () => ({type: 'return', value: rt.atom('error')}),
      }], {onLoad: 'init'});
    }
  `);
  writeFileSync(join(dir, 'bad_register.mjs'), 'export function register(rt) {}');
  for (const [name, other] of [['cycle_a', 'cycle_b'], ['cycle_b', 'cycle_a']]) {
    writeFileSync(join(dir, `${name}.mjs`), `
      export function register(rt) {
        rt.registerModule(26, '${name}', [{
          name: 'init', arity: 0,
          run: () => ({type: 'tail', module: '${other}', name: 'run', args: [], external: true}),
        }, {
          name: 'run', arity: 0, exported: true,
          run: () => ({type: 'return', value: rt.atom('ok')}),
        }], {onLoad: 'init'});
      }
    `);
  }
  assert.equal(await within(loaderChecks(Runtime, pathToFileURL(`${dir}/`).href)), true);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const resources = new Map([
      ['/runtime.mjs', source('runtime/beam2js.mjs')],
      ['/checks.mjs', source('test/loader-cases.mjs')],
      ['/runtime/beam2js.mjs', source('runtime/beam2js.mjs')],
      ['/examples/browser/main.mjs', source('examples/browser/main.mjs')],
      ['/examples/browser/dom.nif.mjs', source('examples/browser/dom.nif.mjs')],
      ...['browser_demo', 'dom'].map(name =>
        [`/examples/browser/${name}.mjs`, readFileSync(join(dir, `${name}.mjs`), 'utf8')]),
      ...['loader_fixture.mjs', 'loader_helper.mjs', 'loader_fixture.nif.mjs',
        'invalid.nif.mjs', 'throws.nif.mjs', 'bad_init.mjs', 'bad_register.mjs', 'cycle_a.mjs', 'cycle_b.mjs']
        .map(name => [`/modules/${name}`, readFileSync(join(dir, name), 'utf8')]),
    ]);
    const requests = [];
    await page.route('http://beam2js.test/**', route => {
      const path = new URL(route.request().url()).pathname;
      requests.push(path);
      if (path === '/') return route.fulfill({contentType: 'text/html', body: '<!doctype html>'});
      if (path === '/examples/browser/') {
        return route.fulfill({contentType: 'text/html', body: source('examples/browser/index.html')});
      }
      const body = resources.get(path);
      return route.fulfill({status: body === undefined ? 404 : 200, contentType: 'text/javascript', body: body ?? ''});
    });
    await page.goto('http://beam2js.test/');
    assert.equal(await within(page.evaluate(async () => {
      const {Runtime} = await import('/runtime.mjs');
      const {loaderChecks} = await import('/checks.mjs');
      return loaderChecks(Runtime, 'http://beam2js.test/modules/');
    })), true);
    for (const name of ['loader_fixture.mjs', 'loader_helper.mjs', 'loader_fixture.nif.mjs']) {
      assert.equal(requests.filter(path => path === `/modules/${name}`).length, 1, `duplicate download of ${name}`);
    }
    await page.goto('http://beam2js.test/examples/browser/');
    await page.waitForFunction(() => document.getElementById('message').textContent === 'Hello from Erlang!');
    await page.click('#button');
    await page.waitForFunction(() => document.getElementById('message').textContent.endsWith('Click 1!'));
    await page.locator('#mouse-area').hover();
    await page.waitForFunction(() => document.getElementById('mouse-area').textContent.startsWith('Mouse: '));
    await page.click('#stop');
    await page.waitForFunction(() => document.getElementById('status').textContent === 'Stopped.');
    assert.equal(await page.isDisabled('#button'), true);
    for (const name of ['browser_demo.mjs', 'dom.mjs', 'dom.nif.mjs']) {
      assert.equal(requests.filter(path => path === `/examples/browser/${name}`).length, 1);
    }
    await page.route('http://beam2js.test/examples/browser/dom.nif.mjs', route =>
      route.fulfill({status: 404, contentType: 'text/javascript', body: ''}));
    await page.reload();
    await page.waitForFunction(() => {
      const status = document.getElementById('status').textContent;
      return status.startsWith('Failed:') && status.includes('dom.nif.mjs');
    });
    assert.equal(await page.isDisabled('#button'), true);
    assert.equal(await page.isDisabled('#stop'), true);
  } finally {
    await browser.close();
  }
  console.log('Dynamic module loading and NIF checks passed in Node and Chromium');
} finally {
  rmSync(dir, {recursive: true, force: true});
}
