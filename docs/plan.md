# Implementation plan

This is a roadmap, not a claim of implemented compatibility. The current
experimental compiler and runtime support only the small subset described in
the [README](../README.md). In particular, they do not yet implement complete
call semantics, general BIF dispatch or full OTP process and scheduling
semantics. Local processes, messaging and cooperative scheduling are supported
for the subset described below.

The phases build on earlier foundations, but incremental work may span several
phases. The opcode and BIF inventories are maintained throughout, rather than
postponing coverage tracking until the end. Each phase should leave the project
runnable and reject unsupported cases explicitly.

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
- [x] Derive an initial generic opcode ledger from OTP 29.1.2's `genop.tab`,
  independently of the disassembler, with an explicit initial status for each
  opcode identity. See the [ledger](opcodes-otp-29.1.2.md).
- [ ] Complete the independent generic opcode ledger from that release's
  `genop.tab`. Record active and deprecated instructions, operand and control
  flow variants, and status for decoding, validation, lowering, runtime
  semantics and tests. Do not equate disassembler output with raw opcodes:
  the disassembler can normalize instructions. The
  ledger inventories selected operand and control-flow variants. It records OTP
  29.1.2's obsolete-opcode loader policy and compact operand encoding, with
  raw guard tests including x/y and type-tagged registers and a stripped
  compiler-generated fixture, raw control-flow, selection-list and selected BIF
  forms, and representative obsolete loader tests. It also records the
  disassembler's missing-type-table limitation. Full per-instruction operand
  encodings and many historical forms remain unverified.
- [x] Inventory OTP 29.1.2 `bif.tab` declarations and the three additional
  runtime-discovered BIFs by module, name and arity. See the
  [initial inventory](bifs-otp-29.1.2.md).
- [ ] Complete the BIF inventory by category, including guard
  behavior, exceptions, side effects, host dependencies and implementation
  status. Distinguish BIFs from ordinary functions implemented by OTP modules.
  The inventory records selected runtime and compiler classifications and tested behavior
  for several list, tuple, map, arithmetic, binary and process BIFs. Most individual
  effects, exceptions, host dependencies and other built-ins still need investigation.
- [ ] Establish a compatibility matrix for instructions, BIFs, OTP libraries,
  input releases and hosts. Record currently supported and unsupported cases.
- [ ] Build a reusable OTP-vs-JavaScript differential harness, including
  canonical term/exception comparison, fixture compilation, stripped files,
  timeouts and deterministic test controls. Run it in Node and a real browser
  in CI. The current suites compare supported cases with OTP in Node and
  Chromium, including stripped fixtures and an injectable test clock; CI
  integration and a complete general-purpose harness remain open.
- [x] Add malformed-input, deterministic-output, unsupported-instruction and
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
- [x] Emit deterministic, escaped JavaScript with a versioned runtime ABI.
  Preserve atomic output replacement and diagnostics.
- [ ] Define input, chunk, nesting and decompression limits. Audit or isolate
  OTP helpers that can intern atoms or decompress before limits apply; keep the
  untrusted-input warning until the complete path is safe.

**Done when:** Supported fixtures, including stripped files, pass through the
validated pipeline; malformed and unsupported cases fail predictably; no
untrusted-input safety claim is made without tests and a completed audit.

## Phase 3: Fundamental Erlang terms and comparisons

**Goal:** Establish term semantics that instructions and BIFs can share.

- [x] Define the current runtime representations and host boundary for atoms,
  arbitrary-precision integers, floats, the empty list, cons cells and tuples.
  Supported compound values are immutable; the boundary uses explicit runtime
  constructors and accessors. Atom limits, resource limits and other broader
  term guarantees remain future work.
- [ ] Implement exact and numeric equality, ordering, type tests and numeric
  operations for the supported terms, including integer/float edge cases.
  Integer bitwise `band`, `bor`, `bxor` and `bnot`, integer `div` and `rem`,
  unary negation and binary `+`, `-`, `*` and `/` instructions support guard
  and zero-label forms; the latter raise `badarith` on invalid inputs or overflow.
  These integer operators, unary negation and binary arithmetic operators also
  support callable BIF forms.
  The bitwise, `div`, `rem`, unary negation and binary arithmetic forms support
  ordinary x and y destinations, including aliased operands, without changing
  the destination on guard failure.
  `abs/1`, `trunc/1`, `round/1`, `floor/1`, `ceil/1` and `float/1` support
  guard, zero-label and callable forms; the latter two raise `badarg` for
  invalid input or float conversion overflow. These instructions also support
  x and y destinations, including an aliased source, without writing on guard
  failure. Floating-register conversion,
  moves, addition, subtraction, multiplication, division and negation are also
  supported for ordinary floating-point expressions.
