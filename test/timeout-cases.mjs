export class FakeClock {
  time = 0;
  next = 0;
  timers = new Map();

  now() { return this.time; }
  setTimeout(callback, delay) {
    const handle = ++this.next;
    this.timers.set(handle, {callback, due: this.time + delay, delay});
    return handle;
  }
  clearTimeout(handle) { this.timers.delete(handle); }
  advance(delay) {
    const target = this.time + delay;
    while (true) {
      const next = [...this.timers].sort((a, b) => a[1].due - b[1].due)[0];
      if (!next || next[1].due > target) break;
      this.time = next[1].due;
      this.timers.delete(next[0]);
      next[1].callback();
    }
    this.time = target;
  }
  fireEarly() {
    const [handle, timer] = this.timers.entries().next().value;
    this.timers.delete(handle);
    timer.callback();
  }
}

export async function timeoutChecks(Runtime, registerModules) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const within = promise => {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout test timed out')), 5000);
    })]).finally(() => clearTimeout(timer));
  };
  const clock = new FakeClock();
  const rt = new Runtime({schedulers: 2, reductionLimit: 1000, clock});
  registerModules(rt);
  let mark;
  const waitMark = () => new Promise(resolve => { mark = resolve; });
  rt.registerModule(26, 'receive_probe', [{
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
  const poll = rt.invoke('receive_timeout', 'poll', []) === atom('timeout');
  const zero = rt.invoke('receive_timeout', 'timed', [0n]) === atom('timeout');
  const matched = rt.spawnProcess('receive_timeout', 'timed', [0n]);
  rt.sendMessage(matched, atom('ignored'));
  rt.sendMessage(matched, tuple('wanted', 1n));
  const found = await within(matched.result);
  const zeroMatch = rt.tupleElement(found, 1) === atom('message') &&
    rt.tupleElement(found, 2) === 1n && rt.processMailbox(matched)[0] === atom('ignored');
  const invalid = value => {
    try {
      rt.invoke('receive_timeout', 'timed', [value]);
    } catch (error) {
      return error.erlangClass === 'error' && error.reason === atom('timeout_value');
    }
    return false;
  };
  const invalids = [-1n, 4294967296n, 1n << 80n, rt.float(1), atom('bad')].map(invalid);
  const matchedInvalid = rt.invoke('receive_timeout', 'self_timed', [-1n]);
  const matchedBeforeValidation = rt.tupleElement(matchedInvalid, 1) === atom('message') &&
    rt.tupleElement(matchedInvalid, 2) === atom('found');
  const resetResult = rt.invoke('receive_timeout', 'reset_after', []);
  const reset = rt.tupleElement(resetResult, 1) === atom('timeout') && rt.tupleElement(resetResult, 2) === 123n;
  check(poll && zero && zeroMatch && invalids.every(Boolean) && matchedBeforeValidation && reset,
    'zero timeout, argument validation or timeout cursor reset failed');

  let entered = waitMark();
  const delayed = rt.spawnProcess('receive_timeout', 'announced', [100n]);
  await within(entered);
  check([...clock.timers.values()][0]?.delay === 100, 'timeout was not armed');
  clock.fireEarly();
  check([...clock.timers.values()][0]?.due === 100, 'early clock callback was not rearmed');
  clock.advance(40);
  rt.sendMessage(delayed, atom('ignored'));
  await new Promise(resolve => setTimeout(resolve, 30));
  check([...clock.timers.values()][0]?.due === 100, 'unmatched message restarted the timeout');
  clock.advance(59);
  let done = false;
  delayed.result.then(() => { done = true; }, () => { done = true; });
  await Promise.resolve();
  check(!done, 'timeout occurred before its deadline');
  clock.advance(1);
  const delayedResult = await within(delayed.result);
  const timeout = delayedResult === atom('timeout') && rt.processMailbox(delayed)[0] === atom('ignored');
  check(timeout && clock.timers.size === 0, 'timeout did not preserve unmatched messages or clear its timer');

  entered = waitMark();
  const literal = rt.spawnProcess('receive_timeout', 'literal_announced', []);
  await within(entered);
  check([...clock.timers.values()][0]?.delay === 10, 'literal timeout did not arm a timer');
  clock.advance(10);
  check(await within(literal.result) === atom('timeout'), 'literal timeout did not fire');

  entered = waitMark();
  const messageFirst = rt.spawnProcess('receive_timeout', 'announced', [100n]);
  await within(entered);
  rt.sendMessage(messageFirst, tuple('wanted', 6n));
  clock.advance(100);
  check(rt.tupleElement(await within(messageFirst.result), 2) === 6n,
    'message delivered before the timeout callback was lost');
  entered = waitMark();
  const timeoutFirst = rt.spawnProcess('receive_timeout', 'announced', [100n]);
  await within(entered);
  clock.advance(100);
  const late = tuple('wanted', 7n);
  rt.sendMessage(timeoutFirst, late);
  check(await within(timeoutFirst.result) === atom('timeout') && rt.processMailbox(timeoutFirst)[0] === late,
    'message delivered after the timeout callback changed the timeout outcome');

  entered = waitMark();
  const infinite = rt.spawnProcess('receive_timeout', 'announced', [atom('infinity')]);
  await within(entered);
  check(clock.timers.size === 0, 'infinite receive scheduled a timer');
  rt.sendMessage(infinite, tuple('wanted', 5n));
  const infiniteResult = await within(infinite.result);
  const infinity = rt.tupleElement(infiniteResult, 2) === 5n && clock.timers.size === 0;
  check(infinity, 'infinite receive did not wake for a matching message');

  entered = waitMark();
  const two = rt.spawnProcess('receive_timeout', 'two_announced', [100n]);
  await within(entered);
  const staleCallback = [...clock.timers.values()][0].callback;
  clock.advance(20);
  const secondEntered = waitMark();
  rt.sendMessage(two, tuple('first', 10n));
  await within(secondEntered);
  staleCallback();
  check([...clock.timers.values()][0]?.due === clock.time + 100, 'matching a message did not cancel its timer');
  clock.advance(80);
  check(clock.timers.size === 1, 'old receive timeout affected a later receive');
  clock.advance(20);
  const pair = await within(two.result);
  const cancelled = rt.tupleElement(pair, 1) === 10n &&
    rt.tupleElement(pair, 2) === atom('second_timeout') && clock.timers.size === 0;
  check(cancelled, 'consecutive timed receives interfered');

  entered = waitMark();
  const sleep = rt.spawnProcess('receive_timeout', 'sleep_announced', [100n]);
  rt.sendMessage(sleep, atom('before'));
  await within(entered);
  rt.sendMessage(sleep, atom('untouched'));
  await new Promise(resolve => setTimeout(resolve, 30));
  check(rt.isProcessAlive(sleep.pid) && clock.timers.size === 1,
    'receive without clauses failed to suspend with a nonempty mailbox');
  clock.advance(100);
  const sleepResult = await within(sleep.result);
  const sleeping = sleepResult === atom('done') && rt.processMailbox(sleep)[0] === atom('before') &&
    rt.processMailbox(sleep)[1] === atom('untouched');
  check(sleeping, 'receive without clauses consumed a message or missed its timeout');

  entered = waitMark();
  const resetDelayed = rt.spawnProcess('receive_timeout', 'delayed_reset', [100n]);
  rt.sendMessage(resetDelayed, tuple('later', 99n));
  await within(entered);
  clock.advance(100);
  const delayedPair = await within(resetDelayed.result);
  check(rt.tupleElement(delayedPair, 1) === atom('timeout') && rt.tupleElement(delayedPair, 2) === 99n,
    'delayed timeout did not reset the mailbox scan');

  entered = waitMark();
  const longest = rt.spawnProcess('receive_timeout', 'announced', [4294967295n]);
  await within(entered);
  check([...clock.timers.values()][0]?.delay === 2147483647, 'long timeout was not split for the host');
  clock.advance(2147483647);
  check([...clock.timers.values()][0]?.delay === 2147483647, 'long timeout second segment is wrong');
  clock.advance(2147483647);
  check([...clock.timers.values()][0]?.delay === 1, 'long timeout final segment is wrong');
  clock.advance(1);
  const max = await within(longest.result) === atom('timeout');
  check(max && clock.timers.size === 0, 'maximum timeout expired at the wrong time');

  let syncWait = false;
  try {
    rt.invoke('receive_timeout', 'timed', [50n]);
  } catch (error) {
    syncWait = /synchronous invocation cannot wait/.test(error.message);
  }
  check(syncWait && clock.timers.size === 0, 'blocking synchronous receive leaked its timer');
  let badClock = false;
  try {
    new Runtime({clock: {}});
  } catch (error) {
    badClock = /clock requires/.test(error.message);
  }
  check(badClock, 'invalid clock adapter was accepted');
  const brokenClock = new FakeClock();
  const brokenRuntime = new Runtime({clock: brokenClock});
  registerModules(brokenRuntime);
  let brokenEntered;
  const brokenReady = new Promise(resolve => { brokenEntered = resolve; });
  brokenRuntime.registerModule(26, 'receive_probe', [{
    name: 'mark', arity: 0, exported: true,
    run: runtime => {
      brokenEntered();
      return {type: 'return', value: runtime.atom('ok')};
    },
  }]);
  const broken = brokenRuntime.spawnProcess('receive_timeout', 'sleep_announced', [100n]);
  await within(brokenReady);
  brokenClock.time = NaN;
  brokenClock.fireEarly();
  const clockError = await within(broken.result.then(() => null, error => error));
  check(/clock.now must return a finite number/.test(clockError?.message),
    'asynchronous clock error did not reject the process');

  const real = new Runtime();
  registerModules(real);
  const started = performance.now();
  const realSleep = real.spawnProcess('receive_timeout', 'sleep', [25n]);
  check(await within(realSleep.result) === real.atom('done') && performance.now() - started >= 25,
    'default monotonic clock fired early');
  return `[${[poll, zero, zeroMatch, ...invalids, matchedBeforeValidation,
    reset, timeout, infinity, cancelled, sleeping, max].join(',')}]`;
}
