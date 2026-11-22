import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';

const dir = mkdtempSync(join(tmpdir(), 'beam2js-sudoku-'));
const run = (command, args) => execFileSync(command, args, {encoding: 'utf8', timeout: 30000});
const source = path => readFileSync(resolve(path), 'utf8');

try {
  run('erlc', ['-o', dir, 'examples/sudoku/sudoku.erl']);
  const beam = join(dir, 'sudoku.beam');
  const stripped = join(dir, 'sudoku-stripped.beam');
  run('erl', ['-noshell', '-eval',
    '[In,Out]=init:get_plain_arguments(), {ok,B}=file:read_file(In), ' +
    '{ok,{_,S}}=beam_lib:strip(B), ok=file:write_file(Out,S), halt().', '-extra', beam, stripped]);
  const compiler = resolve('_build/default/bin/beam2js');
  for (const [input, name] of [[beam, 'sudoku.mjs'], [stripped, 'sudoku-stripped.mjs']]) {
    run(compiler, [input, join(dir, name)]);
  }
  const otp = run('erl', ['-pa', dir, '-noshell', '-eval',
    '{ok,S}=sudoku:solve(sudoku:sample()), ' +
    'Empty=lists:duplicate(9,lists:duplicate(9,0)), ' +
    'Impossible=[[1,2,3,4,5,6,7,8,0],[0,0,0,0,0,0,0,0,9]|lists:nthtail(2,Empty)], ' +
    'Duplicate=[[1,1,0,0,0,0,0,0,0]|tl(Empty)], ' +
    'io:format("~w~n~w~n~w~n",[S,sudoku:solve(Impossible),sudoku:solve(Duplicate)]),halt().',
  ]).trim().split('\n');
  assert.deepEqual(otp.slice(1), ['unsolvable', 'invalid']);
  const expected = JSON.parse(otp[0]);
  for (const name of ['sudoku.mjs', 'sudoku-stripped.mjs']) {
    const nodeResult = run(process.execPath, ['--input-type=module', '--eval',
      'const [{Runtime},{sudokuChecks},mod]=await Promise.all(process.argv.slice(1,4).map(url=>import(url)));' +
      'const runtime=new Runtime({reductionLimit:10000}); mod.register(runtime);' +
      'console.log(JSON.stringify(await sudokuChecks(runtime,JSON.parse(process.argv[4]))));',
      pathToFileURL(resolve('runtime/beam2js.mjs')).href,
      pathToFileURL(resolve('test/sudoku-cases.mjs')).href,
      pathToFileURL(join(dir, name)).href, JSON.stringify(expected)]);
    assert.deepEqual(JSON.parse(nodeResult), expected);
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const resources = new Map([
      ['/', '<!doctype html><title>Sudoku test</title>'],
      ['/runtime.mjs', source('runtime/beam2js.mjs')],
      ['/checks.mjs', source('test/sudoku-cases.mjs')],
      ['/sudoku.mjs', readFileSync(join(dir, 'sudoku.mjs'), 'utf8')],
      ['/sudoku-stripped.mjs', readFileSync(join(dir, 'sudoku-stripped.mjs'), 'utf8')],
    ]);
    await page.route('http://beam2js.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (!resources.has(path)) return route.abort();
      await route.fulfill({contentType: path === '/' ? 'text/html' : 'text/javascript', body: resources.get(path)});
    });
    await page.goto('http://beam2js.test/', {timeout: 30000});
    let timer;
    const results = await Promise.race([
      page.evaluate(async solution => {
        const {Runtime} = await import('/runtime.mjs');
        const {sudokuChecks} = await import('/checks.mjs');
        const results = [];
        for (const name of ['/sudoku.mjs', '/sudoku-stripped.mjs']) {
          const runtime = new Runtime({reductionLimit: 10000});
          (await import(name)).register(runtime);
          results.push(await sudokuChecks(runtime, solution));
        }
        return results;
      }, expected),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Sudoku browser test timed out')), 30000);
      }),
    ]).finally(() => clearTimeout(timer));
    assert.deepEqual(results, [expected, expected]);
  } finally {
    await browser.close();
  }
  console.log('Sudoku solver passed OTP, Node and Chromium tests, including stripped input');
} finally {
  rmSync(dir, {recursive: true, force: true});
}
