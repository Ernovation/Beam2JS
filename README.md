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

## Examples

### Sudoku solver

The [Sudoku example](examples/sudoku/sudoku.erl) is a pure Erlang backtracking
solver that runs in Node.js:

```sh
rebar3 escriptize
mkdir -p _build/sudoku
erlc -o _build/sudoku examples/sudoku/sudoku.erl
_build/default/bin/beam2js _build/sudoku/sudoku.beam _build/sudoku/sudoku.mjs
node examples/sudoku/run.mjs
```

`sudoku:solve/1` takes nine rows of nine integers, using `0` for an empty cell.
It returns `{ok, Grid}` for the first solution, `invalid` for malformed input
or conflicting clues, and `unsolvable` for a valid puzzle with no solution.
It does not check whether the solution is unique.

### Browser demo

Build the compiler and the example's BEAM files, then serve them with the
Beam2JS web server from the repository root:

```sh
rebar3 escriptize
mkdir -p _build/browser
erlc -o _build/browser examples/browser/browser_demo.erl examples/browser/dom.erl
_build/default/bin/beam2js serve --beam-dir _build/browser --module-root /examples/browser/
```

Open <http://localhost:8080/examples/browser/> (the page, not the server root
`http://localhost:8080/`, which has no application). The Erlang process listens for
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
rebar3 escriptize
mkdir -p _build/server
erlc -o _build/server examples/server/server_demo.erl
_build/default/bin/beam2js serve --pa _build/server
```

Open <http://localhost:8080/examples/server/>. The page imports the runtime
with `moduleBaseURL` set to `/modules/`; the server compiles `server_demo.mjs`
from `_build/server` and `ordsets.mjs` from the OTP installation on first use.

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

The compiler supports only part of the BEAM instruction set, so many OTP
library modules cannot be compiled yet. For example `ordsets` compiles, but
`lists` does not (it uses unsupported closure and type-test instructions).

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
npm run test:toolchain
```

Build the compiler and run every suite with:

```sh
rebar3 escriptize
npm test
```

Each suite can also be run on its own: `npm run test:integration`,
`test:execution`, `test:opcodes`, `test:bifs`, `test:maps`, `test:funs`,
`test:errors`, `test:links`, `test:loader`, `test:sudoku`, `test:server` and
`test:browser`. `test:server` starts `beam2js serve` and loads both browser
examples through it in Chromium.
`test:links` compiles [fixtures/process_links.erl](fixtures/process_links.erl)
and checks that its link, monitor, exit-signal and exception scenarios produce
the same results in Beam2JS as in OTP.
