export async function sendChecks(Runtime, registerModules) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const errors = [];
  const rt = new Runtime({schedulers: 2, reductionLimit: 2,
    onProcessError: (pid, error) => errors.push([pid, error])});
  registerModules(rt);
  let release = false;
  rt.registerModule(23, 'send_host', [{
    name: 'hold', arity: 0, exported: true,
    run: (runtime, args) => release
      ? {type: 'return', value: runtime.atom('ok')}
      : {type: 'yield', state: {}, registers: args},
  }, {
    name: 'reenter', arity: 0, exported: true,
    run: (runtime, args, state, budget, pid) => ({
      type: 'return', value: runtime.invoke('erlang', 'send', [pid, runtime.atom('reentrant')]),
    }),
  }]);
  rt.registerModule(23, 'erlang', [{
    name: 'send', arity: 2, exported: true,
    run: runtime => ({type: 'return', value: runtime.atom('shadow')}),
  }, {
    name: '!', arity: 2, exported: true,
    run: runtime => ({type: 'return', value: runtime.atom('shadow')}),
  }]);
  const atom = name => rt.atom(name);
  const receiver = rt.spawnProcess('send_host', 'hold', []);
  const pid = receiver.pid;
  const message = rt.tuple([atom('payload'), 9n]);
  rt.sendMessage(receiver, atom('host'));
  const direct = rt.invoke('process_send', 'send', [pid, message]) === message;
  const wrapped = rt.invoke('process_send', 'wrapped', [pid, atom('wrapped')]);
  const continuation = rt.tupleElement(wrapped, 1) === atom('sent') &&
    rt.tupleElement(wrapped, 2) === atom('wrapped');
  const callable = rt.invoke('process_send', 'callable', [pid, atom('callable')]) === atom('callable');
  const raw = ['tail', 'last', 'call', 'operator'].map(name => {
    const sent = atom(name);
    const result = rt.invoke('raw_send', name, [pid, sent]);
    return (name === 'call' ? rt.tupleElement(result, 1) : result) === sent;
  });
  check(direct && continuation && callable && raw.every(Boolean), 'send return value or continuation is wrong');
  const prefix = [atom('host'), message, atom('wrapped'), atom('callable'),
    ...['tail', 'last', 'call', 'operator'].map(atom)];
  check(prefix.every((value, i) => rt.processMailbox(receiver)[i] === value),
    'local messages were not delivered in order');

  const self = rt.spawnProcess('process_send', 'self_send', [atom('self')]);
  check(await self.result === atom('self') && rt.processMailbox(self)[0] === atom('self'),
    'self-send did not reach the running process mailbox');
  const reentrant = rt.spawnProcess('send_host', 'reenter', []);
  check(await reentrant.result === atom('reentrant') &&
    rt.processMailbox(reentrant)[0] === atom('reentrant'),
  'reentrant send did not reach the running process');
  check(rt.invoke('process_send', 'self_send', [atom('sync')]) === atom('sync') &&
    rt.invoke('send_host', 'reenter', []) === atom('reentrant'),
  'synchronous process could not send to itself');

  const one = [rt.tuple([atom('one'), 1n]), rt.tuple([atom('one'), 2n])];
  const two = [rt.tuple([atom('two'), 1n]), rt.tuple([atom('two'), 2n])];
  const sender1 = rt.spawnProcess('process_send', 'send_two', [pid, ...one]);
  const sender2 = rt.spawnProcess('process_send', 'send_two', [pid, ...two]);
  check(await sender1.result === one[1] && await sender2.result === two[1],
    'scheduled sender returned the wrong term');
  const concurrent = rt.processMailbox(receiver).slice(prefix.length);
  const ordered = concurrent.length === 4 && [one, two].every(pair =>
    concurrent.indexOf(pair[0]) >= 0 && concurrent.indexOf(pair[0]) < concurrent.indexOf(pair[1]));
  check(ordered, 'messages from a sender were reordered');

  const child = rt.invoke('process_spawn', 'start', [
    atom('spawn_probe'), atom('record'),
    rt.cons(pid, rt.cons(3n, rt.cons(4n, rt.nil()))),
  ]);
  await rt.processHandle(child).result;
  const childMessage = rt.processMailbox(receiver).at(-1);
  check(rt.tupleElement(childMessage, 1) === atom('child') &&
    rt.tupleElement(childMessage, 2) === child &&
    rt.tupleElement(childMessage, 3) === 3n && rt.tupleElement(childMessage, 4) === 4n,
  'Erlang-spawned child did not deliver its message');
  check(errors.length === 0, 'successful child was reported as failed');

  const invalid = destination => {
    try {
      rt.invoke('process_send', 'send', [destination, atom('invalid')]);
    } catch (error) {
      return error.erlangClass === 'error' && error.reason === atom('badarg');
    }
    return false;
  };
  const invalidResults = [atom('unregistered'), 1n, rt.nil(), rt.tuple([atom('name'), 1n])].map(invalid);
  check(invalidResults.every(Boolean), 'invalid destination did not raise badarg');
  for (const name of ['tail', 'last', 'call', 'operator']) {
    let badarg = false;
    try {
      rt.invoke('raw_send', name, [1n, atom('invalid')]);
    } catch (error) {
      badarg = error.erlangClass === 'error' && error.reason === atom('badarg');
    }
    check(badarg, 'callable send did not propagate badarg');
  }
  const foreignRuntime = new Runtime();
  const foreignLive = foreignRuntime.spawnProcess('erlang', 'abs', [-1n]);
  for (const destination of [foreignRuntime.invoke('erlang', 'self', []), foreignLive.pid,
    rt.tuple([atom('name'), atom('node')])]) {
    let unsupported = false;
    try {
      rt.invoke('process_send', 'send', [destination, atom('message')]);
    } catch (error) {
      unsupported = /sending to .* is unsupported/.test(error.message);
    }
    check(unsupported, 'unsupported destination was silently accepted');
  }
  await foreignLive.result;
  const before = rt.processMailbox(receiver);
  release = true;
  await receiver.result;
  const dead = rt.invoke('process_send', 'send', [pid, atom('dead')]) === atom('dead') &&
    rt.invoke('erlang', 'send', [pid, message]) === message &&
    rt.invoke('process_send', 'send', [rt.invoke('erlang', 'self', []), message]) === message &&
    rt.processMailbox(receiver).length === before.length;
  check(dead, 'sending to a terminated local PID was not a no-op returning the message');
  let hostDead = false;
  try {
    rt.sendMessage(receiver, message);
  } catch (error) {
    hostDead = /terminated process/.test(error.message);
  }
  check(hostDead, 'host sendMessage behavior changed for a dead process');
  return `[${[direct, continuation, callable, ...raw, ordered, ...invalidResults, dead].join(',')}]`;
}
