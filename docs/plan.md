# Implementation plan

This is a roadmap, not a claim of implemented compatibility. The current
experimental compiler and runtime support only the small subset described in
the [README](../README.md). In particular, they do not yet implement normal
calls, general BIF dispatch, processes or a scheduler.

Work through the phases in order: each builds on earlier foundations. The
opcode and BIF inventories are maintained throughout, rather than postponing
coverage tracking until the end. Each phase should leave the project runnable
and reject unsupported cases explicitly.

## Shared completion rules

For each feature or instruction family:

- [ ] Record its release-specific status in the compatibility matrix, including
  operand forms, lowering, runtime support, tests and known limitations.
- [ ] Differentially test results, exceptions and relevant effects against the
  exact OTP release, including success, failure and edge cases. Test stripped
  BEAM input and representative compiler-generated modules.
- [ ] Run the same generated modules in Node.js and a real browser when the
  feature is host-independent. Bound test execution time.
- [ ] Provide actionable diagnostics for unsupported input or capabilities;
  failed compilation must not overwrite an existing output or leave a partial
  output.
- [ ] Document supported behavior and limitations without claiming that an
  instruction, BIF or OTP release is supported just because it decodes.

## Phase 1: Baseline, inventory and test infrastructure

**Goal:** Know precisely what needs to be implemented and make progress
measurable.

- [x] Pin and record the tested OTP producer/tooling version, Node.js and
  browser versions. Start with OTP 29.1.2 as described in the
  [design](design.md).
- [ ] Derive an independent generic opcode ledger from that release's
  `genop.tab`. Record active and deprecated instructions, operand and control
  flow variants, and status for decoding, validation, lowering, runtime
  semantics and tests. Do not equate disassembler output with raw opcodes:
  the disassembler can normalize instructions. The
  [initial OTP 29.1.2 ledger](opcodes-otp-29.1.2.md) inventories all opcode
  identities and selected operand and control-flow variants. It records OTP
  29.1.2's obsolete-opcode loader policy and compact operand encoding, with
  raw guard tests including x/y and type-tagged registers and a stripped
  compiler-generated fixture, raw control-flow, selection-list and selected BIF
  forms, and representative obsolete loader tests. It also records the
  disassembler's missing-type-table limitation. Full per-instruction operand
  encodings and many historical forms remain unverified.
- [ ] Inventory BIFs by module/name/arity and category, including guard
  behavior, exceptions, side effects, host dependencies and implementation
  status. Distinguish BIFs from ordinary functions implemented by OTP modules.
  The [initial OTP 29.1.2 inventory](bifs-otp-29.1.2.md) records the release
  table, selected runtime and compiler classifications, and tested behavior
  for several list, tuple, map, arithmetic, binary and process BIFs. Most individual
  effects, exceptions, host dependencies and other built-ins still need investigation.
- [ ] Establish a compatibility matrix for instructions, BIFs, OTP libraries,
  input releases and hosts. Record currently supported and unsupported cases.
- [ ] Build a reusable OTP-vs-JavaScript differential harness, including
  canonical term/exception comparison, fixture compilation, stripped files,
  timeouts and deterministic test controls. Run it in Node and a real browser
  in CI.
- [ ] Add malformed-input, deterministic-output, unsupported-instruction and
  output-preservation regression tests.

**Done when:** Every opcode and inventoried BIF has an explicit initial status,
the existing slice is covered by the harness, and both host test paths run.

## Phase 2: BEAM decoding, validation and compiler pipeline

**Goal:** Make the compiler a reliable foundation for adding instructions.

- [ ] Isolate the internal OTP disassembler behind a versioned adapter; compare
  it with the original opcode stream and supplement or replace it when it
  loses information needed for correct lowering or validation.
- [ ] Validate the BEAM container, chunks, padding, code header, instruction
  operands and references. Decode execution-relevant atoms, literals, imports,
  exports, strings, lambdas and metadata without requiring debug information.
