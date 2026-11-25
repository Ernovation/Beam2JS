// ETS: the NIF half of OTP's ets module and the match specification engine
// shared with erlang:match_spec_test/3.
import {
  CONS, TUPLE, MAP, NIL,
  is, isAtom, listToArray, arrayToList, bool, termKey,
} from './term.mjs';

const badarg = rt => rt.raiseError(rt.atom('badarg'));

// --- match specifications ------------------------------------------------------

const variablePattern = /^\$(\d+)$/;
const variableNumber = atom => {
  const match = Symbol.keyFor(atom).match(variablePattern);
  return match ? Number(match[1]) : null;
};

const guardFunctions = new Set([
  'is_atom', 'is_float', 'is_integer', 'is_list', 'is_number', 'is_pid', 'is_port', 'is_reference', 'is_tuple',
  'is_map', 'is_map_key', 'is_binary', 'is_bitstring', 'is_function', 'is_record', 'is_boolean', 'abs', 'element',
  'hd', 'tl', 'length', 'map_get', 'map_size', 'node', 'round', 'size', 'bit_size', 'byte_size', 'tuple_size',
  'trunc', 'ceil', 'floor', 'float', 'binary_part', 'min', 'max', '+', '-', '*', 'div', 'rem', 'band', 'bor',
  'bxor', 'bnot', 'bsl', 'bsr', '>', '>=', '<', '=<', '=:=', '==', '=/=', '/=', '/', 'not', 'and', 'or', 'xor',
  'andalso', 'orelse', 'self', 'get_tcw',
]);
const bodyOnlyFunctions = new Set([
  'set_seq_token', 'get_seq_token', 'message', 'return_trace', 'exception_trace', 'process_dump', 'enable_trace',
  'disable_trace', 'trace', 'display', 'caller', 'caller_line', 'current_stacktrace', 'set_tcw', 'silent',
]);

class MatchFailure extends Error {}
const fail = () => {
  throw new MatchFailure('match specification failure');
};

export function compileMatchSpec(rt, spec) {
  const clauses = listToArray(spec);
  if (clauses === null) badarg(rt);
  return clauses.map(clause => {
    if (!is(clause, TUPLE) || clause[1].length !== 3) badarg(rt);
    const [head, guards, body] = clause[1];
    const guardList = listToArray(guards);
    const bodyList = listToArray(body);
    if (guardList === null || bodyList === null) badarg(rt);
    for (const guard of guardList) validateExpression(rt, guard, false);
    for (const expression of bodyList) validateExpression(rt, expression, true);
    return {head, guards: guardList, body: bodyList};
  });
}

function validateExpression(rt, expression, body) {
  if (is(expression, TUPLE) && expression[1].length > 0) {
    const [op, ...args] = expression[1];
    if (expression[1].length === 1 && is(op, TUPLE)) {
      for (const element of op[1]) validateExpression(rt, element, body);
      return;
    }
    if (op === rt.atom('const')) return;
    if (!isAtom(op)) badarg(rt);
    const name = Symbol.keyFor(op);
    if (!guardFunctions.has(name) && !(body && bodyOnlyFunctions.has(name))) badarg(rt);
    for (const arg of args) validateExpression(rt, arg, body);
  } else if (is(expression, CONS)) {
    let cursor = expression;
    while (is(cursor, CONS)) {
      validateExpression(rt, cursor[1][0], body);
      cursor = cursor[1][1];
    }
    validateExpression(rt, cursor, body);
  }
}

function matchHead(rt, pattern, term, bindings) {
  if (isAtom(pattern)) {
    if (pattern === rt.atom('_')) return true;
    const number = variableNumber(pattern);
    if (number === null) return pattern === term;
    if (bindings.has(number)) return rt.equalExact(bindings.get(number), term);
    bindings.set(number, term);
    return true;
  }
  if (is(pattern, TUPLE)) {
    if (!is(term, TUPLE) || term[1].length !== pattern[1].length) return false;
    return pattern[1].every((element, i) => matchHead(rt, element, term[1][i], bindings));
  }
  if (is(pattern, CONS)) {
    return is(term, CONS) && matchHead(rt, pattern[1][0], term[1][0], bindings) &&
      matchHead(rt, pattern[1][1], term[1][1], bindings);
  }
  if (is(pattern, MAP)) {
    if (!is(term, MAP)) return false;
    for (const [key, value] of pattern[1]) {
      const found = term[1].find(([candidate]) => rt.equalExact(candidate, key));
      if (!found || !matchHead(rt, value, found[1], bindings)) return false;
    }
    return true;
  }
  return rt.equalExact(pattern, term);
}

