import assert from 'node:assert/strict';
import {Runtime, ErlangError} from '../runtime/beam2js.mjs';

export function mapChecks() {
  const rt = new Runtime();

  const nestedKey = rt.tuple([rt.atom('point'), rt.cons(1n, rt.cons(2n, rt.nil()))]);
  const nestedValue = rt.map([
    [rt.atom('items'), rt.cons(rt.tuple([rt.atom('tag'), 1n]), rt.nil())],
  ]);
  const compound = rt.tuple([
    rt.map([[nestedKey, nestedValue]]),
    rt.cons(rt.map([[rt.atom('kind'), rt.atom('list')]]), rt.nil()),
  ]);

  assert.equal(rt.isType('is_tuple', compound), true);
  assert.equal(rt.isType('is_list', rt.tupleElement(compound, 2)), true);
  assert.equal(rt.isType('is_map', rt.tupleElement(compound, 1)), true);
  assert.equal(rt.isType('is_map', rt.listHead(rt.tupleElement(compound, 2))), true);

  assert.equal(rt.mapGet(nestedValue, rt.atom('missing')), null);
  assert.equal(rt.mapSize(rt.map([[1n, rt.atom('integer')], [rt.float(1), rt.atom('float')]])), 2n);
  assert.equal(rt.mapGet(rt.map([[rt.float(1), rt.atom('float')]]), rt.float(1)) === rt.atom('float'), true);

  const fromList = rt.invoke('maps', 'from_list', [rt.cons(
    rt.tuple([rt.atom('b'), 2n]), rt.cons(rt.tuple([rt.atom('a'), 1n]), rt.nil()))]);
  assert.equal(rt.mapSize(fromList), 2n);
  assert.equal(rt.mapGet(fromList, rt.atom('b')), 2n);

  const withKeys = rt.invoke('maps', 'with', [rt.cons(rt.atom('a'), rt.nil()), fromList]);
  assert.equal(rt.mapSize(withKeys), 1n);
  assert.equal(rt.mapGet(withKeys, rt.atom('a')), 1n);

  const left = rt.map([[rt.atom('a'), 1n], [rt.atom('b'), 2n]]);
  const right = rt.map([[rt.atom('b'), 3n], [rt.atom('c'), 4n]]);
  const merged = rt.invoke('maps', 'merge', [left, right]);
  assert.equal(rt.mapGet(merged, rt.atom('a')), 1n);
  assert.equal(rt.mapGet(merged, rt.atom('b')), 3n);
  assert.equal(rt.mapGet(merged, rt.atom('c')), 4n);

  assert.throws(() => rt.invoke('maps', 'get', [rt.atom('missing'), left]), ErlangError);
  assert.throws(() => rt.invoke('maps', 'update', [rt.atom('missing'), 9n, left]), ErlangError);

  const iterator = rt.invoke('maps', 'iterator', [left]);
  assert.equal(rt.invoke('maps', 'is_iterator_valid', [iterator]), rt.atom('true'));
  const next = rt.invoke('maps', 'next', [iterator]);
  assert.equal(rt.isType('is_tuple', next), true);
}
