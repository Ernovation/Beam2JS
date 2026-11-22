export async function schedulerChecks(Runtime, ErlangError, registerModules) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const throws = (fn, pattern) => {
    try {
      fn();
    } catch (error) {
      check(pattern.test(error.message), `unexpected error: ${error.message}`);
      return;
    }
    throw new Error(`expected error: ${pattern}`);
  };

  throws(() => new Runtime({schedulers: 0}), /positive safe integers/);
  throws(() => new Runtime({reductionLimit: 0}), /positive safe integers/);
  const runtime = new Runtime({schedulers: 2, reductionLimit: 1});
  registerModules(runtime);
  const progress = [];
  const hostError = new Error('host process failure');
  let timerRanDuringWork = false;
  let allDone = false;
  runtime.registerModule(25, 'scheduler_probe', [{
    name: 'mark', arity: 2, exported: true,
    run: (rt, [id, remaining]) => {
      progress.push([id, remaining]);
      if (progress.length === 1) {
        setTimeout(() => { timerRanDuringWork = !allDone; }, 0);
      }
      return {type: 'return', value: rt.atom('ok')};
    },
  }]);
  runtime.registerModule(25, 'scheduler_host', [{
    name: 'fail', arity: 0, exported: true,
    run: () => { throw hostError; },
  }, {
    name: 'yield', arity: 0, exported: true,
    run: () => ({type: 'yield', state: {}, registers: []}),
  }]);
  throws(() => runtime.invoke('scheduler_host', 'yield', []), /unexpected yield/);

  const args = [11n, 8n];
  const first = runtime.spawnProcess('scheduler_fixture', 'count', args);
  args[0] = 99n;
  const second = runtime.spawnProcess('scheduler_fixture', 'count', [22n, 8n]);
  const busy = runtime.spawnProcess('raw_scheduler', 'busy', [40n]);
  const quick = runtime.spawnProcess('erlang', 'abs', [-7n]);
  const float = runtime.spawnProcess('raw_float_registers', 'add_alias',
    [runtime.float(1.5), runtime.float(2.5)]);
  const stack = runtime.spawnProcess('calls', 'stack', [11n, 22n, 33n, 44n]);
  const failed = runtime.spawnProcess('arithmetic_body', 'absolute', [runtime.atom('bad')]);
  const failure = failed.result.then(() => null, error => error);
  const hostFailed = runtime.spawnProcess('scheduler_host', 'fail', []);
  const hostFailure = hostFailed.result.then(() => null, error => error);
  const missing = runtime.spawnProcess('missing', 'function', []);
  const missingFailure = missing.result.then(() => null, error => error);

  runtime.sendMessage(first, runtime.atom('first'));
  runtime.sendMessage(first, runtime.tuple([1n, 2n]));
  runtime.sendMessage(second, runtime.atom('second'));
  const snapshot = runtime.processMailbox(first);
  snapshot.pop();
  check(runtime.processMailbox(first).length === 2, 'mailbox snapshot must not mutate the queue');
  check(runtime.processMailbox(second).length === 1, 'mailboxes must be isolated');
  check(runtime.processMailbox(first)[0] === runtime.atom('first'), 'mailbox order changed');
  throws(() => runtime.sendMessage(first, {}), /supported Erlang term/);
  throws(() => new Runtime().sendMessage(first, 1n), /process from this runtime/);
  throws(() => runtime.spawnProcess('erlang', 'abs', [1]), /supported Erlang terms/);

  const winner = await Promise.race([
    busy.result.then(() => 'busy'),
    quick.result.then(() => 'quick'),
  ]);
  check(winner === 'quick', 'backward jump loop blocked the runnable queue');
  const [a, b, busyResult, quickResult, floatResult, stackResult, error, hostFailureResult, missingError] = await Promise.all([
    first.result, second.result, busy.result, quick.result, float.result, stack.result, failure, hostFailure, missingFailure,
  ]);
  allDone = true;
  check(timerRanDuringWork, 'scheduler did not yield to the host event loop');
  check(progress.length === 16, 'process progress was lost or duplicated');
  const firstLast = progress.findIndex(([id, n]) => id === 11n && n === 1n);
  const secondLast = progress.findIndex(([id, n]) => id === 22n && n === 1n);
  check(progress.findIndex(([id]) => id === 22n) < firstLast &&
    progress.findIndex(([id]) => id === 11n) < secondLast, 'processes did not interleave');
  for (const id of [11n, 22n]) {
    check(progress.filter(([actual]) => actual === id).every(([, n], i) => n === 8n - BigInt(i)),
      'process execution state was corrupted');
  }
  check(busyResult === runtime.atom('done') && quickResult === 7n, 'incorrect runnable result');
  check(runtime.floatValue(floatResult) === 4, 'floating registers did not survive a yield');
  check(runtime.tupleElement(runtime.tupleElement(stackResult, 1), 1) === 11n &&
    runtime.tupleElement(runtime.tupleElement(stackResult, 1), 2) === 22n &&
    runtime.tupleElement(stackResult, 2) === 33n &&
    runtime.tupleElement(stackResult, 3) === 44n, 'stack or continuation state was corrupted');
  check(error instanceof ErlangError && error.reason === runtime.atom('badarg'), 'process failure was lost');
  check(hostFailureResult === hostError, 'host error was wrapped or lost');
  check(/undefined or unsupported function/.test(missingError?.message), 'resolution failure was lost');
  throws(() => runtime.sendMessage(first, 1n), /terminated process/);
  throws(() => runtime.sendMessage(failed, 1n), /terminated process/);
  const singleScheduler = new Runtime({reductionLimit: 1});
  const singleResults = await Promise.all([-1n, -2n].map(value =>
    singleScheduler.spawnProcess('erlang', 'abs', [value]).result));
  check(singleResults[0] === 1n && singleResults[1] === 2n, 'single-scheduler queue failed');

  return [a, b].map(value =>
    `{${runtime.tupleElement(value, 1)},${runtime.tupleElement(value, 2)}}`);
}
