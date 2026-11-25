import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Runtime, ErlangError} from '../runtime/beam2js.mjs';

const dir = mkdtempSync(join(tmpdir(), 'beam2js-funs-'));
try {
  execFileSync('erlc', ['-o', dir, 'fixtures/fun_slice.erl', 'fixtures/fun_call.erl', 'fixtures/fun_maps.erl']);
  const compiler = resolve('_build/default/bin/beam2js');
  for (const name of ['fun_slice', 'fun_call', 'fun_maps']) {
    execFileSync(compiler, [join(dir, `${name}.beam`), join(dir, `${name}.mjs`)]);
  }
  const [slice, call, maps] = await Promise.all(['fun_slice', 'fun_call', 'fun_maps']
    .map(name => import(pathToFileURL(join(dir, `${name}.mjs`)))));
  const rt = new Runtime();
  slice.register(rt);
  call.register(rt);
  maps.register(rt);
  await Promise.all(['maps', 'lists'].map(name => rt.loadModule(name)));

  const exported = rt.invoke('fun_slice', 'exported', []);
  assert.equal(rt.isType('is_function', exported), true);
  assert.equal(rt.funArity(exported), 2);
  assert.equal(rt.invoke('fun_slice', 'apply_export', [5n]), 7n);

  const closure = rt.invoke('fun_slice', 'captured', [10n]);
  assert.equal(rt.isType('is_function', closure), true);
  assert.equal(rt.funArity(closure), 1);
  assert.equal(rt.invoke('fun_call', 'captured_call', [10n, 5n]), 15n);
  assert.equal(rt.invoke('erlang', 'apply', [closure, rt.cons(5n, rt.nil())]), 15n);
  assert.throws(() => rt.invoke('fun_call', 'bad_arity', [5n]), ErlangError);

  const map = rt.map([[rt.atom('a'), 1n], [rt.atom('b'), 2n], [rt.atom('c'), 3n]]);
  const mapped = rt.invoke('fun_maps', 'map_values', [map]);
  assert.equal(rt.mapGet(mapped, rt.atom('a')), 2n);
  assert.equal(rt.mapGet(mapped, rt.atom('c')), 4n);

  const filtered = rt.invoke('fun_maps', 'filter_even', [map]);
  assert.equal(rt.mapSize(filtered), 1n);
  assert.equal(rt.mapGet(filtered, rt.atom('b')), 2n);
  assert.equal(rt.invoke('fun_maps', 'fold_sum', [map]), 6n);

  const left = rt.map([[rt.atom('a'), 1n], [rt.atom('b'), 2n]]);
  const right = rt.map([[rt.atom('b'), 3n], [rt.atom('c'), 4n]]);
  const merged = rt.invoke('fun_maps', 'merge', [left, right]);
  assert.equal(rt.mapGet(merged, rt.atom('b')), 5n);
  assert.equal(rt.mapGet(merged, rt.atom('c')), 4n);

  const present = rt.map([[rt.atom('a'), 2n]]);
  assert.equal(rt.mapGet(rt.invoke('fun_maps', 'update_present', [present]), rt.atom('a')), 3n);

  const list = rt.cons(1n, rt.cons(2n, rt.cons(3n, rt.cons(4n, rt.nil()))));
  assert.equal(rt.mapSize(rt.invoke('fun_maps', 'groups', [list])), 2n);
  assert.equal(rt.mapSize(rt.invoke('fun_maps', 'groups_values', [list])), 2n);

  console.log('Fun and closure tests passed');
} finally {
  rmSync(dir, {recursive: true, force: true});
}