function evaluate(rt, expression, context) {
  if (isAtom(expression)) {
    const name = Symbol.keyFor(expression);
    if (name === '$_') return context.object;
    if (name === '$$') {
      const numbers = [...context.bindings.keys()].sort((a, b) => a - b);
      return arrayToList(rt, numbers.map(number => context.bindings.get(number)));
    }
    const number = variableNumber(expression);
    if (number === null) return expression;
    if (!context.bindings.has(number)) fail();
    return context.bindings.get(number);
  }
  if (is(expression, TUPLE) && expression[1].length > 0) {
    const [op, ...args] = expression[1];
    if (expression[1].length === 1 && is(op, TUPLE)) {
      return rt.tuple(op[1].map(element => evaluate(rt, element, context)));
    }
    if (op === rt.atom('const') && args.length === 1) return args[0];
    if (!isAtom(op)) return expression;
    return call(rt, Symbol.keyFor(op), args, context);
  }
  if (is(expression, CONS)) {
    const items = [];
    let cursor = expression;
    while (is(cursor, CONS)) {
      items.push(evaluate(rt, cursor[1][0], context));
      cursor = cursor[1][1];
    }
    return arrayToList(rt, items, evaluate(rt, cursor, context));
  }
  if (is(expression, MAP)) {
    return rt.map(expression[1].map(([key, value]) => [evaluate(rt, key, context), evaluate(rt, value, context)]));
  }
  return expression;
}

function call(rt, name, args, context) {
  const truth = value => {
    if (value === rt.atom('true')) return true;
    if (value === rt.atom('false')) return false;
    return fail();
  };
  switch (name) {
    case 'andalso':
      for (const arg of args) if (!truth(evaluate(rt, arg, context))) return rt.atom('false');
      return rt.atom('true');
    case 'orelse':
      for (const arg of args) if (truth(evaluate(rt, arg, context))) return rt.atom('true');
      return rt.atom('false');
    case 'and':
      return bool(rt, args.map(arg => truth(evaluate(rt, arg, context))).every(Boolean));
    case 'or':
      return bool(rt, args.map(arg => truth(evaluate(rt, arg, context))).some(Boolean));
    case 'self':
      return context.pid ?? fail();
    case 'node':
      return rt.atom('nonode@nohost');
    case 'is_port':
      return rt.atom('false');
    case 'get_tcw':
      return 0n;
    default:
      break;
  }
  if (bodyOnlyFunctions.has(name)) return rt.atom('true');
  const values = args.map(arg => evaluate(rt, arg, context));
  if (name === '+' && values.length === 1) {
    if (typeof values[0] !== 'bigint' && !(Array.isArray(values[0]) && values[0][0] === 2)) fail();
    return values[0];
  }
  try {
    return rt.callBif(name, values, context.pid);
  } catch (error) {
    if (error?.erlangClass) fail();
    throw error;
  }
}

// Runs a compiled match specification against one term. Returns
// {value} for the first matching clause, or null.
export function runMatchSpec(rt, clauses, term, pid) {
  for (const clause of clauses) {
    const bindings = new Map();
    if (!matchHead(rt, clause.head, term, bindings)) continue;
    const context = {object: term, bindings, pid};
    try {
      if (!clause.guards.every(guard => evaluate(rt, guard, context) === rt.atom('true'))) continue;
    } catch (error) {
      // A guard that raises fails the clause.
      if (error instanceof MatchFailure) continue;
      throw error;
    }
    try {
      let value = term;
      for (const expression of clause.body) value = evaluate(rt, expression, context);
      return {value};
    } catch (error) {
      if (error instanceof MatchFailure) return {value: rt.atom('EXIT')};
      throw error;
    }
  }
  return null;
}

// --- tables --------------------------------------------------------------------

class Table {
  constructor(rt, {name, named, type, keypos, protection, owner, heir}) {
    Object.assign(this, {rt, name, named, type, keypos, protection, owner, heir});
    this.id = rt.makeRef();
    this.entries = type === 'ordered_set' ? [] : new Map();
    this.size = 0;
  }

  key(object) {
    return object[1][this.keypos - 1];
  }

