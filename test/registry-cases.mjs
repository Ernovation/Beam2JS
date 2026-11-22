import {FakeClock} from './timeout-cases.mjs';

export async function registryChecks(Runtime, registerModules) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const within = promise => {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('registry test timed out')), 5000);
    })]).finally(() => clearTimeout(timer));
  };
  const clock = new FakeClock();
  const rt = new Runtime({clock});
  registerModules(rt);
  rt.registerModule(25, 'erlang', [
    {name: 'register', arity: 2, exported: true, run: runtime => ({type: 'return', value: runtime.atom('shadow')})},
    {name: 'whereis', arity: 1, exported: true, run: runtime => ({type: 'return', value: runtime.atom('shadow')})},
  ]);
  const atom = name => rt.atom(name);
  const call = (name, args) => rt.invoke('process_registry', name, args);
  const recipient = (name = 'receive_one') => rt.spawnProcess('process_registry', name, []);
  const names = () => {
    const result = [];
    for (let list = call('names', []); list !== rt.nil(); list = rt.listTail(list)) {
      result.push(rt.listHead(list));
    }
    return result;
  };
  const badarg = (name, args) => {
    try {
      call(name, args);
    } catch (error) {
      return error.erlangClass === 'error' && error.reason === atom('badarg');
    }
    return false;
  };
  const name = atom('beam2js_registry_test');
  const otherName = atom('beam2js_registry_other');
  const empty = call('lookup', [name]) === atom('undefined') &&
    call('lookup', [atom('undefined')]) === atom('undefined') && !names().includes(name);
  const first = recipient('receive_two');
  const spare = recipient();
  const wrapped = call('wrapped', [name, first.pid]);
  const bound = rt.tupleElement(wrapped, 1) === atom('bound') &&
    rt.tupleElement(wrapped, 2) === atom('true') &&
    call('lookup', [name]) === first.pid && names().includes(name);
  const invalid = [
    badarg('bind', [name, first.pid]), badarg('bind', [name, spare.pid]),
    badarg('bind', [otherName, first.pid]), badarg('bind', [atom('undefined'), spare.pid]),
    badarg('bind', [1n, spare.pid]), badarg('bind', [otherName, 1n]),
    badarg('lookup', [1n]), badarg('unbind', [otherName]), badarg('unbind', [1n]),
  ].every(Boolean);
  const one = atom('one');
  const two = atom('two');
  const sent = rt.invoke('process_send', 'send', [name, one]) === one &&
    rt.invoke('erlang', 'send', [name, two]) === two;
  const pair = await within(first.result);
  const delivered = sent && rt.tupleElement(pair, 1) === one && rt.tupleElement(pair, 2) === two;
  const removed = call('lookup', [name]) === atom('undefined') && !names().includes(name) &&
    badarg('bind', [otherName, first.pid]);

  const former = recipient();
  check(call('bind', [name, former.pid]) === atom('true'), 'could not bind first process');
  check(call('unbind', [name]) === atom('true'), 'could not unregister name');
  check(call('bind', [name, spare.pid]) === atom('true'), 'could not reuse name');
  rt.sendMessage(former, atom('finish'));
  await within(former.result);
  const reused = call('lookup', [name]) === spare.pid &&
    rt.invoke('erlang', '!', [name, atom('reused')]) === atom('reused') &&
    await within(spare.result) === atom('reused');
  const selfPair = call('self_bind', [name]);
  const self = rt.tupleElement(selfPair, 1) === rt.tupleElement(selfPair, 2) &&
    call('lookup', [name]) === atom('undefined');
  const failure = new Error('registry process failed');
  rt.registerModule(25, 'registry_host', [{
    name: 'fail', arity: 0, exported: true, run: () => { throw failure; },
  }]);
  const failed = rt.spawnProcess('registry_host', 'fail', []);
  call('bind', [name, failed.pid]);
  const failureCleanup = await within(failed.result.then(() => null, error => error)) === failure &&
    call('lookup', [name]) === atom('undefined');

  const later = rt.invoke('erlang', 'send_after', [10n, name, atom('late')]);
  const lateReceiver = recipient();
  call('bind', [name, lateReceiver.pid]);
  clock.advance(10);
  const lateBound = await within(lateReceiver.result) === atom('late') &&
    rt.invoke('erlang', 'read_timer', [later]) === atom('false');

  const old = recipient();
  call('bind', [name, old.pid]);
  const timer = rt.invoke('erlang', 'start_timer', [20n, name, atom('tick')]);
  rt.sendMessage(old, atom('stop'));
  await within(old.result);
  check(rt.invoke('erlang', 'read_timer', [timer]) === 20n,
    'name-addressed timer was canceled when the original process exited');
  const replacement = recipient();
  call('bind', [name, replacement.pid]);
  clock.advance(20);
  const timed = await within(replacement.result);
  const reregistered = rt.tupleElement(timed, 1) === atom('timeout') &&
    rt.tupleElement(timed, 2) === timer && rt.tupleElement(timed, 3) === atom('tick');
  const lost = rt.invoke('erlang', 'send_after', [5n, name, atom('lost')]);
  clock.advance(5);
  const disappeared = rt.invoke('erlang', 'read_timer', [lost]) === atom('false') &&
    call('lookup', [name]) === atom('undefined');
  const cancelled = rt.invoke('erlang', 'start_timer', [10n, name, atom('cancelled')]);
  check(rt.invoke('erlang', 'cancel_timer', [cancelled]) === 10n && clock.timers.size === 0,
    'name-addressed timer could not be canceled');

  const cleanupClock = new FakeClock();
  const cleanupRuntime = new Runtime({clock: cleanupClock});
  const finishing = cleanupRuntime.spawnProcess('erlang', 'abs', [-1n]);
  cleanupRuntime.invoke('erlang', 'register', [name, finishing.pid]);
  cleanupRuntime.invoke('erlang', 'send_after', [10n, finishing.pid, 1n]);
  let reentrantBadarg = false;
  cleanupClock.clearTimeout = () => {
    try {
      cleanupRuntime.invoke('erlang', 'register', [otherName, finishing.pid]);
    } catch (error) {
      reentrantBadarg = error.erlangClass === 'error' && error.reason === atom('badarg');
    }
  };
  await within(finishing.result);
  check(reentrantBadarg && cleanupRuntime.invoke('erlang', 'whereis', [name]) === atom('undefined') &&
    cleanupRuntime.invoke('erlang', 'whereis', [otherName]) === atom('undefined'),
  'finishing process retained or reacquired a name during timer cleanup');

  const foreign = new Runtime();
  const foreignProcess = foreign.spawnProcess('erlang', 'abs', [-1n]);
  check(badarg('bind', [name, foreignProcess.pid]), 'foreign PID was registered');
  await within(foreignProcess.result);
  const isolated = recipient();
  call('bind', [name, isolated.pid]);
  check(foreign.invoke('erlang', 'whereis', [name]) === foreign.atom('undefined'),
    'process registries were shared between runtimes');
  rt.sendMessage(isolated, atom('finish'));
  await within(isolated.result);
  const observations = [empty, bound, invalid, delivered, removed, reused, self,
    failureCleanup, lateBound, reregistered, disappeared];
  check(observations.every(Boolean), 'registry behavior differs from the expected result');
  return `[${observations.join(',')}]`;
}
