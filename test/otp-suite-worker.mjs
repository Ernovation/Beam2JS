import {Runtime} from '../runtime/beam2js.mjs';
import {charlist, arrayToList, listToArray} from '../runtime/otp/term.mjs';
import {format} from './otp-differential.mjs';
import {makeMemoryDirectory} from '../runtime/otp/file.mjs';

const {baseURL, suite, testcase, groups, dataDir} = JSON.parse(process.argv[2]);
let output = '';
const processErrors = [];
const rt = new Runtime({
  moduleBaseURL: new URL('modules/', baseURL),
  fileBaseURL: baseURL,
  reductionLimit: 10000,
  stdout: text => { output = (output + text).slice(-2000); },
  onProcessError: (_pid, error) => {
    if (processErrors.length < 3) processErrors.push(error.message);
  },
  onHalt: () => { throw new Error('test attempted to halt the runtime'); },
});
const register = (module, definitions) => rt.registerModule(26, module,
  definitions.map(([name, arity, fn]) => ({name, arity, exported: true,
    run: (rt, args) => ({type: 'return', value: fn(rt, args)})})));
const ok = () => rt.atom('ok');
const fail = (_rt, [reason]) => rt.raiseError(rt.tuple([rt.atom('test_case_failed'), reason]));
register('ct', [
  ['fail', 1, fail], ['fail', 2, (_rt, args) => fail(rt, [rt.tuple(args)])],
  ...['log', 'pal', 'comment'].flatMap(name => [1, 2, 3].map(arity => [name, arity, ok])),
  ['timetrap', 1, () => rt.makeRef()],
]);
register('test_server', [
  ['timetrap', 1, () => rt.makeRef()], ['timetrap_cancel', 1, ok],
  ['is_native', 1, () => rt.atom('false')],
  ...[['seconds', 1000n], ['minutes', 60000n], ['hours', 3600000n]].map(([name, factor]) =>
    [name, 1, (_rt, [value]) => rt.callBif('trunc', [rt.callBif('*', [value, factor])])]),
]);
const privDir = `/__otp_test_private__/${suite}/${testcase}/`;
makeMemoryDirectory(rt, privDir);
const config = arrayToList(rt, [
  rt.tuple([rt.atom('data_dir'), charlist(rt, dataDir)]),
  rt.tuple([rt.atom('priv_dir'), charlist(rt, privDir)]),
  rt.tuple([rt.atom('testcase'), rt.atom(testcase)]),
  ...groups.map(group => rt.tuple([rt.atom('test_group'), rt.atom(group)])),
]);
function describe(term) {
  try { return format(rt, term).slice(0, 2500); }
  catch (error) { return `<unformattable term: ${error.message}>`; }
}
try {
  let testProcess;
  register('otp_opcode_test_controller', [['start', 0, () => {
    testProcess = rt.spawnProcess('otp_ct_driver', 'run',
      [rt.atom(suite), arrayToList(rt, groups.map(group => rt.atom(group))), rt.atom(testcase), config]);
    return testProcess.pid;
  }]]);
  await rt.invokeAsync('otp_opcode_test_controller', 'start', []);
  const value = await testProcess.result;
  const tag = rt.isType('is_tuple', value) && rt.tupleSize(value) > 0 ? rt.tupleElement(value, 1) : undefined;
  const status = typeof tag === 'symbol' && ['skip', 'skipped'].includes(Symbol.keyFor(tag)) ? 'skip' :
    tag === rt.atom('fail') ? 'fail' : 'pass';
  process.send({status, result: describe(value), output, processErrors});
} catch (error) {
  process.send({
    status: 'fail', error: error.message, reason: error.reason === undefined ? undefined : describe(error.reason),
    stack: listToArray(error.stack) === null ? error.stack?.toString() : describe(error.stack),
    cause: error.cause?.message, output, processErrors,
  });
}
