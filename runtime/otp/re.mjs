// The re module's NIFs: PCRE2 patterns translated to JavaScript regular
// expressions. A compiled pattern is {re_pattern, Groups, Unicode, CRLF, Ref},
// as in OTP 29, with the translation kept per runtime under Ref.
//
// The translator emits a token list rather than a string so that constructs
// JavaScript lacks can be rewritten afterwards: atomic groups and possessive
// quantifiers become (?=(X))\N, inline option changes are applied while
// translating (case folding by expansion when it is scoped), and anchors,
// dot and the PCRE escapes follow the configured newline convention.
// Recursion, conditionals, branch reset and backtracking verbs other than
// (*FAIL) are reported as compile errors.
import {
  BITSTRING, TUPLE, is, isAtom, listToArray, arrayToList, charlist, charlistText, binary,
  iolistBytes, chardataText,
} from './term.mjs';

const badarg = rt => rt.raiseError(rt.atom('badarg'));
const patterns = new WeakMap();

class CompileError extends Error {
  constructor(message, position) {
    super(message);
    this.position = position;
  }
}

const NEWLINES = {
  lf: '\\n', cr: '\\r', crlf: '\\r\\n', anycrlf: '(?:\\r\\n|\\r|\\n)',
  any: '(?:\\r\\n|[\\n\\x0B\\f\\r\\x85\\u2028\\u2029])', nul: '\\x00',
};
const DOT = {
  lf: '[^\\n]', cr: '[^\\r]', crlf: '(?:(?!\\r\\n)[\\s\\S])', anycrlf: '[^\\r\\n]',
  any: '[^\\n\\x0B\\f\\r\\x85\\u2028\\u2029]', nul: '[^\\x00]',
};

// Class bodies, usable inside [...].
const ASCII_CLASSES = {
  alnum: '0-9A-Za-z', alpha: 'A-Za-z', ascii: '\\x00-\\x7F', blank: ' \\t', cntrl: '\\x00-\\x1F\\x7F',
  digit: '0-9', graph: '\\x21-\\x7E', lower: 'a-z', print: '\\x20-\\x7E',
  punct: '!-\\/:-@\\[-`{-~', space: '\\t-\\r ', upper: 'A-Z', word: '0-9A-Za-z_', xdigit: '0-9A-Fa-f',
};
const UCP_CLASSES = {
  alnum: '\\p{L}\\p{N}', alpha: '\\p{L}', digit: '\\p{Nd}', lower: '\\p{Ll}', upper: '\\p{Lu}',
  space: '\\t-\\r\\p{Z}', word: '\\p{L}\\p{N}_\\p{Mn}\\p{Pc}', blank: '\\t\\p{Zs}',
};
const VSPACE = '\\n\\x0B\\f\\r\\x85\\u2028\\u2029';

const ESCAPE_RANGES = {
  d: [[48, 57]], w: [[48, 57], [65, 90], [95, 95], [97, 122]], s: [[9, 13], [32, 32]],
  h: [[9, 9], [32, 32], [0xa0, 0xa0], [0x1680, 0x1680], [0x180e, 0x180e], [0x2000, 0x200a],
    [0x202f, 0x202f], [0x205f, 0x205f], [0x3000, 0x3000]],
  v: [[10, 13], [0x85, 0x85], [0x2028, 0x2029]],
};
const UCP_ESCAPES = {d: ['\\p{Nd}', '\\P{Nd}'], w: [UCP_CLASSES.word, '\\W'], s: [UCP_CLASSES.space, '\\S']};

// Class bodies for \d \w \s \h \v and their negations.
function escapes(ucp) {
  const out = {};
  for (const [name, ranges] of Object.entries(ESCAPE_RANGES)) {
    out[name] = ucp && UCP_ESCAPES[name] ? UCP_ESCAPES[name] : [rangesBody(ranges), rangesBody(complement(ranges))];
  }
  return out;
}

function literal(cp) {
  const char = String.fromCodePoint(cp);
  return /[0-9A-Za-z]/.test(char) ? char : `\\u{${cp.toString(16)}}`;
}

function caseVariants(cp, unicode) {
  if (!unicode && cp > 127) return [cp];
  const char = String.fromCodePoint(cp);
  const out = new Set([cp]);
  for (const variant of [char.toLowerCase(), char.toUpperCase()]) {
    const points = [...variant];
    if (points.length === 1) out.add(points[0].codePointAt(0));
  }
  return [...out];
}

// Complement of a set of [lo, hi] ranges over all code points.
function complement(ranges) {
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
  const out = [];
  let next = 0;
  for (const [lo, hi] of sorted) {
    if (lo > next) out.push([next, lo - 1]);
    next = Math.max(next, hi + 1);
  }
  if (next <= 0x10ffff) out.push([next, 0x10ffff]);
  return out;
}

function rangesBody(ranges) {
  return ranges.map(([lo, hi]) => lo === hi ? literal(lo) : `${literal(lo)}-${literal(hi)}`).join('');
}

// Ranges of an ASCII class body such as '0-9A-Za-z'.
function asciiRanges(body) {
  const chars = [];
  const re = /\\x([0-9A-F]{2})|\\t|\\r|\\(.)|(.)/gy;
  for (let m; (m = re.exec(body));) {
    if (m[1]) chars.push(parseInt(m[1], 16));
    else if (m[0] === '\\t') chars.push(9);
    else if (m[0] === '\\r') chars.push(13);
    else chars.push((m[2] ?? m[3]).codePointAt(0));
  }
  const ranges = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i + 1] === 45 && i + 2 < chars.length) {
      ranges.push([chars[i], chars[i + 2]]);
      i += 2;
    } else ranges.push([chars[i], chars[i]]);
  }
  return ranges;
}

