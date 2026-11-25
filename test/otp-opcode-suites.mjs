import {spawn, fork, execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, join, relative, dirname} from 'node:path';

const root = resolve('docs/background/otp_src_29.1.2');
const output = resolve('_build/otp-opcode-tests');
const args = process.argv.slice(2);
const option = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const selectedSuite = option('suite');
const selectedCase = option('case');
const suiteNames = selectedSuite?.split(',');
const caseNames = selectedCase?.split(',');
for (const arg of args) {
  if (!['--skip-build', '--catalog-only'].includes(arg) && !/^--(suite|case|timeout|concurrency|report)=.+$/.test(arg)) {
    throw new Error(`unknown or empty option: ${arg}`);
  }
}
const timeoutMs = Number(option('timeout', '5000'));
const concurrency = Number(option('concurrency', '2'));
const heapMiB = Number(option('heap', '1024'));
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 ||
    !Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 4) {
  throw new Error('timeout must be positive and concurrency must be between 1 and 4');
}
if (!Number.isSafeInteger(heapMiB) || heapMiB < 64) throw new Error('heap must be at least 64 MiB');
const report = resolve(option('report', join(output, 'results.json')));
mkdirSync(dirname(report), {recursive: true});
const env = {...process.env, ERL_FLAGS: '+S 2:2 +SDio 1 +SDcpu 1',
  ERL_CRASH_DUMP: join(output, 'erl_crash.dump')};
const opcodeSuites = new Set([
  'after_SUITE', 'beam_SUITE', 'beam_literals_SUITE', 'big_SUITE', 'binary_SUITE',
  'bs_bincomp_SUITE', 'bs_bit_binaries_SUITE', 'bs_construct_SUITE', 'bs_match_bin_SUITE',
  'bs_match_int_SUITE', 'bs_match_misc_SUITE', 'bs_match_tail_SUITE', 'bs_utf_SUITE',
  'exception_SUITE', 'float_SUITE', 'fun_SUITE', 'guard_SUITE', 'map_SUITE',
  'native_record_SUITE', 'nested_SUITE', 'op_SUITE', 'receive_SUITE', 'small_SUITE', 'tuple_SUITE',
  'andor_SUITE', 'apply_SUITE', 'beam_block_SUITE', 'beam_bounds_SUITE', 'beam_except_SUITE',
  'beam_jump_SUITE', 'beam_reorder_SUITE', 'beam_ssa_SUITE', 'beam_type_SUITE', 'beam_utils_SUITE',
  'bs_match_SUITE', 'bs_size_expr_SUITE', 'core_alias_SUITE', 'core_fold_SUITE',
  'inline_SUITE', 'lc_SUITE', 'match_SUITE', 'maybe_SUITE', 'mc_SUITE', 'misc_SUITE',
  'overridden_bif_SUITE', 'record_SUITE', 'regressions_SUITE', 'trycatch_SUITE', 'zlc_SUITE',
]);
mkdirSync(output, {recursive: true});
if (!args.includes('--skip-build')) {
  execFileSync('erlc', ['-o', output, 'test/otp_suite_catalog.erl'], {env, stdio: 'inherit'});
  execFileSync('erl', ['-pa', output, resolve('_build/default/lib/beam2js/ebin'),
    '-noshell', '-eval', '[Root,Output]=init:get_plain_arguments(), otp_suite_catalog:main([Root,Output]), halt().',
    '-extra', root, output], {env, stdio: 'inherit', timeout: 180000});
}
// The Common Test lifecycle driver is small; always keep it current.
for (const kind of ['emulator', 'compiler']) {
  mkdirSync(join(output, kind), {recursive: true});
  execFileSync('erlc', ['-o', join(output, kind), 'test/otp_ct_driver.erl'], {env, stdio: 'inherit'});
}
const catalog = JSON.parse(readFileSync(join(output, 'catalog.json'), 'utf8'));
if (args.includes('--catalog-only')) {
  console.log(`Catalogued ${catalog.length} suites in ${join(output, 'catalog.json')}`);
  process.exit(0);
}
const suites = catalog.filter(suite => suiteNames ? suiteNames.includes(`${suite.kind}/${suite.name}`) :
  opcodeSuites.has(suite.name));
