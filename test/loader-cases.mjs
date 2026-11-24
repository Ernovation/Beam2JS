export async function loaderChecks(Runtime, baseURL) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const rt = new Runtime({moduleBaseURL: baseURL, schedulers: 2, reductionLimit: 1});
  const string = value => Array.from(value).reverse()
    .reduce((tail, character) => rt.cons(BigInt(character.codePointAt(0)), tail), rt.nil());
  const calls = [rt.invokeAsync('loader_fixture', 'run', [5n]), rt.invokeAsync('loader_fixture', 'run', [6n])];
  const results = await Promise.all(calls);
  check(rt.equalExact(results[0], rt.tuple([6n, 24n, 10n])), 'lazy dependency or NIF call failed');
  check(rt.equalExact(results[1], rt.tuple([7n, 25n, 12n])), 'concurrent loading failed');
  check(rt.nativeLoads === 1, 'concurrent callers initialized NIF more than once');
  check(rt.invoke('loader_fixture', 'native', [1n, 2n]) === 20n, 'preloaded synchronous invocation failed');
  const again = await rt.invokeAsync('loader_fixture', 'wrapped_load', [string('loader_fixture'), 99n]);
  check(rt.equalExact(again, rt.tuple([rt.atom('ok'), 20n])), 'cached NIF load or continuation failed');
  check(rt.nativeLoads === 1, 'successful NIF loaded more than once');
  for (const [name, info, message] of [
    ['missing_nif', 0n, 'missing_nif'],
    ['invalid', rt.atom('invalid'), 'NIF target does not exist'],
    ['throws', rt.atom('throw'), 'NIF initialization failed'],
  ]) {
    const result = await rt.invokeAsync('loader_fixture', 'load', [string(name), info]);
    check(rt.tupleElement(result, 1) === rt.atom('error'), 'NIF failure did not return error');
    const detail = rt.tupleElement(result, 2);
    check(rt.tupleElement(detail, 1) === rt.atom('load_failed'), 'wrong NIF error shape');
    check(new TextDecoder().decode(rt.bitstringBytes(rt.tupleElement(detail, 2))).includes(message),
      'NIF diagnostic missing cause');
    check(rt.invoke('loader_fixture', 'native', [1n, 2n]) === 20n, 'failed NIF partially patched module');
  }
  const retried = await rt.invokeAsync('loader_fixture', 'load', [string('invalid'), 3n]);
  check(retried === rt.atom('ok'), 'failed NIF could not be retried');
  check(rt.invoke('loader_fixture', 'native', [1n, 2n]) === 6n, 'retried NIF not installed on caller');
  for (const name of [rt.atom('invalid'), rt.nil(), rt.cons(1n, 2n), rt.cons(0xd800n, rt.nil())]) {
    try {
      await rt.invokeAsync('loader_fixture', 'load', [name, 0n]);
      throw new Error('invalid NIF name accepted');
    } catch (error) {
      check(error.reason === rt.atom('badarg'), 'invalid NIF name did not raise badarg');
    }
  }
  for (const [module, name, match] of [
    ['absent', 'run', 'cannot load module absent'],
    ['loader_fixture', 'absent', 'undefined or unsupported function'],
    ['loader_fixture', 'private_native', 'undefined or unsupported function'],
    ['bad_init', 'run', 'on_load failed'],
    ['bad_register', 'run', 'did not register itself'],
    ['cycle_a', 'run', 'circular on_load dependency'],
  ]) {
    try {
      await rt.invokeAsync(module, name, name === 'private_native' ? [1n] : []);
      throw new Error('invalid module or function accepted');
    } catch (error) {
      check(error.message.includes(match), `unexpected loader failure: ${error.message}`);
    }
  }
  check(!rt.modules.has('bad_init'), 'failed initializer left module registered');
  const other = new Runtime({moduleBaseURL: baseURL});
  await other.loadModule('loader_fixture');
  check(other.nativeLoads === 1 && other.invoke('loader_fixture', 'native', [1n, 2n]) === 20n,
    'module import cache prevented registration in another runtime');
  try {
    other.invoke('loader_helper', 'id', [1n]);
    throw new Error('synchronous invocation unexpectedly loaded a module');
  } catch (error) {
    check(error.message.includes('use invokeAsync or loadModule'), 'missing sync-loading diagnostic');
  }
  check(!other.modules.has('loader_helper'), 'synchronous invocation started a download');
  return true;
}
