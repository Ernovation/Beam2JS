# Beam2JS design

## Goal and scope

Translate one compiled `.beam` module into one JavaScript ES module. The output
depends on a separately supplied JavaScript runtime and must work in both Node.js
and browsers; it does not embed the runtime or bundle other Erlang modules.
Erlang functions map to generated JavaScript functions, but execution must be
mediated by the runtime to preserve BEAM process and call semantics.

The long-term goal is to support all generic BEAM instructions accepted for
each explicitly supported input OTP release and runtime behavior comparable to
BEAM. This is a substantial compatibility project, not a claim that JavaScript
or garbage collection automatically implements BEAM semantics. The repository currently implements only the experimental subset described in
the [README](../README.md); the remainder of this document describes the target
design, not implemented behavior. Native code, operating-system services and
distributed Erlang require explicit compatibility decisions and cannot be
assumed available in a browser.

## Input and compatibility

Start with BEAM files produced by OTP 29.1.2 and the corresponding OTP tooling.
Do not require Erlang source, abstract code or debug information: stripped
modules must work. BEAM files are chunked containers; validate the container,
chunk sizes and padding, mandatory chunks, references, code header and
instruction operands before generating code. Interpret imports, exports,
literals, strings, lambda information and any other execution-relevant chunks;
preserve or explicitly handle relevant metadata such as `on_load` and line
information. Ignore only demonstrably non-semantic optional chunks; reject
unknown execution-affecting formats rather than guessing.

Use OTP's `beam_lib` for supported chunk access and investigate
`beam_disasm:file/1` for the first decoder. `beam_disasm` is an internal OTP
module, not a stable public format contract, and its own source warns that it
does not work with previous BEAM versions. Its output may normalize instructions,
so compare against the original generic opcode inventory rather than assuming a
one-to-one mapping. Isolate it behind a versioned adapter, with fixtures and an
independent inventory; replace or supplement it with a version-specific decoder
when necessary. Match the precise accepted input versions using tests, not just
the BEAM format number, which alone is insufficient to identify an opcode set.
Stripped files do not necessarily identify their producer release reliably, so
acceptance must be based on validated format and instruction capabilities, not
an assumption that a producer version can always be recovered. The published
matrix describes tested producers, not a provenance guarantee.
Reject unsupported formats, versions, instructions and operand forms with the
file, function, instruction location and reason where available; never emit a
silently incomplete module. Unknown non-semantic chunks may be skipped only
under a documented policy.