if (!suites.length) throw new Error('no matching suites');
if (suiteNames?.some(name => !suites.some(suite => `${suite.kind}/${suite.name}` === name))) {
  throw new Error('one or more requested suites were not found');
}
if (caseNames?.some(name => !suites.some(suite => suite.cases?.some(test => test.testcase === name)))) {
  throw new Error('one or more requested testcases were not found');
}
const servers = [];
function startServer(kind) {
  return new Promise((resolve, reject) => {
    const server = spawn('_build/default/bin/beam2js', ['serve', '--port', '0', '--pa', join(output, kind)],
      {env, stdio: ['ignore', 'pipe', 'pipe']});
    servers.push(server);
    let text = '';
    const timer = setTimeout(() => reject(new Error(`server startup timed out: ${text}`)), 30000);
    const read = chunk => {
      text += chunk;
      const match = /Serving on (http:\/\/127\.0\.0\.1:\d+\/)/.exec(text);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    };
    server.stdout.on('data', read);
    server.stderr.on('data', read);
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`server exited ${code}: ${text}`)); });
  });
}
function runCase(data) {
  return new Promise(resolve => {
    const worker = fork(new URL('./otp-suite-worker.mjs', import.meta.url), [JSON.stringify(data)], {
      execArgv: [`--max-old-space-size=${heapMiB}`, '--experimental-network-imports', '--no-warnings'],
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let diagnostics = '';
    worker.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-2500); });
    const timer = setTimeout(() => finish({status: 'timeout', error: `exceeded ${timeoutMs}ms`}), timeoutMs);
    let completed = false;
    function finish(result) {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      if (worker.exitCode !== null || worker.signalCode !== null) return resolve(result);
      worker.once('exit', () => resolve(result));
      worker.kill('SIGKILL');
    }
    worker.once('message', finish);
    worker.once('error', error => finish({status: 'fail', error: error.message}));
    worker.once('exit', (code, signal) => {
      if (!completed) finish({status: diagnostics.includes('heap out of memory') ? 'resource_limit' : 'fail',
        error: `test process exited without result: ${signal ?? code}`, diagnostics});
    });
  });
}
const results = [];
try {
  const bases = new Map(await Promise.all([...new Set(suites.map(s => s.kind))]
    .map(async kind => [kind, await startServer(kind)])));
  const jobs = [];
  for (const suite of suites) {
    if (!suite.compiled || !suite.cases) {
      results.push({suite: `${suite.kind}/${suite.name}`, status: 'blocked',
        error: suite.compile_error ?? suite.discovery_error});
      continue;
    }
    for (const test of suite.cases.filter(test => !caseNames || caseNames.includes(test.testcase))) {
      jobs.push({suite, test});
    }
  }
  if (!jobs.length && !results.length) throw new Error('no testcases were selected');
  let next = 0;
  await Promise.all(Array.from({length: concurrency}, async () => {
    while (next < jobs.length) {
      const {suite, test} = jobs[next++];
      const result = await runCase({baseURL: bases.get(suite.kind), suite: suite.name,
        testcase: test.testcase, groups: test.groups,
        dataDir: `/${relative(resolve('.'), join(root, suite.kind === 'emulator' ?
          'erts/emulator/test' : 'lib/compiler/test', `${suite.name}_data`))}/`});
      const row = {suite: `${suite.kind}/${suite.name}`, testcase: test.testcase, groups: test.groups, ...result};
      results.push(row);
      console.log(`${row.status} ${row.suite}:${row.testcase} ${row.error ?? ''}`);
      writeFileSync(report, JSON.stringify(results, null, 2) + '\n');
    }
  }));
  writeFileSync(report, JSON.stringify(results, null, 2) + '\n');
} finally {
  await Promise.all(servers.map(server => new Promise(resolve => {
    if (server.exitCode !== null) return resolve();
    server.once('exit', resolve);
    server.kill();
  })));
}
const counts = {};
for (const row of results) counts[row.status] = (counts[row.status] ?? 0) + 1;
console.log(JSON.stringify(counts));
if (results.some(row => !['pass', 'skip'].includes(row.status))) process.exitCode = 1;
