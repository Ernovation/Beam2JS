import {FakeClock} from './timeout-cases.mjs';

export async function timerBifChecks(Runtime, registerModules) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const within = promise => {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timer BIF test timed out')), 5000);
    })]).finally(() => clearTimeout(timer));
  };
  const clock = new FakeClock();
  const rt = new Runtime({clock});
  registerModules(rt);
  rt.registerModule(26, 'erlang', ['send_after', 'start_timer'].map(name => ({
    name, arity: 3, exported: true, run: runtime => ({type: 'return', value: runtime.atom('shadow')}),
  })));
  const atom = name => rt.atom(name);
  const call = (name, args) => rt.invoke('process_timer', name, args);
  const receiver = () => rt.spawnProcess('process_timer', 'receive_one', []);
  const pending = receiver();
  const cancelled = call('send_later', [100n, pending.pid, atom('ignored')]);
  const reference = rt.isType('is_reference', cancelled);
  const initial = call('read', [cancelled]) === 100n;
  clock.advance(40);
  const remainder = call('cancel', [cancelled]) === 60n;
  const absent = call('read', [cancelled]) === atom('false') &&
    call('cancel', [cancelled]) === atom('false');
  clock.advance(100);
  check(rt.processMailbox(pending).length === 0, 'cancelled timer delivered a message');

  const message = rt.tuple([atom('payload'), 9n]);
  const deliveredRef = call('send_later', [10n, pending.pid, message]);
  clock.advance(9);
  check(rt.processMailbox(pending).length === 0, 'send_after delivered early');
  clock.advance(1);
  const delivered = await within(pending.result) === message &&
    call('read', [deliveredRef]) === atom('false');
  const timed = receiver();
  const wrapper = call('wrapped', [25n, timed.pid, atom('tick')]);
  const timedRef = rt.tupleElement(wrapper, 2);
  check(rt.tupleElement(wrapper, 1) === atom('started'), 'non-tail timer call failed');
  clock.advance(25);
  const timeoutMessage = await within(timed.result);
  const wrapped = rt.tupleSize(timeoutMessage) === 3 &&
    rt.tupleElement(timeoutMessage, 1) === atom('timeout') &&
    rt.tupleElement(timeoutMessage, 2) === timedRef &&
    rt.tupleElement(timeoutMessage, 3) === atom('tick');
  const notTimer = call('read', [rt.makeRef()]) === atom('false');
  const badarg = (name, args) => {
    try {
      call(name, args);
    } catch (error) {
      return error.erlangClass === 'error' && error.reason === atom('badarg');
    }
    return false;
  };
  const bad = [
    badarg('send_later', [-1n, timed.pid, atom('x')]),
    badarg('start', [atom('infinity'), timed.pid, atom('x')]),
    badarg('send_later', [rt.float(1), timed.pid, atom('x')]),
    badarg('start', [1n, 123n, atom('x')]),
    badarg('read', [atom('bad')]),
    badarg('cancel', [1n]),
  ];
  check(bad.every(Boolean), 'timer BIF did not raise badarg');

  const deadRef = call('send_later', [20n, timed.pid, atom('dead')]);
  const dead = call('read', [deadRef]) === atom('false');
  const terminating = rt.spawnProcess('erlang', 'abs', [-1n]);
  const exitRef = call('start', [100n, terminating.pid, atom('exit')]);
  await within(terminating.result);
  const exit = call('cancel', [exitRef]) === atom('false') && clock.timers.size === 0;
  const chunkReceiver = receiver();
  const longRef = call('start', [4294967295n, chunkReceiver.pid, atom('long')]);
  check([...clock.timers.values()][0].delay === 2147483647, 'long timer was not split');
  clock.fireEarly();
  check([...clock.timers.values()][0].delay === 2147483647, 'early callback was not rearmed');
  clock.advance(2147483647);
  check(call('read', [longRef]) === 2147483648n, 'long timer remaining time is wrong');
  check(call('cancel', [longRef]) === 2147483648n && clock.timers.size === 0,
    'long timer cancellation failed');
  rt.sendMessage(chunkReceiver, atom('done'));
  await within(chunkReceiver.result);

  const maxReceiver = receiver();
  const maxRef = call('start', [4294967295n, maxReceiver.pid, atom('max')]);
  clock.advance(4294967294);
  check(rt.processMailbox(maxReceiver).length === 0 && call('read', [maxRef]) === 1n,
    'maximum timer fired early');
  clock.advance(1);
  const maxMessage = await within(maxReceiver.result);
  check(rt.tupleElement(maxMessage, 2) === maxRef && rt.tupleElement(maxMessage, 3) === atom('max'),
    'maximum timer did not deliver after all chunks');

  const zeroReceiver = receiver();
  const zeroRef = rt.invoke('erlang', 'start_timer', [0n, zeroReceiver.pid, atom('zero')]);
  check(rt.invoke('erlang', 'read_timer', [zeroRef]) === 0n, 'zero timer was not pending');
  clock.advance(0);
  const zeroMessage = await within(zeroReceiver.result);
  check(rt.tupleElement(zeroMessage, 2) === zeroRef &&
    rt.tupleElement(zeroMessage, 3) === atom('zero') &&
    rt.invoke('erlang', 'cancel_timer', [zeroRef]) === atom('false'),
  'zero timer or direct callable BIF failed');

  const staleReceiver = receiver();
  const staleRef = call('send_later', [10n, staleReceiver.pid, atom('stale')]);
  const staleCallback = [...clock.timers.values()][0].callback;
  call('cancel', [staleRef]);
  staleCallback();
  check(rt.processMailbox(staleReceiver).length === 0, 'stale timer callback delivered a message');
  rt.sendMessage(staleReceiver, atom('done'));
  await within(staleReceiver.result);
  const foreign = new Runtime();
  const foreignProcess = foreign.spawnProcess('erlang', 'abs', [-1n]);
  check(badarg('send_later', [1n, foreignProcess.pid, atom('x')]),
    'foreign PID was accepted as a timer destination');
  check(call('read', [foreign.makeRef()]) === atom('false'),
    'foreign reference was not treated as an unknown timer');
  await within(foreignProcess.result);

  const brokenClock = new FakeClock();
  const brokenRuntime = new Runtime({clock: brokenClock});
  registerModules(brokenRuntime);
  const brokenReceiver = brokenRuntime.spawnProcess('process_timer', 'receive_one', []);
  const brokenRef = brokenRuntime.invoke('erlang', 'send_after', [10n, brokenReceiver.pid, 1n]);
  brokenClock.time = NaN;
  let clockError = false;
  try {
    brokenClock.fireEarly();
  } catch (error) {
    clockError = /clock.now must return a finite number/.test(error.message);
  }
  check(clockError && brokenRuntime.invoke('erlang', 'read_timer', [brokenRef]) === brokenRuntime.atom('false'),
    'asynchronous clock error was lost or left an active timer');
  brokenRuntime.sendMessage(brokenReceiver, 1n);
  await within(brokenReceiver.result);

  const clearClock = new FakeClock();
  const clearRuntime = new Runtime({clock: clearClock});
  const exits = clearRuntime.spawnProcess('erlang', 'abs', [-1n]);
  const firstRef = clearRuntime.invoke('erlang', 'send_after', [10n, exits.pid, 1n]);
  const secondRef = clearRuntime.invoke('erlang', 'send_after', [20n, exits.pid, 2n]);
  clearClock.clearTimeout = () => { throw new Error('clear failed'); };
  const cleanupError = await within(exits.result.then(() => null, error => error));
  check(cleanupError instanceof AggregateError && cleanupError.errors.length === 2 &&
    !clearRuntime.isProcessAlive(exits.pid) &&
    clearRuntime.invoke('erlang', 'read_timer', [firstRef]) === clearRuntime.atom('false') &&
    clearRuntime.invoke('erlang', 'read_timer', [secondRef]) === clearRuntime.atom('false'),
  'timer cleanup failure leaked process state or hid errors');
  const processError = new Error('process failed');
  clearRuntime.registerModule(26, 'timer_failure', [{
    name: 'fail', arity: 0, exported: true,
    run: (runtime, args, state, budget, pid) => {
      runtime.invoke('erlang', 'send_after', [10n, pid, 1n]);
      throw processError;
    },
  }]);
  const fails = clearRuntime.spawnProcess('timer_failure', 'fail', []);
  const bothErrors = await within(fails.result.then(() => null, error => error));
  check(bothErrors instanceof AggregateError && bothErrors.errors[0] === processError &&
    /clear failed/.test(bothErrors.errors[1].message) && !clearRuntime.isProcessAlive(fails.pid),
  'process and timer cleanup errors were not both reported');
  let syncErrors;
  try {
    clearRuntime.invoke('timer_failure', 'fail', []);
  } catch (error) {
    syncErrors = error;
  }
  check(syncErrors instanceof AggregateError && syncErrors.errors[0] === processError &&
    /clear failed/.test(syncErrors.errors[1].message),
  'synchronous process and timer cleanup errors were not both reported');
  let unsupported = false;
  try {
    call('send_later', [4294967296n, timed.pid, atom('x')]);
  } catch (error) {
    unsupported = /timer delays above/.test(error.message);
  }
  check(unsupported, 'unsupported timer delay did not report a host diagnostic');
  const real = new Runtime();
  registerModules(real);
  const realReceiver = real.spawnProcess('process_timer', 'receive_one', []);
  const started = performance.now();
  real.invoke('erlang', 'send_after', [20n, realReceiver.pid, real.atom('real')]);
  check(await within(realReceiver.result) === real.atom('real') && performance.now() - started >= 20,
    'default clock delivered a timer message early');
  check(reference && initial && remainder && absent && delivered && wrapped && notTimer && dead && exit,
    'timer BIF behavior differs from the expected result');
  return `[${[reference, initial, remainder, absent, delivered, wrapped, notTimer, ...bad, dead, exit].join(',')}]`;
}
