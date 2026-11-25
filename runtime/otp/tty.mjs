import {listToArray, arrayToList, binary, charlist} from './term.mjs';

const states = new WeakMap();
const badarg = rt => rt.raiseError(rt.atom('badarg'));
const ok = (rt, value) => value === undefined ? rt.atom('ok') : rt.tuple([rt.atom('ok'), value]);
const error = (rt, reason) => rt.tuple([rt.atom('error'), rt.atom(reason)]);
const bytes = (rt, data) => rt.bitstringBytes(rt.callBif('iolist_to_binary', [data]));
const terminals = rt => {
  if (!states.has(rt)) states.set(rt, new Map());
  return states.get(rt);
};
function tty(rt, ref) {
  const found = terminals(rt).get(ref);
  if (!found) badarg(rt);
  return found;
}
function notify(rt, ref, value) {
  if (value.reader && (value.input.length || value.eof) && !value.notified) {
    value.notified = true;
    if (rt.isProcessAlive(value.reader)) rt.sendMessage(rt.processHandle(value.reader),
      rt.tuple([rt.atom('select'), ref, value.readRef, rt.atom('ready_input')]));
  }
}
export function terminalWidth(point) {
  if (!point) return 0;
  if (point < 32 || point >= 0x7f && point < 0xa0) return -1;
  const char = String.fromCodePoint(point);
  if (/\p{Mark}|\p{Default_Ignorable_Code_Point}/u.test(char)) return 0;
  return point >= 0x1100 && (point <= 0x115f || point === 0x2329 || point === 0x232a ||
    point >= 0x2e80 && point <= 0xa4cf && point !== 0x303f ||
    point >= 0xac00 && point <= 0xd7a3 || point >= 0xf900 && point <= 0xfaff ||
    point >= 0xfe10 && point <= 0xfe19 || point >= 0xfe30 && point <= 0xfe6f ||
    point >= 0xff00 && point <= 0xff60 || point >= 0xffe0 && point <= 0xffe6 ||
    /\p{Extended_Pictographic}/u.test(char) || point >= 0x20000) ? 2 : 1;
}
function codepoint(rt, term) {
  if (typeof term !== 'bigint' || term < 0n || term > 0x10ffffn) badarg(rt);
  return Number(term);
}
const capabilities = {
  clear: '\x1b[H\x1b[2J', el: '\x1b[K', ed: '\x1b[J', cr: '\r', bel: '\x07',
  cub1: '\b', cuf1: '\x1b[C', cuu1: '\x1b[A', cud1: '\n',
  bold: '\x1b[1m', sgr0: '\x1b[0m', smul: '\x1b[4m', rmul: '\x1b[24m',
  rev: '\x1b[7m', sitm: '\x1b[3m', ritm: '\x1b[23m',
  setaf: '\x1b[3%p1%dm', setab: '\x1b[4%p1%dm',
  cup: '\x1b[%i%p1%d;%p2%dH', hpa: '\x1b[%i%p1%dG',
  cub: '\x1b[%p1%dD', cuf: '\x1b[%p1%dC', cuu: '\x1b[%p1%dA', cud: '\x1b[%p1%dB',
};
function cap(rt, data) {
  return new TextDecoder().decode(bytes(rt, data)).replace(/\0.*$/s, '');
}