  // ordered_set: index of the first object whose key is >= key, and whether it is equal.
  search(key) {
    let low = 0;
    let high = this.entries.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.rt.compare(this.key(this.entries[mid]), key) < 0) low = mid + 1;
      else high = mid;
    }
    return [low, low < this.entries.length && this.rt.compare(this.key(this.entries[low]), key) === 0];
  }

  lookup(key) {
    if (this.type === 'ordered_set') {
      const [index, found] = this.search(key);
      return found ? [this.entries[index]] : [];
    }
    const found = this.entries.get(termKey(key));
    if (!found) return [];
    return this.type === 'set' ? [found] : found;
  }

  insert(object) {
    const key = this.key(object);
    if (this.type === 'ordered_set') {
      const [index, found] = this.search(key);
      if (found) this.entries[index] = object;
      else {
        this.entries.splice(index, 0, object);
        this.size++;
      }
      return;
    }
    const hash = termKey(key);
    if (this.type === 'set') {
      if (!this.entries.has(hash)) this.size++;
      this.entries.set(hash, object);
      return;
    }
    const bucket = this.entries.get(hash) ?? [];
    if (this.type === 'bag' && bucket.some(existing => this.rt.equalExact(existing, object))) return;
    bucket.push(object);
    this.entries.set(hash, bucket);
    this.size++;
  }

  deleteKey(key) {
    if (this.type === 'ordered_set') {
      const [index, found] = this.search(key);
      if (found) {
        this.entries.splice(index, 1);
        this.size--;
      }
      return;
    }
    const hash = termKey(key);
    const found = this.entries.get(hash);
    if (!found) return;
    this.size -= this.type === 'set' ? 1 : found.length;
    this.entries.delete(hash);
  }

  deleteObject(object) {
    const key = this.key(object);
    if (this.type === 'set' || this.type === 'ordered_set') {
      const [existing] = this.lookup(key);
      if (existing && this.rt.equalExact(existing, object)) this.deleteKey(key);
      return;
    }
    const hash = termKey(key);
    const bucket = this.entries.get(hash);
    if (!bucket) return;
    const kept = bucket.filter(existing => !this.rt.equalExact(existing, object));
    this.size -= bucket.length - kept.length;
    if (kept.length) this.entries.set(hash, kept);
    else this.entries.delete(hash);
  }

  objects() {
    if (this.type === 'ordered_set') return this.entries.slice();
    if (this.type === 'set') return [...this.entries.values()];
    return [...this.entries.values()].flat();
  }

  keys() {
    if (this.type === 'ordered_set') return this.entries.map(object => this.key(object));
    return [...this.entries.values()].map(value => this.key(this.type === 'set' ? value : value[0]));
  }

  clear() {
    this.entries = this.type === 'ordered_set' ? [] : new Map();
    this.size = 0;
  }
}

const registries = new WeakMap();
function registry(rt) {
  let tables = registries.get(rt);
  if (!tables) {
    tables = {byId: new Map(), byName: new Map()};
    registries.set(rt, tables);
  }
  return tables;
}

function findTable(rt, id) {
  const tables = registry(rt);
  if (isAtom(id)) return tables.byName.get(id);
  if (Array.isArray(id) && id[0] === 7) return tables.byId.get(id[1]);
  return undefined;
}

function table(rt, id, pid, access = 'read') {
  const found = findTable(rt, id);
  if (!found) badarg(rt);
  if (pid !== undefined && found.owner !== pid && !rt.equalExact(found.owner, pid)) {
    if (found.protection === 'private' || (access === 'write' && found.protection === 'protected')) badarg(rt);
  }
  return found;
}

function deleteTable(rt, found) {
  const tables = registry(rt);
  tables.byId.delete(found.id[1]);
  if (found.named) tables.byName.delete(found.name);
  found.detach?.();
}

function watchOwner(rt, found) {
  found.detach?.();
  found.detach = undefined;
  try {
    found.detach = rt.onProcessExit(found.owner, () => ownerExited(rt, found));
  } catch {
    // Processes run synchronously through invoke cannot be watched; their tables persist.
  }
}

function ownerExited(rt, found) {
  found.detach = undefined;
  if (!registry(rt).byId.has(found.id[1])) return;
  const heir = found.heir;
  if (heir && !rt.equalExact(heir.pid, found.owner) && isAlive(rt, heir.pid)) {
    const previous = found.owner;
    found.owner = heir.pid;
    queueMicrotask(() => {
      if (!registry(rt).byId.has(found.id[1])) return;
      watchOwner(rt, found);
      rt.sendPidMessage(heir.pid, rt.tuple([rt.atom('ETS-TRANSFER'), tableName(rt, found), previous, heir.data]));
    });
    return;
  }
  deleteTable(rt, found);
}

function isAlive(rt, pid) {
  try {
    return rt.isProcessAlive(pid);
  } catch {
    return false;
  }
}

