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

Build and serve the example from the repository root:

```sh
rebar3 escriptize
mkdir -p _build/browser
erlc -o _build/browser examples/browser/browser_demo.erl examples/browser/dom.erl
_build/default/bin/beam2js _build/browser/browser_demo.beam examples/browser/browser_demo.mjs
_build/default/bin/beam2js _build/browser/dom.beam examples/browser/dom.mjs
python3 -m http.server 8000
```

Open <http://localhost:8000/examples/browser/>. The Erlang process listens for
click and mouse-move events, updates the page, and exits when you select **Stop
Erlang process**. The runtime downloads `browser_demo.mjs` and `dom.mjs` when
needed. The `dom` module loads its JavaScript implementation from
`dom.nif.mjs` in its `-on_load` initializer. The example uses browser APIs; it
is not a general JavaScript interop layer.

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
relative and absolute timers are available. `schedulers` and
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
process registry, and JavaScript NIF replacements.

This is not a drop-in OTP runtime. Unsupported instructions or operand forms
reject compilation. General exception handling, distributed processes,
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

Build the compiler and run the main checks with:

```sh
rebar3 escriptize
node test/integration.mjs
npm run test:execution
npm run test:browser
npm run test:loader
npm run test:sudoku
```

Other focused suites are available as `npm run test:bifs`,
`npm run test:maps`, `npm run test:funs`, `npm run test:errors` and
`npm run test:opcodes`.