- [ ] Define how unknown chunks and unsupported formats are handled. Reject
  execution-affecting formats and instructions that cannot be interpreted
  correctly; report the file, function and instruction location when available.
- [ ] Build a control-flow graph and typed IR with explicit registers, stack
  slots, branches, failure edges, calls, exceptions and suspension points.
  Validate labels, function boundaries and applicable register/stack rules.
- [ ] Emit deterministic, escaped JavaScript with a versioned runtime ABI.
  Preserve atomic output replacement and diagnostics.
- [ ] Define input, chunk, nesting and decompression limits. Audit or isolate
  OTP helpers that can intern atoms or decompress before limits apply; keep the
  untrusted-input warning until the complete path is safe.

**Done when:** Supported fixtures, including stripped files, pass through the
validated pipeline; malformed and unsupported cases fail predictably; no
untrusted-input safety claim is made without tests and a completed audit.

## Phase 3: Fundamental Erlang terms and comparisons

**Goal:** Establish term semantics that instructions and BIFs can share.

- [ ] Define runtime representations and host-boundary conversions for atoms,
  arbitrary-precision integers, floats, the empty list, cons cells and tuples.
  Preserve Erlang value semantics rather than exposing mutable host objects.
- [ ] Implement exact and numeric equality, ordering, type tests and numeric
  operations for the supported terms, including integer/float edge cases.
  Nonzero-label integer bitwise guard instructions support `band`, `bor`,
  `bxor` and `bnot`. Integer `div` and `rem`, unary negation, binary
  `+`, `-`, `*` and `/`, and `abs/1`, `trunc/1`, `round/1`, `floor/1`,
  `ceil/1` and `float/1` guard instructions also support nonzero labels;
  arithmetic and exception forms remain incomplete.
- [ ] Lower the corresponding literal, move, test, comparison, branch, list and
  tuple instructions, including guard-failure versus exception behavior.
  Nested literals containing the implemented term types, including binary and
  partial-byte bitstring values, are supported;
  unsupported literal values still reject the module. Tagged tuple matching
  and selected value and tuple-arity branches are also supported. Type-tagged
  x-register sources are read without validating their hints; y registers and
  type-tagged operands without the disassembler's required type table remain
  unsupported. Selected `hd`, `tl`, `length`, `tuple_size`, `element`,
  `bit_size` and `byte_size` guard
  BIF instructions branch on invalid input; their exception forms are unsupported.
  `is_binary` and `is_bitstr` test instructions distinguish byte-sized
  binaries from other bitstrings.
  Length traversal is synchronous and does not yield to a scheduler.
- [ ] Test unusual atoms, large and negative integers, float boundaries,
  improper lists, nested terms, matching and failed guards against OTP.

**Done when:** Supported terms and operations agree with OTP across successful
and failing cases; unsupported term types still fail explicitly.

## Phase 4: Resumable execution, calls and exceptions

**Goal:** Execute ordinary Erlang functions without depending on the JavaScript
call stack and provide the control-flow foundation for concurrency.

- [ ] Replace the current synchronous tail-call-only execution with
  process-owned frames, program counters, registers, stack slots and
  continuations. Define versioned actions for calls, tail calls, returns,
  raises, yields and suspensions.
- [ ] Lower local and external non-tail calls, tail calls, returns, stack/frame
  instructions and applicable allocation instructions. Preserve effects other
  than garbage collection.
- [ ] Implement exception classes, reasons and propagation, including
  `throw`, `error`, `exit`, catch/try regions and stack traces. Distinguish
  Erlang exceptions from host JavaScript failures.
- [ ] Implement function-clause, bad-match, case-clause, bad-argument and
  undefined-function failure behavior as the corresponding paths are added.
- [ ] Add reduction/yield checkpoints to calls, loops and potentially
  long-running runtime operations, ready for a scheduler.

