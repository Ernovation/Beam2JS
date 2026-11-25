import {Runtime} from './beam2js.mjs';
import {terminalWidth} from './otp/tty.mjs';

// A small VT-style text terminal. OTP's edlin handles editing and history;
// this adapter only renders the resulting cursor/erase sequences.
export class BrowserTerminal {
  #element;
  #output;
  #input;
  #cursor;
  #listeners = new Set();
  #closeListeners = new Set();
  #resizeListeners = new Set();
  #resizeObserver;
  #lines = [[]];
  #row = 0;
  #column = 0;
  #pending = '';
  #controller = new AbortController();

  constructor(element) {
    if (!(element instanceof HTMLElement)) throw new TypeError('terminal requires an HTML element');
    this.#element = element;
    this.#output = document.createElement('pre');
    this.#output.setAttribute('aria-label', 'Erlang shell output');
    this.#output.style.cssText = 'margin:0;white-space:pre;min-height:100%;font:inherit;';
    this.#cursor = document.createElement('span');
    this.#cursor.setAttribute('aria-hidden', 'true');
    this.#cursor.dataset.beam2jsCursor = '';
    this.#cursor.style.cssText = 'display:inline-block;width:1ch;height:1em;margin-right:-1ch;vertical-align:-0.15em;background:currentColor;opacity:0.65;pointer-events:none;';
    this.#input = document.createElement('textarea');
    this.#input.setAttribute('aria-label', 'Erlang shell input');
    this.#input.setAttribute('autocapitalize', 'off');
    this.#input.autocomplete = 'off';
    this.#input.spellcheck = false;
    this.#input.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;bottom:0;left:0;padding:0;border:0;';
    element.style.position ||= 'relative';
    element.append(this.#output, this.#input);
    this.#render();
    this.#resizeObserver = new ResizeObserver(() => {
      for (const callback of this.#resizeListeners) callback();
    });
    this.#resizeObserver.observe(element);
    const options = {signal: this.#controller.signal};
    element.addEventListener('click', () => this.#input.focus({preventScroll: true}), options);
    this.#input.addEventListener('keydown', event => {
      const keys = {Enter: '\r', Backspace: '\x7f', Delete: '\x1b[3~', Tab: '\t', Escape: '\x1b',
        ArrowLeft: '\x1b[D', ArrowRight: '\x1b[C', ArrowUp: '\x1b[A', ArrowDown: '\x1b[B',
        Home: '\x1b[H', End: '\x1b[F'};
      let data = keys[event.key];
      if (event.ctrlKey && !event.altKey && /^[a-z]$/i.test(event.key)) {
        data = String.fromCharCode(event.key.toUpperCase().charCodeAt(0) - 64);
      }
      if (data !== undefined) {
        event.preventDefault();
        this.send(data);
      }
    }, options);
    this.#input.addEventListener('input', event => {
      if (event.isComposing) return;
      if (this.#input.value) this.send(this.#input.value.replace(/\r?\n/g, '\r'));
      this.#input.value = '';
    }, options);
  }
  onData(callback) { this.#listeners.add(callback); return () => this.#listeners.delete(callback); }
  onClose(callback) { this.#closeListeners.add(callback); return () => this.#closeListeners.delete(callback); }
  onResize(callback) { this.#resizeListeners.add(callback); return () => this.#resizeListeners.delete(callback); }
  send(text) { for (const callback of this.#listeners) callback(text); }
  focus() { this.#input.focus({preventScroll: true}); }
  size() {
    const style = getComputedStyle(this.#element), font = Number.parseFloat(style.fontSize) || 16;
    return {columns: Math.max(20, Math.floor(this.#element.clientWidth / (font * 0.6))),
      rows: Math.max(5, Math.floor(this.#element.clientHeight / (Number.parseFloat(style.lineHeight) || font * 1.2)))};
  }
  write(text) {
    text = this.#pending + text;
    this.#pending = '';
    for (let i = 0; i < text.length;) {
      if (text[i] === '\x1b') {
        const remaining = text.slice(i);
        const sequence = /^\x1b\[([?;\d]*)([ -/]*[@-~])/.exec(remaining);
        if (!sequence) {
          if (remaining === '\x1b' || /^\x1b\[[?;\d]*$/.test(remaining)) this.#pending = remaining;
          else if (text[i + 1] === ']') {
            const end = /\x07|\x1b\\/.exec(text.slice(i + 2));
            if (!end) { this.#pending = remaining; break; }
            i += 2 + end.index + end[0].length; continue;
          }
          if (this.#pending) break;
          i += 2; continue;
        }
        this.#control(sequence[2], sequence[1]);
        i += sequence[0].length;
        continue;
      }
      const point = text.codePointAt(i), char = String.fromCodePoint(point);
      i += char.length;
      if (char === '\r') this.#column = 0;
      else if (char === '\n') { this.#row++; this.#column = 0; }
      else if (char === '\b') this.#column = Math.max(0, this.#column - 1);
      else if (char === '\t') this.#column += 8 - this.#column % 8;
      else if (point >= 32 && point !== 127) {
        const width = terminalWidth(point);
        if (width === 0) {
          let previous = this.#column - 1;
          while (previous > 0 && this.#line()[previous] === '') previous--;
          if (previous >= 0) this.#line()[previous] = (this.#line()[previous] ?? '') + char;
        } else {
          if (this.#column + width > this.size().columns) { this.#row++; this.#column = 0; }
          this.#line()[this.#column++] = char;
          if (width === 2) this.#line()[this.#column++] = '';
        }
      }
      this.#line();
    }
    if (this.#lines.length > 10000) {
      const trim = this.#lines.length - 10000;
      this.#lines.splice(0, trim); this.#row = Math.max(0, this.#row - trim);
    }
    this.#render();
    this.#element.scrollTop = this.#element.scrollHeight;
  }
  #render() {
    const line = this.#line();
    let column = this.#column;
    let offset = Math.max(0, column - line.length);
    if (line[column] === '') { column--; offset = 1; }
    this.#cursor.style.transform = `translateX(${offset}ch)`;
    const text = cells => Array.from(cells, char => char ?? ' ').join('');
    const before = this.#lines.slice(0, this.#row).map(text);
    const after = this.#lines.slice(this.#row + 1).map(text);
    this.#output.replaceChildren(
      (before.length ? before.join('\n') + '\n' : '') + text(line.slice(0, column)),
      this.#cursor,
      text(line.slice(column)) + (after.length ? '\n' + after.join('\n') : ''));
  }
  #line() {
    while (this.#lines.length <= this.#row) this.#lines.push([]);
    return this.#lines[this.#row];
  }
  #control(command, parameters) {
    const [a = 0, b = 0] = parameters.replace('?', '').split(';').map(Number), n = a || 1;
    if (command === 'A') this.#row = Math.max(0, this.#row - n);
    else if (command === 'B') this.#row += n;
    else if (command === 'C') this.#column += n;
    else if (command === 'D') this.#column = Math.max(0, this.#column - n);
    else if (command === 'G') this.#column = n - 1;
    else if (command === 'H' || command === 'f') { this.#row = n - 1; this.#column = (b || 1) - 1; }
    else if (command === 'K') {
      if (a === 2) this.#line().length = 0;
      else if (a === 1) this.#line().fill(' ', 0, this.#column + 1);
      else this.#line().length = this.#column;
    } else if (command === 'J') {
      if (a === 2) { this.#lines = [[]]; this.#row = 0; this.#column = 0; }
      else { this.#lines.length = this.#row + 1; this.#line().length = this.#column; }
    }
    // SGR and terminal mode controls do not change this plain-text display.
  }
  dispose() {
    for (const callback of this.#closeListeners) callback();
    this.#controller.abort();
    this.#resizeObserver.disconnect();
    this.#listeners.clear(); this.#closeListeners.clear();
    this.#resizeListeners.clear();
    this.#cursor.remove();
    this.#input.remove();
  }
}

export async function startBrowserShell(element, options = {}) {
  const terminal = new BrowserTerminal(element);
  let runtime, stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    terminal.dispose();
    if (!runtime) return;
    const processes = await runtime.invokeAsync('erlang', 'processes', []);
    for (let list = processes; list !== runtime.nil(); list = runtime.listTail(list)) {
      const pid = runtime.listHead(list);
      if (runtime.isProcessAlive(pid)) runtime.terminateProcess(pid, runtime.atom('kill'));
    }
  };
  try {
    runtime = new Runtime({...options, terminal, stdout: text => terminal.write(text)});
    const driver = await runtime.invokeAsync('beam2js_shell', 'start', []);
    if (!runtime.isType('is_pid', driver)) throw new Error('OTP user_drv failed to start');
    terminal.focus();
    return {runtime, terminal, stop};
  } catch (error) {
    await stop();
    throw error;
  }
}
