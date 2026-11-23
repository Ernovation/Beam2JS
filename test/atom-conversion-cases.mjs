import {ErlangError} from '../runtime/beam2js.mjs';

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function readBytes(runtime, list) {
  const result = [];
  const empty = runtime.nil();
  while (list !== empty) {
    result.push(runtime.listHead(list));
    list = runtime.listTail(list);
  }
  return result;
}

export function atomConversionChecks(Runtime, registerModule, expected) {
  const runtime = new Runtime();
  registerModule(runtime);
  for (const [name, bytes] of expected.values) {
    const atom = runtime.atom(name);
    const expectedBytes = bytes.map(BigInt);
    for (const [module, functionName] of [
      ['atom_conversion', 'to_list'], ['erlang', 'atom_to_list'],
    ]) {
      const actual = readBytes(runtime, runtime.invoke(module, functionName, [atom]));
      check(actual.length === expectedBytes.length &&
        actual.every((value, index) => value === expectedBytes[index]),
      `${functionName}/1 returned incorrect UTF-8 bytes for ${name}`);
    }
  }
  try {
    runtime.invoke('erlang', 'atom_to_list', [1n]);
  } catch (error) {
    if (error instanceof ErlangError && error.erlangClass === 'error' &&
        error.reason === runtime.atom('badarg') && expected.badarg) return true;
    throw error;
  }
  throw new Error('atom_to_list/1 accepted a non-atom');
}
