// HTTP filesystem with an in-memory writable overlay: server files are
// read-only, while files and directories created by Erlang code live in the
// runtime's memory and shadow server paths. Descriptors and buffers belong to
// one runtime; ordinary file data is never evaluated as JavaScript.
import {BITSTRING, TUPLE, is, isAtom, listToArray, arrayToList, charlist, charlistText, binary} from './term.mjs';

const states = new WeakMap();
const badarg = rt => rt.raiseError(rt.atom('badarg'));
const error = (rt, reason) => rt.tuple([rt.atom('error'), rt.atom(reason)]);
const ok = (rt, value) => rt.tuple([rt.atom('ok'), value]);
const asyncIO = run => ({type: 'async', run});
function state(rt) {
  if (!states.has(rt)) {
    states.set(rt, {cwd: rt.fileBaseURL, handles: new WeakMap(), buffers: new WeakMap(), paths: [rt.moduleBaseURL],
      overlay: new Map()});
  }
  return states.get(rt);
}
function integer(rt, value) {
  if (typeof value !== 'bigint' || value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) badarg(rt);
  return Number(value);
}
function text(rt, term) {
  const value = isAtom(term) ? Symbol.keyFor(term) :
    is(term, BITSTRING) ? new TextDecoder().decode(rt.bitstringBytes(term)) : charlistText(term);
  if (value === null || value === undefined) badarg(rt);
  const decoded = is(term, BITSTRING) ? value.replace(/\0$/, '') : value;
  if (decoded.includes('\0')) badarg(rt);
  return decoded;
}
function url(rt, name) {
  const result = new URL(text(rt, name), state(rt).cwd);
  if (!['http:', 'https:', 'file:'].includes(result.protocol)) badarg(rt);
  return result.href;
}
async function request(rt, path, method = 'GET') {
  let response;
  try {
    response = await rt.fetchFile(path, {method});
  } catch (cause) {
    // Transport errors are IO errors, not missing files or successful empty reads.
    if (!(cause instanceof TypeError)) throw cause;
    return {reason: 'eio'};
  }
  if (!response.ok) {
    if (response.headers.get('content-type')?.startsWith('application/vnd.beam2js.file+json')) {
      const data = await json(response);
      if (['enoent', 'enotdir', 'eacces', 'einval'].includes(data?.error)) return {reason: data.error};
    }
    return {reason: response.status === 404 ? 'enoent' :
      response.status === 401 || response.status === 403 ? 'eacces' : 'eio'};
  }
  return {response};
}
async function json(response) {
  try { return await response.json(); }
  catch (error) {
    if (!(error instanceof SyntaxError) && !(error instanceof TypeError)) throw error;
    return null;
  }
}
async function readFile(rt, path) {
  const entry = overlayEntry(rt, path);
  if (entry) return entry.type === 'regular' ? ok(rt, binary(rt, entry.bytes.slice())) : error(rt, 'eisdir');
  const result = await request(rt, path);
  if (result.reason) return error(rt, result.reason);
  try {
    return ok(rt, binary(rt, new Uint8Array(await result.response.arrayBuffer())));
  } catch (cause) {
    if (!(cause instanceof TypeError)) throw cause;
    return error(rt, 'eio');
  }
}
// Reads a whole file (overlay or server) for runtime natives such as
// code:load_abs; resolves to bytes or an error reason name.
export async function readFileBytes(rt, name) {
  const path = url(rt, name);
  const entry = overlayEntry(rt, path);
  if (entry) return entry.type === 'regular' ? entry.bytes.slice() : 'eisdir';
  const result = await request(rt, path);
  if (result.reason) return result.reason;
  try {
    return new Uint8Array(await result.response.arrayBuffer());
  } catch (cause) {
    if (!(cause instanceof TypeError)) throw cause;
    return 'eio';
  }
}
function handle(rt, ref) {
  const value = state(rt).handles.get(ref);
  if (!value) badarg(rt);
  return value;
}
function buffer(rt, ref) {
  const value = state(rt).buffers.get(ref);
  if (!value) badarg(rt);
  return value;
}
function take(rt, ref, size) {
  const value = buffer(rt, ref), n = integer(rt, size);
  if (n > value.bytes.length) badarg(rt);
  const result = binary(rt, value.bytes.slice(0, n));
  value.bytes = value.bytes.slice(n);
  return result;
}
function read(rt, ref, offset, size, advance) {
  const value = handle(rt, ref), n = integer(rt, size), pos = integer(rt, offset ?? BigInt(value.position));
  if (!n) return ok(rt, binary(rt, new Uint8Array()));
  if (pos >= value.bytes.length) return rt.atom('eof');
  const end = Math.min(value.bytes.length, pos + n);
  if (advance) value.position = end;
  return ok(rt, binary(rt, value.bytes.slice(pos, end)));
}
function info(rt, size, timestamp = 0, metadata = {}) {
  return rt.tuple([rt.atom('file_info'), BigInt(size), rt.atom(metadata.type ?? 'regular'), rt.atom(metadata.access ?? 'read'),
    BigInt(metadata.atime ?? timestamp), BigInt(metadata.mtime ?? timestamp), BigInt(metadata.ctime ?? timestamp),
    BigInt(metadata.mode ?? 0o100444), 1n, 0n, 0n, 0n, 0n, 0n]);
}
async function metadata(rt, path, operation) {
  const target = new URL(path);
  target.search = `beam2js=${operation}`;
  const result = await request(rt, target.href);
  if (result.reason) return result;
  if (!result.response.headers.get('content-type')?.startsWith('application/vnd.beam2js.file+json')) {
    return {reason: 'enotsup'};
  }
  const value = await json(result.response);
  return value === null || typeof value !== 'object' ? {reason: 'eio'} : {value};
}
async function stat(rt, path) {
  const entry = overlayEntry(rt, path);
  if (entry) return overlayInfo(rt, entry);
  const result = await metadata(rt, path, 'stat');
  if (result.value) {
    const data = result.value;
    if (!Number.isSafeInteger(data.size) || data.size < 0 ||
        !['regular', 'directory', 'symlink', 'other', 'device'].includes(data.type) ||
        !['atime', 'mtime', 'ctime', 'mode'].every(key => Number.isSafeInteger(data[key]))) {
      return error(rt, 'eio');
    }
    return info(rt, data.size, 0, data);
  }
  if (!['enotsup', 'enoent'].includes(result.reason)) return error(rt, result.reason);
  const head = await request(rt, path, 'HEAD');
  if (head.reason) return error(rt, head.reason);
  const length = head.response.headers.get('content-length');
  let size = length === null ? NaN : Number(length);
  if (!Number.isSafeInteger(size) || size < 0) {
    const get = await readFile(rt, path);
    if (rt.tupleElement(get, 1) === rt.atom('error')) return get;
    size = rt.bitstringBytes(rt.tupleElement(get, 2)).length;
  }
  const date = Date.parse(head.response.headers.get('last-modified'));
  return info(rt, size, Number.isFinite(date) ? Math.floor(date / 1000) : 0);
}
const overlayKey = path => path.length > 1 && path.endsWith('/') && !path.endsWith('//') ? path.slice(0, -1) : path;
function parentKey(key) {
  const index = key.lastIndexOf('/');
  return index <= key.indexOf('//') + 1 ? null : key.slice(0, index);
}
function overlayEntry(rt, path) {
  return state(rt).overlay.get(overlayKey(path));
}
const now = () => Math.floor(Date.now() / 1000);
function overlayInfo(rt, entry) {
  return info(rt, entry.type === 'regular' ? entry.bytes.length : 0, entry.mtime,
    {type: entry.type, access: 'read_write', mode: entry.type === 'regular' ? 0o100644 : 0o40755});
}
// The type of an overlay or server path, or null when it does not exist.
async function pathType(rt, path) {
  const entry = overlayEntry(rt, path);
  if (entry) return entry.type;
  const result = await stat(rt, path);
  return rt.tupleElement(result, 1) === rt.atom('error') ? null : Symbol.keyFor(rt.tupleElement(result, 3));
}
async function parentIsDirectory(rt, path) {
  const parent = parentKey(overlayKey(path));
  return parent === null || await pathType(rt, parent + '/') === 'directory';
}
function overlayChildren(rt, path) {
  const key = overlayKey(path);
  return [...state(rt).overlay.keys()].filter(child => parentKey(child) === key);
}
async function openWritable(rt, path, flags) {
  const has = name => flags.includes(rt.atom(name));
  let entry = overlayEntry(rt, path);
  if (!entry) {
    const type = await pathType(rt, path);
    if (type === 'directory') return error(rt, 'eisdir');
    if (type === null && !await parentIsDirectory(rt, path)) return error(rt, 'enoent');
    let bytes = new Uint8Array();
    if (type !== null && !has('exclusive')) {
      const result = await readFile(rt, path);
      if (rt.tupleElement(result, 1) === rt.atom('error')) return result;
      bytes = rt.bitstringBytes(rt.tupleElement(result, 2)).slice();
    } else if (type !== null) {
      return error(rt, 'eexist');
    }
    entry = {type: 'regular', bytes, mtime: now()};
    state(rt).overlay.set(overlayKey(path), entry);
  } else if (entry.type === 'directory') {
    return error(rt, 'eisdir');
  } else if (has('exclusive')) {
    return error(rt, 'eexist');
  }
  if (has('write') && !has('read') && !has('append')) entry.bytes = new Uint8Array();
  const ref = rt.makeRef();
  state(rt).handles.set(ref, {
    get bytes() { return entry.bytes; },
    position: 0, entry, writable: true, readable: has('read'), append: has('append'),
  });
  return ok(rt, ref);
}
function writeAt(rt, value, offset, data) {
  if (!value.writable) return error(rt, 'ebadf');
  const chunks = (listToArray(data) ?? badarg(rt)).map(chunk => rt.bitstringBytes(chunk));
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const start = value.append ? value.entry.bytes.length : offset;
  const end = start + length;
  let bytes = value.entry.bytes;
  if (end > bytes.length) {
    bytes = new Uint8Array(end);
    bytes.set(value.entry.bytes);
  }
  let position = start;
  for (const chunk of chunks) {
    bytes.set(chunk, position);
    position += chunk.length;
  }
  value.entry.bytes = bytes;
  value.entry.mtime = now();
  return end;
}
function modulePath(rt, name) {
  const path = text(rt, name);
  // erl_prim_loader's object requests refer to BEAM names, but this runtime's
  // object format is a generated ES module. Do not fetch a BEAM as a fallback.
  return path.endsWith('.beam')
    ? new URL(`${encodeURIComponent(path.split('/').pop().slice(0, -5))}.mjs`, rt.moduleBaseURL).href
    : new URL(path, path.endsWith('.mjs') && !/[/:]/.test(path) ? rt.moduleBaseURL : state(rt).cwd).href;
}
async function loaderRead(rt, file, paths = state(rt).paths) {
  const name = text(rt, file);
  const candidates = name.endsWith('.beam') || /[/:]/.test(name)
    ? [modulePath(rt, file)]
    : paths.map(path => new URL(name, path.endsWith('/') ? path : path + '/').href);
  let result = error(rt, 'enoent');
  for (const path of candidates) {
    result = await readFile(rt, path);
    if (rt.tupleElement(result, 1) === rt.atom('ok')) return {result, path};
    if (rt.tupleElement(result, 2) !== rt.atom('enoent')) break;
  }
  return {result};
}

