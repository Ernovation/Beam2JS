import {FakeClock} from './timeout-cases.mjs';

export async function processInfoChecks(Runtime, registerModules) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const within = promise => {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('process info test timed out')), 5000);
    })]).finally(() => clearTimeout(timer));
  };
  const rt = new Runtime({schedulers: 2});
  registerModules(rt);
  rt.registerModule(26, 'erlang', [{
    name: 'process_info', arity: 2, exported: true,
    run: runtime => ({type: 'return', value: runtime.atom('shadow')}),
  }]);
  const atom = name => rt.atom(name);
  const list = (...values) => values.reduceRight((tail, value) => rt.cons(value, tail), rt.nil());
  const pair = (key, value) => rt.tuple([key, value]);
  const entry = (key, value) => pair(atom(key), value);
  const key = () => rt.tuple([atom('key'), rt.cons(1n, rt.nil())]);
  const itemKey = () => pair(atom('dictionary'), key());
  const expectedMessages = list(atom('first'), pair(atom('second'), 2n));
  const info = (pid, item) => rt.invoke('process_info_fixture', 'query', [pid, item]);
  const equal = (left, right) => rt.equalExact(left, right);
  const array = term => {
    const values = [];
    for (let cursor = term; cursor !== rt.nil(); cursor = rt.listTail(cursor)) values.push(rt.listHead(cursor));
    return values;
  };
  const unordered = (term, expected) => {
    const actual = array(term);
    return actual.length === expected.length &&
      expected.every(value => actual.some(item => equal(item, value)));
  };
  const self = array(rt.invoke('process_info_fixture', 'self_report', []));
  const selfInfo = self.length === 7 &&
    equal(self[0], entry('dictionary', list(entry('local', atom('value'))))) &&
    equal(self[1], pair(pair(atom('dictionary'), atom('local')), atom('value'))) &&
    equal(self[2], pair(pair(atom('dictionary'), atom('missing')), atom('undefined'))) &&
    equal(self[3], entry('messages', expectedMessages)) &&
    equal(self[4], entry('message_queue_len', 2n)) &&
    equal(self[5], entry('registered_name', rt.nil())) &&
    equal(self[6], entry('status', atom('running')));
  const collector = rt.spawnProcess('process_info_fixture', 'ready', []);
  const target = rt.spawnProcess('process_info_fixture', 'target', [collector.pid, key()]);
  check(await within(collector.result) === target.pid, 'target did not become ready');
  const unregistered = info(target.pid, atom('registered_name')) === rt.nil() &&
    equal(info(target.pid, list(atom('registered_name'))), list(entry('registered_name', rt.nil())));
  const waiting = equal(info(target.pid, atom('status')), entry('status', atom('waiting')));
  const dictInfo = info(target.pid, atom('dictionary'));
  const dictionary = rt.tupleElement(dictInfo, 1) === atom('dictionary') &&
    unordered(rt.tupleElement(dictInfo, 2),
      [pair(key(), atom('value')), entry('undefined_key', atom('undefined'))]);
  const lookup = equal(info(target.pid, itemKey()), pair(itemKey(), atom('value'))) &&
    equal(info(target.pid, pair(atom('dictionary'), atom('missing'))),
      pair(pair(atom('dictionary'), atom('missing')), atom('undefined'))) &&
    equal(info(target.pid, pair(atom('dictionary'), atom('undefined_key'))),
      pair(pair(atom('dictionary'), atom('undefined_key')), atom('undefined'))) &&
    equal(info(target.pid, list(itemKey(), itemKey())),
      list(pair(itemKey(), atom('value')), pair(itemKey(), atom('value'))));
  rt.sendMessage(target, atom('first'));
  rt.sendMessage(target, pair(atom('second'), 2n));
  const saved = info(target.pid, atom('messages'));
  const queue = equal(saved, entry('messages', expectedMessages)) &&
    equal(info(target.pid, atom('message_queue_len')), entry('message_queue_len', 2n));
  const duplicated = equal(info(target.pid, list(atom('message_queue_len'), atom('registered_name'),
    atom('message_queue_len'), atom('messages'))), list(entry('message_queue_len', 2n),
    entry('registered_name', rt.nil()), entry('message_queue_len', 2n), entry('messages', expectedMessages))) &&
    info(target.pid, rt.nil()) === rt.nil();
  const name = atom('beam2js_process_info');
  rt.invoke('erlang', 'register', [name, target.pid]);
  const named = equal(info(target.pid, atom('registered_name')), entry('registered_name', name)) &&
    equal(info(target.pid, list(atom('registered_name'))), list(entry('registered_name', name))) &&
    equal(rt.invoke('process_info_fixture', 'wrapped', [target.pid, atom('message_queue_len')]),
      pair(atom('result'), entry('message_queue_len', 2n))) &&
    equal(rt.invoke('erlang', 'process_info', [target.pid, atom('message_queue_len')]),
      entry('message_queue_len', 2n));
  const badarg = (pid, item) => {
    try {
      info(pid, item);
    } catch (error) {
      return error.erlangClass === 'error' && error.reason === atom('badarg');
    }
    return false;
  };
  const invalid = [
    badarg(1n, atom('messages')), badarg(atom('bad'), atom('messages')),
    badarg(target.pid, atom('bad')), badarg(target.pid, 1n),
    badarg(target.pid, list(atom('messages'), atom('bad'))),
    badarg(target.pid, rt.cons(atom('messages'), atom('tail'))),
    badarg(target.pid, rt.tuple([atom('dictionary')])),
    badarg(target.pid, pair(atom('bad'), atom('key'))),
    badarg(target.pid, list(atom('memory'), atom('bad'))),
  ].every(Boolean);
  check(rt.equalExact(info(target.pid, atom('memory')), pair(atom('memory'), 0n)),
    'process_info memory is not reported');
  check(rt.equalExact(info(target.pid, atom('trap_exit')), pair(atom('trap_exit'), atom('false'))),
    'process_info trap_exit is not reported');
  rt.sendMessage(target, atom('finish'));
  check(await within(target.result) === atom('ok'), 'target did not terminate');
  const snapshot = equal(saved, entry('messages', expectedMessages)) &&
    rt.processMailbox(target).length === 2;
  const dead = [atom('messages'), atom('memory'), rt.nil(), itemKey()].every(item =>
    info(target.pid, item) === atom('undefined')) &&
    badarg(target.pid, atom('bad')) && badarg(target.pid, list(atom('memory'), atom('bad')));
  const foreign = new Runtime();
  const foreignProcess = foreign.spawnProcess('erlang', 'abs', [-1n]);
  check(badarg(foreignProcess.pid, atom('messages')), 'foreign PID was accepted');
  await within(foreignProcess.result);
  const failure = new Error('process info failure test');
  rt.registerModule(26, 'process_info_host', [{
    name: 'fail', arity: 0, exported: true, run: () => { throw failure; },
  }]);
  const failed = rt.spawnProcess('process_info_host', 'fail', []);
  check(await within(failed.result.then(() => null, error => error)) === failure &&
    info(failed.pid, atom('messages')) === atom('undefined'), 'failed process remained inspectable');

  const clock = new FakeClock();
  const cleanup = new Runtime({clock});
  const finishing = cleanup.spawnProcess('erlang', 'abs', [-1n]);
  cleanup.invoke('erlang', 'send_after', [10n, finishing.pid, 1n]);
  let finishingInfo;
  clock.clearTimeout = () => {
    finishingInfo = cleanup.invoke('erlang', 'process_info', [finishing.pid, cleanup.atom('messages')]);
  };
  await within(finishing.result);
  check(finishingInfo === cleanup.atom('undefined'), 'finishing process remained inspectable during cleanup');
  const observations = [selfInfo, unregistered, waiting, dictionary, lookup, queue,
    duplicated, named, invalid, snapshot, dead];
  check(observations.every(Boolean), 'process information behavior differs from OTP');
  return `[${observations.join(',')}]`;
}