function translate(source, options) {
  const {unicode, ucp, newline, dollarEndonly, noAutoCapture, ungreedy, dupnames} = options;
  const points = [...source].map(char => char.codePointAt(0));
  const length = points.length;
  const at = i => i < length ? String.fromCodePoint(points[i]) : '';
  const nl = NEWLINES[newline];
  const esc = escapes(ucp);
  const tokens = [];
  const names = new Map();
  let groups = 0;
  let hidden = 0;
  let flags = {...options.flags};
  // JavaScript's i flag folds like PCRE only for Unicode patterns without
  // scoped changes; otherwise letters are expanded to their case variants.
  const inlineCase = /\(\?[a-zA-Z]*-[a-zA-Z]*i|\(\?\^|\(\?[a-zA-Z]*i/.test(source.slice(1)) ||
    /^\(\?[a-zA-Z]*-/.test(source);
  const useIFlag = unicode && !inlineCase && (flags.i || /^\(\?[a-zA-Z]*i[a-zA-Z]*\)/.test(source));
  if (useIFlag) flags.i = true;
  const expandCase = () => flags.i && !useIFlag;
  const stack = [];
  let atomStart = -1;
  let pos = 0;
  let totalGroups = 0;
  for (let i = 0; i < length; i++) {
    if (at(i) === '\\') i++;
    else if (at(i) === '(' && at(i + 1) !== '?' && at(i + 1) !== '*') totalGroups++;
    else if (at(i) === '(' && at(i + 1) === '?' && /[<'P]/.test(at(i + 2)) && !/[=!]/.test(at(i + 3))) totalGroups++;
  }

  const fail = (message, position = pos) => {
    throw new CompileError(message, position);
  };
  const emitAtom = (...items) => {
    atomStart = tokens.length;
    tokens.push(...items);
  };
  const lit = cp => {
    if (expandCase()) {
      const variants = caseVariants(cp, unicode);
      if (variants.length > 1) return `[${variants.map(literal).join('')}]`;
    }
    return literal(cp);
  };
  const skipExtended = () => {
    while (flags.x && pos < length) {
      if (/[ \t\n\x0B\f\r]/.test(at(pos))) pos++;
      else if (at(pos) === '#') {
        while (pos < length && at(pos) !== '\n') pos++;
      } else break;
    }
  };
  const readName = (close) => {
    let name = '';
    while (pos < length && /[A-Za-z0-9_]/.test(at(pos))) name += at(pos++);
    if (at(pos) !== close || !name) fail('syntax error in subpattern name (missing terminator?)');
    pos++;
    return name;
  };
  const backrefTo = numbers => {
    if (!numbers.length) fail('reference to non-existent subpattern');
    return numbers.map(number => ({ref: `p${number}`}));
  };
  const nameRef = name => backrefTo(names.get(name) ?? fail('reference to non-existent subpattern'));
  const property = (negated) => {
    let name;
    if (at(pos) === '{') {
      const end = points.indexOf(0x7d, pos);
      if (end < 0) fail('malformed \\P or \\p sequence');
      name = String.fromCodePoint(...points.slice(pos + 1, end));
      pos = end + 1;
    } else name = at(pos++);
    if (name.startsWith('^')) {
      negated = !negated;
      name = name.slice(1);
    }
    const special = {Any: '[\\s\\S]', L: '\\p{L}', Xan: '[\\p{L}\\p{N}]', Xsp: '[\\t-\\r\\p{Z}]',
      Xps: '[\\t-\\r\\p{Z}]', Xwd: '[\\p{L}\\p{N}_]', 'L&': '[\\p{Lu}\\p{Ll}\\p{Lt}]', Lc: '[\\p{Lu}\\p{Ll}\\p{Lt}]'};
    let body;
    if (special[name]) body = special[name];
    else {
      for (const candidate of [`\\p{${name}}`, `\\p{Script=${name}}`]) {
        try {
          new RegExp(candidate, 'u');
          body = candidate;
          break;
        } catch {}
      }
      if (!body) fail('unknown property name after \\P or \\p');
    }
    if (!negated) return body;
    if (body.startsWith('\\p')) return `\\P${body.slice(2)}`;
    return `[^${body.slice(1, -1)}]`;
  };
  const hexEscape = () => {
    if (at(pos) === '{') {
      const end = points.indexOf(0x7d, pos);
      const text = String.fromCodePoint(...points.slice(pos + 1, end));
      if (end < 0 || !/^[0-9A-Fa-f]+$/.test(text)) fail('non-hex character in \\x{} (closing brace missing?)');
      pos = end + 1;
      return parseInt(text, 16);
    }
    let text = '';
    while (text.length < 2 && /[0-9A-Fa-f]/.test(at(pos))) text += at(pos++);
    return text ? parseInt(text, 16) : 0;
  };
  const codeCheck = cp => {
    if (cp > (unicode ? 0x10ffff : 0xff)) fail('character code point value in \\x{} or \\o{} is too large');
    return cp;
  };
  // A literal escape such as \n or \x41 (shared by classes); null if not one.
  const simpleEscape = (c) => {
    switch (c) {
      case 'a': return 7;
      case 'e': return 27;
      case 'f': return 12;
      case 'n': return 10;
      case 'r': return 13;
      case 't': return 9;
      case 'x': return codeCheck(hexEscape());
      case 'o': {
        const end = points.indexOf(0x7d, pos);
        const text = String.fromCodePoint(...points.slice(pos + 1, end));
        if (at(pos) !== '{' || end < 0 || !/^[0-7]+$/.test(text)) fail('missing opening brace after \\o');
        pos = end + 1;
        return codeCheck(parseInt(text, 8));
      }
      case 'c': {
        const next = at(pos++);
        if (!next || next.codePointAt(0) > 127) fail('\\c must be followed by a printable ASCII character');
        return next.toUpperCase().codePointAt(0) ^ 0x40;
      }
      case '0': {
        let text = '';
        while (text.length < 2 && /[0-7]/.test(at(pos))) text += at(pos++);
        return parseInt(text || '0', 8);
      }
      default: return null;
    }
  };

  const parseClass = () => {
    const start = pos - 1;
    let negate = false;
    if (at(pos) === '^') {
      negate = true;
      pos++;
    }
    const parts = [];
    const ranges = [];
    let first = true;
    const single = () => {
      // One class member: a code point, or a class body string.
      const c = at(pos);
      if (c === '[' && /^\[:\^?[a-z]+:\]/.test(String.fromCodePoint(...points.slice(pos, pos + 12)))) {
        const end = points.indexOf(0x5d, pos + 1);
        let name = String.fromCodePoint(...points.slice(pos + 2, end - 1));
        pos = end + 1;
        const negated = name.startsWith('^');
        if (negated) name = name.slice(1);
        if (!ASCII_CLASSES[name]) fail('unknown POSIX class name');
        const body = ucp && UCP_CLASSES[name] ? UCP_CLASSES[name] : ASCII_CLASSES[name];
        if (!negated) return {body};
        if (body.includes('\\p')) return {body: `\\P${body.slice(2)}`};
        return {body: rangesBody(complement(asciiRanges(body)))};
      }
      pos++;
      if (c !== '\\') return c.codePointAt(0);
      const e = at(pos++);
      if (e === '') fail('\\ at end of pattern');
      const simple = simpleEscape(e);
      if (simple !== null) return simple;
      if (e === 'b') return 8;
      const lower = e.toLowerCase();
      if (esc[lower]) return {body: esc[lower][e === lower ? 0 : 1]};
      if (e === 'p' || e === 'P') return {body: property(e === 'P').replace(/^\[(.*)\]$/, '$1')};
      if (e === 'N') fail('escape sequence is invalid in character class');
      if (/[A-Za-z0-9]/.test(e)) fail('unrecognized character follows \\');
      return e.codePointAt(0);
    };
    for (;;) {
      if (pos >= length) fail('missing terminating ] for character class', length);
      if (at(pos) === ']' && !first) {
        pos++;
        break;
      }
      first = false;
      if (at(pos) === '\\' && at(pos + 1) === 'Q') {
        pos += 2;
        while (pos < length && !(at(pos) === '\\' && at(pos + 1) === 'E')) ranges.push([points[pos], points[pos++]]);
        pos += 2;
        continue;
      }
      if (at(pos) === '\\' && at(pos + 1) === 'E') {
        pos += 2;
        continue;
      }
      const lo = single();
      if (typeof lo === 'number' && at(pos) === '-' && at(pos + 1) !== ']' && pos + 1 < length) {
        const save = pos;
        pos++;
        const hi = single();
        if (typeof hi === 'number') {
          if (hi < lo) fail('range out of order in character class', pos - 1);
          ranges.push([lo, hi]);
          continue;
        }
        pos = save;
      }
      if (typeof lo === 'number') ranges.push([lo, lo]);
      else parts.push(lo.body);
    }
    if (expandCase()) {
      for (const [lo, hi] of ranges.slice()) {
        if (hi - lo > 2000) continue;
        for (let cp = lo; cp <= hi; cp++) {
          for (const variant of caseVariants(cp, unicode)) if (variant < lo || variant > hi) ranges.push([variant, variant]);
        }
      }
    }
    const body = rangesBody(ranges) + parts.join('');
    if (!body) return negate ? '[\\s\\S]' : '[]';
    if (start >= 0) return `[${negate ? '^' : ''}${body}]`;
  };

  const quantifier = () => {
    const c = at(pos);
    let min;
    let max;
    if (c === '*') [min, max] = [0, Infinity];
    else if (c === '+') [min, max] = [1, Infinity];
    else if (c === '?') [min, max] = [0, 1];
    else if (c === '{') {
      const m = BRACES.exec(String.fromCodePoint(...points.slice(pos, pos + 40)));
      min = m[1] === '' ? 0 : Number(m[1]);
      max = m[2] === undefined ? min : m[3] === '' ? Infinity : Number(m[3]);
      if (max < min) fail('numbers out of order in {} quantifier', pos + m[0].length - 1);
      if (max > 65535 && max !== Infinity) fail('number too big in {} quantifier', pos + m[0].length - 1);
      pos += m[0].length - 1;
    } else return null;
    pos++;
    let lazy = false;
    let possessive = false;
    if (at(pos) === '?') {
      lazy = true;
      pos++;
    } else if (at(pos) === '+') {
      possessive = true;
      pos++;
    }
    if (flags.U && !possessive) lazy = !lazy;
    const text = max === Infinity
      ? (min === 0 ? '*' : min === 1 ? '+' : `{${min},}`)
      : min === 0 && max === 1 ? '?' : min === max ? `{${min}}` : `{${min},${max}}`;
    return {text: text + (lazy ? '?' : ''), possessive};
  };

  const atomic = (startIndex) => {
    // (?=(X))\N matches X once, without backtracking into it.
    const key = `h${hidden++}`;
    tokens.splice(startIndex, 0, '(?=', {cap: key});
    tokens.push('))', {ref: key});
    atomStart = startIndex;
  };

  const parseGroupStart = () => {
    // pos is just past '('.
    const groupPos = pos - 1;
    const open = kind => {
      stack.push({kind, start: tokens.length, flags: {...flags}, pos: groupPos});
      atomStart = -1;
    };
    if (at(pos) === '*') {
      const end = points.indexOf(0x29, pos);
      const verb = String.fromCodePoint(...points.slice(pos + 1, end < 0 ? length : end));
      const lookaround = {pla: '(?=', positive_lookahead: '(?=', nla: '(?!', negative_lookahead: '(?!',
        plb: '(?<=', positive_lookbehind: '(?<=', nlb: '(?<!', negative_lookbehind: '(?<!', atomic: '(?:'};
      const colon = verb.indexOf(':');
      if (colon > 0 && lookaround[verb.slice(0, colon)]) {
        pos += colon + 2;
        const name = verb.slice(0, colon);
        open(name === 'atomic' ? 'atomic' : 'lookaround');
        tokens.push(lookaround[name]);
        return;
      }
      if (end < 0) fail('missing closing parenthesis', length);
      pos = end + 1;
      if (['FAIL', 'F', 'FALSE'].includes(verb)) return emitAtom('(?!)');
      fail(`(*${verb}) is not supported by Beam2JS`, groupPos);
    }
    if (at(pos) !== '?') {
      if (noAutoCapture) {
        open('group');
        tokens.push('(?:');
      } else {
        groups++;
        open('capture');
        tokens.push({cap: `p${groups}`});
      }
      return;
    }
    pos++;
    const c = at(pos);
    const named = (close) => {
      const name = readName(close);
      groups++;
      if (names.has(name) && !dupnames) fail('two named subpatterns have the same name (PCRE2_DUPNAMES not set)');
      names.set(name, [...(names.get(name) ?? []), groups]);
      open('capture');
      tokens.push({cap: `p${groups}`});
    };
    if (c === ':') {
      pos++;
      open('group');
      tokens.push('(?:');
    } else if (c === '=' || c === '!') {
      pos++;
      open('lookaround');
      tokens.push(`(?${c}`);
    } else if (c === '<' && (at(pos + 1) === '=' || at(pos + 1) === '!')) {
      tokens.push(`(?<${at(pos + 1)}`);
      pos += 2;
      stack.push({kind: 'lookaround', start: tokens.length - 1, flags: {...flags}, pos: groupPos});
      atomStart = -1;
    } else if (c === '>') {
      pos++;
      open('atomic');
      tokens.push('(?:');
    } else if (c === '#') {
      while (pos < length && at(pos) !== ')') pos++;
      if (pos >= length) fail('missing ) after (?# comment', length);
      pos++;
    } else if (c === '<') {
      pos++;
      named('>');
    } else if (c === "'") {
      pos++;
      named("'");
    } else if (c === 'P' && at(pos + 1) === '<') {
      pos += 2;
      named('>');
    } else if (c === 'P' && at(pos + 1) === '=') {
      pos += 2;
      emitAtom(...nameRef(readName(')')));
    } else if (/[a-zA-Z^-]/.test(c) && c !== 'P' && c !== 'R') {
      let on = true;
      const next = {...flags};
      while (/[a-zA-Z^-]/.test(at(pos))) {
        const f = at(pos++);
        if (f === '-') on = false;
        else if (f === '^') Object.assign(next, {i: false, m: false, s: false, x: false, n: false, U: false});
        else if ('imsxnUJ'.includes(f)) next[f] = on;
        else fail('unrecognized character after (? or (?-', pos - 1);
      }
      if (at(pos) === ')') {
        pos++;
        flags = next;
      } else if (at(pos) === ':') {
        pos++;
        open('group');
        flags = next;
        tokens.push('(?:');
      } else fail('unrecognized character after (? or (?-');
    } else if (c === '|') {
      fail('(?| branch reset is not supported by Beam2JS', groupPos);
    } else if (c === '(') {
      fail('conditional subpatterns are not supported by Beam2JS', groupPos);
    } else {
      fail('recursion and subroutine calls are not supported by Beam2JS', groupPos);
    }
  };

  if (options.anchoredStart) tokens.push('(?<![\\s\\S])');
  while (pos < length) {
    skipExtended();
    if (pos >= length) break;
    if (/[*+?]/.test(at(pos)) || (at(pos) === '{' && quantifierFollows(points, pos))) {
      if (atomStart < 0) fail('quantifier does not follow a repeatable item', pos + 1);
      const q = quantifier();
      const start = atomStart;
      tokens.splice(start, 0, '(?:');
      tokens.push(')', q.text);
      if (q.possessive) atomic(start);
      atomStart = -1;
      continue;
    }
    const c = at(pos++);
    switch (c) {
      case '\\': {
        const e = at(pos++);
        if (e === '') fail('\\ at end of pattern');
        const simple = simpleEscape(e);
        if (simple !== null) {
          emitAtom(lit(simple));
          break;
        }
        const lower = e.toLowerCase();
        if (esc[lower]) {
          emitAtom(e === lower ? `[${esc[lower][0]}]` : `[^${esc[lower][0]}]`);
          break;
        }
        if (/[1-9]/.test(e)) {
          let digits = e;
          while (/[0-9]/.test(at(pos))) digits += at(pos++);
          const number = Number(digits);
          if (number < 10 || number <= totalGroups) {
            if (number > totalGroups) fail('reference to non-existent subpattern');
            emitAtom({ref: `p${number}`});
          } else {
            pos -= digits.length - 1;
            let octal = '';
            pos--;
            while (octal.length < 3 && /[0-7]/.test(at(pos))) octal += at(pos++);
            if (!octal) fail('reference to non-existent subpattern');
            emitAtom(lit(parseInt(octal, 8)));
          }
          break;
        }
        switch (e) {
          case 'b':
          case 'B':
            if (ucp) {
              const w = `[${esc.w[0]}]`;
              const boundary = `(?:(?<=${w})(?!${w})|(?<!${w})(?=${w}))`;
              tokens.push(e === 'b' ? boundary : `(?!${boundary})`);
            } else tokens.push(`\\${e}`);
            atomStart = -1;
            break;
          case 'A': tokens.push('(?<![\\s\\S])'); atomStart = -1; break;
          case 'z': tokens.push('(?![\\s\\S])'); atomStart = -1; break;
          case 'Z': tokens.push(`(?=(?:${nl})?(?![\\s\\S]))`); atomStart = -1; break;
          case 'G':
            if (tokens.length) fail('\\G is only supported at the start of a pattern by Beam2JS');
            tokens.push({start: true});
            atomStart = -1;
            break;
          case 'R': emitAtom(`(?:\\r\\n|[${VSPACE}])`); break;
          case 'N': emitAtom(DOT[newline]); break;
          case 'X': emitAtom('(?:\\P{M}\\p{M}*)'); break;
          case 'C': emitAtom('[\\s\\S]'); break;
          case 'p':
          case 'P': emitAtom(property(e === 'P')); break;
          case 'Q':
            while (pos < length && !(at(pos) === '\\' && at(pos + 1) === 'E')) emitAtom(lit(points[pos++]));
            if (pos < length) pos += 2;
            break;
          case 'E': break;
          case 'g': {
            let text;
            if (at(pos) === '{') {
              const end = points.indexOf(0x7d, pos);
              if (end < 0) fail('\\g is not followed by a braced, angle-bracketed, or quoted name/number or by a plain number');
              text = String.fromCodePoint(...points.slice(pos + 1, end));
              pos = end + 1;
            } else if (at(pos) === '<' || at(pos) === "'") {
              fail('recursion and subroutine calls are not supported by Beam2JS');
            } else {
              text = '';
              if (at(pos) === '-' || at(pos) === '+') text += at(pos++);
              while (/[0-9]/.test(at(pos))) text += at(pos++);
            }
            if (/^-\d+$/.test(text)) emitAtom(...backrefTo([groups + 1 + Number(text)].filter(n => n > 0)));
            else if (/^\d+$/.test(text)) {
              if (Number(text) > totalGroups) fail('reference to non-existent subpattern');
              emitAtom({ref: `p${Number(text)}`});
            } else emitAtom(...nameRef(text));
            break;
          }
          case 'k': {
            const close = {'<': '>', "'": "'", '{': '}'}[at(pos)];
            if (!close) fail('\\k is not followed by a braced, angle-bracketed, or quoted name');
            pos++;
            emitAtom(...nameRef(readName(close)));
            break;
          }
          case 'K': fail('\\K is not supported by Beam2JS', pos - 2);
          default:
            if (/[A-Za-z]/.test(e)) fail('unrecognized character follows \\');
            emitAtom(lit(e.codePointAt(0)));
        }
        break;
      }
      case '[': emitAtom(parseClass()); break;
      case '(': parseGroupStart(); break;
      case ')': {
        const group = stack.pop();
        if (!group) fail('unmatched closing parenthesis', pos);
        flags = group.flags;
        tokens.push(')');
        if (group.kind === 'atomic') atomic(group.start);
        else atomStart = group.start;
        break;
      }
      case '|':
        tokens.push('|');
        atomStart = -1;
        break;
      case '.': emitAtom(flags.s ? '[\\s\\S]' : DOT[newline]); break;
      case '^':
        tokens.push({caret: flags.m});
        atomStart = -1;
        break;
      case '$':
        tokens.push({dollar: flags.m});
        atomStart = -1;
        break;
      default:
        if (flags.x && /[ \t\n\x0B\f\r]/.test(c)) break;
        emitAtom(lit(c.codePointAt(0)));
    }
  }
  if (stack.length) fail('missing closing parenthesis', length);

  return {tokens, groups, names, useIFlag};
}

const BRACES = /^\{\s*(\d*)\s*(?:(,)\s*(\d*)\s*)?\}/;

// Whether a { at pos starts a quantifier rather than a literal brace.
function quantifierFollows(points, pos) {
  const m = BRACES.exec(String.fromCodePoint(...points.slice(pos, pos + 40)));
  return Boolean(m) && !(m[1] === '' && (m[2] === undefined || m[3] === ''));
}

// Renders the tokens for one combination of run-time options.
function render(compiled, {notbol, noteol, offsetStart}) {
  const {tokens, newline, dollarEndonly} = compiled;
  const nl = NEWLINES[newline];
  const numbers = new Map();
  let next = 1;
  for (const token of tokens) if (token?.cap) numbers.set(token.cap, next++);
  let out = '';
  for (const token of tokens) {
    if (typeof token === 'string') out += token;
    else if (token.cap) out += '(';
    else if (token.ref) out += `(?:\\${numbers.get(token.ref)})`;
    else if (token.start) out += offsetStart;
    else if ('caret' in token) {
      if (token.caret) out += notbol ? `(?<=${nl})(?=[\\s\\S])` : `(?:(?<![\\s\\S])|(?<=${nl})(?=[\\s\\S]))`;
      else out += notbol ? '(?!)' : '(?<![\\s\\S])';
    } else if ('dollar' in token) {
      if (token.dollar) out += noteol ? `(?=${nl})` : `(?=${nl}|(?![\\s\\S]))`;
      else if (noteol) out += '(?!)';
      else out += dollarEndonly ? '(?![\\s\\S])' : `(?=(?:${nl})?(?![\\s\\S]))`;
    }
  }
  return {source: out, numbers};
}

function regexFor(compiled, key, build) {
  let regex = compiled.cache.get(key);
  if (!regex) {
    regex = build();
    if (compiled.cache.size > 64) compiled.cache.clear();
    compiled.cache.set(key, regex);
  }
  return regex;
}

const COMPILE_ATOMS = new Set(['unicode', 'anchored', 'caseless', 'dollar_endonly', 'dotall', 'extended',
  'firstline', 'multiline', 'no_auto_capture', 'dupnames', 'ungreedy', 'bsr_anycrlf', 'bsr_unicode',
  'no_start_optimize', 'ucp', 'never_utf']);
const RUN_ATOMS = new Set(['anchored', 'global', 'notbol', 'noteol', 'notempty', 'notempty_atstart', 'report_errors']);

// Splits options into compile options (an object) and run options; null if invalid.
function parseOptions(rt, list, {allowRun, allowCompile}) {
  const items = listToArray(list);
  if (items === null) return null;
  const compile = {flags: {}, newline: 'lf', unicode: false};
  const run = {capture: null, offset: 0, global: false};
  let hasCompile = false;
  for (const item of items) {
    if (isAtom(item)) {
      const name = Symbol.keyFor(item);
      if (allowRun && RUN_ATOMS.has(name)) {
        run[name] = true;
        if (name === 'anchored') compile.anchoredRun = true;
        continue;
      }
      if (!allowCompile || !COMPILE_ATOMS.has(name)) {
        if (name === 'export' && allowCompile && !allowRun) {
          compile.export = true;
          continue;
        }
        return null;
      }
      hasCompile = true;
      switch (name) {
        case 'unicode': compile.unicode = true; break;
        case 'anchored': compile.anchored = true; break;
        case 'caseless': compile.flags.i = true; break;
        case 'dollar_endonly': compile.dollarEndonly = true; break;
        case 'dotall': compile.flags.s = true; break;
        case 'extended': compile.flags.x = true; break;
        case 'multiline': compile.flags.m = true; break;
        case 'no_auto_capture': compile.noAutoCapture = true; break;
        case 'dupnames': compile.dupnames = true; break;
        case 'ungreedy': compile.flags.U = true; break;
        case 'ucp': compile.ucp = true; break;
        default: break;
      }
      continue;
    }
    const tuple = is(item, TUPLE) ? item[1] : null;
    if (!tuple || !isAtom(tuple[0])) return null;
    const key = Symbol.keyFor(tuple[0]);
    if (key === 'newline' && tuple.length === 2 && allowCompile && isAtom(tuple[1]) &&
        NEWLINES[Symbol.keyFor(tuple[1])]) {
      compile.newline = Symbol.keyFor(tuple[1]);
      hasCompile = true;
    } else if (allowRun && key === 'offset' && tuple.length === 2 && typeof tuple[1] === 'bigint' && tuple[1] >= 0n) {
      run.offset = Number(tuple[1]);
    } else if (allowRun && (key === 'match_limit' || key === 'match_limit_recursion') && tuple.length === 2 &&
        typeof tuple[1] === 'bigint' && tuple[1] >= 0n) {
      // Not enforced.
    } else if (allowRun && key === 'capture' && (tuple.length === 2 || tuple.length === 3)) {
      const type = tuple.length === 3 ? tuple[2] : rt.atom('index');
      if (!isAtom(type) || !['index', 'list', 'binary'].includes(Symbol.keyFor(type))) return null;
      const spec = tuple[1];
      if (isAtom(spec)) {
        if (!['all', 'all_but_first', 'all_names', 'first', 'none'].includes(Symbol.keyFor(spec))) return null;
      } else {
        const ids = listToArray(spec);
        if (ids === null || ids.some(id => typeof id !== 'bigint' && !isAtom(id) && charlistText(id) === null &&
          !(is(id, BITSTRING) && id[1][1] % 8 === 0))) return null;
      }
      run.capture = {spec, type: Symbol.keyFor(type)};
    } else return null;
  }
  return {compile, run, hasCompile};
}

function patternText(rt, term, unicode) {
  if (unicode) {
    if (is(term, BITSTRING)) {
      if (term[1][1] % 8 !== 0) return null;
      try {
        return new TextDecoder('utf-8', {fatal: true}).decode(term[1][0]);
      } catch {
        return null;
      }
    }
    return chardataText(term);
  }
  const bytes = iolistBytes(term);
  return bytes === null ? null : String.fromCharCode(...bytes);
}

function compilePattern(rt, text, options) {
  const translated = translate(text, {
    ...options, flags: {...options.flags}, anchoredStart: false,
  });
  const compiled = {
    ...translated, newline: options.newline, dollarEndonly: options.dollarEndonly,
    unicode: options.unicode, anchored: Boolean(options.anchored), cache: new Map(),
  };
  // Surface JavaScript syntax errors at compile time.
  try {
    new RegExp(render(compiled, {}).source, 'u');
  } catch (error) {
    throw new CompileError(`unsupported pattern (${error.message})`, 0);
  }
  return compiled;
}

function compileTerm(rt, compiled) {
  const ref = rt.makeRef();
  patterns.set(ref, compiled);
  const crlf = ['crlf', 'anycrlf', 'any'].includes(compiled.newline) ? 1n : 0n;
  return rt.tuple([rt.atom('re_pattern'), BigInt(compiled.groups), compiled.unicode ? 1n : 0n, crlf, ref]);
}

function compileError(rt, error) {
  return rt.tuple([charlist(rt, error.message), BigInt(error.position)]);
}

function compiledOf(term) {
  if (!is(term, TUPLE) || term[1].length !== 5 || term[1][0] !== Symbol.for('re_pattern')) return null;
  return patterns.get(term[1][4]) ?? null;
}

function compileNif(rt, pattern, optionList) {
  const parsed = parseOptions(rt, optionList, {allowRun: false, allowCompile: true});
  if (!parsed) badarg(rt);
  const text = patternText(rt, pattern, parsed.compile.unicode);
  if (text === null) badarg(rt);
  try {
    const compiled = compilePattern(rt, text, parsed.compile);
    if (parsed.compile.export) {
      return rt.tuple([rt.atom('ok'), rt.tuple([rt.atom('re_exported_pattern'), binary(rt, new TextEncoder().encode('beam2js')),
        binary(rt, new TextEncoder().encode(text)), optionList, binary(rt, [])])]);
    }
    return rt.tuple([rt.atom('ok'), compileTerm(rt, compiled)]);
  } catch (error) {
    if (!(error instanceof CompileError)) throw error;
    return rt.tuple([rt.atom('error'), compileError(rt, error)]);
  }
}

// Subject as a JavaScript string plus the byte offset of every UTF-16 index.
function subjectOf(rt, term, unicode) {
  let bytes;
  if (is(term, BITSTRING)) {
    if (term[1][1] % 8 !== 0) return null;
    bytes = term[1][0];
  } else if (unicode) {
    const text = chardataText(term);
    if (text === null) return null;
    bytes = new TextEncoder().encode(text);
  } else {
    const flat = iolistBytes(term);
    if (flat === null) return null;
    bytes = Uint8Array.from(flat);
  }
  if (!unicode) {
    let text = '';
    for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return {bytes, text, byteAt: null, indexAt: null};
  }
  let text;
  try {
    text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  } catch {
    return null;
  }
  const byteAt = new Int32Array(text.length + 1);
  const indexAt = new Int32Array(bytes.length + 1).fill(-1);
  let offset = 0;
  for (let i = 0; i < text.length;) {
    const cp = text.codePointAt(i);
    const units = cp > 0xffff ? 2 : 1;
    const size = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    byteAt[i] = offset;
    if (units === 2) byteAt[i + 1] = offset;
    indexAt[offset] = i;
    i += units;
    offset += size;
  }
  byteAt[text.length] = offset;
  indexAt[offset] = text.length;
  return {bytes, text, byteAt, indexAt};
}

const toByte = (subject, index) => subject.byteAt ? subject.byteAt[index] : index;
const toIndex = (subject, offset) => subject.indexAt ? subject.indexAt[offset] : offset;
const codePoints = (subject, index) => subject.byteAt ? [...subject.text.slice(0, index)].length : index;

// One match attempt at or after `from` (sticky when anchored); returns the
// indices array (UTF-16 based) or null.
function exec(compiled, subject, from, run, {anchored, notemptyAtstart}) {
  const {notbol, noteol} = run;
  let rendered;
  const sticky = anchored || compiled.anchored;
  const key = `${notbol ? 1 : 0}${noteol ? 1 : 0}${sticky ? 1 : 0}${notemptyAtstart ? `n${codePoints(subject, from)}` : ''}` +
    `|${compiled.hasStart ? from : ''}`;
  const regex = regexFor(compiled, key, () => {
    const offsetStart = `(?<=(?<![\\s\\S])[\\s\\S]{${codePoints(subject, from)}})(?<!(?<![\\s\\S])[\\s\\S]{${codePoints(subject, from) + 1}})`;
    rendered = render(compiled, {notbol, noteol, offsetStart});
    let source = rendered.source;
    // Ending past `from` makes the match nonempty.
    if (notemptyAtstart) source = `(?:${source})(?<=(?<![\\s\\S])[\\s\\S]{${codePoints(subject, from) + 1},})`;
    const flags = `du${sticky ? 'y' : 'g'}${compiled.useIFlag ? 'i' : ''}`;
    const result = new RegExp(source, flags);
    result.numbers = rendered.numbers;
    return result;
  });
  regex.lastIndex = from;
  const match = regex.exec(subject.text);
  if (!match) return null;
  const groups = [match.indices[0]];
  for (let n = 1; n <= compiled.groups; n++) {
    groups.push(match.indices[regex.numbers.get(`p${n}`)] ?? null);
  }
  return groups;
}

// All matches (or the first) as arrays of [start, end] UTF-16 index pairs.
function matches(compiled, subject, run) {
  const results = [];
  let from = toIndex(subject, run.offset);
  if (from < 0) return null;
  const first = (position, attempt) => {
    if (!run.notempty) return exec(compiled, subject, position, run, attempt);
    // Leftmost nonempty match: retry at every empty match position.
    for (let at = position; at <= subject.text.length;) {
      const found = exec(compiled, subject, at, run, attempt);
      if (!found) return null;
      if (found[0][1] > found[0][0]) return found;
      const start = found[0][0];
      const nonempty = exec(compiled, subject, start, run, {anchored: true, notemptyAtstart: true});
      if (nonempty) return nonempty;
      if (attempt.anchored || compiled.anchored) return null;
      at = start + advance(subject, start, compiled);
    }
    return null;
  };
  let attempt = {anchored: run.anchored, notemptyAtstart: run.notempty_atstart};
  for (;;) {
    const found = first(from, attempt);
    if (!found) {
      if (!run.global || !attempt.retry) break;
      // The empty match could not be extended: move one character on.
      from = attempt.retry;
      if (from > subject.text.length) break;
      attempt = {anchored: run.anchored, notemptyAtstart: false};
      continue;
    }
    results.push(found);
    if (!run.global) break;
    const [start, end] = found[0];
    from = end;
    attempt = start === end
      ? {anchored: true, notemptyAtstart: true, retry: end + advance(subject, end, compiled)}
      : {anchored: run.anchored, notemptyAtstart: false};
    if (start === end && end >= subject.text.length) break;
  }
  return results;
}

function advance(subject, index, compiled) {
  if (index >= subject.text.length) return 1;
  const crlf = ['crlf', 'anycrlf', 'any'].includes(compiled.newline);
  if (crlf && subject.text[index] === '\r' && subject.text[index + 1] === '\n') return 2;
  return subject.text.codePointAt(index) > 0xffff ? 2 : 1;
}

function captureValue(rt, subject, compiled, pair, type) {
  if (type === 'index') {
    if (!pair) return rt.tuple([-1n, 0n]);
    const start = toByte(subject, pair[0]);
    return rt.tuple([BigInt(start), BigInt(toByte(subject, pair[1]) - start)]);
  }
  if (!pair) return type === 'list' ? rt.nil() : binary(rt, []);
  const start = toByte(subject, pair[0]);
  const end = toByte(subject, pair[1]);
  if (type === 'binary') return binary(rt, subject.bytes.slice(start, end));
  if (compiled.unicode) return charlist(rt, subject.text.slice(pair[0], pair[1]));
  return arrayToList(rt, Array.from(subject.bytes.subarray(start, end), byte => BigInt(byte)));
}

function groupByName(compiled, found, name) {
  const numbers = compiled.names.get(name);
  if (!numbers) return undefined;
  return numbers.find(number => found[number]) ?? numbers[0];
}

function captures(rt, subject, compiled, found, capture) {
  const spec = capture?.spec ?? rt.atom('all');
  const type = capture?.type ?? 'index';
  let selected;
  if (isAtom(spec)) {
    const name = Symbol.keyFor(spec);
    let last = found.length - 1;
    while (last > 0 && !found[last]) last--;
    if (name === 'all') selected = found.slice(0, last + 1);
    else if (name === 'all_but_first') selected = found.slice(1, last + 1);
    else if (name === 'first') selected = [found[0]];
    else if (name === 'all_names') {
      selected = [...compiled.names.keys()].sort().map(key => found[groupByName(compiled, found, key)]);
    }
  } else {
    selected = listToArray(spec).map(id => {
      if (typeof id === 'bigint') return id >= 0n && id < BigInt(found.length) ? found[Number(id)] : null;
      const name = isAtom(id) ? Symbol.keyFor(id) : is(id, BITSTRING)
        ? new TextDecoder().decode(id[1][0]) : charlistText(id);
      const number = groupByName(compiled, found, name);
      return number === undefined ? null : found[number];
    });
  }
  return arrayToList(rt, selected.map(pair => captureValue(rt, subject, compiled, pair, type)));
}

function runNif(rt, subjectTerm, pattern, optionList) {
  let compiled = compiledOf(pattern);
  const parsed = parseOptions(rt, optionList, {allowRun: true, allowCompile: !compiled});
  if (!parsed) badarg(rt);
  const {run} = parsed;
  if (!compiled) {
    if (is(pattern, TUPLE)) badarg(rt);
    const text = patternText(rt, pattern, parsed.compile.unicode);
    if (text === null) badarg(rt);
    try {
      compiled = compilePattern(rt, text, parsed.compile);
    } catch (error) {
      if (!(error instanceof CompileError)) throw error;
      if (run.report_errors) {
        return rt.tuple([rt.atom('error'), rt.tuple([rt.atom('compile'), compileError(rt, error)])]);
      }
      badarg(rt);
    }
  }
  compiled.hasStart = compiled.tokens.some(token => token?.start);
  const subject = subjectOf(rt, subjectTerm, compiled.unicode);
  if (!subject || run.offset > subject.bytes.length) badarg(rt);
  const found = matches(compiled, subject, run);
  if (found === null) badarg(rt);
  if (!found.length) return rt.atom('nomatch');
  if (run.capture && run.capture.spec === Symbol.for('none')) return rt.atom('match');
  const values = found.map(groups => captures(rt, subject, compiled, groups, run.capture));
  return rt.tuple([rt.atom('match'), run.global ? arrayToList(rt, values) : values[0]]);
}

export function reBifs() {
  return new Map([['re', [
    ['version', 0, rt => binary(rt, new TextEncoder().encode('10.47 2025-10-21'))],
    ['compile', 1, (rt, [pattern]) => compileNif(rt, pattern, rt.nil())],
    ['compile', 2, (rt, [pattern, options]) => compileNif(rt, pattern, options)],
    ['run', 2, (rt, [subject, pattern]) => runNif(rt, subject, pattern, rt.nil())],
    ['run', 3, (rt, [subject, pattern, options]) => runNif(rt, subject, pattern, options)],
    ['internal_run', 4, (rt, [subject, pattern, options]) => runNif(rt, subject, pattern, options)],
    ['inspect', 2, (rt, [pattern, item]) => {
      const compiled = compiledOf(pattern);
      if (!compiled || item !== rt.atom('namelist')) badarg(rt);
      return rt.tuple([rt.atom('namelist'), arrayToList(rt, [...compiled.names.keys()].sort()
        .map(name => binary(rt, new TextEncoder().encode(name))))]);
    }],
    ['import', 1, (rt, [exported]) => {
      const parts = is(exported, TUPLE) ? exported[1] : null;
      if (!parts || parts.length !== 5 || parts[0] !== rt.atom('re_exported_pattern')) badarg(rt);
      const options = (listToArray(parts[3]) ?? badarg(rt)).filter(option => option !== rt.atom('export'));
      const result = compileNif(rt, parts[2], arrayToList(rt, options));
      if (!is(result, TUPLE) || result[1][0] !== rt.atom('ok')) badarg(rt);
      return result[1][1];
    }],
  ]]]);
}