- [ ] Lower the corresponding literal, move, test, comparison, branch, list and
  tuple instructions, including guard-failure versus exception behavior.
  Nested literals containing the implemented term types, including binary and
  partial-byte bitstring values, are supported;
  unsupported literal values still reject the module. Tagged tuple matching
  and selected value and tuple-arity branches are also supported. Type-tagged
  x- and y-register sources are read without validating their hints; type-tagged
  operands without the disassembler's required type table remain unsupported.
  The zero-label `=:=/2` instruction and callable `erlang:'=:='/2` return
  exact-equality boolean atoms. Selected `hd`, `tl`, `length`, `tuple_size` and `element`
  instructions branch on invalid input in guards or raise `badarg` in zero-label
  forms. `bit_size`, `byte_size` and `binary_part` instructions likewise branch
  in guards or raise `badarg` in zero-label forms.
  `is_binary` and `is_bitstr` test instructions distinguish byte-sized
  binaries from other bitstrings.
  Length traversal is synchronous and does not yield to a scheduler.
- [x] Support type-tagged y-register reads and the zero-label exact-equality
  BIF instruction with ordinary x and y destinations. Test typed stack reads and
  aliased operands against OTP in Node and Chromium, including stripped input;
  separately check register bounds and missing frames.
- [x] Support `put_tuple2` construction into ordinary x and y registers,
  including aliased source operands. Test compiler-generated and assembly
  forms, empty tuples, calls and scheduler yields against OTP in Node and
  Chromium, including stripped input.
- [x] Support `get_tuple_element` extraction into ordinary x and y registers,
  including an aliased source and destination. Test compiler-generated and
  assembly forms, calls and scheduler yields against OTP in Node and Chromium,
  including stripped input.
- [x] Support `get_list` extraction into distinct ordinary x and y registers,
  including a source aliased with either destination. Test compiler-generated
  and assembly forms, improper lists, calls and scheduler yields against OTP
  in Node and Chromium, including stripped input.
- [x] Support `put_list` construction into ordinary x and y registers,
  including either or both source operands aliased with the destination. Test
  compiler-generated and assembly forms, proper and improper lists, calls and
  scheduler yields against OTP in Node and Chromium, including stripped input.
- [x] Support `get_hd` and `get_tl` extraction into ordinary x and y registers,
  including an aliased source. Test compiler-generated and assembly forms,
  improper lists, calls and scheduler yields against OTP in Node and Chromium,
  including stripped input.
- [x] Support ordinary x and y destinations for `hd`, `tl`, `tuple_size` and
  `element` BIF instructions, including aliased operands. Test zero-label
  exceptions, guard branches without destination writes, calls and scheduler
  yields against OTP in Node and Chromium, including stripped input.
- [x] Support ordinary x and y destinations for `length` GC-BIF instructions,
  including an aliased source. Test zero-label exceptions, guard branches without
  destination writes, long lists, calls and scheduler yields against OTP in
  Node and Chromium, including stripped input. Traversal remains synchronous.
- [x] Support ordinary x and y destinations for `bit_size` and `byte_size`
  GC-BIF instructions, including an aliased source. Test partial-bitstring
  rounding, guard failures without destination writes, zero-label exceptions,
  calls and scheduler yields against OTP in Node and Chromium, including stripped input.
- [x] Support ordinary x and y destinations for both `binary_part` GC-BIF
  arities, including aliased operands. Test guard failures without destination
  writes, zero-label exceptions, negative lengths, calls, stack trimming and
  scheduler yields against OTP in Node and Chromium, including stripped input.
- [x] Support ordinary x and y destinations for the eleven non-failing type
  predicate BIF instructions, including an aliased source. Test supported term
  types, calls and scheduler yields against OTP in Node and Chromium, including
  stripped input.
- [x] Support ordinary x and y destinations for `band`, `bor`, `bxor` and
  `bnot` GC-BIF instructions, including aliased operands. Test guard failures
  without destination writes, zero-label exceptions, large and negative integers,
  calls, stack trimming and scheduler yields against OTP in Node and Chromium,
  including stripped input.