**Done when:** Nested local/external calls, deep recursion, tail recursion,
guard failures and cross-call exceptions match OTP without overflowing the
JavaScript stack.

## Phase 5: Core BIFs and ordinary language programs

**Goal:** Support a useful, prioritized set of pure and process-independent
BIFs.

- [ ] Implement a BIF dispatch mechanism keyed by module, name and arity,
  including compiler-emitted specialized BIF instructions and guard forms.
  Preserve exact return values, error classes/reasons and guard failure rules.
  Nine non-failing type-predicate BIF instruction forms and selected
  list/tuple, binary, integer bitwise and selected arithmetic guard BIF instructions are supported for the
  existing term subset; callable BIF dispatch remains unimplemented.
- [ ] Implement and test common type predicates, arithmetic and bitwise
  operations, comparisons, tuple/list operations, atom and number conversions,
  and relevant binary operations as their term support becomes available.
- [ ] Implement dynamic `apply`/function resolution and the supported portions
  of module introspection, including `module_info`, rather than treating BIFs
  as ordinary missing external modules.
- [ ] Prioritize further BIFs using the inventory and actual fixture/application
  usage. Mark host-dependent or unavailable operations explicitly.
- [ ] Run representative pure Erlang modules and selected OTP library
  functions, recording missing BIFs and instructions as actionable gaps.

**Done when:** The published core BIF set passes differential success, guard,
error and boundary tests, and representative non-concurrent programs run.

## Phase 6: Compound terms, matching and functions

**Goal:** Cover the data structures and dynamic functions used by typical
Erlang programs.

- [ ] Implement maps, binaries and bitstrings, including construction, matching,
  updates, sizes, alignment and failure paths; cover relevant generic opcodes.
  Binary and partial-byte bitstring literals, comparisons, type tests and
  nonzero-label size guards and `binary_part/2` and `/3` guard slicing are supported;
  general construction, matching, slicing instructions and callable BIF
  dispatch are not.
- [ ] Implement funs, closures and captured environments, exported funs,
  indirect calls and arity checks; retain required module/lambda metadata.
- [ ] Complete comparison, ordering, exact map-key behavior and host conversion
  for the newly supported types. Preserve immutable Erlang term semantics.
- [ ] Support external term encoding/decoding where needed, with explicit
  resource limits and a documented safe-input policy.
- [ ] Add differential tests for nested terms, bit-level boundaries, malformed
  data, matching failures, closures and dynamic calls.

**Done when:** Representative programs using each supported compound type and
fun form match OTP, including failures and term comparisons.

## Phase 7: Processes and cooperative scheduling

**Goal:** Run independent Erlang processes fairly on a JavaScript host.

- [ ] Implement PID identity, process creation and termination, process-owned
  state, a runnable queue and the basic process BIFs such as `self` and `spawn`.
- [ ] Schedule resumable frames with reduction budgets; ensure loops and
  long-running runtime operations yield, and host event loops remain responsive.
- [ ] Define process isolation and term sharing/copying rules; JavaScript garbage
  collection must not expose mutable state across processes.
- [ ] Provide deterministic scheduler and clock controls for tests, plus bounded
  handling of host callbacks and asynchronous work.
- [ ] Test deep recursion, process isolation, termination, fairness and
  responsiveness under CPU-bound workloads.

**Done when:** Multiple independent processes make progress without blocking
the host, and process identity, lifecycle and supported spawn behavior match
OTP in the covered cases.

## Phase 8: Messaging, receive and timers

**Goal:** Support Erlang-style asynchronous communication and waiting.

- [ ] Implement message sending, per-process mailboxes and ordering guarantees;
  include sending to dead or invalid destinations and registered names as their
  support is added.
- [ ] Lower receive instructions and implement selective receive, mailbox
  scanning, suspension, wakeup and preservation of unmatched messages.
- [ ] Implement `receive ... after`, monotonic time, timer creation and
  cancellation, with defined timeout/message races and host clock adapters.
