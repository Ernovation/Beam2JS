# Beam2JS

Beam2JS compiles supported Erlang BEAM modules to JavaScript ES modules and
runs them with a small JavaScript runtime. It is an experimental subset, not a
general-purpose Erlang implementation.

## Get started

The compiler currently requires Erlang/OTP 29. Build it from the repository
root, then compile an Erlang module and run it with the JavaScript runtime:

```sh
rebar3 escriptize
mkdir -p build
erlc -o build my_module.erl
_build/default/bin/beam2js build/my_module.beam build/my_module.mjs
```

In a JavaScript entry point, point the runtime at the directory containing the
generated modules and invoke an exported Erlang function:

```js
import {Runtime} from './runtime/beam2js.mjs';

const runtime = new Runtime({moduleBaseURL: new URL('./build/', import.meta.url)});
const result = await runtime.invokeAsync('my_module', 'run', [42n]);
```

Modules are downloaded and registered on first use. Erlang integers are
JavaScript `bigint`s; use `runtime.atom('name')` for atoms and
`runtime.float(number)` for floats. See [Runtime API](#runtime-api) for
constructing other terms and scheduling processes.

Generated functions dispatch once per straight-line instruction block, rather
than once per BEAM instruction. Jump targets, exception handlers and call/receive
continuations remain block entry points. Scheduler slices can still stop inside
a block and resume without replaying instructions or exceeding `reductionLimit`.
Recompile existing modules to use this optimization; `rebar3 otplib` rebuilds the
bundled OTP modules.

## Examples

Each example runs with one command that first builds the compiler and the
examples (see [Development commands](#development-commands)).

### Sudoku solver

The [Sudoku example](examples/sudoku/sudoku.erl) is a pure Erlang backtracking
solver that runs in Node.js:

```sh
rebar3 demo sudoku
```

This compiles `sudoku.erl` to `_build/sudoku/sudoku.beam`, compiles that to
`_build/sudoku/sudoku.mjs` and runs [run.mjs](examples/sudoku/run.mjs) with
Node.js.

`sudoku:solve/1` takes nine rows of nine integers, using `0` for an empty cell.
It returns `{ok, Grid}` for the first solution, `invalid` for malformed input
or conflicting clues, and `unsolvable` for a valid puzzle with no solution.
It does not check whether the solution is unique.

### Browser demo

Build the example's BEAM files and serve them with the Beam2JS web server:

```sh
rebar3 demo browser        # add --port 8000 if port 8080 is taken
```

This runs `beam2js serve --beam-dir _build/browser --module-root /examples/browser/`.
Open <http://localhost:8080/examples/browser/> (the page, not the server root
`http://localhost:8080/`, which has no application) and stop the server with
Ctrl-C. The Erlang process listens for
click and mouse-move events, updates the page, and exits when you select **Stop
Erlang process**. The runtime requests `browser_demo.mjs` and `dom.mjs` when
needed and the server compiles them from the BEAM files. The `dom` module loads
its JavaScript implementation from `dom.nif.mjs` in its `-on_load` initializer;
that file and the page itself are served as static files. The example uses
browser APIs; it is not a general JavaScript interop layer.

### Server demo

The [server demo](examples/server/server_demo.erl) calls OTP's own `ordsets`
module from the browser without compiling it in advance:

```sh
rebar3 demo server
```

This runs `beam2js serve --pa _build/server`. Open
<http://localhost:8080/examples/server/>. The page imports the runtime
with `moduleBaseURL` set to `/modules/`; the server compiles `server_demo.mjs`
from `_build/server` and `ordsets.mjs` from the OTP installation on first use.

### Interactive Erlang shell

```sh
rebar3 demo shell --port 8000
```

Open <http://localhost:8000/examples/shell/>. This runs OTP's actual `shell`,
`user_drv`, `group` and `edlin` modules in the browser, with JavaScript
replacements for `prim_tty`'s terminal NIFs. Enter expressions ending in a
period; arrow keys edit and recall commands, Tab completes names, and Ctrl+G
opens OTP's job-control menu. The **Stop shell** button stops the Erlang
processes and disconnects input.

Try:

```erlang
X = 21, X * 2.
lists:seq(1, 5).
io:get_line("Name: ").
file:consult("fixtures/browser_shell.terms").
file:list_dir("examples").
```

To embed it in another page, give the terminal element a size, an overflow
policy and a monospace font:

```html
<div id="shell" style="height:25rem;overflow:auto;font:16px/1.3 monospace"></div>
<script type="module">
  import {startBrowserShell} from './runtime/browser-shell.mjs';
  const shell = await startBrowserShell(document.getElementById('shell'), {
    moduleBaseURL: new URL('/modules/', document.baseURI),
    fileBaseURL: new URL('/', document.baseURI),
  });
  // Later: await shell.stop();
</script>
```

The returned object contains `runtime`, `terminal` and `stop()`. It owns a
dedicated runtime; stopping it terminates every process in that runtime.
The supplied terminal renders plain text with a visible cursor and cursor/erase
controls, not ANSI colors or a complete graphical terminal emulator. Command
history lives in the browser session, not on the server's disk.

Files are fetched on demand relative to `fileBaseURL`, which defaults to
`moduleBaseURL`. `file:read_file`, sequential and positional reads, file IO
devices (including `file:consult`), file metadata, directory listing and
changing the virtual working directory are supported. The working directory
is a URL, not a path on the browser host. `beam2js serve` supplies directory
and metadata queries; a generic static server can serve file contents but
may not support those queries. Files are read-only: writes return
`{error,erofs}`. OS handles, symlinks and archives are not provided and return
explicit unsupported-operation errors.

Module loading is separate from file IO. `code:ensure_loaded` and ordinary
remote calls import and register compiled `.mjs` files. Compatibility
requests such as `erl_prim_loader:get_file("lists.beam")` fetch
`<moduleBaseURL>/lists.mjs` and return its JavaScript source and `.mjs` URL,
never a BEAM binary. `code:objfile_extension()` consequently returns `".mjs"`.
This does not add an Erlang-to-BEAM compiler inside the browser.

## Web server

`beam2js serve` starts an Erlang web server that compiles BEAM files to
JavaScript when the browser requests them, so modules need no separate build
step. Point the runtime's `moduleBaseURL` at the server's module root:

```js
const runtime = new Runtime({moduleBaseURL: new URL('/modules/', document.baseURI)});
```

Requests under the module root are handled as follows:

| Request | Response |
| --- | --- |
| `<root><module>.mjs` | `<module>.beam`, compiled to JavaScript |
| `<root><name>.nif.mjs` | `<name>.nif.mjs` from a NIF directory or next to the BEAM files, unchanged |
| anything else | the document root's file at that path, or 404 |

By default every module the server's own Erlang node can load is served: the
BEAM file is located on the code path, which includes the OTP installation and
any `--pa` directories. With one or more `--beam-dir` options only those
directories are searched. A module that the compiler does not support returns
HTTP 500 with the compiler's diagnostic, which makes the runtime's load fail.
Compiled output is cached in memory until the BEAM file's size or modification
time changes.

| Option | Default | Meaning |
| --- | --- | --- |
| `--port N` | `8080` | TCP port; `0` picks a free port |
| `--ip ADDRESS` | `127.0.0.1` | Listening address |
| `--module-root PATH` | `/modules/` | URL path under which modules are served |
| `--beam-dir DIR` | code path | Serve only BEAM files from `DIR`; repeatable |
| `--pa DIR` | | Add `DIR` to the code path; repeatable |
| `--nif-dir DIR` | | Also look for `.nif.mjs` files in `DIR`; repeatable |
| `--root DIR` | `.` | Document root for static files such as pages and the runtime |
| `--no-root` | | Serve no static files |

The server can also run inside an existing Erlang node:

```erlang
{ok, Server} = beam2js_server:start(#{port => 8080,
                                      beam_dirs => ["ebin"],   % or code_path
                                      nif_dirs => ["priv/js"],
                                      document_root => "www"}),
Port = beam2js_server:port(Server),
beam2js_server:stop(Server).
```

The map keys match the command-line options (`ip`, `port`, `module_root`,
`beam_dirs`, `nif_dirs`, `document_root`); `start/1` defaults to no document
root. The server uses OTP `inets` and listens on the loopback address unless
told otherwise. In the default mode it exposes the compiled code of every
module on the code path, so restrict it with `--beam-dir` before making it
reachable from other machines.

The server also answers `?beam2js=stat` and `?beam2js=list` on static file
and directory URLs with `application/vnd.beam2js.file+json` metadata for the
browser filesystem. These queries are confined to the configured document
root and are disabled by `--no-root`. Directory listings expose the names
in that root, so choose `--root` accordingly when serving other machines.

Compiling an OTP module does not supply OS services it depends on. For
example, native shared libraries, distribution and server-side filesystem
writes are not available in a browser.

## Runtime API

### Loading and calling modules

```js
const runtime = new Runtime({
  moduleBaseURL: new URL('./build/', import.meta.url),
});

const value = await runtime.invokeAsync('my_module', 'run', [42n]);
```

The runtime imports `<moduleBaseURL>/<module>.mjs` and calls its
`register(runtime)` export when an unloaded module is first called. Concurrent
calls share the in-flight load. A module's `-on_load` initializer completes
before calls continue. Load and initialization failures reject the call with
diagnostics; failed loads can be retried.

The default base URL is the browser document URL or the repository root in
Node.js. Set `moduleBaseURL` to the directory containing the generated modules
(as in the example above); a directory URL should end with `/`.

Use `await runtime.loadModule('my_module')` to load and initialize a module
before making synchronous calls with `runtime.invoke`. Synchronous `invoke`
does not download modules or NIFs. Explicit registration is also supported:
import a generated module and call its `register(runtime)` export.

### Runtime options and standard output

Besides `moduleBaseURL`, `schedulers` and `reductionLimit`, the runtime accepts:

| Option | Default | Purpose |
| --- | --- | --- |
| `stdout` | `process.stdout.write` in Node.js, `console.log` per line in browsers | Receives text written by `io:format` and other output to the default IO server |
| `arguments` | `{root: ['/'], progname: ['erl'], home: ['/']}` | Values returned by `init:get_argument/1` |
| `plainArguments` | `[]` | Strings returned by `init:get_plain_arguments/0` |
| `fileBaseURL` | `moduleBaseURL` | Base URL for the HTTP filesystem |
| `fetch` | Host's `fetch` | Fetch-compatible function used for file IO, not ES module imports |
| `terminal` | None | Optional terminal adapter used by `prim_tty`; provided by `startBrowserShell` |

A custom terminal adapter provides `write(text)`, `onData(callback)` and
`size()` returning `{columns, rows}`. `onData` delivers strings or UTF-8 byte
arrays and returns an unsubscribe function. Optional `onClose(callback)` and
`onResize(callback)` notify EOF and terminal geometry changes.

Processes without a group leader use the IO server registered as `user`,
which the runtime starts on first use. It writes output to `stdout` and
answers input requests with `eof`.

### JavaScript NIFs

An Erlang module can provide fallback functions and load replacements from
JavaScript:

```erlang
-module(example).
-on_load(init/0).
-export([add/2]).

init() -> erlang:load_nif("example", undefined).
add(_, _) -> erlang:nif_error(nif_not_loaded).
```

`erlang:load_nif(Name, LoadInfo)` imports `<Name>.nif.mjs` relative to the
runtime's module base URL. The NIF exports a factory returning descriptors for
existing Erlang functions:

```js
export function nif(runtime, loadInfo) {
  return [{
    name: 'add',
    arity: 2,
    run: (_rt, [left, right]) => ({type: 'return', value: left + right}),
  }];
}
```

The factory may be asynchronous. Replacements are validated and installed
together; they preserve the Erlang functions' export visibility, and other
functions in the module remain Erlang implementations. NIF failures return
`{error, {load_failed, MessageBinary}}` without partially replacing functions.
NIF files and generated modules are trusted executable JavaScript, subject to
normal browser MIME, CORS and CSP rules. This is not a native shared-library
NIF ABI or a sandbox.

### Erlang terms

Use the runtime helpers to create terms at the JavaScript boundary:

| Erlang term | JavaScript representation/helper |
| --- | --- |
| Integer | `bigint`, for example `42n` |
| Atom | `runtime.atom('ok')` |
| Float | `runtime.float(3.14)` |
| Empty list | `runtime.nil()` |
| Cons cell | `runtime.cons(head, tail)` |
| Tuple | `runtime.tuple([first, second])` |
| Bitstring | `runtime.bitstring(bytes, bitLength)` |
| Opaque host object | `runtime.hostHandle(object)` |

use `runtime.floatValue`, `tupleSize`, `tupleElement`, `listHead`,
`listTail`, `isBitstring`, `bitstringSize` and `bitstringBytes` to inspect
terms. Tuple element indexes are one-based. `bitstring` copies the input bytes;
bits are most-significant-bit first, and unused low bits in the final byte are
cleared. `hostValue(handle)` unwraps a host handle only in the runtime that
created it. Raw JavaScript numbers and objects are not Erlang terms; use the
runtime helpers rather than constructing term wrappers yourself. Do not mutate
compound term payloads from host code.

### Processes and messages

Use `spawnProcess` to start an Erlang process from JavaScript. Its `result`
property is a promise for the Erlang return value:

```js
const process = runtime.spawnProcess('my_module', 'listen', []);
runtime.sendMessage(process, runtime.atom('stop'));
const result = await process.result;
```

Processes have separate registers, stacks and FIFO mailboxes. Erlang
`receive` can suspend a scheduled process while it waits for a matching
message. Local process names, process dictionaries, references, and supported
relative and absolute timers are available.

Erlang links and monitors follow OTP semantics: `spawn_link`, `spawn_monitor`,
`link`, `monitor`, `demonitor` (with `flush` and `info`), `exit/2` and
`process_flag(trap_exit, true)` are supported. Abnormal exits propagate to
linked processes, trapping processes receive `{'EXIT', Pid, Reason}` messages,
and monitors receive `{'DOWN', Ref, process, Pid, Reason}`. From JavaScript,
`runtime.terminateProcess(pid, reason)` sends an exit signal and rejects the
process's `result` promise. `schedulers` and
`reductionLimit` are runtime options; scheduler slots cooperate on one
JavaScript event loop and do not provide parallel execution. Synchronous host
operations can still block that event loop.

## Supported Erlang subset

The compiler targets the BEAM format and compiler tooling from OTP 29; generated
modules must use runtime ABI 26. The supported subset includes common control
flow and calls; integers, floats, atoms, lists, tuples, maps, binaries and
bitstrings; selected matching and extraction instructions; and a defined set
of Erlang BIFs and arithmetic operations. The runtime adds cooperative local
processes, message passing, selective receive, references, timers, a local
process registry, links and monitors, Erlang `try`/`catch` exception
handling with stack traces, and JavaScript NIF replacements.

OTP's own `lists.beam` compiles and runs unchanged. OTP implements
`lists:reverse/2`, `member/2`, `keyfind/3`, `keymember/3` and `keysearch/3` as
BIFs, so the runtime supplies JavaScript versions of those five when the
`lists` module is loaded.

OTP's stdlib and compiler modules can be compiled from their installed BEAM
files and loaded unchanged, including the building blocks of the interactive
shell: `erl_scan`, `erl_parse`, `erl_lint`, `erl_eval`, `erl_pp`, `io_lib`,
`io`, `re`, `ets`, `maps`, `sets`, `gb_trees`, `sofs` and friends. Functions
that OTP implements as BIFs or NIFs (for example in `lists`, `maps`, `ets`,
`unicode`, `binary`, `persistent_term`, `atomics` and `re`) have JavaScript
implementations that the runtime installs when the module loads. The runtime
ships compiled copies of a few core modules in
[runtime/otp/lib](runtime/otp/lib) and uses them when the module root has
none; rebuild them with `rebar3 otplib` after changing the compiler.
`init`, `code` and `net_kernel` are JavaScript modules describing a single,
non-distributed node.

`re` translates PCRE patterns into JavaScript regular expressions, so a few
PCRE-only features (branch reset groups `(?|...)`, conditional subpatterns,
recursion and subroutine calls, `\K` and backtracking verbs such as `(*SKIP)`)
return compile errors.

This is not a drop-in OTP runtime. Unsupported instructions or operand forms
reject compilation. Stack traces have no line information. Distributed processes,
serialization, worker-based parallelism, and many OTP library functions are
not implemented. Some operations are synchronous and can block the host for
large inputs. The compiler uses OTP's BEAM disassembler; **do not compile
untrusted BEAM files**.

For precise coverage and remaining gaps, see the
[OTP 29.1.2 opcode ledger](docs/opcodes-otp-29.1.2.md), the
[BIF inventory](docs/bifs-otp-29.1.2.md), and the [design notes](docs/design.md).
The [browser event design](docs/browser-events.md) describes the browser
example's event and subscription model. The supplied
[BEAM Book](docs/background/theBeamBook/README.md) is a reference, not the
specification for every OTP release.

## Development and tests

The recommended development environment is VS Code with Docker and the
Dev Containers extension. Reopen this repository in the container; it supplies
the pinned Erlang/OTP, Node.js, Playwright and Chromium toolchain. Check it with:

```sh
rebar3 test toolchain
```

### Development commands

The repository's rebar3 plugin ([tools/rebar3/beam2js_tasks](tools/rebar3/beam2js_tasks))
adds commands for everyday tasks. Each command first runs the commands it
depends on, so it always uses a compiler built from the current sources:

| Command | Does | Runs first |
| --- | --- | --- |
| `rebar3 escriptize` | Builds the compiler, `_build/default/bin/beam2js` | `compile` |
| `rebar3 otplib` | Rebuilds the OTP modules bundled in [runtime/otp/lib](runtime/otp/lib) | `escriptize` |
| `rebar3 examples` | Compiles the examples into `_build/sudoku`, `_build/browser` and `_build/server` | `escriptize` |
| `rebar3 build` | Everything above | `otplib`, `examples` |
| `rebar3 demo sudoku` | Runs the Sudoku solver in Node.js | `otplib`, `examples` |
| `rebar3 demo browser` | Serves the browser demo at `/examples/browser/` until Ctrl-C | `otplib`, `examples` |
| `rebar3 demo server` | Serves the server demo at `/examples/server/` until Ctrl-C | `otplib`, `examples` |
| `rebar3 demo shell` | Runs the browser shell at `/examples/shell/` until Ctrl-C | `otplib`, `examples` |
| `rebar3 test` | Runs every test suite (`npm test`) | `otplib` |
| `rebar3 test SUITE...` | Runs the named suites, for example `rebar3 test shell lists` | `otplib` |

```text
compile ── escriptize ─┬─ otplib ───┬─ test
                       │            ├─ build
                       │            └─ demo
                       └─ examples ─┬─ build
                                    └─ demo
```

`otplib` records a hash of its inputs (the compiler sources, the runtime's
Erlang sources in [runtime/otp/src](runtime/otp/src), the build script and the
OTP version) and skips the rebuild when they are unchanged; `--force` rebuilds
anyway. Commit the regenerated `runtime/otp/lib` files together with the
compiler change that caused them. `demo browser`, `demo server` and `demo shell` accept
`--port N` (default 8080) and `--ip ADDRESS` (default `127.0.0.1`). `test`
installs the Node.js dependencies with `npm ci` when they are missing. Run
`rebar3 help COMMAND` for details.

The npm scripts in [package.json](package.json) run the suites without
building anything first, so `npm test` and `npm run test:SUITE` work after a
`rebar3 build`. To compile a single module by hand, run
`_build/default/bin/beam2js input.beam output.mjs`.

### Test suites

Each suite can also be run on its own (`rebar3 test SUITE` or
`npm run test:SUITE`): `toolchain`, `integration`, `execution`, `opcodes`, `bifs`, `maps`, `funs`, `errors`,
`links`, `lists`, `binary`, `otplib`, `shell`, `loader`, `sudoku`, `server`
`browser` and `browser-shell`. The `server` suite starts `beam2js serve` and loads both browser
examples through it in Chromium.
`links` compiles [fixtures/process_links.erl](fixtures/process_links.erl)
and checks that its link, monitor, exit-signal and exception scenarios produce
the same results in Beam2JS as in OTP.
`lists` compiles OTP's installed `lists.beam` and
[fixtures/lists_cases.erl](fixtures/lists_cases.erl) and compares every
exported `lists` function with OTP.
`binary`, `otplib` and `shell` follow the same approach with
[fixtures/binary_cases.erl](fixtures/binary_cases.erl),
[fixtures/otp_lib_cases.erl](fixtures/otp_lib_cases.erl) and
[fixtures/shell_cases.erl](fixtures/shell_cases.erl); `shell` compiles
the OTP modules that the interactive shell builds on and compares scanning,
parsing, linting, evaluation, formatting and `re` results with OTP.
`browser-shell` boots the interactive OTP shell in Chromium and tests
evaluation, exception recovery, line editing and history, Unicode input,
terminal resizing, HTTP files/directories and on-demand `.mjs` loading.
