import {ErlangError} from '../runtime/beam2js.mjs';

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function expectErlangError(callback, runtime, reason, message) {
  try {
    callback();
  } catch (error) {
    if (error instanceof ErlangError && error.erlangClass === 'error' && error.reason === reason) return;
    throw error;
  }
  throw new Error(message);
}

function list(runtime, values) {
  return values.reduceRight((tail, value) => runtime.cons(value, tail), runtime.nil());
}

function readList(runtime, value) {
  const values = [];
  const nil = runtime.nil();
  while (value !== nil) {
    values.push(runtime.listHead(value));
    value = runtime.listTail(value);
  }
  return values;
}

export function applyChecks(Runtime, registerModule, expected) {
  const runtime = new Runtime();
  registerModule(runtime);
  const atom = name => runtime.atom(name);
  const module = atom('dynamic_apply');
  const applied = [module, atom('add'), list(runtime, [2n, 3n])];

  check(runtime.invoke('dynamic_apply', 'apply_tail', applied) === BigInt(expected.sum),
    'tail apply returned the wrong result');
  const wrapped = runtime.invoke('dynamic_apply', 'apply_non_tail', applied);
  check(runtime.tupleElement(wrapped, 1) === atom('result') &&
    runtime.tupleElement(wrapped, 2) === BigInt(expected.sum),
  'non-tail apply did not return through its continuation');
  check(new TextDecoder().decode(runtime.bitstringBytes(runtime.invoke('dynamic_apply', 'apply_bif', []))) === '42',
    'apply did not resolve an Erlang BIF');
  check(runtime.invoke('dynamic_apply', 'module_name', []) === module &&
    runtime.invoke('dynamic_apply', 'module_info', [atom('module')]) === module,
  'module_info(module) returned the wrong module');
  check(runtime.invoke('dynamic_apply', 'keep_hidden', []) === atom('hidden'),
    'private local function call failed');

  const exportTerm = runtime.invoke('dynamic_apply', 'module_exports', []);
  const exports = readList(runtime, exportTerm)
    .map(entry => `${Symbol.keyFor(runtime.tupleElement(entry, 1))}/${runtime.tupleElement(entry, 2)}`)
    .sort();
  check(exports.length === expected.exports.length &&
    exports.every((entry, index) => entry === expected.exports[index]),
  'module_info(exports) disagreed with OTP');
  const info = readList(runtime, runtime.invoke('dynamic_apply', 'module_info_all', []));
  check(info.map(entry => Symbol.keyFor(runtime.tupleElement(entry, 1))).join() ===
    'module,exports,attributes,compile,md5' && runtime.tupleElement(info[0], 2) === module,
  'module_info/0 did not return the OTP metadata keys');
  const allExports = readList(runtime, runtime.tupleElement(info[1], 2))
    .map(entry => `${Symbol.keyFor(runtime.tupleElement(entry, 1))}/${runtime.tupleElement(entry, 2)}`)
    .sort();
  check(allExports.length === expected.exports.length &&
    allExports.every((entry, index) => entry === expected.exports[index]),
  'module_info/0 exports disagree with module_info(exports)');
  check(expected.errors, 'OTP did not confirm the tested badarg cases');

  for (const [moduleArg, functionArg, args] of [
    [atom('dynamic_apply'), atom('add'), runtime.cons(2n, atom('improper'))],
    [atom('dynamic_apply'), 3n, runtime.nil()],
    [3n, atom('add'), runtime.nil()],
  ]) {
    expectErlangError(
      () => runtime.invoke('dynamic_apply', 'apply_tail', [moduleArg, functionArg, args]),
      runtime, atom('badarg'), 'invalid apply arguments did not raise badarg',
    );
  }
  expectErlangError(
    () => runtime.invoke('dynamic_apply', 'module_info', [atom('unknown')]),
    runtime, atom('badarg'), 'unknown module_info key did not raise badarg',
  );
  expectErlangError(
    () => runtime.invoke('dynamic_apply', 'module_info', [3n]),
    runtime, atom('badarg'), 'invalid module_info key did not raise badarg',
  );
  let privateTargetRejected = false;
  try {
    runtime.invoke('dynamic_apply', 'apply_tail', [module, atom('hidden'), runtime.nil()]);
  } catch (error) {
    privateTargetRejected = /undefined or unsupported function: dynamic_apply:hidden\/0/.test(error.message);
  }
  check(privateTargetRejected, 'apply invoked a private function');
  return true;
}