- [ ] Add differential tests for multiple senders, selective receive, mailbox
  ordering, zero and delayed timeouts, cancellation and send/exit races.
  Compare permitted outcomes where OTP scheduling is nondeterministic.

**Done when:** Processes can exchange messages and suspend/resume correctly;
receive and timer tests agree with OTP's observable guarantees.

## Phase 9: Links, monitors and exit signals

**Goal:** Support process supervision primitives and their races.

- [ ] Implement bidirectional links, unlinking, exit signals, exit reasons and
  `trap_exit`, including normal exits, untrappable kill and already-dead PIDs.
- [ ] Implement process monitors, unique references, `DOWN` messages,
  demonitoring and flush/info options, including monitor-after-exit and
  cancellation races.
- [ ] Define signal ordering and lifecycle cleanup; cover simultaneous exits,
  links/monitors established during termination and messages already in flight.
- [ ] Add deterministic and randomized differential tests, comparing allowed
  outcomes and ensuring no leaked process, link, monitor or timer state.
- [ ] Exercise a small supervision-style example using the implemented
  primitives; do not claim OTP supervisor compatibility until its dependencies
  also run.

**Done when:** The advertised link, monitor and exit semantics match OTP across
normal, exceptional and race cases.

## Phase 10: Broader BIFs, module loading and host integration

**Goal:** Expand from language features to practical applications.

- [ ] Implement additional BIF families from the inventory, including process
  registry and information, references, timers, conversions and other commonly
  used operations. Specify supported options and resource limits per BIF.
- [ ] Define registration, dependency resolution, module loading and `on_load`
  ordering/failure behavior. Implement code-version lifetime and hot loading
  only when their semantics can be preserved and tested.
- [ ] Introduce explicit Node.js and browser adapters for clocks, I/O,
  randomness and other supported capabilities; define asynchronous calls,
  errors and conversion at the JavaScript boundary.
- [ ] Classify ports, NIFs, drivers, distribution and OS-dependent BIFs as
  implemented, adapted or unsupported on each host. Do not silently substitute
  incompatible behavior.
- [ ] Run representative multi-module applications and selected OTP libraries;
  use observed gaps to prioritize further BIF and opcode work.

**Done when:** Documented application scenarios run on each claimed host,
host-dependent limitations are explicit, and the BIF matrix reflects tested
behavior rather than dispatcher presence alone.

## Phase 11: Complete opcode coverage and compatibility hardening

**Goal:** Reach complete, evidence-backed generic opcode coverage for the
chosen input release.

- [ ] Implement and test every active generic opcode in the release inventory,
  including operand forms, failure edges, control-flow variants and runtime
  effects. Trace normalized disassembler instructions back to the raw ledger.
- [ ] Implement and test deprecated opcodes that the supported OTP loader
  accepts; individually investigate and document entries that cannot occur in
  accepted input. Do not count rejection as implementation. If older releases
  are supported, repeat the inventory and implementation for their accepted
  instructions rather than assuming this release's ledger is sufficient.
- [ ] Close remaining gaps in instruction families, validation, literals,
  metadata, calls, exceptions, processes and BIFs required by real modules.
- [ ] Add generated/randomized programs, malformed-input and fuzz tests,
  regression fixtures and a representative real-world BEAM corpus. Track raw
  opcode/operand coverage separately from end-to-end feature coverage.
- [ ] Establish performance and memory baselines, scheduling responsiveness,
  long-running stability and CI on Node and browsers. Optimize only while
  preserving differential behavior.
- [ ] Publish the final release-specific matrix and known differences. Add
  other OTP versions only with their own decoder, inventory and compatibility
  evidence.

**Done when:** All generic opcodes accepted under the documented release policy
are implemented and covered by tests, and the published runtime, BIF, library
and host compatibility claims are supported by differential and real-world
results. Opcode completeness alone does not imply full OTP or platform
compatibility.
