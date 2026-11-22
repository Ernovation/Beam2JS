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

### Sudoku example

The [Sudoku solver](examples/sudoku/sudoku.erl) is a pure Erlang backtracking
example that works with the supported subset. To compile and run its sample:

```sh
rebar3 escriptize
mkdir -p _build/sudoku
erlc -o _build/sudoku examples/sudoku/sudoku.erl
_build/default/bin/beam2js _build/sudoku/sudoku.beam _build/sudoku/sudoku.mjs
node examples/sudoku/run.mjs
```

`sudoku:solve/1` takes nine rows of nine integers, with `0` for an empty cell.
It returns `{ok, Grid}` for the first solution, `invalid` for malformed input
or conflicting clues, and `unsolvable` for a valid puzzle with no solution.
It does not check whether the solution is unique. The sample prints:

```text
5 3 4 6 7 8 9 1 2
6 7 2 1 9 5 3 4 8
1 9 8 3 4 2 5 6 7
8 5 9 7 6 1 4 2 3
4 2 6 8 5 3 7 9 1
7 1 3 9 2 4 8 5 6
9 6 1 5 3 7 2 8 4
2 8 7 4 1 9 6 3 5
3 4 5 2 8 6 1 7 9
```

The example's `runtime.invoke` is synchronous and may block the event loop,
especially for difficult puzzles. `npm run test:sudoku` compares the solver
with OTP and checks normal and stripped modules in Node and Chromium.

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

`erlang:make_ref/0` and `runtime.makeRef()` create opaque immutable references,
unique across processes and `Runtime` instances sharing the same runtime module.
`is_reference/1` and reference type tests are supported. References remain valid
after a process exits and can be passed in terms and messages. Their local
ordering is implementation-defined; distributed references and serialization
are not supported.

Each process starts with an empty process dictionary. `erlang:get/0,1`,
`get_keys/0,1`, `put/2` and `erase/0,1` read or update only the calling
process's dictionary; a spawned child does not inherit it. Keys and value
filters use exact term equality. Missing keys return `undefined`, which can
also be a stored value; list results have unspecified order. Dictionaries are
discarded when a process exits. Operations and comparisons scan synchronously
and may block the host for large dictionaries or terms.

`erlang:process_info/2` accepts a local PID and `messages`,
`message_queue_len`, `dictionary`, `{dictionary, Key}`, `registered_name` or
`status`, or a proper list of these items. Results are snapshots, and list
results preserve item order and duplicates. An unregistered process returns
`[]` for the single `registered_name` item and `{registered_name, []}` when
that item is in a list. A dead local PID returns `undefined`; invalid PIDs
and item specifications raise `badarg`. Other valid OTP 29.1.2 items produce
a host diagnostic for live processes. Status describes this cooperative
scheduler (`running`, `runnable` or `waiting`); OTP cross-scheduler signals
and `process_info/1` are unsupported. Snapshot construction is synchronous.

For ABI 26 modules, unmatched function, case, match and if clauses throw an
exported `ErlangError` at the JavaScript boundary. Its `erlangClass` is the
string `"error"` and `reason` is an Erlang term: `function_clause`,
`{case_clause, Value}`, `{badmatch, Value}`, `if_clause`, `badarg`,
`badarith` or `timeout_value` for the supported error paths. It propagates
through supported local and external calls without wrapping JavaScript errors.
This does not implement Erlang catch/try, other exception classes or Erlang
stack traces.

### Cooperative processes

The host can schedule independent executions without blocking on `invoke`:

```js
const runtime = new Runtime({schedulers: 2, reductionLimit: 1000});
// Register generated modules before starting processes.
const process = runtime.spawnProcess('module', 'function', [1n]);
runtime.sendMessage(process, runtime.atom('hello'));
const pending = runtime.processMailbox(process);
const result = await process.result;
```

`spawnProcess` returns a host handle whose `pid` is the process's opaque Erlang
PID term. Its `result` promise
resolves with the returned term or rejects with the original Erlang or host
error. Each process owns its registers, frames and FIFO mailbox;
`processMailbox` returns a snapshot, not a way to consume messages. Messages
must be supported terms, and sending to a terminated process or using a handle
from another runtime throws. `erlang:self/0` returns the current process's PID;
`is_pid/1` and PID type tests are supported. Each synchronous `invoke` also
uses a distinct process identity, which remains a valid term after it returns.
`erlang:is_process_alive/1` returns a boolean atom for a local PID and raises
`badarg` for a non-PID or a PID from another runtime. The host can use
`runtime.isProcessAlive(pid)` to obtain a JavaScript boolean.
`erlang:spawn(Module, Function, Args)` schedules a local child and returns its
PID. Module and function must be atoms and Args a proper list, otherwise it
raises `badarg` in the parent. The child executes an exported function, with
its own PID and process state. A missing or private target, or more than 255
arguments, fails asynchronously in the child with a host diagnostic; OTP
`undef` exceptions are not yet modeled. Argument-list traversal is synchronous.
The host can retrieve a scheduled process's handle with
`runtime.processHandle(pid)`, including after it terminates. A synchronous
`invoke` PID or a PID from another runtime has no such handle.

