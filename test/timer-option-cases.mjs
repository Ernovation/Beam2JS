import {FakeClock} from './timeout-cases.mjs';

export async function timerOptionChecks(Runtime, registerModules) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const within = promise => {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timer option test timed out')), 5000);
    })]).finally(() => clearTimeout(timer));
  };
  const clock = new FakeClock();
  const rt = new Runtime({clock});
  registerModules(rt);
  rt.registerModule(25, 'erlang', [
    ...['read_timer', 'cancel_timer'].map(name => ({name, arity: 2})),
    ...['send_after', 'start_timer'].map(name => ({name, arity: 4})),
  ].map(entry => ({
    ...entry, exported: true, run: runtime => ({type: 'return', value: runtime.atom('shadow')}),
  })));
  const atom = name => rt.atom(name);
  const option = (name, value) => rt.tuple([atom(name), atom(value)]);
  const list = (...values) => values.reduceRight((tail, value) => rt.cons(value, tail), rt.nil());
  const asyncTrue = option('async', 'true');
  const asyncFalse = option('async', 'false');
  const infoTrue = option('info', 'true');
  const infoFalse = option('info', 'false');
  const absTrue = option('abs', 'true');
  const absFalse = option('abs', 'false');
  const call = (name, args) => rt.invoke('process_timer', name, args);
  const defaultTarget = rt.spawnProcess('process_timer', 'receive_one', []);
  const defaultRef = call('send_opts', [5n, defaultTarget.pid, atom('default'), rt.nil()]);
  clock.advance(5);
  const createdDefault = rt.isType('is_reference', defaultRef) &&
    await within(defaultTarget.result) === atom('default');
  const namedTarget = rt.spawnProcess('process_timer', 'receive_one', []);
  const name = atom('beam2js_timer_options');
  rt.invoke('erlang', 'register', [name, namedTarget.pid]);
  const namedRef = rt.invoke('erlang', 'start_timer', [10n, name, atom('named'), list(absFalse)]);
  clock.advance(10);
  const namedMessage = await within(namedTarget.result);
  const configuredRelative = rt.tupleElement(namedMessage, 1) === atom('timeout') &&
    rt.tupleElement(namedMessage, 2) === namedRef && rt.tupleElement(namedMessage, 3) === atom('named');
  const target = rt.spawnProcess('process_timer', 'receive_one', []);
  const wrapper = call('wrapped_opts', [100n, target.pid, atom('wrapped'), list(absTrue, absFalse)]);
  const wrapperRef = rt.tupleElement(wrapper, 2);
  const duplicateRelative = rt.tupleElement(wrapper, 1) === atom('started') &&
    rt.invoke('erlang', 'cancel_timer', [wrapperRef]) === 100n;
  const creationBadarg = (name, delay, destination, options) => {
    try {
      call(name, [delay, destination, atom('bad'), options]);
    } catch (error) {
      return error.erlangClass === 'error' && error.reason === atom('badarg');
    }
    return false;
  };
  const invalidCreation = [
    creationBadarg('send_opts', 1n, target.pid, list(option('abs', 'yes'))),
    creationBadarg('start_opts', 1n, target.pid, list(asyncFalse)),
    creationBadarg('send_opts', 1n, target.pid, list(atom('bad'))),
    creationBadarg('send_opts', 1n, target.pid, rt.cons(absFalse, atom('tail'))),
    creationBadarg('start_opts', 1n, target.pid, atom('bad')),
    creationBadarg('send_opts', 1n, target.pid, list(rt.tuple([atom('abs')]))),
    creationBadarg('start_opts', -1n, target.pid, list(absFalse)),
    creationBadarg('send_opts', atom('bad'), target.pid, list(absTrue)),
    creationBadarg('start_opts', 1n, 123n, list(absTrue)),
    creationBadarg('send_opts', 1n, target.pid, list(absTrue, infoTrue)),
  ].every(Boolean) && clock.timers.size === 0;
  const absoluteTarget = rt.spawnProcess('process_timer', 'receive_one', []);
  const absoluteRef = call('send_opts', [call('now', []) + 10n, absoluteTarget.pid, atom('absolute'), list(absTrue)]);
  clock.fireEarly();
  check(clock.timers.size === 1, 'early absolute timer callback was not rearmed');
  clock.advance(9);
  const pendingAbsolute = call('read', [absoluteRef]) === 1n;
  clock.advance(1);
  const absolutePid = pendingAbsolute && await within(absoluteTarget.result) === atom('absolute');
  const absoluteNamedTarget = rt.spawnProcess('process_timer', 'receive_one', []);
  rt.invoke('erlang', 'register', [name, absoluteNamedTarget.pid]);
  const absoluteNamedRef = call('start_opts', [call('now', []) + 10n, name, atom('named_absolute'), list(absTrue)]);
  clock.advance(10);
  const absoluteNamedMessage = await within(absoluteNamedTarget.result);
  const absoluteNamed = rt.tupleElement(absoluteNamedMessage, 1) === atom('timeout') &&
    rt.tupleElement(absoluteNamedMessage, 2) === absoluteNamedRef &&
    rt.tupleElement(absoluteNamedMessage, 3) === atom('named_absolute');
  const pastTarget = rt.spawnProcess('process_timer', 'receive_one', []);
  const pastRef = call('send_opts', [call('now', []) - 100n, pastTarget.pid, atom('past'),
    list(absFalse, absTrue)]);
  clock.advance(0);
  const absolutePast = rt.isType('is_reference', pastRef) && await within(pastTarget.result) === atom('past');
  const limitRef = call('send_opts', [call('now', []) + 4294967295n, target.pid, atom('limit'), list(absTrue)]);
  check(call('cancel', [limitRef]) === 4294967295n, 'maximum absolute timer distance failed');
  for (const [deadline, pattern] of [
    [call('now', []) + 4294967296n, /more than 4294967295 ms ahead/],
    [9007199254740992n, /exceeds supported clock precision/],
    [-9007199254740992n, /exceeds supported clock precision/],
  ]) {
    let rejected = false;
    try {
      call('send_opts', [deadline, target.pid, atom('bad'), list(absTrue)]);
    } catch (error) {
      rejected = pattern.test(error.message);
    }
    check(rejected && clock.timers.size === 0, 'unsupported absolute deadline was not rejected');
  }
  const unitClock = new FakeClock();
  unitClock.time = -1001.25;
  const unitRuntime = new Runtime({clock: unitClock});
  registerModules(unitRuntime);
  const unitCall = (name, args) => unitRuntime.invoke('process_timer', name, args);
  const unitAtom = name => unitRuntime.atom(name);
  const expectedUnits = [
    ['second', -2n], ['seconds', -2n], ['millisecond', -1002n], ['milli_seconds', -1002n],
    ['microsecond', -1001250n], ['micro_seconds', -1001250n],
    ['nanosecond', -1001250000n], ['nano_seconds', -1001250000n],
    ['native', -1001250000n], ['perf_counter', -1001250000n],
  ];
  const monotonicValid = expectedUnits.every(([unit, expected]) => unitCall('now_in', [unitAtom(unit)]) === expected) &&
    unitCall('native_now', []) === -1001250000n &&
    unitCall('now_in', [3n]) === -4n && unitCall('now_in', [1000n]) === -1002n &&
    unitCall('now_in', [1n << 80n]) === -((1001250000n * (1n << 80n) + 999999999n) / 1000000000n);
  const monotonicInvalid = [0n, -1n, unitAtom('bad'), unitRuntime.float(1)].every(unit => {
    try {
      unitCall('now_in', [unit]);
    } catch (error) {
      return error.erlangClass === 'error' && error.reason === unitAtom('badarg');
    }
    return false;
  });
  const negativeTarget = unitRuntime.spawnProcess('process_timer', 'receive_one', []);
  const negativeOption = unitRuntime.cons(unitRuntime.tuple([unitAtom('abs'), unitAtom('true')]), unitRuntime.nil());
  unitCall('send_opts', [-992n, negativeTarget.pid, unitAtom('negative'), negativeOption]);
  unitClock.advance(9);
  check(unitClock.timers.size === 1, 'negative absolute deadline fired early');
  unitClock.advance(1);
  check(await within(negativeTarget.result) === unitAtom('negative'), 'negative absolute deadline did not fire');
  unitClock.time = -Number.MIN_VALUE;
  check(unitCall('now', []) === -1n && unitCall('native_now', []) === -1n,
    'negative fractional clock reading was not rounded down');
  unitClock.time = Number.MAX_SAFE_INTEGER + 1;
  for (const operation of [
    () => unitCall('now', []),
    () => unitCall('send_opts', [0n, negativeTarget.pid, unitAtom('bad'), negativeOption]),
  ]) {
    let rejected = false;
    try {
      operation();
    } catch (error) {
      rejected = /clock exceeds supported millisecond precision/.test(error.message);
    }
    check(rejected, 'unsafe clock value was not rejected');
  }
  const create = () => rt.invoke('erlang', 'send_after', [1000n, target.pid, atom('timer')]);
  const ref = create();
  const defaults = call('read_opts', [ref, rt.nil()]) === 1000n &&
    rt.invoke('erlang', 'read_timer', [ref, list(asyncFalse)]) === 1000n;
  const duplicateSync = call('read_opts', [ref, list(asyncTrue, asyncFalse)]) === 1000n;
  const reply = async (fn, reference, options) => {
    const process = rt.spawnProcess('process_timer', fn, [reference, options]);
    return within(process.result);
  };
  const replyMatches = (result, tag, reference, value) => {
    const message = rt.tupleElement(result, 2);
    return rt.tupleElement(result, 1) === atom('ok') &&
      rt.tupleSize(message) === 3 && rt.tupleElement(message, 1) === atom(tag) &&
      rt.tupleElement(message, 2) === reference && rt.tupleElement(message, 3) === value;
  };
  const asyncRead = replyMatches(await reply('read_reply', ref, list(asyncTrue)),
    'read_timer', ref, 1000n);
  const duplicateAsync = replyMatches(await reply('read_reply', ref, list(asyncFalse, asyncTrue)),
    'read_timer', ref, 1000n);
  const missing = rt.makeRef();
  const asyncMissing = replyMatches(await reply('read_reply', missing, list(asyncTrue)),
    'read_timer', missing, atom('false'));
  const cancelRef = create();
  const asyncCancel = replyMatches(await reply('cancel_reply', cancelRef, list(asyncTrue, infoTrue)),
    'cancel_timer', cancelRef, 1000n) && call('read', [cancelRef]) === atom('false');
  const noInfoRef = create();
  const noInfoResult = await reply('cancel_no_reply', noInfoRef, list(asyncTrue, infoFalse));
  const noInfo = rt.tupleElement(noInfoResult, 1) === atom('ok') &&
    rt.tupleElement(noInfoResult, 2) === atom('no_reply') &&
    call('read', [noInfoRef]) === atom('false');
  const silentRef = create();
  const syncSilent = call('cancel_opts', [silentRef, list(infoTrue, infoFalse)]) === atom('ok') &&
    call('read', [silentRef]) === atom('false');
  const infoRef = create();
  const syncInfo = call('cancel_opts', [infoRef, list(infoFalse, infoTrue)]) === 1000n;
  const transientRef = create();
  check(rt.invoke('erlang', 'cancel_timer', [transientRef, list(asyncTrue)]) === atom('ok') &&
    call('read', [transientRef]) === atom('false'),
  'asynchronous cancellation was lost when the caller exited');
  const badarg = (name, reference, options) => {
    try {
      call(name, [reference, options]);
    } catch (error) {
      return error.erlangClass === 'error' && error.reason === atom('badarg');
    }
    return false;
  };
  const invalid = [
    badarg('read_opts', ref, list(infoFalse)),
    badarg('cancel_opts', ref, list(option('async', 'yes'))),
    badarg('cancel_opts', ref, list(option('unknown', 'true'))),
    badarg('read_opts', ref, list(atom('bad'))),
    badarg('cancel_opts', ref, rt.cons(asyncTrue, atom('tail'))),
    badarg('read_opts', ref, atom('bad')),
    badarg('cancel_opts', atom('bad'), list(asyncTrue, infoFalse)),
    badarg('read_opts', ref, list(rt.tuple([atom('async')]))),
  ].every(Boolean) && call('read', [ref]) === 1000n;
  check(call('cancel', [ref]) === 1000n, 'main timer could not be canceled');
  const expired = create();
  clock.advance(1000);
  const asyncExpired = replyMatches(await reply('cancel_reply', expired, list(asyncTrue)),
    'cancel_timer', expired, atom('false'));
  check(await within(target.result) === atom('timer'), 'timer expiration changed during option tests');

  const brokenClock = new FakeClock();
  const broken = new Runtime({clock: brokenClock});
  registerModules(broken);
  const brokenTarget = broken.spawnProcess('process_timer', 'receive_one', []);
  const brokenRef = broken.invoke('erlang', 'send_after', [10n, brokenTarget.pid, 1n]);
  const brokenOptions = broken.cons(broken.tuple([broken.atom('info'), broken.atom('false')]), broken.nil());
  brokenClock.time = NaN;
  check(broken.invoke('erlang', 'cancel_timer', [brokenRef, brokenOptions]) === broken.atom('ok'),
    'silent cancellation unnecessarily read the clock');
  broken.sendMessage(brokenTarget, 1n);
  await within(brokenTarget.result);
  const observations = [createdDefault, configuredRelative, duplicateRelative, invalidCreation,
    absolutePid, absoluteNamed, absolutePast, monotonicValid, monotonicInvalid,
    defaults, duplicateSync, asyncRead, duplicateAsync, asyncMissing,
    asyncCancel, noInfo, syncSilent, syncInfo, invalid, asyncExpired];
  check(observations.every(Boolean), 'timer option behavior differs from the expected result');
  return `[${observations.join(',')}]`;
}
