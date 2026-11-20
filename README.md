# Beam2JS

Beam2JS translates a small subset of compiled Erlang BEAM modules to JavaScript
ES modules for execution with its JavaScript runtime. This is an experimental
first slice, **not** a general-purpose Erlang implementation.

See the [design](docs/design.md) and [implementation plan](docs/plan.md).
The [OTP 29.1.2 opcode ledger](docs/opcodes-otp-29.1.2.md) tracks the initial
raw instruction inventory and its current verification gaps.
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
```

In JavaScript, create a `Runtime` from `runtime/beam2js.mjs`, call the
generated module's `register(runtime)`, and invoke an exported function with
`runtime.invoke('module', 'function', args)`. Erlang integers are JavaScript
`bigint`s; use `runtime.atom('name')` for atoms. Register dependencies before
calling functions that use them. The generated module is host-independent;
the integration tests currently run only in Node.js.

The compiler currently requires host OTP 29 and uses its internal disassembler.
Only moves, exact-equality branches, jumps, tail calls and returns over integer
and atom operands are implemented. Unsupported instructions reject the whole
module, with a diagnostic; missing external functions fail at invocation.
Ordinary non-tail calls, arithmetic, other terms, BIFs (including
`module_info`), processes, exceptions and scheduling are not implemented.
Do not use the compiler on untrusted BEAM files: OTP's disassembler can intern
atoms and decompress data before any resource limits are applied. The 32 MiB
input limit is not a security boundary. No producer-version or complete opcode
compatibility is claimed.

The images are pinned by digest, but Debian browser dependencies are installed
from package repositories and can change. The container is not a bit-for-bit
reproducible build.