- [x] Support ordinary x and y destinations for integer `div` and `rem`
  GC-BIF instructions, including aliased operands. Test guard failures without
  destination writes, zero-label exceptions, zero divisors, large and negative
  integers, calls, stack trimming and scheduler yields against OTP in Node and
  Chromium, including stripped input.
- [x] Support ordinary x and y destinations for binary `+`, `-`, `*` and `/`
  GC-BIF instructions, including aliased operands. Test guard failures without
  destination writes, zero-label exceptions, integer and float edge cases,
  calls, stack trimming and scheduler yields against OTP in Node and Chromium,
  including stripped input. OTP emits floating-register instructions for
  compiler-generated division; the division GC-BIF forms use assembly fixtures.
- [x] Support ordinary x and y destinations for unary negation and `abs/1`
  GC-BIF instructions, including an aliased source. Test guard failures without
  destination writes, zero-label exceptions, large integers, signed zero,
  calls and scheduler yields against OTP in Node and Chromium, including stripped input.
- [x] Support ordinary x and y destinations for `trunc/1`, `round/1`, `floor/1`,
  `ceil/1` and `float/1` GC-BIF instructions, including an aliased source.
  Test guard failures without destination writes, zero-label exceptions,
  rounding and float conversion boundaries, calls and scheduler yields against
  OTP in Node and Chromium, including stripped input.
- [x] Test unusual atoms, large and negative integers, float boundaries,
  improper lists, nested terms, matching and failed guards against OTP.

**Done when:** Supported terms and operations agree with OTP across successful
and failing cases; unsupported term types still fail explicitly.

## Phase 4: Resumable execution, calls and exceptions

**Goal:** Execute ordinary Erlang functions without depending on the JavaScript
call stack and provide the control-flow foundation for concurrency.

- [x] Extend the continuation-based call loop to process-owned frames,
  program counters, registers and stack slots, with bounded instruction yields
  and receive suspension in ABI 26. Actions cover calls, tail calls, returns,
  yields and receive waits.
- [ ] Add raise actions and full exception handling to the resumable execution
  model. Selected error paths currently propagate through JavaScript using a
  distinct `ErlangError`.
- [ ] Lower local and external non-tail calls, tail calls, returns, stack/frame
  instructions and applicable allocation instructions. Preserve effects other
  than garbage collection. A limited slice supports ordinary y slots,
  allocation, initialization, trimming, deallocation, calls and tail transfers
  with deallocation. Register-state and frame-flow validation remain incomplete.
- [ ] Implement exception classes, reasons and propagation, including
  `throw`, `error`, `exit`, catch/try regions and stack traces. Distinguish
  Erlang exceptions from host JavaScript failures. Selected `error` reasons
  propagate through supported calls to the host; catch/try, other classes and
  Erlang stack traces remain unsupported.
- [ ] Implement function-clause, bad-match, case-clause, bad-argument and
  undefined-function failure behavior as the corresponding paths are added.
  Function-clause, bad-match, case-clause and if-clause failures expose their
  Erlang class and reason at the JavaScript boundary. Zero-label arithmetic
  and the supported integer bitwise instructions expose `badarith`; selected
  list, tuple, binary and numeric BIF instructions expose `badarg`.
- [ ] Add reduction/yield checkpoints to calls, loops and potentially
  long-running runtime operations, ready for a scheduler. Generated instructions
  now have bounded steps, but runtime operations and host calls do not yield.

**Done when:** Nested local/external calls, deep recursion, tail recursion,
guard failures and cross-call exceptions match OTP without overflowing the
JavaScript stack.

## Phase 5: Core BIFs and ordinary language programs

**Goal:** Support a useful, prioritized set of pure and process-independent
BIFs.

