export async function referenceChecks(Runtime, registerModules) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const within = promise => {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('reference test timed out')), 5000);
    })]).finally(() => clearTimeout(timer));
  };
  const rt = new Runtime({schedulers: 2, reductionLimit: 2});
  registerModules(rt);
  rt.registerModule(26, 'erlang', [{
    name: 'make_ref', arity: 0, exported: true,
    run: runtime => ({type: 'return', value: runtime.atom('shadow')}),
  }, {
    name: 'is_reference', arity: 1, exported: true,
    run: runtime => ({type: 'return', value: runtime.atom('shadow')}),
  }]);
  const atom = name => rt.atom(name);
  const process = rt.spawnProcess('process_reference', 'pair', []);
  const pair = await within(process.result);
  const ref = rt.tupleElement(pair, 1);
  const other = rt.tupleElement(pair, 2);
  const direct = rt.invoke('process_reference', 'new', []);
  const fromHost = rt.makeRef();
  const fromOtherRuntime = new Runtime().makeRef();
  check([ref, other, direct, fromHost, fromOtherRuntime].every(value =>
    rt.isType('is_reference', value) && Object.isFrozen(value)) &&
    new Set([ref, other, direct, fromHost, fromOtherRuntime]).size === 5,
  'references are not immutable and unique across processes and runtimes');
  check(rt.invoke('erlang', 'is_reference', [ref]) === atom('true') &&
    rt.invoke('erlang', 'is_reference', [fromOtherRuntime]) === atom('true'),
  'callable reference predicate failed');

  const rawRefs = ['ref_tail', 'ref_last', 'ref_call'].map(name => {
    const result = rt.invoke('raw_reference', name, []);
    return name === 'ref_call' ? rt.tupleElement(result, 1) : result;
  });
  const rawRefTests = rawRefs.map(value => rt.isType('is_reference', value));
  check(rawRefTests.every(Boolean) &&
    new Set([ref, other, direct, fromHost, fromOtherRuntime, ...rawRefs]).size === 8,
  'external make_ref calls did not produce fresh references');
  const rawPredicates = ['test_tail', 'test_last', 'test_call'].map(name => {
    const test = value => {
      const result = rt.invoke('raw_reference', name, [value]);
      return name === 'test_call' ? rt.tupleElement(result, 1) : result;
    };
    return test(ref) === atom('true') && test(1n) === atom('false');
  });
  check(rawPredicates.every(Boolean), 'external reference predicate failed');

  const nested = value => rt.tuple([rt.cons(value, rt.nil())]);
  const nestedSame = rt.equalExact(nested(ref), nested(ref)) && rt.equalNumeric(nested(ref), nested(ref));
  const nestedDifferent = !rt.equalExact(nested(ref), nested(other)) &&
    !rt.equalNumeric(nested(ref), nested(other));
  check(nestedSame && nestedDifferent && rt.compare(ref, ref) === 0 &&
    rt.compare(ref, other) !== 0 && rt.compare(ref, other) === -rt.compare(other, ref),
  'reference equality or ordering is inconsistent');
  const pid = rt.invoke('erlang', 'self', []);
  const order = rt.compare(atom('atom'), ref) < 0 && rt.compare(ref, pid) < 0;
  check(order, 'reference term ordering relative to atoms or PIDs is wrong');
  const handle = rt.hostHandle({});
  check(rt.compare(ref, handle) !== 0 && rt.compare(ref, handle) === -rt.compare(handle, ref) &&
    !rt.equalExact(ref, handle), 'host handles and references were conflated');
  for (const name of ['is_integer', 'is_number', 'is_atom', 'is_boolean', 'is_float', 'is_list',
    'is_tuple', 'is_binary', 'is_bitstring', 'is_pid']) {
    check(rt.invoke('erlang', name, [ref]) === atom('false'), 'reference passed another type test');
  }
  for (const value of [1n, rt.float(1), atom('other'), rt.nil(), rt.cons(1n, rt.nil()), rt.tuple([]),
    rt.bitstring([], 0), handle, pid]) {
    check(rt.invoke('erlang', 'is_reference', [value]) === atom('false') &&
      rt.invoke('process_reference', 'ref_guard', [value]) === atom('no') &&
      rt.invoke('process_reference', 'ref_body', [value]) === atom('false'),
    'non-reference passed a reference type test');
  }
  const recipient = rt.spawnProcess('process_receive', 'wanted', []);
  rt.sendMessage(recipient, rt.tuple([atom('wanted'), ref]));
  const preserved = await within(recipient.result) === ref;
  check(preserved, 'reference identity changed across a mailbox');
  const observations = [
    rt.isType('is_reference', ref),
    ref !== other,
    rt.invoke('process_reference', 'compare', [ref, ref]) === atom('same'),
    rt.invoke('process_reference', 'compare', [ref, other]) === atom('different'),
    rt.invoke('process_reference', 'ref_guard', [ref]) === atom('yes'),
    rt.invoke('process_reference', 'ref_guard', [1n]) === atom('no'),
    rt.invoke('process_reference', 'ref_body', [ref]) === atom('true'),
    rt.invoke('process_reference', 'ref_body', [1n]) === atom('false'),
    order,
    rt.invoke('process_reference', 'ref_order', [ref]) === atom('yes'),
    rt.invoke('process_reference', 'ref_order', [atom('atom')]) === atom('no'),
    nestedSame, nestedDifferent, preserved, ...rawRefTests, ...rawPredicates,
    new Set([ref, other, direct, ...rawRefs]).size === 6,
  ];
  return `[${observations.join(',')}]`;
}
