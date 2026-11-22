export async function spawnChecks(Runtime, registerModules) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const errors = [];
  const hostError = new Error('spawned host failure');
  const runtime = new Runtime({schedulers: 2, reductionLimit: 2,
    onProcessError: (pid, error) => errors.push([pid, error])});
  registerModules(runtime);
  const seen = [];
  runtime.registerModule(23, 'spawn_probe', [{
    name: 'record', arity: 3, exported: true,
    run: (rt, args, state, budget, pid) => {
      seen.push([pid, ...args]);
      return {type: 'return', value: rt.atom('ok')};
    },
  }, {
    name: 'arity255', arity: 255, exported: true,
    run: (rt, args) => ({type: 'return', value: args[254]}),
  }, {
    name: 'arity256', arity: 256, exported: true,
    run: rt => ({type: 'return', value: rt.atom('should_not_run')}),
  }, {
    name: 'private', arity: 0, exported: false,
    run: rt => ({type: 'return', value: rt.atom('should_not_run')}),
  }, {
    name: 'fail', arity: 0, exported: true,
    run: () => { throw hostError; },
  }]);
  runtime.registerModule(23, 'erlang', [{
    name: 'spawn', arity: 3, exported: true,
    run: rt => ({type: 'return', value: rt.atom('shadow')}),
  }]);
  const atom = name => runtime.atom(name);
  const list = values => values.reduceRight((tail, value) => runtime.cons(value, tail), runtime.nil());
  const target = [atom('spawn_probe'), atom('record'), list([atom('observer'), 3n, 4n])];
  const child = runtime.invoke('process_spawn', 'start', target);
  check(runtime.isType('is_pid', child) && runtime.isProcessAlive(child), 'spawn did not create a live PID');
  const handle = runtime.processHandle(child);
  check(handle.pid === child && runtime.processHandle(child) === handle, 'PID did not resolve to its process handle');
  check(await handle.result === atom('ok') && !runtime.isProcessAlive(child), 'child did not complete');
  check(runtime.processHandle(child) === handle, 'completed child handle was lost');
  const recorded = seen.some(([pid, observer, first, second]) =>
    pid === child && observer === atom('observer') && first === 3n && second === 4n);
  check(recorded, 'child identity or arguments were not preserved');

  const parent = runtime.spawnProcess('process_spawn', 'parent_child', []);
  const pair = await parent.result;
  const parentPid = runtime.tupleElement(pair, 1);
  const nestedPid = runtime.tupleElement(pair, 2);
  check(parentPid === parent.pid && nestedPid !== parentPid, 'parent and child identities were not isolated');
  check(await runtime.processHandle(nestedPid).result === nestedPid, 'child self/0 returned the wrong PID');

  const wrapped = runtime.invoke('process_spawn', 'across', target);
  const wrappedPid = runtime.tupleElement(wrapped, 2);
  check(runtime.tupleElement(wrapped, 1) === atom('started') && runtime.isType('is_pid', wrappedPid),
    'non-tail spawn did not preserve its continuation');
  await runtime.processHandle(wrappedPid).result;
  const rawResults = [];
  for (const name of ['tail', 'last', 'call']) {
    const result = runtime.invoke('raw_spawn', name, target);
    const pid = name === 'call' ? runtime.tupleElement(result, 1) : result;
    rawResults.push(runtime.isType('is_pid', pid));
    await runtime.processHandle(pid).result;
    check(seen.some(([observed]) => observed === pid), 'external spawn form did not run its child');
  }

  const badarg = args => {
    try {
      runtime.invoke('process_spawn', 'start', args);
    } catch (error) {
      return error.erlangClass === 'error' && error.reason === atom('badarg');
    }
    return false;
  };
  const invalid = [
    [1n, atom('record'), runtime.nil()],
    [atom('spawn_probe'), 1n, runtime.nil()],
    [atom('spawn_probe'), atom('record'), atom('bad')],
    [atom('spawn_probe'), atom('record'), runtime.cons(1n, atom('bad'))],
  ].map(badarg);
  check(invalid.every(Boolean), 'invalid spawn arguments did not raise badarg');
  const longImproper = Array.from({length: 256}, (_, i) => BigInt(i))
    .reduceRight((tail, value) => runtime.cons(value, tail), atom('bad'));
  check(badarg([atom('spawn_probe'), atom('record'), longImproper]),
    'oversized improper argument list did not raise badarg');

  const missingPid = runtime.invoke('erlang', 'spawn', [atom('missing'), atom('function'), runtime.nil()]);
  check(runtime.isProcessAlive(missingPid), 'missing-target child was not initially alive');
  const missingError = await runtime.processHandle(missingPid).result.then(() => null, error => error);
  check(/undefined or unsupported function/.test(missingError?.message), 'missing target did not fail in child');
  check(!runtime.isProcessAlive(missingPid), 'failed child is still alive');
  const badPid = runtime.invoke('erlang', 'spawn', [atom('erlang'), atom('abs'), list([atom('bad')])]);
  const badError = await runtime.processHandle(badPid).result.then(() => null, error => error);
  check(badError?.erlangClass === 'error' && badError.reason === atom('badarg'),
    'child Erlang failure was lost');
  const privatePid = runtime.invoke('erlang', 'spawn', [atom('spawn_probe'), atom('private'), runtime.nil()]);
  const privateError = await runtime.processHandle(privatePid).result.then(() => null, error => error);
  check(/undefined or unsupported function/.test(privateError?.message), 'private child function was executed');
  const hostPid = runtime.invoke('erlang', 'spawn', [atom('spawn_probe'), atom('fail'), runtime.nil()]);
  const observedHostError = await runtime.processHandle(hostPid).result.then(() => null, error => error);
  check(observedHostError === hostError, 'child host error was wrapped or lost');
  const list255 = list(Array.from({length: 255}, (_, i) => BigInt(i)));
  const pid255 = runtime.invoke('erlang', 'spawn', [atom('spawn_probe'), atom('arity255'), list255]);
  check(await runtime.processHandle(pid255).result === 254n, '255-argument child did not run');
  const list256 = list(Array.from({length: 256}, (_, i) => BigInt(i)));
  const pid256 = runtime.invoke('erlang', 'spawn', [atom('spawn_probe'), atom('arity256'), list256]);
  const arityError = await runtime.processHandle(pid256).result.then(() => null, error => error);
  check(/unsupported function arity/.test(arityError?.message), 'oversized child arity did not fail');
  check([missingPid, badPid, privatePid, hostPid, pid256].every((pid, i) =>
    errors.some(([reported, error]) => reported === pid &&
      error === [missingError, badError, privateError, hostError, arityError][i])),
  'child failure was not reported to the host');
  check(errors.length === 5, 'child failures were reported more than once');
  const hostProcess = runtime.spawnProcess('spawn_probe', 'fail', []);
  check(await hostProcess.result.then(() => null, error => error) === hostError && errors.length === 5,
    'host-created process failure was not confined to its result promise');

  let invalidHandle = false;
  try {
    runtime.processHandle(runtime.invoke('erlang', 'self', []));
  } catch (error) {
    invalidHandle = /scheduled process PID/.test(error.message);
  }
  check(invalidHandle, 'synchronous PID resolved to a scheduled process handle');
  invalidHandle = false;
  const foreignRuntime = new Runtime();
  const foreignProcess = foreignRuntime.spawnProcess('erlang', 'abs', [-1n]);
  try {
    runtime.processHandle(foreignProcess.pid);
  } catch (error) {
    invalidHandle = /scheduled process PID/.test(error.message);
  }
  check(invalidHandle, 'foreign PID resolved to a process handle');
  await foreignProcess.result;
  let invalidReporter = false;
  try {
    new Runtime({onProcessError: null});
  } catch (error) {
    invalidReporter = /onProcessError/.test(error.message);
  }
  check(invalidReporter, 'invalid child error reporter was accepted');

  const logs = [];
  const originalError = console.error;
  try {
    console.error = (...args) => logs.push(args);
    const defaultRuntime = new Runtime();
    const defaultPid = defaultRuntime.invoke('erlang', 'spawn',
      [defaultRuntime.atom('missing'), defaultRuntime.atom('function'), defaultRuntime.nil()]);
    const defaultError = await defaultRuntime.processHandle(defaultPid).result.then(() => null, error => error);
    check(logs.length === 1 && logs[0][1] === defaultError, 'default child error reporter did not log the failure');
  } finally {
    console.error = originalError;
  }

  return `[${[
    runtime.isType('is_pid', child), recorded, parentPid !== nestedPid,
    runtime.tupleElement(wrapped, 1) === atom('started') && runtime.isType('is_pid', wrappedPid),
    ...rawResults, ...invalid, runtime.isType('is_pid', missingPid), runtime.isType('is_pid', pid256),
  ].join(',')}]`;
}
