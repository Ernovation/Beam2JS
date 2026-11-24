// Compiles OTP's own lists.beam and fixtures/lists_cases.erl, runs every
// scenario under OTP and under Beam2JS, and requires identical results.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Runtime} from '../runtime/beam2js.mjs';

const module = 'lists_cases';
const compiler = resolve('_build/default/bin/beam2js');

// Formats a term like io_lib's ~w for the term types the scenarios return.
function format(rt, term) {
  if (typeof term === 'bigint') return String(term);
  if (typeof term === 'symbol') {
    const name = Symbol.keyFor(term);
    return /^[a-z][A-Za-z0-9_@]*$/.test(name) ? name : `'${name.replace(/[\\']/g, '\\$&')}'`;
  }
  if (rt.isType('is_float', term)) {
    const value = rt.floatValue(term);
    return Number.isInteger(value) ? value.toFixed(1) : String(value);
  }
  if (rt.isType('is_tuple', term)) {
    const items = [];
    for (let i = 1; i <= rt.tupleSize(term); i++) items.push(format(rt, rt.tupleElement(term, i)));
    return `{${items.join(',')}}`;
  }
  if (rt.isType('is_list', term)) {
    const items = [];
    while (rt.isType('is_nonempty_list', term)) {
      items.push(format(rt, rt.listHead(term)));
      term = rt.listTail(term);
    }
    return term === rt.nil() ? `[${items.join(',')}]` : `[${items.join(',')}|${format(rt, term)}]`;
  }
  throw new TypeError(`unexpected scenario result: ${String(term)}`);
}

export async function listsChecks() {
  const dir = mkdtempSync(join(tmpdir(), 'beam2js-lists-'));
  try {
    execFileSync('erlc', ['-o', dir, `fixtures/${module}.erl`]);
    const listsBeam = execFileSync('erl', ['-noshell', '-eval',
      'io:format("~s", [code:which(lists)]), halt().'], {encoding: 'utf8'});
    execFileSync(compiler, [listsBeam, join(dir, 'lists.mjs')]);
    execFileSync(compiler, [join(dir, `${module}.beam`), join(dir, `${module}.mjs`)]);
    const otp = execFileSync('erl', ['-noshell', '-pa', dir, '-eval', `
      [io:format("result ~s ~w~n", [S, ${module}:run(S)]) || S <- ${module}:scenarios()], halt().`],
    {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
    const expected = new Map(otp.split('\n').filter(line => line.startsWith('result ')).map(line => {
      const [, scenario, result] = line.match(/^result (\S+) (.*)$/);
      return [scenario, result];
    }));
    assert.ok(expected.size >= 70, `expected OTP results for every scenario, got ${expected.size}`);

    const rt = new Runtime({moduleBaseURL: pathToFileURL(`${dir}/`).href});
    const failures = [];
    for (const [scenario, want] of expected) {
      let got;
      try {
        got = format(rt, await rt.invokeAsync(module, 'run', [rt.atom(scenario)]));
      } catch (error) {
        got = `exception: ${error.message}`;
      }
      if (got !== want) failures.push(`${scenario}: OTP ${want}, Beam2JS ${got}`);
    }
    assert.deepEqual(failures, []);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await listsChecks();
  console.log('lists.beam from OTP matched OTP on every scenario');
}
