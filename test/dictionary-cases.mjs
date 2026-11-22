export async function dictionaryChecks(Runtime, registerModules) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const within = promise => {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('dictionary test timed out')), 5000);
    })]).finally(() => clearTimeout(timer));
  };
  const rt = new Runtime({schedulers: 2, reductionLimit: 2});
  registerModules(rt);
  rt.registerModule(26, 'erlang', [
    {name: 'get', arity: 1}, {name: 'put', arity: 2}, {name: 'erase', arity: 0},
  ].map(entry => ({
    ...entry, exported: true, run: runtime => ({type: 'return', value: runtime.atom('shadow')}),
  })));
  rt.registerModule(26, 'bad_dictionary', [{
    name: 'run', arity: 0, exported: true,
    run: () => ({type: 'dictionary', name: 'unknown', args: []}),
  }]);
  let invalidOperation = false;
  try {
    rt.invoke('bad_dictionary', 'run', []);
  } catch (error) {
    invalidOperation = error instanceof TypeError && /invalid process dictionary operation/.test(error.message);
  }
  check(invalidOperation, 'invalid dictionary action did not fail');
  const atom = name => rt.atom(name);
  const undefinedValue = atom('undefined');
  const call = (name, args) => rt.invoke('process_dictionary', name, args);
  const element = (tuple, index) => rt.tupleElement(tuple, index);
  const list = term => {
    const result = [];
    for (let cursor = term; cursor !== rt.nil(); cursor = rt.listTail(cursor)) result.push(rt.listHead(cursor));
    return result;
  };
  const unordered = (term, expected) => {
    const actual = list(term);
    return actual.length === expected.length &&
      expected.every(value => actual.some(item => rt.equalExact(item, value)));
  };
  const key = () => rt.tuple([atom('key'), rt.cons(1n, rt.nil())]);
  const other = rt.tuple([atom('key'), rt.cons(rt.float(1), rt.nil())]);
  const value = () => rt.tuple([atom('value'), rt.bitstring([0xa0], 3)]);
  const distinct = rt.float(1);
  const result = call('exercise', [key(), key(), other, value(), value(), distinct]);
  const absent = [1, 2, 5, 15].every(index => element(result, index) === undefinedValue);
  const previous = rt.equalExact(element(result, 3), value()) &&
    rt.equalExact(element(result, 4), value()) && rt.equalExact(element(result, 10), value());
  const keys = unordered(element(result, 6), [key(), other]) &&
    unordered(element(result, 7), [key()]) && unordered(element(result, 8), [other]);
  const pairs = unordered(element(result, 9), [rt.tuple([key(), value()]), rt.tuple([other, distinct])]) &&
    unordered(element(result, 11), [rt.tuple([other, distinct])]) &&
    unordered(element(result, 12), [rt.tuple([other, distinct])]);
  const cleared = element(result, 13) === rt.nil() && element(result, 14) === rt.nil();
  const undefinedResult = call('undefined_value', [key()]);
  const storedUndefined = element(undefinedResult, 1) === undefinedValue &&
    unordered(element(undefinedResult, 2), [key()]) && element(undefinedResult, 3) === undefinedValue &&
    element(undefinedResult, 4) === 42n && element(undefinedResult, 5) === undefinedValue &&
    element(undefinedResult, 6) === rt.nil();
  const valueKeyResult = call('value_keys', []);
  const exactValues = unordered(element(valueKeyResult, 1), [atom('integer')]) &&
    unordered(element(valueKeyResult, 2), [atom('float')]) && element(valueKeyResult, 3) === rt.nil() &&
    unordered(element(valueKeyResult, 4), [atom('negative_zero')]);
  const expectedRoundtrip = values => rt.tuple(values);
  const equalResult = expectedRoundtrip([undefinedValue, atom('found'), atom('found'), undefinedValue]);
  const unequalResult = expectedRoundtrip([undefinedValue, undefinedValue, undefinedValue, atom('found')]);
  const ref = rt.makeRef();
  const otherRef = rt.makeRef();
  const bitstring = () => rt.bitstring([0xa0], 3);
  const pid = rt.invoke('erlang', 'self', []);
  const otherPid = rt.invoke('erlang', 'self', []);
  const hostHandle = rt.hostHandle({});
  const otherHandle = rt.hostHandle({});
  const keyEquality = rt.equalExact(call('roundtrip', [key(), key()]), equalResult) &&
    rt.equalExact(call('roundtrip', [bitstring(), bitstring()]), equalResult) &&
    rt.equalExact(call('roundtrip', [ref, ref]), equalResult) &&
    rt.equalExact(call('roundtrip', [ref, otherRef]), unequalResult) &&
    rt.equalExact(call('roundtrip', [pid, pid]), equalResult) &&
    rt.equalExact(call('roundtrip', [pid, otherPid]), unequalResult) &&
    rt.equalExact(call('roundtrip', [rt.float(0), rt.float(-0)]), unequalResult) &&
    rt.equalExact(call('roundtrip', [1n, rt.float(1)]), unequalResult);
  check(rt.equalExact(call('roundtrip', [hostHandle, hostHandle]), equalResult) &&
    rt.equalExact(call('roundtrip', [hostHandle, otherHandle]), unequalResult),
  'host handle dictionary keys lost identity');
  const direct = rt.invoke('erlang', 'put', [atom('direct'), 1n]) === undefinedValue &&
    rt.invoke('erlang', 'get', [atom('direct')]) === undefinedValue &&
    rt.invoke('erlang', 'erase', []) === rt.nil();
  const invocations = call('store', [atom('isolation'), 1n]) === undefinedValue &&
    call('read', [atom('isolation')]) === undefinedValue;
  const raw = rt.equalExact(call('raw', [atom('raw')]),
    rt.tuple([atom('stored'), atom('stored'), rt.tuple([atom('stored')])]));
  const collector = rt.spawnProcess('process_dictionary', 'collect', []);
  const first = rt.spawnProcess('process_dictionary', 'worker', [collector.pid, atom('shared'), 1n]);
  const second = rt.spawnProcess('process_dictionary', 'worker', [collector.pid, atom('shared'), 2n]);
  const ready = await within(collector.result);
  check(new Set([element(ready, 1), element(ready, 2)]).size === 2 &&
    [element(ready, 1), element(ready, 2)].every(pid => pid === first.pid || pid === second.pid),
  'workers did not independently reach receive');
  rt.sendMessage(first, atom('go'));
  rt.sendMessage(second, atom('go'));
  const [firstResult, secondResult] = await within(Promise.all([first.result, second.result]));
  const workers = rt.equalExact(firstResult, rt.tuple([undefinedValue, 1n, 1n, undefinedValue])) &&
    rt.equalExact(secondResult, rt.tuple([undefinedValue, 2n, 2n, undefinedValue]));
  const parent = rt.spawnProcess('process_dictionary', 'parent', [atom('inherited'), atom('parent')]);
  const child = rt.equalExact(await within(parent.result), rt.tuple([undefinedValue, atom('parent')]));
  const observations = [absent, previous, keys, pairs, cleared, storedUndefined, exactValues, keyEquality,
    direct, invocations, raw, workers, child];
  check(observations.every(Boolean), 'process dictionary behavior differs from OTP');
  return `[${observations.join(',')}]`;
}