function tableName(rt, found) {
  return found.named ? found.name : found.id;
}

function objectsOf(rt, found, value) {
  const objects = is(value, TUPLE) ? [value] : listToArray(value);
  if (objects === null) badarg(rt);
  for (const object of objects) {
    if (!is(object, TUPLE) || object[1].length < found.keypos) badarg(rt);
  }
  return objects;
}

function parseOptions(rt, list) {
  const options = listToArray(list);
  if (options === null) badarg(rt);
  const result = {type: 'set', keypos: 1, protection: 'protected', named: false, heir: null};
  for (const option of options) {
    if (isAtom(option)) {
      const name = Symbol.keyFor(option);
      if (['set', 'ordered_set', 'bag', 'duplicate_bag'].includes(name)) result.type = name;
      else if (['public', 'protected', 'private'].includes(name)) result.protection = name;
      else if (name === 'named_table') result.named = true;
      else if (name !== 'compressed') badarg(rt);
    } else if (is(option, TUPLE)) {
      const [key, value, data] = option[1];
      const name = isAtom(key) ? Symbol.keyFor(key) : '';
      if (name === 'keypos' && option[1].length === 2) {
        if (typeof value !== 'bigint' || value < 1n) badarg(rt);
        result.keypos = Number(value);
      } else if (name === 'heir' && option[1].length === 2 && value === rt.atom('none')) {
        result.heir = null;
      } else if (name === 'heir' && option[1].length === 3 && Array.isArray(value) && value[0] === 6) {
        result.heir = {pid: value, data};
      } else if (!['write_concurrency', 'read_concurrency', 'decentralized_counters'].includes(name) ||
                 option[1].length !== 2) {
        badarg(rt);
      }
    } else {
      badarg(rt);
    }
  }
  return result;
}

function info(rt, found, item) {
  const atom = name => rt.atom(name);
  switch (Symbol.keyFor(item)) {
    case 'id': return found.id;
    case 'name': return found.name;
    case 'size': return BigInt(found.size);
    case 'type': return atom(found.type);
    case 'keypos': return BigInt(found.keypos);
    case 'protection': return atom(found.protection);
    case 'owner': return found.owner;
    case 'heir': return found.heir ? found.heir.pid : atom('none');
    case 'named_table': return bool(rt, found.named);
    case 'node': return atom('nonode@nohost');
    case 'memory': return BigInt(found.size * 8 + 300);
    case 'compressed':
    case 'read_concurrency':
    case 'decentralized_counters':
    case 'write_concurrency': return atom('false');
    case 'fixed': return atom('false');
    case 'safe_fixed':
    case 'safe_fixed_monotonic_time': return atom('false');
    case 'stats': return atom('false');
    default: return badarg(rt);
  }
}

const infoItems = ['id', 'decentralized_counters', 'read_concurrency', 'write_concurrency', 'compressed', 'memory',
  'owner', 'heir', 'name', 'size', 'node', 'named_table', 'type', 'keypos', 'protection'];

function selectAll(rt, found, spec, pid, reverse = false) {
  const clauses = compiledClauses(rt, spec);
  const results = [];
  const objects = found.objects();
  if (reverse) objects.reverse();
  for (const object of objects) {
    const result = runMatchSpec(rt, clauses, object, pid);
    if (result) results.push(result.value);
  }
  return results;
}

const compiledSpecs = new WeakMap();
function compiledClauses(rt, spec) {
  if (Array.isArray(spec) && spec[0] === 7 && compiledSpecs.has(spec)) return compiledSpecs.get(spec);
  return compileMatchSpec(rt, spec);
}

const end = rt => rt.atom('$end_of_table');

function chunk(rt, results, limit) {
  if (results.length === 0) return end(rt);
  const taken = results.slice(0, limit);
  const rest = results.slice(limit);
  const continuation = rest.length
    ? rt.tuple([rt.atom('beam2js_ets_continuation'), BigInt(limit), arrayToList(rt, rest)])
    : end(rt);
  return rt.tuple([arrayToList(rt, taken), continuation]);
}

function continueChunk(rt, continuation) {
  if (continuation === end(rt)) return end(rt);
  if (!is(continuation, TUPLE) || continuation[1].length !== 3 ||
      continuation[1][0] !== rt.atom('beam2js_ets_continuation')) badarg(rt);
  return chunk(rt, listToArray(continuation[1][2]), Number(continuation[1][1]));
}

function limitOf(rt, limit) {
  if (typeof limit !== 'bigint' || limit < 1n) badarg(rt);
  return Number(limit);
}