The opcode coverage ledger is derived from the exact OTP release's
[`genop.tab`](https://github.com/erlang/otp/blob/OTP-29.1.2/lib/compiler/src/genop.tab)
and distinguishes active and deprecated instructions, decoding, lowering,
runtime support and tested semantics. Test instructions used by real files as
well as operand and control-flow variants. Deprecated entries must be
explicitly rejected or supported according to the chosen input policy.
Additional OTP releases require their own checked-in compatibility evidence and
tests; no release is considered supported merely because its files parse.

## Compiler pipeline

1. Read a BEAM file with bounded resource use and report malformed input.
2. Decode chunks and generic instructions through a version-specific adapter.
   Resolve atom, literal, import, export, label and function references while
   retaining source locations and original instruction information.
3. Validate instruction forms, register and stack use, function boundaries,
   branch targets and exception regions. Build a control-flow graph and a
   typed intermediate representation with explicit failure edges, calls,
   continuations and suspension points.
4. Lower every accepted instruction to the IR or issue an actionable unsupported
   instruction error. Heap allocation hints may become no-ops only after their
   non-GC effects, including stack and register behavior, are preserved.
5. Emit deterministic, escaped JavaScript and a versioned runtime ABI marker.
   Write the complete output atomically only after successful compilation;
   failed compilation must not leave partial output or overwrite an existing
   output.

The planned command-line interface accepts an input BEAM and output path,
returns a nonzero exit status on errors and never implicitly links dependencies.
Exact command spelling and API names will be finalized with the first vertical
slice, rather than presented as implemented interfaces.

Treat BEAM input as potentially untrusted: enforce limits on file, chunk,
decompressed literal and term sizes and nesting; reject malformed references.
Avoid unbounded atom creation and unsafe deserialization. OTP helpers may intern
atoms or decompress data before application limits can be applied, so their
use requires an explicit safety review or isolation; `binary_to_term(...,
[safe])` alone is not a resource limit.

## JavaScript and runtime contract

Each generated ES module exposes a registration function that receives a
compatible runtime, registers the Erlang module's function table and metadata,
and does not automatically invoke user code. The runtime verifies the ABI
version. Names are encoded as data rather than interpolated as JavaScript
identifiers. The runtime resolves external calls by module, function and arity,
including dynamic calls and exported funs; missing modules/functions produce
Erlang-compatible errors. Registration and module loading, including `on_load`,
must have defined failure and ordering behavior.

Each Erlang function is represented by a generated JavaScript function with a
resumable entry point. Its control-flow blocks can be emitted as a program
counter and switch/loop. A process-owned frame contains live registers, stack
slots, program counter, exception handlers and continuation state. A generated
function executes a bounded segment and returns a tagged action to the
runtime: call, tail call, return, raise, yield or suspend. Non-tail calls save
a continuation; tail calls replace the current frame. The scheduler drives
actions without relying on the JavaScript call stack, allowing unbounded tail
recursion, exceptions across calls, selective receive, timeouts and fair
cooperative scheduling. Yield checks must also cover loops and long-running
runtime operations, not just function calls. The precise ABI is to be fixed and
tested in the first implementation slice.

The current ABI 25 slice stores each process's execution state and mailbox
separately and schedules bounded generated-instruction segments from a shared
queue. Receives suspend off the queue and resume on message delivery or a
monotonic receive timer. Local PID timer BIFs support relative delays and
cancellation; broader timer options and full OTP race semantics remain future work.
Configurable scheduler slots cooperate on one event loop, not parallel workers.
Before moving scheduling to workers, the runtime must define
exclusive process ownership and transfer, synchronized mailbox ordering,
module availability and term transport. In particular, the current WeakMap
term representations and opaque host handles cannot simply be shared across
worker realms. Runtime operations and host calls also need yield or isolation
strategies before responsiveness can be guaranteed.

The runtime owns:

- Erlang term representations, identity, exact and numeric equality, ordering,
  arbitrary-precision integers, floats, atoms, lists, tuples, maps, binaries,
  bitstrings, funs and external-term encoding where needed.
- BIFs and guard failure versus exceptions; `throw`, `error`, `exit`, stack
  traces and catch/try semantics.
- Isolated process state, PIDs, mailboxes, selective receive, timers,
  scheduling, links, monitors and exit signals. JavaScript GC replaces BEAM
  memory reclamation, not process isolation or message semantics.
- A module registry, function resolution and code-version lifetime rules;
  hot code loading must be implemented explicitly before it is claimed.
- Host adapters for I/O, clocks, randomness, networking and other platform
  capabilities, with explicit errors for unavailable operations. Ports, NIFs,
  drivers, distributed nodes and OS-dependent BIFs need documented adapters,
  emulation or explicit unsupported status, not silent substitutes.

Host JavaScript values are not automatically Erlang terms. The runtime defines
an explicit boundary for conversion, asynchronous host calls and exceptions.
The same generated module and core runtime should be portable across hosts.
The [term representation design](terms.md) describes the planned value
representations, comparison rules and host-boundary constraints.

## Verification and release criteria

The main oracle is differential execution against the exact supported OTP
release: compile fixtures to BEAM, execute them in OTP and execute their
translated output with the JavaScript runtime, then compare normalized Erlang
results, exceptions and observable effects. Cover stripped BEAM files, unusual
atoms, large integers, control flow, failure edges, recursion, funs, binaries,
process interactions and malformed inputs. Include generated/randomized cases
and real modules. Use bounded timeouts and deterministic clock/scheduling
controls where ordering is under test; concurrency tests compare allowed
outcomes rather than assuming an arbitrary scheduler order.

Track opcode and operand-form coverage separately from end-to-end feature
coverage. Test both Node.js and a real browser, including identical emitted
modules. Maintain a release-specific compatibility matrix listing supported
instructions, BIFs, OTP libraries, platforms and known differences. A release
may claim full compatibility for an input release only once its inventory,
runtime features and differential suite justify that claim.

## References

- [The BEAM Book: modules and file format](theBeamBook/chapters/beam_modules.asciidoc)
- [The BEAM Book: generic instructions](theBeamBook/chapters/beam_instructions.asciidoc)
- [OTP 29.1.2 disassembler source](https://github.com/erlang/otp/blob/OTP-29.1.2/lib/compiler/src/beam_disasm.erl)
- [OTP beam_lib documentation](https://www.erlang.org/doc/apps/stdlib/beam_lib.html)

The book is useful conceptual background; release-specific OTP source and
behavior take precedence where it is dated or differs.