- [ ] Implement a BIF dispatch mechanism keyed by module, name and arity,
  including compiler-emitted specialized BIF instructions and guard forms.
  Preserve exact return values, error classes/reasons and guard failure rules.
  Eleven non-failing type-predicate BIFs and selected list/tuple, binary and numeric
  BIFs support instruction and callable forms for the existing term subset. Selected
  integer bitwise and division operators, unary negation and binary `+`, `-`,
  `*` and `/` support instructions and callable BIF forms.
  Comparison operators support comparison test instructions and callable forms;
  exact equality also supports a zero-label BIF instruction.
  Boolean `not`, `and`, `or` and `xor` support instructions and callable forms.
  `list_to_tuple/1`, `tuple_to_list/1`, `atom_to_list/1`, `atom_to_binary/2`, `integer_to_list/1,2`,
  `integer_to_binary/1,2` and `binary_to_list/1,3` are callable.
  `self/0`, `is_process_alive/1`, local `spawn/3`, `send/2`, `!/2` and
  `make_ref/0` are callable, as are the local timer, dictionary, process-info and registry BIFs
  described in phases 8 and 10. `apply/3` and `get_module_info/1,2` are also
  callable for the limited behavior described below; other callable BIFs
  remain unimplemented.
- [ ] Implement and test common type predicates, arithmetic and bitwise
  operations, comparisons, tuple/list operations, atom and number conversions,
  and relevant binary operations as their term support becomes available.
- [x] Support callable `erlang` unary `-` and binary `+`, `-`, `*` and `/`,
  including external calls and `badarith` exceptions. Compare integer, float,
  overflow and failure behavior with OTP in Node and Chromium, including stripped
  callers and forced scheduler yields.
- [x] Support callable `erlang:'=:='/2` for the supported term types, including
  external tail and non-tail calls. Compare exact equality with OTP in Node and
  Chromium, including stripped callers and forced scheduler yields. Comparison
  remains synchronous.
- [x] Support the other callable comparison operators `==`, `/=`, `=/=`, `<`,
  `=<`, `>` and `>=` for supported terms. Compare numeric and exact equality,
  ordering, external calls and scheduler yields with OTP in Node and Chromium,
  including stripped callers. Comparisons remain synchronous.
- [x] Support callable `erlang` integer `band`, `bor`, `bxor`, `bnot`, `div`
  and `rem`, including external calls and `badarith` exceptions. Compare large
  and negative integers, invalid operands and zero divisors with OTP in Node
  and Chromium, including stripped callers and forced scheduler yields.
- [x] Support callable `list_to_tuple/1` and `tuple_to_list/1`, including
  compiler-generated calls and `badarg` failures. Test empty, nested, long and
  improper inputs against OTP in Node and Chromium, including stripped callers
  and scheduler yields. Conversion remains synchronous.
- [x] Support boolean `not`, `and`, `or` and `xor` BIF instructions and
  callable forms, with guard failure, `badarg` exceptions and x/y destinations.
  Test truth tables, non-booleans, aliased operands and scheduler yields against
  OTP in Node and Chromium, including stripped callers.
- [x] Support callable `integer_to_list/1,2` and `integer_to_binary/1,2`.
  Test all bases, large signed integers, invalid arguments, external calls and
  scheduler yields against OTP in Node and Chromium, including stripped callers.
  Conversion remains synchronous; OTP resource and scheduling behavior is not
  reproduced.
- [x] Support callable `binary_to_list/1,3`, including one-based inclusive
  ranges and `badarg` failures. Test empty and long binaries, partial bitstrings,
  range boundaries, external calls and scheduler yields against OTP in Node
  and Chromium, including stripped callers. Conversion remains synchronous;
  OTP resource and scheduling behavior is not reproduced.
- [x] Support callable `atom_to_binary/2` with UTF-8, Unicode and Latin-1.
  Test invalid arguments and unrepresentable Latin-1 names against OTP in Node
  and Chromium, including stripped callers. Conversion remains synchronous.
- [x] Support callable `binary_to_atom/2` for byte-aligned binaries with UTF-8,
  Unicode and Latin-1. Reject partial bitstrings, malformed UTF-8, non-binaries
  and invalid encodings with `badarg`. Test direct and stripped callers in Node
  and Chromium against OTP.
- [x] Implement dynamic `apply`/function resolution and the supported portions
  of module introspection, including `module_info`, rather than treating BIFs
  as ordinary missing external modules. `apply/3` tail-transfers to exported
  functions in registered modules and supported callable BIFs, with proper-list,
  atom and 255-argument validation. `module_info/0,1` and compiler-emitted
  `get_module_info/1,2` expose only the `module` and `exports` fields. Test
  tail and non-tail calls, errors, exports and stripped modules against OTP in
  Node and Chromium. `apply/2`, funs, full module metadata and OTP `undef`
  exceptions remain unsupported.
