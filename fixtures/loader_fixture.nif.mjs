export async function nif(runtime, info) {
  await new Promise(resolve => setTimeout(resolve, 5));
  runtime.nativeLoads = (runtime.nativeLoads ?? 0) + 1;
  if (info === runtime.atom('throw')) throw new Error('NIF initialization failed');
  const functions = [{
    name: 'native', arity: 2,
    run: (rt, [a, b]) => ({type: 'return', value: a + b + info}),
  }, {
    name: 'private_native', arity: 1,
    run: (rt, [value]) => ({type: 'return', value: value * 2n}),
  }];
  if (info === runtime.atom('invalid')) functions.push({name: 'missing', arity: 0, run: () => {}});
  return functions;
}