const matchSpec = (rt, pattern, body) => arrayToList(rt, [rt.tuple([pattern, rt.nil(), arrayToList(rt, [body])])]);

function updateCounter(rt, found, object, operation) {
  const elements = object[1].slice();
  const operations = is(operation, CONS) || is(operation, NIL) ? listToArray(operation) : [operation];
  if (operations === null) badarg(rt);
  const results = [];
  for (const op of operations) {
    let position = found.keypos + 1;
    let increment = op;
    let threshold, setValue;
    if (is(op, TUPLE)) {
      [position, increment, threshold, setValue] = op[1];
      if ((op[1].length !== 2 && op[1].length !== 4) || typeof position !== 'bigint') badarg(rt);
      position = Number(position);
    }
    if (typeof increment !== 'bigint' || position < 1 || position > elements.length || position === found.keypos) {
      badarg(rt);
    }
    const current = elements[position - 1];
    if (typeof current !== 'bigint') badarg(rt);
    let value = current + increment;
    if (threshold !== undefined) {
      if (typeof threshold !== 'bigint' || typeof setValue !== 'bigint') badarg(rt);
      if ((increment >= 0n && value > threshold) || (increment < 0n && value < threshold)) value = setValue;
    }
    elements[position - 1] = value;
    results.push(value);
  }
  found.insert(rt.tuple(elements));
  return is(operation, CONS) || is(operation, NIL) ? arrayToList(rt, results) : results[0];
}

function updateElement(rt, found, object, spec) {
  const elements = object[1].slice();
  const updates = is(spec, TUPLE) ? [spec] : listToArray(spec);
  if (updates === null) badarg(rt);
  for (const update of updates) {
    if (!is(update, TUPLE) || update[1].length !== 2 || typeof update[1][0] !== 'bigint') badarg(rt);
    const position = Number(update[1][0]);
    if (position < 1 || position > elements.length || position === found.keypos) badarg(rt);
    elements[position - 1] = update[1][1];
  }
  found.insert(rt.tuple(elements));
}

function neighbour(rt, found, key, direction) {
  if (found.type === 'ordered_set') {
    const [index, equal] = found.search(key);
    const at = direction > 0 ? (equal ? index + 1 : index) : index - 1;
    return at >= 0 && at < found.entries.length ? found.key(found.entries[at]) : end(rt);
  }
  const keys = found.keys();
  const index = keys.findIndex(candidate => rt.equalExact(candidate, key));
  if (index < 0) badarg(rt);
  const at = index + direction;
  return at >= 0 && at < keys.length ? keys[at] : end(rt);
}

function edge(rt, found, last) {
  const keys = found.keys();
  if (!keys.length) return end(rt);
  return last && found.type === 'ordered_set' ? keys[keys.length - 1] : keys[0];
}

function withObjects(rt, found, key) {
  if (key === end(rt)) return key;
  return rt.tuple([key, arrayToList(rt, found.lookup(key))]);
}