- [ ] Prioritize further BIFs using the inventory and actual fixture/application
  usage. Mark host-dependent or unavailable operations explicitly.
  - [x] Selected callable `atom_to_list/1` from the BIF inventory and existing
    OTP error-normalization test usage. It returns UTF-8 bytes as an Erlang
    integer list and raises `badarg` for non-atoms; compare empty, ASCII and
    Unicode atom names against OTP in Node and Chromium, including stripped
    callers. Conversion is synchronous; broader prioritization remains open.
- [ ] Run representative pure Erlang modules and selected OTP library
  functions, recording missing BIFs and instructions as actionable gaps. A
  [Sudoku solver](../examples/sudoku/sudoku.erl) now runs in OTP, Node and
  Chromium, including stripped input; this does not establish general OTP
  library support.

**Done when:** The published core BIF set passes differential success, guard,
error and boundary tests, and representative non-concurrent programs run.

## Phase 6: Compound terms, matching and functions

**Goal:** Cover the data structures and dynamic functions used by typical
Erlang programs.

- [~] Implement maps, binaries and bitstrings, including construction, matching,
  updates, sizes, alignment and failure paths; basic tagged maps and map literals,
  exact lookup/matching, updates, pure `maps` module operations and map BIF guards are implemented, while callback-based `maps` functions and broader
  map coverage remains open. Cover relevant generic opcodes.
  Binary and partial-byte bitstring literals, comparisons, type tests and
  size and `binary_part/2` and `/3` guard, zero-label and callable forms are
  supported, as are callable `binary_to_list/1,3`. General construction,
  matching, other slicing instructions and other callable binary BIFs are not.
- [~] Implement funs, closures and captured environments, exported funs,
  indirect calls and arity checks. Exported fun literals, local closures,
  `make_fun3`, `call_fun/1`, `apply/2`, `is_function/1`, bad-arity and callback
  invocation are implemented; general tail-call and broader fun forms remain open.
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

- [x] Implement local PID identity, host-created and `spawn/3` processes,
  process-owned frames and mailboxes, termination, completion promises and a
  shared runnable queue. `self/0`, `is_pid/1` and local
  `is_process_alive/1` are supported.
- [ ] Complete process creation and termination semantics and other spawn
  variants.
  Child failures are reported to the host; missing targets and arities over 255
  currently produce host diagnostics rather than OTP `undef`.
- [ ] Schedule resumable frames with reduction budgets; ensure loops and
  long-running runtime operations yield, and host event loops remain responsive.
  Configurable cooperative scheduler slots run on one JavaScript event loop;
  they do not execute in parallel or use workers. Generated instructions yield,
  while long-running runtime operations and synchronous host calls still block.
- [ ] Define process isolation and term sharing/copying rules; JavaScript garbage
  collection must not expose mutable state across processes.
  Supported immutable terms are shared; opaque host handles may refer to mutable
  host objects and are not an isolation boundary.
- [x] Provide configurable cooperative scheduler slots and instruction budgets,
  and an injectable monotonic clock for receive-timer tests.
- [ ] Provide deterministic scheduler controls and bounded handling of host
  callbacks and asynchronous work.
- [x] Test deep recursion, process state and mailbox isolation, termination,
  interleaving and host responsiveness for selected generated-instruction
  workloads in Node and Chromium.
- [ ] Extend fairness and responsiveness tests to long-running runtime
  operations and other CPU-bound workloads as they become yieldable.

**Done when:** Multiple independent processes make progress without blocking
the host, and process identity, lifecycle and supported spawn behavior match
OTP in the covered cases.

## Phase 8: Messaging, receive and timers

**Goal:** Support Erlang-style asynchronous communication and waiting.

- [x] Implement process-local FIFO mailboxes and local PID message sending.
  The host can append supported terms to a mailbox. Erlang
  `!` and `send/2` deliver to local PIDs, returning the message and discarding
  it for dead local PIDs. Messages from the same sender retain their order.
  Invalid destinations raise `badarg`.
- [x] Deliver messages to locally registered names, with `badarg` for an
  unregistered name.
- [ ] Extend delivery to name/node tuples and non-local PIDs and complete OTP
  delivery semantics.
- [x] Lower the supported receive instructions for indefinite and timed
  selective receive, including mailbox scanning, suspension, wakeup and
  preservation of unmatched messages. A synchronous invocation throws if it
  would block. An indefinite wait alone does not keep the host event loop alive.
