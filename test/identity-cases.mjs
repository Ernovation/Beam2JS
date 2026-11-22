export async function identityChecks(Runtime, registerModules) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const runtime = new Runtime({schedulers: 2, reductionLimit: 1});
  registerModules(runtime);
  const syncError = new Error('synchronous process failed');
  let failedSyncPid;
  runtime.registerModule(23, 'identity_probe', [{
    name: 'reenter', arity: 0, exported: true,
    run: (rt, args, state, budget, pid) => {
      const nested = rt.invoke('erlang', 'self', []);
      check(rt.isProcessAlive(pid) && !rt.isProcessAlive(nested), 'reentrant liveness is incorrect');
      return {type: 'return', value: nested};
    },
  }, {
    name: 'fail_sync', arity: 0, exported: true,
    run: (rt, args, state, budget, pid) => {
      failedSyncPid = pid;
      throw syncError;
    },
  }]);
  runtime.registerModule(23, 'erlang', [{
    name: 'self', arity: 0, exported: true,
    run: rt => ({type: 'return', value: rt.atom('shadow')}),
  }, {
    name: 'is_pid', arity: 1, exported: true,
    run: rt => ({type: 'return', value: rt.atom('shadow')}),
  }, {
    name: 'is_process_alive', arity: 1, exported: true,
    run: rt => ({type: 'return', value: rt.atom('shadow')}),
  }]);

  const pairProcess = runtime.spawnProcess('process_identity', 'self_pair', []);
  const otherProcess = runtime.spawnProcess('raw_bifs', 'self_pid', []);
  const reentrantProcess = runtime.spawnProcess('process_identity', 'reentrant', []);
  const rawProcesses = ['self_tail', 'self_last', 'self_call'].map(name =>
    runtime.spawnProcess('raw_identity', name, []));
  const failedProcess = runtime.spawnProcess('erlang', 'abs', [runtime.atom('bad')]);
  const failure = failedProcess.result.then(() => null, error => error);
  const wasAlive = runtime.isProcessAlive(pairProcess.pid) &&
    runtime.invoke('erlang', 'is_process_alive', [pairProcess.pid]) === runtime.atom('true') &&
    runtime.invoke('process_identity', 'alive', [pairProcess.pid]) === runtime.atom('true');
  check(runtime.invoke('raw_identity', 'alive_tail', [pairProcess.pid]) === runtime.atom('true') &&
    runtime.invoke('raw_identity', 'alive_last', [pairProcess.pid]) === runtime.atom('true') &&
    runtime.tupleElement(runtime.invoke('raw_identity', 'alive_call', [pairProcess.pid]), 1) === runtime.atom('true'),
  'external liveness calls failed');
  check(runtime.invoke('process_identity', 'alive_self', []) === runtime.atom('true'),
    'a running synchronous process was not alive');
  const [pair, other, reentrant, ...raw] = await Promise.all([
    pairProcess.result, otherProcess.result, reentrantProcess.result,
    ...rawProcesses.map(process => process.result),
  ]);
  const pid = runtime.tupleElement(pair, 1);
  check(pid === pairProcess.pid && runtime.tupleElement(pair, 2) === pid,
    'self changed across calls or scheduler yields');
  check(other === otherProcess.pid && other !== pid, 'process identities are not distinct');
  check(runtime.tupleElement(reentrant, 1) === reentrantProcess.pid &&
    runtime.tupleElement(reentrant, 3) === reentrantProcess.pid &&
    runtime.tupleElement(reentrant, 2) !== reentrantProcess.pid,
  'reentrant invocation changed the outer process identity');
  check(raw[0] === rawProcesses[0].pid && raw[1] === rawProcesses[1].pid &&
    runtime.tupleElement(raw[2], 1) === rawProcesses[2].pid, 'external self call lost process identity');

  const syncPid = runtime.invoke('erlang', 'self', []);
  check(runtime.isType('is_pid', syncPid) && syncPid !== pid, 'synchronous invocation identity is invalid');
  check(!runtime.isProcessAlive(syncPid), 'completed synchronous process is alive');
  let caughtSyncError = false;
  try {
    runtime.invoke('identity_probe', 'fail_sync', []);
  } catch (error) {
    caughtSyncError = error === syncError;
  }
  check(caughtSyncError && !runtime.isProcessAlive(failedSyncPid), 'failed synchronous process is alive');
  const failedError = await failure;
  check(failedError?.erlangClass === 'error' && !runtime.isProcessAlive(failedProcess.pid),
    'failed scheduled process is alive');
  check(runtime.invoke('raw_identity', 'alive_tail', [pid]) === runtime.atom('false') &&
    runtime.invoke('raw_identity', 'alive_last', [pid]) === runtime.atom('false') &&
    runtime.tupleElement(runtime.invoke('raw_identity', 'alive_call', [pid]), 1) === runtime.atom('false'),
  'external calls did not observe process termination');
  check(runtime.invoke('erlang', 'is_pid', [pid]) === runtime.atom('true'), 'callable is_pid failed');
  for (const name of ['is_integer', 'is_number', 'is_atom', 'is_boolean', 'is_float',
    'is_list', 'is_tuple', 'is_binary', 'is_bitstring']) {
    check(runtime.invoke('erlang', name, [pid]) === runtime.atom('false'), 'PID passed another type test');
  }
  for (const value of [1n, runtime.float(1), runtime.atom('atom'), runtime.nil(),
    runtime.cons(1n, runtime.nil()), runtime.tuple([]), runtime.bitstring([], 0), runtime.hostHandle({})]) {
    check(runtime.invoke('erlang', 'is_pid', [value]) === runtime.atom('false') &&
      runtime.invoke('process_identity', 'pid_guard', [value]) === runtime.atom('no') &&
      runtime.invoke('process_identity', 'pid_body', [value]) === runtime.atom('false'),
    'non-PID term passed a PID type test');
  }
  check(runtime.equalExact(runtime.tuple([pid]), runtime.tuple([pid])) &&
    !runtime.equalExact(runtime.tuple([pid]), runtime.tuple([other])) &&
    runtime.equalNumeric(runtime.cons(pid, runtime.nil()), runtime.cons(pid, runtime.nil())),
  'nested PID comparisons are incorrect');
  check(runtime.compare(pid, other) !== 0 &&
    runtime.compare(pid, other) === -runtime.compare(other, pid), 'PID ordering is inconsistent');
  check(runtime.isType('is_pid', pairProcess.pid), 'PID stopped being a term after termination');
  const foreignPid = new Runtime().invoke('erlang', 'self', []);
  check(foreignPid !== pid && runtime.isType('is_pid', foreignPid), 'runtime PID identities collided');
  const badarg = value => {
    try {
      runtime.invoke('erlang', 'is_process_alive', [value]);
    } catch (error) {
      return error.erlangClass === 'error' && error.reason === runtime.atom('badarg');
    }
    return false;
  };
  check(badarg(runtime.atom('bad')) && badarg(foreignPid), 'invalid or foreign PID did not raise badarg');
  const foreignRuntime = new Runtime();
  const foreignLive = foreignRuntime.spawnProcess('erlang', 'abs', [-1n]);
  check(badarg(foreignLive.pid), 'foreign live PID did not raise badarg');
  await foreignLive.result;
  for (const name of ['alive_tail', 'alive_last', 'alive_call']) {
    let failed = false;
    try {
      runtime.invoke('raw_identity', name, [runtime.atom('bad')]);
    } catch (error) {
      failed = error.erlangClass === 'error' && error.reason === runtime.atom('badarg');
    }
    check(failed, 'external liveness call did not propagate badarg');
  }
  const recipient = runtime.spawnProcess('process_identity', 'self_pid', []);
  runtime.sendMessage(recipient, pid);
  check(runtime.processMailbox(recipient)[0] === pid, 'PID was not preserved in the mailbox');
  await recipient.result;
  let invalidHandle = false;
  try {
    runtime.sendMessage(pid, 1n);
  } catch (error) {
    invalidHandle = /process from this runtime/.test(error.message);
  }
  check(invalidHandle, 'PID must not be accepted as a host process handle');

  const observations = [
    runtime.isType('is_pid', pid),
    runtime.tupleElement(pair, 1) === runtime.tupleElement(pair, 2),
    pid === pairProcess.pid,
    runtime.invoke('process_identity', 'pid_guard', [pid]) === runtime.atom('yes'),
    runtime.invoke('process_identity', 'pid_guard', [1n]) === runtime.atom('no'),
    runtime.invoke('process_identity', 'pid_body', [pid]) === runtime.atom('true'),
    runtime.invoke('process_identity', 'pid_body', [1n]) === runtime.atom('false'),
    runtime.invoke('process_identity', 'compare_self', []) === runtime.atom('same'),
    runtime.invoke('process_identity', 'compare', [other]) === runtime.atom('different'),
    runtime.compare(runtime.atom('atom'), pid) < 0,
    runtime.compare(pid, runtime.tuple([])) < 0,
    runtime.invoke('process_identity', 'pid_order', [pid]) === runtime.atom('yes'),
    runtime.invoke('process_identity', 'pid_order', [runtime.atom('atom')]) === runtime.atom('no'),
    wasAlive,
    runtime.invoke('process_identity', 'alive_self', []) === runtime.atom('true'),
    runtime.invoke('process_identity', 'alive', [pid]) === runtime.atom('false'),
    !runtime.isProcessAlive(failedProcess.pid),
    !runtime.isProcessAlive(syncPid),
    badarg(runtime.atom('bad')),
    badarg(foreignPid),
  ];
  return `[${observations.join(',')}]`;
}
