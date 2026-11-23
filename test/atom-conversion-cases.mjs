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
  const binaryCases = [
    ['example_atom', 'utf8'], ['example_atom', 'latin1'], ['', 'utf8'], ['', 'latin1'],
    ['é', 'utf8'], ['é', 'unicode'], ['é', 'latin1'], ['🙂', 'utf8'], ['🙂', 'unicode'],
  ];
  for (const [index, [name, encoding]] of binaryCases.entries()) {
    for (const [module, functionName] of [
      ['atom_conversion', 'to_binary'], ['erlang', 'atom_to_binary'],
    ]) {
      const actual = runtime.invoke(module, functionName, [runtime.atom(name), runtime.atom(encoding)]);
      const bytes = Array.from(runtime.bitstringBytes(actual));
      const expectedBytes = expected.binaryValues[index];
      check(bytes.length === expectedBytes.length &&
        bytes.every((value, position) => value === expectedBytes[position]),
      `${functionName}/2 returned incorrect ${encoding} bytes for ${name}`);
    }
  }
  const invalidCases = [
    [1n, runtime.atom('utf8')], [runtime.nil(), runtime.atom('utf8')],
    [runtime.atom('example_atom'), 1n], [runtime.atom('example_atom'), runtime.atom('bad')],
    [runtime.atom('🙂'), runtime.atom('latin1')],
  ];
  for (const args of invalidCases) {
    for (const [module, functionName] of [
      ['atom_conversion', 'to_binary'], ['erlang', 'atom_to_binary'],
    ]) {
      let failed = false;
      try {
        runtime.invoke(module, functionName, args);
      } catch (error) {
        if (!(error instanceof ErlangError) || error.erlangClass !== 'error' ||
            error.reason !== runtime.atom('badarg')) throw error;
        failed = true;
      }
      check(failed && expected.binaryBadarg, `${functionName}/2 accepted invalid arguments`);
    }
  }
  const reverseBinaryCases = [
    [[195, 169], 'utf8', 'é'],
    [[195, 169], 'unicode', 'é'],
    [[233], 'latin1', 'é'],
    [[240, 159, 153, 130], 'utf8', '🙂'],
    [[240, 159, 153, 130], 'unicode', '🙂'],
    [[], 'utf8', ''],
  ];
  for (const [bytes, encoding, name] of reverseBinaryCases) {
    const value = runtime.bitstring(bytes, bytes.length * 8);
    for (const [module, functionName] of [
      ['atom_conversion', 'from_binary'], ['erlang', 'binary_to_atom'],
    ]) {
      check(runtime.invoke(module, functionName, [value, runtime.atom(encoding)]) === runtime.atom(name),
        `${functionName}/2 returned the wrong atom`);
    }
  }
  const invalidBinaryCases = [
    [runtime.bitstring([128], 8), runtime.atom('utf8')],
    [runtime.bitstring([128], 7), runtime.atom('latin1')],
    [runtime.bitstring([65], 8), runtime.atom('bad')],
    [runtime.bitstring([65], 8), 1n],
    [1n, runtime.atom('utf8')],
  ];
  for (const args of invalidBinaryCases) {
    let failed = false;
    try {
      runtime.invoke('erlang', 'binary_to_atom', args);
    } catch (error) {
      if (!(error instanceof ErlangError) || error.erlangClass !== 'error' ||
          error.reason !== runtime.atom('badarg')) throw error;
      failed = true;
    }
    check(failed, 'binary_to_atom/2 accepted invalid arguments');
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