export function ttyBifs() {
  const definitions = [];
  const def = (name, arity, fn) => definitions.push([name, arity, fn]);
  def('load', 0, rt => ok(rt));
  def('isatty', 1, (rt, [fd]) => {
    if (!['stdin', 'stdout', 'stderr'].some(name => fd === rt.atom(name))) tty(rt, fd);
    return rt.atom(rt.terminal ? 'true' : 'false');
  });
  def('tty_create', 1, (rt, [fd], pid) => {
    if (fd !== rt.atom('stdout') && fd !== rt.atom('stderr')) badarg(rt);
    const ref = rt.makeRef(), value = {input: new Uint8Array(), eof: false, notified: false};
    terminals(rt).set(ref, value);
    const endpoint = rt.terminal;
    if (endpoint) {
      value.unsubscribe = endpoint.onData(data => {
        const incoming = typeof data === 'string' ? new TextEncoder().encode(data) : data;
        if (!(incoming instanceof Uint8Array)) throw new TypeError('terminal input must be text or Uint8Array');
        const combined = new Uint8Array(value.input.length + incoming.length);
        combined.set(value.input); combined.set(incoming, value.input.length);
        value.input = combined;
        notify(rt, ref, value);
      });
      value.unsubscribeClose = endpoint.onClose?.(() => { value.eof = true; notify(rt, ref, value); });
      value.unsubscribeResize = endpoint.onResize?.(() => {
        if (value.readRef && rt.isProcessAlive(pid)) rt.sendMessage(rt.processHandle(pid),
          rt.tuple([value.readRef, rt.tuple([rt.atom('signal'), rt.atom('sigwinch')])]));
      });
    }
    return ok(rt, ref);
  });
  def('tty_init', 2, (rt, [ref]) => { tty(rt, ref); return ok(rt); });
  def('setlocale', 1, (rt, [ref]) => { tty(rt, ref); return rt.atom('true'); });
  def('tty_encoding', 1, (rt, [ref]) => { tty(rt, ref); return rt.atom('utf8'); });
  def('tty_is_open', 2, (rt, [ref]) => rt.atom(tty(rt, ref).eof ? 'false' : 'true'));
  def('tty_select', 2, (rt, [ref, readRef], pid) => {
    if (!rt.isType('is_reference', readRef)) badarg(rt);
    const value = tty(rt, ref);
    value.reader = pid; value.readRef = readRef; value.notified = false;
    notify(rt, ref, value);
    return ok(rt);
  });
  def('read_nif', 3, (rt, [ref, readRef, size]) => {
    if (typeof size !== 'bigint' || size <= 0n || size > 0x7fffffffn) badarg(rt);
    const value = tty(rt, ref);
    if (readRef !== value.readRef) badarg(rt);
    value.notified = false;
    if (!value.input.length && value.eof) return error(rt, 'closed');
    const result = value.input.slice(0, Number(size));
    value.input = value.input.slice(result.length);
    notify(rt, ref, value);
    return ok(rt, binary(rt, result));
  });
  def('write_nif', 2, (rt, [ref, data]) => {
    tty(rt, ref);
    const output = new TextDecoder().decode(bytes(rt, data));
    if (rt.terminal) rt.terminal.write(output);
    else rt.writeStdout(output);
    return ok(rt);
  });
  def('tty_window_size', 1, (rt, [ref]) => {
    tty(rt, ref);
    const {columns = 80, rows = 24} = rt.terminal?.size?.() ?? {};
    return ok(rt, rt.tuple([BigInt(columns), BigInt(rows)]));
  });
  def('isprint', 1, (rt, [point]) => {
    const n = codepoint(rt, point);
    return rt.atom(n >= 32 && n <= 126 ? 'true' : 'false');
  });
  def('wcwidth', 1, (rt, [point]) => {
    const result = terminalWidth(codepoint(rt, point));
    return result < 0 ? error(rt, 'not_printable') : BigInt(result);
  });
  def('sizeof_wchar', 0, () => 4n);
  def('wcswidth', 1, (rt, [data]) => {
    const input = bytes(rt, data);
    if (input.length % 4) badarg(rt);
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    let result = 0;
    for (let i = 0; i < input.length; i += 4) {
      const point = view.getUint32(i, true);
      if (point > 0x10ffff) badarg(rt);
      if (point === 0) break;
      const w = terminalWidth(point);
      if (w < 0) return error(rt, 'not_printable');
      result += w;
    }
    return ok(rt, BigInt(result));
  });
  def('setupterm_nif', 0, rt => ok(rt));
  def('tigetnum_nif', 1, (rt, [data]) => {
    const name = cap(rt, data), geometry = rt.terminal?.size?.() ?? {columns: 80, rows: 24};
    return BigInt(name === 'co' ? geometry.columns : name === 'li' ? geometry.rows : name === 'Co' ? 8 : -1);
  });
  def('tigetflag_nif', 1, (rt, [data]) => rt.atom(['am', 'xn'].includes(cap(rt, data)) ? 'true' : 'false'));
  def('tigetstr_nif', 1, (rt, [data]) => {
    const value = capabilities[cap(rt, data)];
    return value === undefined ? rt.atom('false') : ok(rt, binary(rt, new TextEncoder().encode(value)));
  });
  def('tinfo_nif', 0, rt => rt.map(['bool', 'num', 'str'].map(kind => [rt.atom(kind),
    arrayToList(rt, (kind === 'str' ? Object.keys(capabilities) : kind === 'num' ? ['co', 'li', 'Co'] : ['am', 'xn'])
      .map(name => rt.map(['name', 'code', 'fname'].map(key => [rt.atom(key), charlist(rt, name)]))))])));
  def('tputs_nif', 2, (rt, [data, args]) => {
    const params = listToArray(args) ?? badarg(rt);
    if (params.length > 9 || params.some(value => typeof value !== 'bigint')) badarg(rt);
    let value = cap(rt, data);
    const values = params.slice();
    if (value.includes('%i')) {
      values[0] = (values[0] ?? 0n) + 1n; values[1] = (values[1] ?? 0n) + 1n;
      value = value.replace('%i', '');
    }
    value = value.replace(/%p([1-9])%d/g, (_, n) => String(values[Number(n) - 1] ?? 0n));
    if (/%(?!%)/.test(value)) return error(rt, 'enotsup');
    return ok(rt, binary(rt, new TextEncoder().encode(value.replaceAll('%%', '%'))));
  });
  return new Map([['prim_tty', definitions]]);
}
