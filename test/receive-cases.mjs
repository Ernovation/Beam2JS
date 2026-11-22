export async function receiveChecks(Runtime, registerModules) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const within = promise => {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('receive test timed out')), 5000);
    })]).finally(() => clearTimeout(timer));
  };
  const rt = new Runtime({schedulers: 2, reductionLimit: 1000});
  registerModules(rt);
  let mark;
  rt.registerModule(23, 'receive_probe', [{
    name: 'mark', arity: 0, exported: true,
    run: runtime => {
      if (!mark) throw new Error('unexpected receive probe');
      mark();
      mark = undefined;
      return {type: 'return', value: runtime.atom('ok')};
    },
  }]);
  const atom = name => rt.atom(name);
  const tuple = (tag, value) => rt.tuple([atom(tag), value]);
  const syncSelf = rt.invoke('process_receive', 'self_select', []) === 42n;
  check(syncSelf, 'synchronous receive did not consume a self-sent message');
  let blocking = false;
  try {
    rt.invoke('process_receive', 'wanted', []);
  } catch (error) {
    blocking = /synchronous invocation cannot wait/.test(error.message);
  }
  check(blocking, 'blocking synchronous receive did not fail explicitly');

  const select = rt.spawnProcess('process_receive', 'wanted', []);
  const ignored = atom('ignored');
  const wanted1 = tuple('wanted', 1n);
  const wanted2 = tuple('wanted', 2n);
  rt.sendMessage(select, ignored);
  rt.sendMessage(select, wanted1);
  rt.sendMessage(select, wanted2);
  const selected = await within(select.result) === 1n;
  const remaining = rt.processMailbox(select);
  check(selected && remaining.length === 2 && remaining[0] === ignored && remaining[1] === wanted2,
    'selective receive did not preserve unmatched messages');

  const two = rt.spawnProcess('process_receive', 'two', []);
  const second = tuple('second', 2n);
  rt.sendMessage(two, second);
  rt.sendMessage(two, tuple('first', 1n));
  const pair = await within(two.result);
  const reset = rt.tupleElement(pair, 1) === 1n && rt.tupleElement(pair, 2) === 2n &&
    rt.processMailbox(two).length === 0;
  check(reset, 'receive cursor was not reset after removing a message');

  const guarded = rt.spawnProcess('process_receive', 'guarded', []);
  const bad = tuple('number', atom('bad'));
  const negative = tuple('number', -1n);
  rt.sendMessage(guarded, bad);
  rt.sendMessage(guarded, negative);
  rt.sendMessage(guarded, tuple('number', 7n));
  const guards = await within(guarded.result) === 7n &&
    rt.processMailbox(guarded)[0] === bad && rt.processMailbox(guarded)[1] === negative;
  check(guards, 'guard failures did not leave unmatched messages in order');

  const entered = new Promise(resolve => { mark = resolve; });
  const waiting = rt.spawnProcess('process_receive', 'announced', []);
  await within(entered);
  let settled = false;
  waiting.result.then(() => { settled = true; }, () => { settled = true; });
  check(rt.isProcessAlive(waiting.pid) && !settled, 'waiting process was not alive');
  rt.sendMessage(waiting, ignored);
  await new Promise(resolve => setTimeout(resolve, 30));
  check(!settled && rt.isProcessAlive(waiting.pid), 'unmatched message completed a waiting receive');
  rt.invoke('erlang', 'send', [waiting.pid, tuple('wanted', 42n)]);
  const wake = await within(waiting.result) === 42n && rt.processMailbox(waiting)[0] === ignored;
  check(wake, 'PID send did not wake the selective receiver');

  const enteredChild = new Promise(resolve => { mark = resolve; });
  const childReceiver = rt.spawnProcess('process_receive', 'announced', []);
  await within(enteredChild);
  const childMessage = tuple('wanted', 77n);
  const childPid = rt.invoke('erlang', 'spawn', [
    atom('process_send'), atom('send'), rt.cons(childReceiver.pid, rt.cons(childMessage, rt.nil())),
  ]);
  const exchanged = await within(rt.processHandle(childPid).result) === childMessage &&
    await within(childReceiver.result) === 77n;
  check(exchanged, 'Erlang-spawned sender did not wake a waiting receiver');

  const enteredSecond = new Promise(resolve => { mark = resolve; });
  const phased = rt.spawnProcess('process_receive', 'two_announced', []);
  const earlySecond = tuple('second', 20n);
  rt.sendMessage(phased, earlySecond);
  rt.sendMessage(phased, tuple('first', 10n));
  await within(enteredSecond);
  const phasedResult = await within(phased.result);
  const twoPhases = rt.tupleElement(phasedResult, 1) === 10n &&
    rt.tupleElement(phasedResult, 2) === 20n && rt.processMailbox(phased).length === 0;
  check(twoPhases, 'second receive lost a message from before the first match');

  let count = 0;
  let parked;
  const parkEntered = new Promise(resolve => { parked = resolve; });
  rt.registerModule(23, 'receive_host', [{
    name: 'park', arity: 0, exported: true,
    run: (runtime, args, state, budget, pid) => {
      count++;
      if (!state) {
        parked();
        return {type: 'wait', state: {resume: true}, registers: args};
      }
      const value = runtime.receiveMessage(pid);
      runtime.removeMessage(pid);
      return {type: 'return', value};
    },
  }, {
    name: 'race', arity: 0, exported: true,
    run: (runtime, args, state, budget, pid) => {
      if (!state) {
        check(runtime.receiveMessage(pid) === null, 'race probe started with a message');
        runtime.sendPidMessage(pid, runtime.atom('raced'));
        return {type: 'wait', state: {resume: true}, registers: args};
      }
      const value = runtime.receiveMessage(pid);
      runtime.removeMessage(pid);
      return {type: 'return', value};
    },
  }]);
  const parkedProcess = rt.spawnProcess('receive_host', 'park', []);
  await within(parkEntered);
  await new Promise(resolve => setTimeout(resolve, 30));
  check(count === 1, 'a waiting process was repeatedly scheduled without a message');
  rt.sendMessage(parkedProcess, atom('first'));
  rt.sendMessage(parkedProcess, atom('second'));
  check(await within(parkedProcess.result) === atom('first') && count === 2 &&
    rt.processMailbox(parkedProcess)[0] === atom('second'),
  'wakeup scheduled a waiting process more than once or lost a message');
  const raced = rt.spawnProcess('receive_host', 'race', []);
  const race = await within(raced.result) === atom('raced');
  check(race, 'message arriving before wait was missed');

  const slicedRuntime = new Runtime({schedulers: 2, reductionLimit: 2});
  registerModules(slicedRuntime);
  const sliced = slicedRuntime.spawnProcess('process_receive', 'wanted', []);
  for (let i = 0; i < 12; i++) slicedRuntime.sendMessage(sliced, BigInt(i));
  slicedRuntime.sendMessage(sliced, slicedRuntime.tuple([slicedRuntime.atom('wanted'), 99n]));
  check(await within(sliced.result) === 99n && slicedRuntime.processMailbox(sliced).length === 12,
    'mailbox scan failed across scheduler yields');
  return `[${[selected, reset, guards, syncSelf, wake, exchanged, twoPhases, race].join(',')}]`;
}
