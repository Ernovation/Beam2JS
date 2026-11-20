# Beam2JS

Beam2JS translates a small subset of compiled Erlang BEAM modules to JavaScript
ES modules for execution with its JavaScript runtime. This is an experimental
first slice, **not** a general-purpose Erlang implementation.

See the [design](docs/design.md) and [implementation plan](docs/plan.md).
The [term representation design](docs/terms.md) describes the planned Erlang
types and JavaScript boundary.
The [OTP 29.1.2 opcode ledger](docs/opcodes-otp-29.1.2.md) tracks the initial
raw instruction inventory and its current verification gaps.
The [BIF inventory](docs/bifs-otp-29.1.2.md) records initial built-in
classifications and remaining gaps.
The supplied [BEAM Book](docs/theBeamBook/README.md) is a reference, not the
specification for every OTP release.

## Development environment

Install Docker, VS Code, and the VS Code Dev Containers extension. Open this
repository in VS Code and select **Dev Containers: Reopen in Container**. The
container uses the Docker Official Image `erlang:29.1.2.0`, plus Node.js and npm
from the official `node:20.19.2-bookworm-slim` image. Both images are pinned by
digest. It also installs the pinned Playwright Chromium headless shell and its
system dependencies. Dependencies are installed when the container is created;
no host Erlang, Node.js or browser installation is required.

In the container, check the tools with:

```sh
erl -noshell -eval 'io:format("OTP ~s~n", [erlang:system_info(otp_release)]), halt().'
rebar3 --version
node --version
npm --version
npm run test:toolchain
```

The checked development baseline is Erlang/OTP **29.1.2** (compiler 10.0.7,
ERTS 17.1.1), rebar3 **3.27.0**, Node.js **20.19.2**, Playwright **1.55.1**
and Chromium headless shell **140.0.7339.186** (Playwright build 1193).
`npm run test:toolchain` checks these versions and launches Chromium; this is a
toolchain smoke test, not yet a browser integration test for generated modules.
Playwright is pinned in the npm lockfile, which determines the browser build.

## Build and run

```sh
rebar3 escriptize
_build/default/bin/beam2js input.beam output.mjs
node test/integration.mjs
npm run test:execution
```

In JavaScript, create a `Runtime` from `runtime/beam2js.mjs`, call the
generated module's `register(runtime)`, and invoke an exported function with
`runtime.invoke('module', 'function', args)`. Erlang integers are JavaScript
`bigint`s; use `runtime.atom('name')` for atoms and `runtime.float(number)` for
finite floats. Use `runtime.floatValue(term)` to retrieve a float, including
the sign of zero. `runtime.nil()` constructs the empty list, and
`runtime.cons(head, tail)` constructs a proper or improper cons cell;
`runtime.listHead(term)` and `runtime.listTail(term)` inspect a cons. Raw
JavaScript numbers and arrays are not Erlang terms. `runtime.tuple(elements)`
copies an array of Erlang terms into an immutable tuple; `tupleSize(term)` and
`tupleElement(term, index)` inspect it using a one-based index.
Register dependencies before
calling functions that use them. The generated module is host-independent;
the integration tests currently run only in Node.js.

The compiler currently requires host OTP 29 and uses its internal disassembler.
Moves, equality and ordering branches, selected type tests, jumps, tail calls
and returns support integers, floats, atoms, lists and tuples. List and tuple
construction, matching and extraction have partial instruction support.
Compiled literals can nest these supported types; a literal containing an
unsupported type, such as a map or binary, rejects the module.
Tagged tuple tests and selected value and tuple-arity branches are supported.
Supported source operands include type-tagged x registers: their hints are
ignored, not validated. Type-tagged y registers and type-tagged operands in
BEAM files missing their type table remain unsupported. Mixed or duplicate selection choices and
zero branch labels are rejected; tuple-arity branches require a tuple source.
The type tests include `is_integer`,
`is_number`, `is_atom`, `is_boolean`, `is_float`, `is_nil`, `is_list` and
`is_nonempty_list`, and `is_tuple`. Non-failing BIF instruction forms of the
seven applicable Erlang predicates return boolean atoms.
Nonzero-failure-label guard BIF instructions for `hd/1`, `tl/1`,
`length/1`, `tuple_size/1` and `element/2` branch on invalid arguments.
`length/1` traverses synchronously and may block the host event loop for long
lists. Their zero-label
exception forms and callable BIF dispatch remain unsupported.
The corresponding guard instructions for integer `band`, `bor`, `bxor` and
`bnot` also branch on non-integers; their exception forms are unsupported.
Integer `div` and `rem` guard instructions branch on non-integers or a zero
divisor; division truncates toward zero and remainder follows the dividend's
sign. Their exception forms are also unsupported.
OTP garbage collection, resource limits and scheduling effects are not reproduced.
Unsupported instructions and operand forms
reject the whole module, with a diagnostic; missing external functions fail at
invocation. New generated modules use runtime ABI 5; the runtime also accepts
existing ABI 1 through 4 modules. Integer-word heap checks are no-ops under
JavaScript GC; OTP memory exhaustion and scheduler effects are not reproduced.
Ordinary non-tail calls, other arithmetic, other terms, general BIF dispatch (including
`module_info`), processes, exceptions and scheduling are not implemented.
Do not use the compiler on untrusted BEAM files: OTP's disassembler can intern
atoms and decompress data before any resource limits are applied. The 32 MiB
input limit is not a security boundary. No producer-version or complete opcode
compatibility is claimed.

The images are pinned by digest, but Debian browser dependencies are installed
from package repositories and can change. The container is not a bit-for-bit
reproducible build.
