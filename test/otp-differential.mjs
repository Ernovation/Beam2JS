// Shared harness for differential suites: compiles a fixture plus OTP's own
// BEAM files, runs every scenario under OTP and under Beam2JS, and returns
// the scenarios whose ~w-formatted results differ.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Runtime} from '../runtime/beam2js.mjs';
import {formatShort} from '../runtime/otp/term.mjs';

const compiler = resolve('_build/default/bin/beam2js');

function atomText(name) {
  return /^[a-z][A-Za-z0-9_@]*$/.test(name) &&
    !['after', 'and', 'andalso', 'band', 'begin', 'bnot', 'bor', 'bsl', 'bsr', 'bxor', 'case', 'catch',
      'cond', 'div', 'else', 'end', 'fun', 'if', 'let', 'maybe', 'not', 'of', 'or', 'orelse', 'receive',
      'rem', 'try', 'when', 'xor'].includes(name)
    ? name
    : `'${name.replace(/[\\']/g, '\\$&')}'`;
}

// Formats a term like io_lib's ~w; map keys are sorted in term order.
export function format(rt, term) {
  if (typeof term === 'bigint') return String(term);
  if (typeof term === 'symbol') return atomText(Symbol.keyFor(term));
  if (rt.isType('is_float', term)) return formatShort(rt.floatValue(term));
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
  if (rt.isType('is_bitstring', term)) {
    const [bytes, bits] = term[1];
    const items = [];
    for (let i = 0; i < bits >> 3; i++) items.push(String(bytes[i]));
    if (bits & 7) items.push(`${bytes[bits >> 3] >> (8 - (bits & 7))}:${bits & 7}`);
    return `<<${items.join(',')}>>`;
  }
  if (rt.isType('is_map', term)) {
    const entries = [...term[1]].sort((a, b) => rt.compare(a[0], b[0]));
    return `#{${entries.map(([k, v]) => `${format(rt, k)} => ${format(rt, v)}`).join(',')}}`;
  }
  if (rt.isType('is_pid', term)) return '<pid>';
  if (rt.isType('is_reference', term)) return '<ref>';
  if (rt.isType('is_function', term)) return '<fun>';
  throw new TypeError(`unexpected scenario result: ${String(term)}`);
}

const otpFormatter = `
  F = fun Fmt(T) when is_pid(T) -> "<pid>";
          Fmt(T) when is_reference(T) -> "<ref>";
          Fmt(T) when is_function(T) -> "<fun>";
          Fmt(T) when is_tuple(T) -> ["{", lists:join(",", [Fmt(E) || E <- tuple_to_list(T)]), "}"];
          Fmt(T) when is_map(T) ->
              ["#{", lists:join(",", [[Fmt(K), " => ", Fmt(V)] || {K, V} <- lists:sort(maps:to_list(T))]), "}"];
          Fmt(T) when is_list(T) -> Fmt2 = fun L([H | Tl], Acc) -> L(Tl, [Fmt(H) | Acc]);
                                               L([], Acc) -> ["[", lists:join(",", lists:reverse(Acc)), "]"];
                                               L(Tl, Acc) -> ["[", lists:join(",", lists:reverse(Acc)), "|", Fmt(Tl), "]"]
                                           end, Fmt2(T, []);
          Fmt(T) -> io_lib:format("~w", [T])
      end,`;

// Compiles `fixtures/<module>.erl` and the listed OTP modules, then compares
// <module>:run(S) for every S in <module>:scenarios().
export async function otpDifferential({module, otpModules = [], minScenarios = 1, timeoutMs = 20000}) {
  const dir = mkdtempSync(join(tmpdir(), `beam2js-${module}-`));
  try {
    execFileSync('erlc', ['-o', dir, `fixtures/${module}.erl`], {stdio: 'pipe'});
    for (const otpModule of otpModules) {
      const beam = execFileSync('erl', ['-noshell', '-eval',
        `io:format("~s", [code:which(${otpModule})]), halt().`], {encoding: 'utf8'});
      execFileSync(compiler, [beam, join(dir, `${otpModule}.mjs`)]);
    }
    execFileSync(compiler, [join(dir, `${module}.beam`), join(dir, `${module}.mjs`)]);
    const otp = execFileSync('erl', ['-noshell', '-pa', dir, '-eval', `${otpFormatter}
      [io:format("result ~s ~ts~n", [S, F(${module}:run(S))]) || S <- ${module}:scenarios()], halt().`],
    {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
    const expected = new Map(otp.split('\n').filter(line => line.startsWith('result ')).map(line => {
      const [, scenario, result] = line.match(/^result (\S+) (.*)$/);
      return [scenario, result];
    }));
    assert.ok(expected.size >= minScenarios,
      `expected OTP results for at least ${minScenarios} scenarios, got ${expected.size}`);

    const rt = new Runtime({moduleBaseURL: pathToFileURL(`${dir}/`).href});
    const failures = [];
    for (const [scenario, want] of expected) {
      let got;
      try {
        let timer;
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timed out')), timeoutMs);
        });
        try {
          got = format(rt, await Promise.race([rt.invokeAsync(module, 'run', [rt.atom(scenario)]), timeout]));
        } finally {
          clearTimeout(timer);
        }
      } catch (error) {
        got = `exception: ${error.message}`;
      }
      if (got !== want) failures.push(`${scenario}: OTP ${want}, Beam2JS ${got}`);
    }
    return {failures, count: expected.size};
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
}