// Creates a writable in-memory directory and its missing ancestors.
export function makeMemoryDirectory(rt, path) {
  let key = overlayKey(new URL(path, state(rt).cwd).href);
  const overlay = state(rt).overlay;
  while (key !== null && !overlay.has(key)) {
    overlay.set(key, {type: 'directory', mtime: now()});
    key = parentKey(key);
  }
}

export function fileBifs() {
  const modules = new Map();
  const def = (module, name, arity, fn) => {
    if (!modules.has(module)) modules.set(module, []);
    modules.get(module).push([name, arity, fn]);
  };
  const prim = (name, arity, fn) => def('prim_file', name, arity, fn);
  prim('on_load', 0, rt => rt.atom('ok'));
  prim('internal_name2native', 1, (rt, [name]) => binary(rt, new TextEncoder().encode(text(rt, name) + '\0')));
  for (const name of ['internal_native2name', 'internal_normalize_utf8']) {
    prim(name, 1, (rt, [name]) => charlist(rt, text(rt, name)));
  }
  prim('is_translatable', 1, (rt, [name]) => { text(rt, name); return rt.atom('true'); });
  prim('get_cwd_nif', 0, rt => ok(rt, binary(rt, new TextEncoder().encode(state(rt).cwd))));
  prim('get_device_cwd_nif', 1, rt => error(rt, 'enotsup'));
  prim('set_cwd_nif', 1, (rt, [name]) => {
    const path = url(rt, name);
    return asyncIO(async () => {
      const result = await stat(rt, path);
      if (rt.tupleElement(result, 1) === rt.atom('error')) return result;
      if (rt.tupleElement(result, 3) !== rt.atom('directory')) return error(rt, 'enotdir');
      state(rt).cwd = path.endsWith('/') ? path : path + '/';
      return rt.atom('ok');
    });
  });
  prim('read_file_nif', 1, (rt, [name]) => {
    const path = url(rt, name);
    return asyncIO(() => readFile(rt, path));
  });
  prim('open_nif', 2, (rt, [name, modes]) => {
    const path = url(rt, name), flags = listToArray(modes);
    if (!flags) badarg(rt);
    if (flags.some(flag => [rt.atom('write'), rt.atom('append'), rt.atom('exclusive')].includes(flag))) {
      return asyncIO(() => openWritable(rt, path, flags));
    }
    const entry = overlayEntry(rt, path);
    if (entry?.type === 'regular') {
      const ref = rt.makeRef();
      state(rt).handles.set(ref, {get bytes() { return entry.bytes; }, position: 0, entry, readable: true});
      return ok(rt, ref);
    }
    return asyncIO(async () => {
      const result = await readFile(rt, path);
      if (rt.tupleElement(result, 1) === rt.atom('error')) return result;
      const ref = rt.makeRef(), bytes = rt.bitstringBytes(rt.tupleElement(result, 2));
      state(rt).handles.set(ref, {bytes, position: 0});
      return ok(rt, ref);
    });
  });
  for (const name of ['close_nif', 'delayed_close_nif']) prim(name, 1, (rt, [ref]) => {
    handle(rt, ref);
    state(rt).handles.delete(ref);
    return rt.atom('ok');
  });
  prim('read_nif', 2, (rt, [ref, size]) => read(rt, ref, null, size, true));
  prim('pread_nif', 3, (rt, [ref, offset, size]) => read(rt, ref, offset, size, false));
  prim('seek_nif', 3, (rt, [ref, mark, offset]) => {
    const value = handle(rt, ref);
    if (typeof offset !== 'bigint') badarg(rt);
    const base = mark === rt.atom('bof') ? 0 : mark === rt.atom('cur') ? value.position :
      mark === rt.atom('eof') ? value.bytes.length : badarg(rt);
    const position = BigInt(base) + offset;
    if (position < 0n || position > BigInt(Number.MAX_SAFE_INTEGER)) return error(rt, 'einval');
    value.position = Number(position);
    return ok(rt, position);
  });
  prim('read_info_nif', 2, (rt, [name]) => {
    const path = url(rt, name);
    return asyncIO(() => stat(rt, path));
  });
  prim('read_handle_info_nif', 1, (rt, [ref]) => info(rt, handle(rt, ref).bytes.length));
  prim('write_nif', 2, (rt, [ref, data]) => {
    const value = handle(rt, ref);
    const end = writeAt(rt, value, value.position, data);
    if (typeof end !== 'number') return end;
    value.position = end;
    return rt.atom('ok');
  });
  prim('pwrite_nif', 3, (rt, [ref, offset, data]) => {
    const end = writeAt(rt, handle(rt, ref), integer(rt, offset), data);
    return typeof end === 'number' ? rt.atom('ok') : end;
  });
  prim('truncate_nif', 1, (rt, [ref]) => {
    const value = handle(rt, ref);
    if (!value.writable) return error(rt, 'ebadf');
    value.entry.bytes = value.entry.bytes.slice(0, value.position);
    return rt.atom('ok');
  });
  prim('allocate_nif', 3, rt => error(rt, 'enotsup'));
  prim('make_dir_nif', 1, (rt, [name]) => {
    const path = url(rt, name);
    return asyncIO(async () => {
      if (await pathType(rt, path) !== null) return error(rt, 'eexist');
      if (!await parentIsDirectory(rt, path)) return error(rt, 'enoent');
      state(rt).overlay.set(overlayKey(path), {type: 'directory', mtime: now()});
      return rt.atom('ok');
    });
  });
  for (const [name, type] of [['del_file_nif', 'regular'], ['del_dir_nif', 'directory']]) {
    prim(name, 1, (rt, [file]) => {
      const path = url(rt, file);
      return asyncIO(async () => {
        const entry = overlayEntry(rt, path);
        if (!entry) return error(rt, await pathType(rt, path) === null ? 'enoent' : 'erofs');
        if (entry.type !== type) return error(rt, type === 'regular' ? 'eperm' : 'enotdir');
        if (type === 'directory' && overlayChildren(rt, path).length) return error(rt, 'eexist');
        state(rt).overlay.delete(overlayKey(path));
        return rt.atom('ok');
      });
    });
  }
  prim('rename_nif', 2, (rt, [source, destination]) => {
    const from = overlayKey(url(rt, source)), to = overlayKey(url(rt, destination));
    return asyncIO(async () => {
      const overlay = state(rt).overlay;
      if (!overlay.has(from)) return error(rt, await pathType(rt, from) === null ? 'enoent' : 'erofs');
      if (!await parentIsDirectory(rt, to)) return error(rt, 'enoent');
      const target = overlay.get(to);
      if (target?.type === 'directory' && overlayChildren(rt, to).length) return error(rt, 'eexist');
      for (const key of [...overlay.keys()]) {
        if (key === from || key.startsWith(from + '/')) {
          const entry = overlay.get(key);
          overlay.delete(key);
          overlay.set(to + key.slice(from.length), entry);
        }
      }
      return rt.atom('ok');
    });
  });
  for (const [name, arity] of [['set_permissions_nif', 2], ['set_owner_nif', 3], ['set_time_nif', 4]]) {
    prim(name, arity, (rt, [file]) => {
      const path = url(rt, file);
      return overlayEntry(rt, path) ? rt.atom('ok') : error(rt, 'erofs');
    });
  }
  for (const [name, arity] of [['make_hard_link_nif', 2], ['make_soft_link_nif', 2]]) {
    prim(name, arity, rt => error(rt, 'enotsup'));
  }
  prim('list_dir_nif', 1, (rt, [name]) => {
    const path = url(rt, name);
    return asyncIO(async () => {
      const entry = overlayEntry(rt, path);
      if (entry?.type === 'regular') return error(rt, 'enotdir');
      const children = overlayChildren(rt, path).map(child => decodeURIComponent(child.slice(child.lastIndexOf('/') + 1)));
      const result = entry ? {value: []} : await metadata(rt, path, 'list');
      if (result.reason) return error(rt, result.reason);
      if (!Array.isArray(result.value) || result.value.some(name => typeof name !== 'string')) return error(rt, 'eio');
      const names = [...new Set([...result.value, ...children])];
      return ok(rt, arrayToList(rt, names.map(name => binary(rt, new TextEncoder().encode(name)))));
    });
  });
  for (const [name, arity] of [['read_link_nif', 1], ['get_handle_nif', 1],
    ['file_desc_to_ref_nif', 1], ['altname_nif', 1]]) {
    prim(name, arity, rt => error(rt, 'enotsup'));
  }
  prim('ipread_s32bu_p32bu_nif', 3, (rt, [ref, offset, maxSize]) => {
    const header = read(rt, ref, offset, 8n, false);
    if (header === rt.atom('eof')) return header;
    const data = rt.bitstringBytes(rt.tupleElement(header, 2));
    if (data.length < 8) return rt.atom('eof');
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const size = view.getInt32(0), pointer = view.getUint32(4);
    if (size < 0 || size > integer(rt, maxSize)) return error(rt, 'einval');
    const result = read(rt, ref, BigInt(pointer), BigInt(size), false);
    return rt.tuple([rt.atom('ok'), BigInt(size), BigInt(pointer),
      result === rt.atom('eof') ? result : rt.tupleElement(result, 2)]);
  });
  for (const [name, arity] of [['sync_nif', 2], ['advise_nif', 4]]) prim(name, arity, (rt, [ref]) => {
    handle(rt, ref); return rt.atom('ok');
  });

  // prim_file's read-ahead implementation uses OTP's mutable prim_buffer.
  const buf = (name, arity, fn) => def('prim_buffer', name, arity, fn);
  buf('on_load', 0, rt => rt.atom('ok'));
  buf('new', 0, rt => {
    const ref = rt.makeRef();
    state(rt).buffers.set(ref, {bytes: new Uint8Array(), locked: false});
    return ref;
  });
  buf('size', 1, (rt, [ref]) => BigInt(buffer(rt, ref).bytes.length));
  buf('peek_head', 1, (rt, [ref]) => binary(rt, buffer(rt, ref).bytes));
  buf('copying_read', 2, (rt, [ref, size]) => take(rt, ref, size));
  buf('skip', 2, (rt, [ref, size]) => { take(rt, ref, size); return rt.atom('ok'); });
  buf('write', 2, (rt, [ref, data]) => {
    const value = buffer(rt, ref), bytes = rt.bitstringBytes(rt.callBif('iolist_to_binary', [data]));
    const combined = new Uint8Array(value.bytes.length + bytes.length);
    combined.set(value.bytes); combined.set(bytes, value.bytes.length);
    value.bytes = combined;
    return rt.atom('ok');
  });
  buf('find_byte_index', 2, (rt, [ref, needle]) => {
    const n = integer(rt, needle);
    if (n > 255) badarg(rt);
    const index = buffer(rt, ref).bytes.indexOf(n);
    return index < 0 ? rt.atom('not_found') : ok(rt, BigInt(index));
  });
  buf('try_lock', 1, (rt, [ref]) => {
    const value = buffer(rt, ref);
    if (value.locked) return rt.atom('busy');
    value.locked = true;
    return rt.atom('acquired');
  });
  buf('unlock', 1, (rt, [ref]) => { buffer(rt, ref).locked = false; return rt.atom('ok'); });

  for (const [name, arity] of [['read_file', 1], ['read_file_info', 1], ['read_file_info', 2],
    ['read_link_info', 1], ['read_link_info', 2], ['get_cwd', 0], ['get_cwd', 1], ['set_cwd', 1],
    ['list_dir', 1], ['list_dir_all', 1], ['write_file', 2], ['delete', 1], ['make_dir', 1], ['del_dir', 1],
    ['read_link', 1], ['read_link_all', 1], ['altname', 1], ['rename', 2], ['make_link', 2], ['make_symlink', 2],
    ['write_file_info', 2], ['write_file_info', 3]]) {
    def('file', name, arity, (rt, args) => {
      if (name === 'read_file_info' && is(args[0], TUPLE) && args[0][1].length === 3 &&
          args[0][1][0] === rt.atom('file_descriptor') && isAtom(args[0][1][1])) {
        return {type: 'tail', module: Symbol.keyFor(args[0][1][1]), name: 'read_handle_info', args, external: true};
      }
      return {type: 'tail', module: 'prim_file', name, args, external: true};
    });
  }
  def('file', 'delete', 2, (rt, [name]) => ({type: 'tail', module: 'prim_file', name: 'delete', args: [name], external: true}));
  def('file', 'open', 2, (rt, [name, modes], pid) => {
    const flags = listToArray(modes);
    if (!flags) return error(rt, 'badarg');
    return flags.includes(rt.atom('raw'))
      ? {type: 'tail', module: 'raw_file_io', name: 'open', args: [name, modes], external: true}
      : {type: 'tail', module: 'file_io_server', name: 'start', args: [pid, name, modes], external: true};
  });
  const loader = (name, arity, fn) => def('erl_prim_loader', name, arity, fn);
  loader('get_path', 0, rt => ok(rt, arrayToList(rt, state(rt).paths.map(path => charlist(rt, path)))));
  loader('set_path', 1, (rt, [paths]) => {
    const values = listToArray(paths) ?? badarg(rt);
    state(rt).paths = values.map(path => url(rt, path));
    return rt.atom('ok');
  });
  for (const name of ['get_file', 'read_file']) loader(name, 1, (rt, [file]) => {
    text(rt, file);
    return asyncIO(async () => {
      const {result, path} = await loaderRead(rt, file);
      if (name === 'read_file') return rt.tupleElement(result, 1) === rt.atom('ok') ? result : rt.atom('error');
      return rt.tupleElement(result, 1) === rt.atom('ok')
        ? rt.tuple([rt.atom('ok'), rt.tupleElement(result, 2), charlist(rt, path)]) : rt.atom('error');
    });
  });
  for (const [name, arity] of [['list_dir', 1], ['read_file_info', 1], ['read_link_info', 1], ['get_cwd', 0], ['get_cwd', 1]]) {
    loader(name, arity, (rt, args) => {
      if (['read_file_info', 'read_link_info'].includes(name)) args = [charlist(rt, modulePath(rt, args[0]))];
      return asyncIO(async () => {
        const result = await rt.invokeAsync('prim_file', name, args);
        return rt.tupleElement(result, 1) === rt.atom('ok') ? result : rt.atom('error');
      });
    });
  }
  loader('prim_init', 0, rt => rt.atom('http'));
  for (const [name, target, arity] of [['prim_read_file', 'read_file', 2], ['prim_list_dir', 'list_dir', 2],
    ['prim_read_file_info', 'read_file_info', 3], ['prim_get_cwd', 'get_cwd', 2]]) {
    loader(name, arity, (rt, [loaderState, file]) => {
      const args = target === 'get_cwd' ? listToArray(file) ?? badarg(rt) :
        [target === 'read_file_info' ? charlist(rt, modulePath(rt, file)) : file];
      return asyncIO(async () => rt.tuple([
        target === 'read_file' ? await readFile(rt, modulePath(rt, file)) :
          await rt.invokeAsync('prim_file', target, args), loaderState]));
    });
  }
  for (const arity of [2, 3]) loader('get_modules', arity, (rt, [names, fun, paths]) => {
    const list = listToArray(names) ?? badarg(rt);
    if (!list.every(isAtom) || !rt.isType('is_function', fun) || rt.funArity(fun) !== 3) badarg(rt);
    const roots = paths === undefined ? [rt.moduleBaseURL] :
      (listToArray(paths) ?? badarg(rt)).map(path => url(rt, path));
    return asyncIO(async () => {
      const success = [], failure = [];
      for (const name of list) {
        const {result, path} = await loaderRead(rt, charlist(rt, `${Symbol.keyFor(name)}.mjs`), roots);
        if (rt.tupleElement(result, 1) !== rt.atom('ok')) {
          failure.push(rt.tuple([name, rt.atom('nofile')]));
          continue;
        }
        let value;
        try {
          value = await rt.invokeAsync('erlang', 'apply', [
            fun, arrayToList(rt, [name, charlist(rt, path), rt.tupleElement(result, 2)])]);
        } catch (cause) {
          if (!cause.erlangClass) throw cause;
          value = rt.tuple([rt.atom('error'), rt.tuple([rt.atom('crash'), cause.reason])]);
        }
        const values = is(value, TUPLE) ? value[1] : [];
        if (values.length !== 2 || ![rt.atom('ok'), rt.atom('error')].includes(values[0])) {
          failure.push(rt.tuple([name, rt.atom('bad_return')]));
        } else {
          (values[0] === rt.atom('ok') ? success : failure).push(rt.tuple([name, values[1]]));
        }
      }
      return ok(rt, rt.tuple([arrayToList(rt, success), arrayToList(rt, failure)]));
    });
  });
  loader('purge_archive_cache', 0, rt => rt.atom('ok'));
  loader('is_basename', 1, (rt, [file]) => rt.atom(/[\\/]/.test(text(rt, file)) ? 'false' : 'true'));
  loader('set_primary_archive', 4, rt => error(rt, 'enotsup'));
  return modules;
}