Erlang-spawned child failures are logged by default. To report them elsewhere,
pass `onProcessError: (pid, error) => ...` to `Runtime`; it receives the
original error. A throwing callback produces an unhandled promise rejection.
Host-created `spawnProcess` failures remain observable through `result`.
PIDs remain valid after termination and may be passed in terms or messages,
but `sendMessage` requires the host handle, not a PID.
`erlang:register/2`, `unregister/1`, `whereis/1` and `registered/0` support
local process names. Each `Runtime` has its own registry; a live local process
can have at most one name, and a name is removed when the process exits.
`undefined` cannot be registered. Missing names return `undefined` from
`whereis/1`; invalid registrations and unregistrations raise `badarg`.
`registered/0` returns a list in unspecified order. Registered ports and
distributed registries are unsupported.

Erlang `Destination ! Message`, `erlang:'!'/2` and `erlang:send/2` append
supported terms to a live local PID or registered name's mailbox and return the message. Messages
from one sender retain their order; sending to a terminated local PID returns
the message without delivery. Invalid destinations, including unregistered
atoms, raise `badarg`.
Name/node tuples and non-local PIDs are not supported and raise a host diagnostic rather than being
silently dropped.
PID ordering is an implementation-defined local order; node identity, PID
serialization and distributed PIDs are not supported.

For supported matches and guards, indefinite selective `receive` scans the mailbox in order, removes the first
matching message and preserves unmatched messages for later receives. A
scheduled process suspends without consuming scheduler time when no message
matches, and wakes when a message arrives. It remains alive while waiting.
`invoke` can consume messages already sent to itself, but throws a host error
if it would have to wait. `receive ... after` accepts 0 through 4294967295
milliseconds or `infinity`; other values raise `timeout_value` if no message
matches. A timeout does not restart on unmatched messages, and a match cancels
it. The initial mailbox scan precedes starting the timer.

Receive timers use a monotonic clock and host callbacks; they can fire late if
the event loop is busy. When a message wakes a process before the timeout
callback, pending messages are scanned first. If the timeout callback wakes a
waiting process first, the timeout branch wins and later messages remain queued.
The optional `clock` runtime option supplies `now()`, `setTimeout(callback, ms)`
and `clearTimeout(handle)` for testing or host integration. `now()` must return
a finite, nondecreasing millisecond count; `setTimeout` must return a handle
and invoke its callback asynchronously at most once. Clock callback failures
reject the affected process for receive timers. An indefinitely waiting process
without a timer does not keep the host event loop alive. Receive markers and
monitors are not supported.

`erlang:send_after/3` and `erlang:start_timer/3` schedule a message to a local
PID or name and return a reference. `start_timer/3` sends `{timeout, Ref, Message}`;
`send_after/3` sends the message itself. The four-argument forms accept `[]`
or a list of `{abs, Boolean}` options; the last option wins. A final
`{abs, true}` interprets the first argument as an absolute monotonic deadline
in milliseconds; past deadlines fire asynchronously as soon as possible.
`erlang:monotonic_time/0` and `/1` read the same clock, so
`erlang:monotonic_time(millisecond)` can be used to construct deadlines.
The clock origin is host-dependent, not OTP or Unix time. `/0` uses a nominal
nanosecond native unit, and `/1` accepts `native`, `perf_counter`, `second`,
`millisecond`, `microsecond`, `nanosecond`, their deprecated plural aliases,
or a positive integer number of units per second; conversions round down.
Clock readings are quantized to nanoseconds, but actual precision is limited
by the host clock and JavaScript numbers. Clock values must have a safe-integer
millisecond floor for these operations. Absolute deadlines must be safe
integers and no more than 4294967295 milliseconds ahead; unsupported values
produce host diagnostics. `erlang:read_timer/1` and
`erlang:cancel_timer/1` return remaining milliseconds or `false`. A timer is
addressed to a PID and automatically canceled when that process exits, not when
its creator exits. A timer addressed to a name resolves the name on expiry;
it survives process termination and drops its message if the name is unregistered.
Timers use the same clock adapter and may fire late; clock errors in timer
callbacks are thrown to the host. Supported relative delays are 0 through
4294967295 milliseconds. Larger delays produce host diagnostics, even where OTP
accepts them. `read_timer/2` accepts `{async, Boolean}` and `cancel_timer/2`
accepts `{async, Boolean}` and `{info, Boolean}` in a proper options list.
Invalid options raise `badarg`.
Asynchronous calls return `ok` and, when info is enabled, send
`{read_timer, Ref, Result}` or `{cancel_timer, Ref, Result}` to the caller.
With `{info, false}`, cancellation returns `ok` and sends no reply.
The cooperative runtime performs these operations and queues replies immediately;
cross-scheduler timing is not reproduced. Distributed destinations remain
unsupported.