export function etsBifs() {
  const bifs = [];
  const def = (name, arity, fn) => bifs.push([name, arity, fn]);

  def('new', 2, (rt, [name, options], pid) => {
    if (!isAtom(name)) badarg(rt);
    const parsed = parseOptions(rt, options);
    const tables = registry(rt);
    if (parsed.named && tables.byName.has(name)) badarg(rt);
    const found = new Table(rt, {...parsed, name, owner: pid});
    tables.byId.set(found.id[1], found);
    if (parsed.named) tables.byName.set(name, found);
    watchOwner(rt, found);
    return tableName(rt, found);
  });
  def('delete', 1, (rt, [id], pid) => {
    deleteTable(rt, table(rt, id, pid, 'write'));
    return rt.atom('true');
  });
  def('delete', 2, (rt, [id, key], pid) => {
    table(rt, id, pid, 'write').deleteKey(key);
    return rt.atom('true');
  });
  def('internal_delete_all', 2, (rt, [id], pid) => {
    const found = table(rt, id, pid, 'write');
    const size = found.size;
    found.clear();
    return BigInt(size);
  });
  def('delete_object', 2, (rt, [id, object], pid) => {
    const found = table(rt, id, pid, 'write');
    if (!is(object, TUPLE) || object[1].length < found.keypos) badarg(rt);
    found.deleteObject(object);
    return rt.atom('true');
  });
  def('insert', 2, (rt, [id, value], pid) => {
    const found = table(rt, id, pid, 'write');
    for (const object of objectsOf(rt, found, value)) found.insert(object);
    return rt.atom('true');
  });
  def('insert_new', 2, (rt, [id, value], pid) => {
    const found = table(rt, id, pid, 'write');
    const objects = objectsOf(rt, found, value);
    const keys = objects.map(object => found.key(object));
    if (keys.some(key => found.lookup(key).length > 0)) return rt.atom('false');
    for (let i = 0; i < keys.length; i++) {
      for (let j = 0; j < i; j++) {
        const same = found.type === 'ordered_set' ? rt.compare(keys[i], keys[j]) === 0 : rt.equalExact(keys[i], keys[j]);
        if (same && found.type !== 'bag' && found.type !== 'duplicate_bag') return rt.atom('false');
      }
    }
    for (const object of objects) found.insert(object);
    return rt.atom('true');
  });
  def('lookup', 2, (rt, [id, key], pid) => arrayToList(rt, table(rt, id, pid).lookup(key)));
  const lookupElement = (rt, id, key, position, pid, fallback) => {
    const found = table(rt, id, pid);
    if (typeof position !== 'bigint' || position < 1n) badarg(rt);
    const objects = found.lookup(key);
    if (!objects.length) {
      if (fallback) return fallback.value;
      return badarg(rt);
    }
    const index = Number(position) - 1;
    if (objects.some(object => index >= object[1].length)) badarg(rt);
    if (found.type === 'set' || found.type === 'ordered_set') return objects[0][1][index];
    return arrayToList(rt, objects.map(object => object[1][index]));
  };
  def('lookup_element', 3, (rt, [id, key, position], pid) => lookupElement(rt, id, key, position, pid));
  def('lookup_element', 4, (rt, [id, key, position, fallback], pid) =>
    lookupElement(rt, id, key, position, pid, {value: fallback}));
  def('member', 2, (rt, [id, key], pid) => bool(rt, table(rt, id, pid).lookup(key).length > 0));
  def('take', 2, (rt, [id, key], pid) => {
    const found = table(rt, id, pid, 'write');
    const objects = found.lookup(key);
    found.deleteKey(key);
    return arrayToList(rt, objects);
  });
  def('first', 1, (rt, [id], pid) => edge(rt, table(rt, id, pid), false));
  def('last', 1, (rt, [id], pid) => edge(rt, table(rt, id, pid), true));
  def('next', 2, (rt, [id, key], pid) => neighbour(rt, table(rt, id, pid), key, 1));
  def('prev', 2, (rt, [id, key], pid) => {
    const found = table(rt, id, pid);
    return found.type === 'ordered_set' ? neighbour(rt, found, key, -1) : neighbour(rt, found, key, 1);
  });
  def('first_lookup', 1, (rt, [id], pid) => {
    const found = table(rt, id, pid);
    return withObjects(rt, found, edge(rt, found, false));
  });
  def('last_lookup', 1, (rt, [id], pid) => {
    const found = table(rt, id, pid);
    return withObjects(rt, found, edge(rt, found, true));
  });
  def('next_lookup', 2, (rt, [id, key], pid) => {
    const found = table(rt, id, pid);
    return withObjects(rt, found, neighbour(rt, found, key, 1));
  });
  def('prev_lookup', 2, (rt, [id, key], pid) => {
    const found = table(rt, id, pid);
    return withObjects(rt, found, neighbour(rt, found, key, found.type === 'ordered_set' ? -1 : 1));
  });
  def('info', 1, (rt, [id]) => {
    if (!isAtom(id) && !(Array.isArray(id) && id[0] === 7)) badarg(rt);
    const found = findTable(rt, id);
    if (!found) return rt.atom('undefined');
    return arrayToList(rt, infoItems.map(item => rt.tuple([rt.atom(item), info(rt, found, rt.atom(item))])));
  });
  def('info', 2, (rt, [id, item]) => {
    if ((!isAtom(id) && !(Array.isArray(id) && id[0] === 7)) || !isAtom(item)) badarg(rt);
    const found = findTable(rt, id);
    if (!found) return rt.atom('undefined');
    return info(rt, found, item);
  });
  def('whereis', 1, (rt, [name]) => {
    if (!isAtom(name)) badarg(rt);
    const found = registry(rt).byName.get(name);
    return found ? found.id : rt.atom('undefined');
  });
  def('rename', 2, (rt, [id, name], pid) => {
    const found = table(rt, id, pid, 'write');
    if (!isAtom(name)) badarg(rt);
    const tables = registry(rt);
    if (found.named) {
      if (tables.byName.has(name) && tables.byName.get(name) !== found) badarg(rt);
      tables.byName.delete(found.name);
      tables.byName.set(name, found);
    }
    found.name = name;
    return name;
  });
  def('give_away', 3, (rt, [id, target, data], pid) => {
    const found = table(rt, id);
    if (!rt.equalExact(found.owner, pid) || !isAlive(rt, target) || rt.equalExact(target, pid)) badarg(rt);
    found.owner = target;
    watchOwner(rt, found);
    rt.sendPidMessage(target, rt.tuple([rt.atom('ETS-TRANSFER'), tableName(rt, found), pid, data]));
    return rt.atom('true');
  });
  def('setopts', 2, (rt, [id, options], pid) => {
    const found = table(rt, id);
    if (!rt.equalExact(found.owner, pid)) badarg(rt);
    const list = is(options, TUPLE) ? [options] : listToArray(options);
    if (list === null) badarg(rt);
    for (const option of list) {
      if (!is(option, TUPLE)) badarg(rt);
      const [key, value, data] = option[1];
      if (key === rt.atom('heir') && value === rt.atom('none')) found.heir = null;
      else if (key === rt.atom('heir') && option[1].length === 3) found.heir = {pid: value, data};
      else if (key === rt.atom('protection') && isAtom(value)) found.protection = Symbol.keyFor(value);
      else badarg(rt);
    }
    return rt.atom('true');
  });
  def('safe_fixtable', 2, (rt, [id, flag], pid) => {
    table(rt, id, pid);
    if (flag !== rt.atom('true') && flag !== rt.atom('false')) badarg(rt);
    return rt.atom('true');
  });
  def('slot', 2, (rt, [id, index], pid) => {
    const found = table(rt, id, pid);
    if (typeof index !== 'bigint' || index < 0n) badarg(rt);
    const objects = found.type === 'ordered_set' ? found.objects().map(object => [object])
      : [...found.entries.values()].map(value => found.type === 'set' ? [value] : value);
    if (index > BigInt(objects.length)) badarg(rt);
    return index === BigInt(objects.length) ? end(rt) : arrayToList(rt, objects[Number(index)]);
  });
  def('update_counter', 3, (rt, [id, key, operation], pid) => {
    const found = table(rt, id, pid, 'write');
    if (found.type === 'bag' || found.type === 'duplicate_bag') badarg(rt);
    const [object] = found.lookup(key);
    if (!object) badarg(rt);
    return updateCounter(rt, found, object, operation);
  });
  def('update_counter', 4, (rt, [id, key, operation, fallback], pid) => {
    const found = table(rt, id, pid, 'write');
    if (found.type === 'bag' || found.type === 'duplicate_bag') badarg(rt);
    let [object] = found.lookup(key);
    if (!object) {
      if (!is(fallback, TUPLE) || fallback[1].length < found.keypos) badarg(rt);
      const elements = fallback[1].slice();
      elements[found.keypos - 1] = key;
      object = rt.tuple(elements);
    }
    return updateCounter(rt, found, object, operation);
  });
  def('update_element', 3, (rt, [id, key, spec], pid) => {
    const found = table(rt, id, pid, 'write');
    if (found.type === 'bag' || found.type === 'duplicate_bag') badarg(rt);
    const [object] = found.lookup(key);
    if (!object) return rt.atom('false');
    updateElement(rt, found, object, spec);
    return rt.atom('true');
  });
  def('update_element', 4, (rt, [id, key, spec, fallback], pid) => {
    const found = table(rt, id, pid, 'write');
    if (found.type === 'bag' || found.type === 'duplicate_bag') badarg(rt);
    let [object] = found.lookup(key);
    if (!object) {
      if (!is(fallback, TUPLE) || fallback[1].length < found.keypos) badarg(rt);
      const elements = fallback[1].slice();
      elements[found.keypos - 1] = key;
      object = rt.tuple(elements);
    }
    updateElement(rt, found, object, spec);
    return rt.atom('true');
  });

  def('match', 2, (rt, [id, pattern], pid) =>
    arrayToList(rt, selectAll(rt, table(rt, id, pid), matchSpec(rt, pattern, rt.atom('$$')), pid)));
  def('match', 3, (rt, [id, pattern, limit], pid) =>
    chunk(rt, selectAll(rt, table(rt, id, pid), matchSpec(rt, pattern, rt.atom('$$')), pid), limitOf(rt, limit)));
  def('match', 1, (rt, [continuation]) => continueChunk(rt, continuation));
  def('match_object', 2, (rt, [id, pattern], pid) =>
    arrayToList(rt, selectAll(rt, table(rt, id, pid), matchSpec(rt, pattern, rt.atom('$_')), pid)));
  def('match_object', 3, (rt, [id, pattern, limit], pid) =>
    chunk(rt, selectAll(rt, table(rt, id, pid), matchSpec(rt, pattern, rt.atom('$_')), pid), limitOf(rt, limit)));
  def('match_object', 1, (rt, [continuation]) => continueChunk(rt, continuation));
  def('select', 2, (rt, [id, spec], pid) => arrayToList(rt, selectAll(rt, table(rt, id, pid), spec, pid)));
  def('select', 3, (rt, [id, spec, limit], pid) =>
    chunk(rt, selectAll(rt, table(rt, id, pid), spec, pid), limitOf(rt, limit)));
  def('select', 1, (rt, [continuation]) => continueChunk(rt, continuation));
  def('select_reverse', 2, (rt, [id, spec], pid) =>
    arrayToList(rt, selectAll(rt, table(rt, id, pid), spec, pid, true)));
  def('select_reverse', 3, (rt, [id, spec, limit], pid) =>
    chunk(rt, selectAll(rt, table(rt, id, pid), spec, pid, true), limitOf(rt, limit)));
  def('select_reverse', 1, (rt, [continuation]) => continueChunk(rt, continuation));
  def('select_count', 2, (rt, [id, spec], pid) => BigInt(
    selectAll(rt, table(rt, id, pid), spec, pid).filter(value => value === rt.atom('true')).length));
  def('internal_select_delete', 2, (rt, [id, spec], pid) => {
    const found = table(rt, id, pid, 'write');
    const clauses = compiledClauses(rt, spec);
    let deleted = 0;
    for (const object of found.objects()) {
      if (runMatchSpec(rt, clauses, object, pid)?.value === rt.atom('true')) {
        found.deleteObject(object);
        deleted++;
      }
    }
    return BigInt(deleted);
  });
  def('select_replace', 2, (rt, [id, spec], pid) => {
    const found = table(rt, id, pid, 'write');
    if (found.type === 'bag' || found.type === 'duplicate_bag') badarg(rt);
    const clauses = compiledClauses(rt, spec);
    let replaced = 0;
    for (const object of found.objects()) {
      const result = runMatchSpec(rt, clauses, object, pid);
      if (!result) continue;
      const value = result.value;
      if (!is(value, TUPLE) || value[1].length < found.keypos ||
          !rt.equalExact(found.key(value), found.key(object))) badarg(rt);
      found.insert(value);
      replaced++;
    }
    return BigInt(replaced);
  });
  def('match_spec_compile', 1, (rt, [spec]) => {
    const clauses = compileMatchSpec(rt, spec);
    const ref = rt.makeRef();
    compiledSpecs.set(ref, clauses);
    return ref;
  });
  def('is_compiled_ms', 1, (rt, [term]) => bool(rt, Array.isArray(term) && compiledSpecs.has(term)));
  def('match_spec_run_r', 3, (rt, [list, compiled, accumulator], pid) => {
    const items = listToArray(list);
    if (items === null || !compiledSpecs.has(compiled)) badarg(rt);
    let result = accumulator;
    for (const item of items) {
      const matched = runMatchSpec(rt, compiledSpecs.get(compiled), item, pid);
      if (matched) result = rt.cons(matched.value, result);
    }
    return result;
  });
  def('internal_request_all', 0, (rt, args, pid) => {
    const ref = rt.makeRef();
    const all = [...registry(rt).byId.values()].map(found => tableName(rt, found));
    rt.sendPidMessage(pid, rt.tuple([ref, arrayToList(rt, all)]));
    return ref;
  });
  return bifs;
}

// erlang:match_spec_test/3 for table objects and trace argument lists.
export function matchSpecTest(rt, term, spec, kind) {
  let clauses;
  try {
    clauses = compileMatchSpec(rt, spec);
  } catch (error) {
    if (!error?.erlangClass) throw error;
    return rt.tuple([rt.atom('error'), arrayToList(rt, [rt.tuple([rt.atom('error'),
      arrayToList(rt, [...'invalid match specification'].map(c => BigInt(c.codePointAt(0))))])])]);
  }
  if (kind === rt.atom('table') && !is(term, TUPLE)) badarg(rt);
  const result = runMatchSpec(rt, clauses, term, undefined);
  const value = result ? (kind === rt.atom('trace') && result.value === term ? rt.atom('true') : result.value)
    : rt.atom('false');
  return rt.tuple([rt.atom('ok'), value, rt.nil(), rt.nil()]);
}
