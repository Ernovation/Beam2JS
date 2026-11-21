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
npm run test:browser
```

### Browser demo

From the repository root, build and serve the example:

```sh
rebar3 escriptize
mkdir -p _build/browser
erlc -o _build/browser examples/browser/browser_demo.erl
_build/default/bin/beam2js _build/browser/browser_demo.beam examples/browser/browser_demo.mjs
python3 -m http.server 8000
```

Open `http://localhost:8000/examples/browser/`. The compiled Erlang function
looks up the page element and calls a JavaScript-backed `dom` module to append
text. Browser errors are reported in the developer console.

The example adapter exposes only synchronous `dom:element_by_id/1` and
`dom:append_text/2`: text arguments are UTF-8 binaries, and `append_text`
returns `ok`. Missing elements, invalid UTF-8, invalid handles and DOM errors
throw JavaScript errors; Erlang exception handling is not implemented. This is
not a general JavaScript method, property or callback API.

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
`runtime.bitstring(bytes, bitLength)` copies an array or `Uint8Array` of
bytes, with bits in most-significant-bit-first order. The byte count must equal
`ceil(bitLength / 8)`; unused low bits are cleared. `isBitstring(term)`,
`bitstringSize(term)` and `bitstringBytes(term)` inspect it; the latter returns
a copy. A binary is a bitstring with a bit length divisible by eight.
Register dependencies before calling functions that use them. The generated
modules run in Node and browsers. See `examples/browser/dom.mjs` for a
JavaScript-backed module.

`runtime.hostHandle(object)` wraps a JavaScript object or function as a
distinct opaque term; `runtime.hostValue(handle)` unwraps it only in the
owning runtime. Wrapping the same object in one runtime preserves identity.
Handles can be passed inside Erlang terms and compared by identity; their
ordering is an implementation-defined extension, not Erlang reference order.
They are not Erlang references and do not implement `is_reference/1`. A live
handle retains its object; there is no explicit release API. Raw JavaScript
objects remain invalid terms. The adapter exposes the supplied document as a
capability and accepts only elements it looked up itself.

The compiler currently requires host OTP 29 and uses its internal disassembler.
Moves, equality and ordering branches, selected type tests, jumps, calls
and returns support integers, floats, atoms, lists, tuples and bitstrings. List and tuple
construction, matching and extraction have partial instruction support.
Compiled literals can nest these supported types; a literal containing an
unsupported type, such as a map, rejects the module. Binary and partial-byte
bitstring literals are supported, including nested literals, equality and
ordering. General dynamic binary/bitstring construction, matching, slicing
instructions and callable BIF dispatch remain unsupported.
Tagged tuple tests and selected value and tuple-arity branches are supported.
Supported source operands include type-tagged x registers: their hints are
ignored, not validated. Type-tagged y registers and type-tagged operands in
BEAM files missing their type table remain unsupported. Mixed or duplicate selection choices and
zero branch labels are rejected; tuple-arity branches require a tuple source.
The type tests include `is_integer`,
`is_number`, `is_atom`, `is_boolean`, `is_float`, `is_nil`, `is_list` and
`is_nonempty_list`, `is_tuple`, `is_binary` and `is_bitstr`. A binary has a
bit length divisible by eight; `is_bitstr` accepts all bitstrings.
Non-failing BIF instruction forms of the nine applicable Erlang predicates,
including `is_binary/1` and `is_bitstring/1`, return boolean atoms.
Nonzero-failure-label guard BIF instructions for `hd/1`, `tl/1`,
`length/1`, `tuple_size/1` and `element/2` branch on invalid arguments.
`length/1` traverses synchronously and may block the host event loop for long
lists. Their zero-label
exception forms and callable BIF dispatch remain unsupported.
Nonzero-label `bit_size/1` and `byte_size/1` guard instructions accept
bitstrings and branch on other terms. `byte_size/1` rounds partial bytes up;
zero-label exception forms are unsupported.
The nonzero-label `binary_part/2` and `binary_part/3` guard instructions
slice binaries using zero-based byte positions; the former takes a
`{Position, Length}` tuple. Negative lengths select bytes before the position.
Invalid inputs or ranges branch. Slices copy synchronously and may block the
host event loop; zero-label forms are unsupported.
The corresponding guard instructions for integer `band`, `bor`, `bxor` and
`bnot` also branch on non-integers; their exception forms are unsupported.
Integer `div` and `rem` guard instructions branch on non-integers or a zero
divisor; division truncates toward zero and remainder follows the dividend's
sign. Their exception forms are also unsupported.
Unary negation and binary `+`, `-` and `*` guard instructions support integer,
float and mixed operands, branching on non-numbers or floating-point overflow.
Binary `/` guard instructions always produce a float; they branch on
non-numbers, zero divisors, integer-to-float conversion overflow or float
result overflow. The `abs/1` guard preserves the integer or float type and
turns negative float zero into positive zero; non-numbers branch.
Nonzero-label `trunc/1`, `round/1`, `floor/1` and `ceil/1` instructions return
integers, with `round/1` rounding ties away from zero. Non-numbers branch.
The `float/1` guard preserves floats and converts integers to binary64,
branching on non-numbers or conversion overflow.
Zero-label exception forms are unsupported.
OTP garbage collection, resource limits and scheduling effects are not reproduced.
Unsupported instructions and operand forms
reject the whole module, with a diagnostic; missing external functions fail at
invocation. New generated modules use runtime ABI 15; the runtime also accepts
existing ABI 1 through 14 modules. Integer-word heap checks are no-ops under
JavaScript GC; OTP memory exhaustion and scheduler effects are not reproduced.
Local and external non-tail calls use explicit continuations and stack slots;
the supported frame instructions are `allocate`, integer-word `allocate_heap`,
`deallocate`, `init_yregs`, `trim`, `call_last`, and `call_ext_last`, plus
moves and swaps involving ordinary y registers. `init_yregs` clears its slots
to nil; `trim` discards low-index slots and renumbers the rest. OTP validation
does not permit reading initialized-but-unassigned slots as terms; Beam2JS
does not yet perform full register validation. Type-tagged y registers and
other frame instructions are unsupported. Calls run synchronously without yielding.
Other arithmetic, other terms, general BIF dispatch (including
`module_info`), processes, exceptions and scheduling are not implemented.
Do not use the compiler on untrusted BEAM files: OTP's disassembler can intern
atoms and decompress data before any resource limits are applied. The 32 MiB
input limit is not a security boundary. No producer-version or complete opcode
compatibility is claimed.

The images are pinned by digest, but Debian browser dependencies are installed
from package repositories and can change. The container is not a bit-for-bit
reproducible build.