- [ ] Implement receive markers and remaining receive instruction forms.
- [x] Implement `receive ... after` timers, including OTP's timeout range,
  infinity, cancellation on match,
  a monotonic host clock adapter and explicit event-loop race ordering.
- [x] Implement local PID `send_after/3` and `start_timer/3`, plus
  `read_timer/1` and `cancel_timer/1`, for relative delays through
  4294967295 milliseconds. Cancel timers when their destination exits and
  test delivery, cancellation and timer references against OTP in Node and
  Chromium, including stripped input.
- [x] Support timer destinations by registered name, resolved at expiration.
  Name-addressed timers survive process termination and discard messages if
  the name is unregistered at expiration.
- [x] Support `read_timer/2` and `cancel_timer/2` with synchronous or
  asynchronous access and the supported `async` and `info` options. Test
  replies, invalid options and cancellation against OTP in Node and Chromium,
  including stripped input. The cooperative runtime performs access immediately.
- [x] Support relative `send_after/4` and `start_timer/4` with empty options or
  `{abs, false}`, including option validation and duplicate-option precedence.
  Test local PID and named destinations against OTP in Node and Chromium,
  including stripped input.
- [x] Support absolute `send_after/4` and `start_timer/4` deadlines and
  `monotonic_time/0,1` using the runtime clock. Test local PID and named
  destinations, past deadlines, time units and invalid inputs against OTP in
  Node and Chromium, including stripped input. Host precision and timer-range
  limits are documented.
- [ ] Complete timer BIFs and OTP timer/scheduler semantics, including larger
  delays and deadlines, distributed destinations and cross-scheduler timing.
- [x] Add differential tests for multiple senders, selective receive, mailbox
  ordering, zero and delayed timeouts and cancellation. Per-sender ordering
  checks allow different interleavings.
- [ ] Extend race tests to send/exit and other nondeterministic outcomes,
  comparing permitted results rather than assuming a scheduler order.

**Done when:** Processes can exchange messages and suspend/resume correctly;
receive and timer tests agree with OTP's observable guarantees.

## Phase 9: Links, monitors and exit signals

**Goal:** Support process supervision primitives and their races.

- [~] Implement bidirectional links, unlinking, exit signals, exit reasons and
  `trap_exit`, including normal exits, untrappable kill and already-dead PIDs.
- [x] Implement unique local references with `make_ref/0` and `is_reference/1`,
  including identity, comparisons and message transport. Distributed reference
  identity and serialization remain unsupported.
- [~] Implement process monitors, `DOWN` messages,
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

- [x] Implement local process registration with `register/2`, `unregister/1`,
  `whereis/1` and `registered/0`, including name cleanup on process exit.
  Test registry operations and named messaging and timers against OTP in Node
  and Chromium, including stripped input.
- [x] Implement process-local `get/0,1`, `get_keys/0,1`, `put/2` and
  `erase/0,1`, including the compiler-emitted `get/1` instruction. Test exact
  key/value matching, process isolation and lifecycle against OTP in Node and
  Chromium, including stripped input. Dictionary operations run synchronously.
- [x] Support local `process_info/2` snapshots for messages, queue length,
  dictionary and dictionary-key lookup, registered name and cooperative status,
  including ordered item lists, dead PIDs and invalid inputs. Test against OTP
  in Node and Chromium, including stripped input. Other information items,
  `process_info/1` and cross-scheduler signal semantics remain open.
- [ ] Implement additional BIF families from the inventory, including process
  registry and information, references, timers, conversions and other commonly
  used operations. Specify supported options and resource limits per BIF.
  Local `make_ref/0`, `is_reference/1` and the timer BIF slice in phase 8 are
  already supported; broader reference and timer operations remain open.
- [ ] Define registration, dependency resolution, module loading and `on_load`
  ordering/failure behavior. Implement code-version lifetime and hot loading
  only when their semantics can be preserved and tested.
- [ ] Introduce explicit Node.js and browser adapters for clocks, I/O,
  randomness and other supported capabilities; define asynchronous calls,
  errors and conversion at the JavaScript boundary. The browser demo now
  provides capability-scoped DOM reads and Erlang-owned subscriptions with
  immutable event snapshots; general JavaScript interop remains unsupported.
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