The positive integer options `schedulers` and `reductionLimit` default to 1
and 1000. Scheduler slots share a runnable queue and cooperate on one
JavaScript event loop; they do **not** run in parallel or use workers. Generated
instructions yield after a bounded number of steps; this is not an OTP reduction
count. Synchronous host calls and runtime operations such as list traversal, comparisons, binary slicing,
mailbox removal and big-integer arithmetic may still block. `invoke` remains synchronous and
does not yield. Supported immutable terms are shared between processes;
host handles still expose potentially mutable JavaScript objects and do not
provide process isolation. Worker transport, actual parallel schedulers,
process cancellation and full OTP scheduling semantics remain future work.

The compiler currently requires host OTP 29 and uses its internal disassembler.
Moves, equality and ordering branches, selected type tests, jumps, calls
and returns support integers, floats, atoms, lists, tuples, bitstrings, local PIDs and references. List and tuple
construction, matching and extraction have partial instruction support.
`put_tuple2` constructs immutable tuples into ordinary x or y registers,
including when an element aliases the destination; y destinations require an
allocated stack slot. `get_tuple_element` likewise accepts x or y destinations,
including an aliased source and destination. `get_list` accepts distinct x or
y head and tail destinations, including a source that aliases either destination.
`put_list` constructs a cons into an ordinary x or y register, including when
either or both operands alias the destination. `get_hd` and `get_tl` likewise
accept x or y destinations, including an aliased source.
Compiled literals can nest the supported literal types; a literal containing an
unsupported type, such as a map, rejects the module. Binary and partial-byte
bitstring literals are supported, including nested literals, equality and
ordering. General dynamic binary/bitstring construction, matching, other
slicing instructions and other callable binary BIFs remain unsupported.
Tagged tuple tests and selected value and tuple-arity branches are supported.
Supported source operands include type-tagged x and y registers: their hints
are ignored, not validated, and y registers require an allocated slot.
Type-tagged operands in BEAM files missing their type table remain unsupported.
The zero-label `=:=/2` BIF instruction returns a boolean atom using exact
equality and supports ordinary x or y destinations, including aliased operands;
callable `erlang:'=:='/2` dispatch is not supported. Mixed or duplicate selection choices and
zero branch labels are rejected; tuple-arity branches require a tuple source.
The type tests include `is_integer`,
`is_number`, `is_atom`, `is_boolean`, `is_float`, `is_nil`, `is_list` and
`is_nonempty_list`, `is_tuple`, `is_binary`, `is_bitstr`, `is_pid` and `is_reference`. A binary has a
bit length divisible by eight; `is_bitstr` accepts all bitstrings.
Non-failing BIF instruction forms of the eleven applicable Erlang predicates,
including `is_binary/1`, `is_bitstring/1`, `is_pid/1` and `is_reference/1`, return boolean atoms.
They support ordinary x or y destinations, including an aliased source.
These eleven predicates are also callable as `erlang` functions through external
calls or `runtime.invoke`, for the supported term types.
Nonzero-failure-label guard BIF instructions for `hd/1`, `tl/1`,
`length/1`, `tuple_size/1` and `element/2` branch on invalid arguments.
Their zero-label and callable forms raise `badarg` on invalid arguments.
The `hd/1`, `tl/1`, `tuple_size/1`, `element/2` and `length/1` instruction
forms support ordinary x or y destinations, including aliased source operands;
failed guards leave their destinations unchanged.
`length/1` traverses synchronously and may block the host event loop for long
lists.
Nonzero-label `bit_size/1` and `byte_size/1` guard instructions accept
bitstrings and branch on other terms. `byte_size/1` rounds partial bytes up;
zero-label forms raise `badarg` on non-bitstrings. Both instruction forms
support x or y destinations, including an aliased source, without writing on
guard failure.
The nonzero-label `binary_part/2` and `binary_part/3` guard instructions
slice binaries using zero-based byte positions; the former takes a
`{Position, Length}` tuple. Negative lengths select bytes before the position.
Invalid inputs or ranges branch in guards or raise `badarg` in zero-label forms.
Both instruction arities support x or y destinations, including aliased
operands; failed guards leave the destination unchanged.
`bit_size/1`, `byte_size/1` and both `binary_part` arities are also callable,
raising `badarg` for invalid inputs. These callable BIFs, the list and tuple BIFs,
and predicates take precedence over registered `erlang` functions of the same
name and arity. Other callable BIFs are limited to `self/0`,
`is_process_alive/1`, `process_info/2`, `spawn/3`, `send/2`, `!/2`, `make_ref/0`,
the local process dictionary, registry and timer BIFs above and the numeric BIFs described below.
Slices copy synchronously and may block the host event loop.
The corresponding guard instructions for integer `band`, `bor`, `bxor` and
`bnot` also branch on non-integers; their zero-label forms raise `badarith`.
Both forms support x or y destinations, including aliased operands; failed
guards leave the destination unchanged.
Integer `div` and `rem` guard instructions branch on non-integers or a zero
divisor; division truncates toward zero and remainder follows the dividend's
sign. Their zero-label forms raise `badarith` on invalid inputs or zero divisors.
Both forms support x or y destinations, including aliased operands; failed guards
leave the destination unchanged.
Unary negation and binary `+`, `-` and `*` guard instructions support integer,
float and mixed operands, branching on non-numbers or floating-point overflow.
Binary `/` guard instructions always produce a float; they branch on
non-numbers, zero divisors, integer-to-float conversion overflow or float
result overflow. Their zero-label instruction forms instead raise `badarith`.
These arithmetic operators are also callable as `erlang` BIFs and raise
`badarith` for the same invalid inputs.
These binary guard and zero-label instructions support x or y destinations,
including aliased operands; failed guards leave the destination unchanged.
Unary negation instructions have the same destination and guard-failure behavior.
Floating-register `fconv`, `fmove`, `fadd`, `fsub`, `fmul`, `fdiv` and
`fnegate` support ordinary floating-point expressions. Arithmetic overflow
raises `badarith`, and floating registers do not survive calls. Register
initialization is checked at runtime, but full BEAM validation is not implemented.
The `abs/1` guard preserves the integer or float type and
turns negative float zero into positive zero; non-numbers branch.
Nonzero-label `trunc/1`, `round/1`, `floor/1` and `ceil/1` instructions return
integers, with `round/1` rounding ties away from zero. Non-numbers branch.
The `float/1` guard preserves floats and converts integers to binary64,
branching on non-numbers or conversion overflow.
Guard and zero-label instructions for all six numeric BIFs support x or y
destinations, including an aliased source, without writing on guard failure.
Their zero-label forms and callable `erlang` functions raise `badarg` for
non-numbers or conversion overflow. These six callable BIFs take precedence
over registered `erlang` functions of the same name and arity.
OTP garbage collection, resource limits and scheduling effects are not reproduced.
Unsupported instructions and operand forms
reject the whole module, with a diagnostic; missing external functions fail at
invocation. The runtime accepts only the current ABI 26; recompile modules
generated for earlier ABIs. Integer-word and supported allocation-list `test_heap` checks are no-ops under
JavaScript GC; OTP memory exhaustion and scheduler effects are not reproduced.
Local and external non-tail calls use explicit continuations and stack slots;
the supported frame instructions are `allocate`, integer-word `allocate_heap`,
`deallocate`, `init_yregs`, `trim`, `call_last`, and `call_ext_last`, plus
moves and swaps involving ordinary y registers. `init_yregs` clears its slots
to nil; `trim` discards low-index slots and renumbers the rest. OTP validation
does not permit reading initialized-but-unassigned slots as terms; Beam2JS
does not yet perform full register validation. Type-tagged y registers and
other frame instructions are unsupported. Calls made through `invoke` run synchronously.
Other arithmetic, other terms, general BIF dispatch (including
`module_info`), general exception handling and full OTP process and scheduling semantics are not implemented.
Do not use the compiler on untrusted BEAM files: OTP's disassembler can intern
atoms and decompress data before any resource limits are applied. The 32 MiB
input limit is not a security boundary. No producer-version or complete opcode
compatibility is claimed.

The images are pinned by digest, but Debian browser dependencies are installed
from package repositories and can change. The container is not a bit-for-bit
reproducible build.
