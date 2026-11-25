# Original OTP opcode tests

This is an ongoing compatibility investigation, **not a claim that every
applicable OTP test passes**.

## Sources and inventory

The execution tests come from
[erts/emulator/test](background/otp_src_29.1.2/erts/emulator/test).
[lib/compiler/test](background/otp_src_29.1.2/lib/compiler/test) also contains
language execution regressions, alongside tests of the Erlang compiler itself.

[otp_suite_catalog.erl](../test/otp_suite_catalog.erl) compiles the original
sources and follows their abstract-source local calls to record statically
named remote dependencies. It uses `all/0` and `groups/0` for discovery.
It does not execute testcase bodies on native Erlang.

The inventory contains 153 suites (104 emulator and 49 compiler suites),
with 2,796 discovered case/group entries. All suites compile with OTP;
148 currently translate to JavaScript. The five translation blockers are:

| Suite | Missing functionality |
| --- | --- |
| Emulator `binary_SUITE` | Native record creation in `test_terms/1` |
| Emulator `hash_SUITE` | Native record creation in `phash2_test/0` |
| Emulator `native_record_SUITE` | Native record instructions and term representation |
| Compiler `native_record_SUITE` | Native record instructions and term representation |
| Compiler `beam_debug_info_SUITE` | `debug_line` metadata |

These are not disassembly-based coverage claims. The normal Beam2JS compiler
still uses OTP's disassembler internally to translate BEAM files.

## Running the probes

The provided OTP source tree must exist under `docs/background/otp_src_29.1.2`.
Build the compiler first:

```sh
rebar3 escriptize

# Inventory only; no testcase bodies run.
npm run test:otp-opcodes -- --catalog-only

# Run the opcode-oriented suite selection.
rebar3 test otp-opcodes

# Reuse the inventory and run selected original bodies.
npm run test:otp-opcodes -- --skip-build \
  --suite=emulator/guard_SUITE --case=guard_bifs --timeout=30000
```

`--suite` takes `emulator/NAME` or `compiler/NAME`; both `--suite` and `--case`
accept comma-separated lists. Other options are:

| Option | Default | Meaning |
| --- | --- | --- |
| `--timeout=MS` | 5000 | Per-case wall-clock budget, including module loading |
| `--concurrency=N` | 2 | Concurrent case processes; accepts 1 through 4 |
| `--heap=MiB` | 1024 | V8 old-generation limit of each case process |
| `--report=PATH` | `_build/otp-opcode-tests/results.json` | JSON result file |
| `--skip-build` | Off | Reuse previously generated suite files |
| `--catalog-only` | Off | Build/discover without running testcase bodies |

The optional `otp-opcodes` probe is deliberately **not** part of `npm test`:
it needs the original source checkout and currently reports unresolved cases.
It exits nonzero on failures, timeouts, memory limits or compilation blockers.
Unknown selections/options are errors, not empty successful test runs.

## What a result means

[otp-opcode-suites.mjs](../test/otp-opcode-suites.mjs) owns its temporary HTTP
servers. Each original testcase body runs in a separate Node process with a
V8 old-generation limit (`--heap`, 1024 MiB by default; some cases queue a
million messages). The test controller starts the testcase in
its own Erlang process. OTP dependencies are downloaded and compiled by the
Beam2JS server, as they are for browser module loading.

The test-only `ct` and `test_server` adapters supply logging, failures and
duration/timetrap utilities. Failures retain their reasons; compiler,
application, code-loading and native-driver operations are not replaced with
successful stubs. Suite discovery also uses OTP's actual `test_lib` and
`trace_sessions` helpers.

**These are body-level probes, not full Common Test runs.** Suite/group/case
initializers, cleanup hooks, repeated-group policies and compiler-option
matrices are not executed. The default suite selection is provisional, not
an exhaustive per-case applicability classification.

| Result | Interpretation |
| --- | --- |
| `pass` | The original body returned normally under the supplied configuration |
| `skip` | The body returned an explicit skip result |
| `fail` | An exception, explicit failure or unexpected process exit occurred |
| `timeout` | The configured execution budget expired |
| `resource_limit` | The isolated Node process exhausted its V8 heap |
| `blocked` | The suite could not translate or be discovered |

`catalog.json` records sources, cases/groups and dependencies.
Result JSON includes the testcase identity, return value or exception,
stack trace and bounded output. Reports are saved under
`_build/otp-opcode-tests` by default.

A timeout is not proof of incorrect opcode semantics. Likewise, failure to
load a fixture, create a port or invoke a native compiler is not automatically
an opcode bug. For mixed tests, the applicable language checks still need
separate validation; the whole suite must not simply be excluded.

## Compatibility fixes from these tests

The original test bodies exposed and helped verify these corrections:

| Correction | Original testcase examples |
| --- | --- |
| Function-clause stack frames contain the failing arguments | Emulator `guard_bifs`; compiler `function_clause` |
| BIF error frames contain arguments and retain tail callers | Emulator `pending_errors`, `t_map_get`, `element` |
| Map errors retain `{badmap,Term}` and `{badkey,Key}` | `t_bif_map_get`, `t_bif_map_is_key`, compiler `map_effect` |
| Exact map updates select the first missing key in exact key order | `t_update_exact`, `t_update_exact_large` |
| Guard map updates and map BIFs honor failure labels | Compiler guard `misc` |
| Map comparison distinguishes integer/float keys and signed zero keys | `t_map_sort_literals`, compiler `eq`, `term_equivalence` |
| Unary `+/1` is callable, validates numbers and normalizes negative zero | Compiler `infer_relops`, `gh_6410`; focused differential fixture |
| Binary tail extraction does not advance the match context | Compiler `shared_sub_bins`, `dec_subidentifiers` |
| Bitstring type checks accept internal match contexts | Compiler `otp_19019` |
| `node/1` rejects non-PID/non-reference arguments | Emulator `pending_errors`; focused differential fixture |
| `apply/2` distinguishes a bad fun from invalid argument lists | Emulator `bad_apply`; focused differential fixture |
| Private binary append updates its accumulator in place | Compiler `mixed_zlc`, `zmc`, `filter_guard`, `cartesian`, `strict_binary` |

Focused regressions are also retained in
[binary_cases.erl](../fixtures/binary_cases.erl),
[otp_lib_cases.erl](../fixtures/otp_lib_cases.erl),
[call-cases.mjs](../test/call-cases.mjs) and
[map-cases.mjs](../test/map-cases.mjs).

The initial selection, using a three-second per-case budget, produced 638 normal returns, 3 skips,
179 failures, 89 timeouts, 2 heap-limit exits and 3 blocked suites. Those
numbers describe the initial probe, not post-fix compatibility or all 2,796
inventory entries.

### Validation snapshot

The final broad probe ran the same 914 selected entries with a five-second
per-case budget: 701 normal returns, 3 skips, 126 failures, 72 timeouts,
9 heap-limit exits and 3 blocked suites. Fifty-five bodies that initially
failed returned normally. All previously passing bodies still pass.
The budget and test-infrastructure improvements
also affect these counts; this is not a pure performance comparison.

All 25 directly selected correction cases pass, including
`fun_SUITE:bad_apply` and five previously failing zipped-comprehension bodies.
The complete `zlc_SUITE` body probe returns normally for 12 of its 13 cases.
Its remaining `bad_generators` failure reaches the original file/line
stacktrace assertions; it is not counted as passing.

The complete standard `npm test` command passed, including Node and Chromium.
The `apply/2` correction was additionally checked with `test:funs` and
`test:otplib`; the latter matches OTP on all 31 fixture scenarios.
The binary differential fixture matches OTP on all 40 scenarios, including
filtered zipped appends, partial bytes and backing-buffer growth. The new
zipped-binary regression was confirmed to fail before its runtime correction.
The original randomized `t_map_compare` body still exceeded a separate
180-second budget; it is **not** counted as passing.

## Outstanding work

1. **Native records are applicable.** Implement their creation/update/access
   instructions, module definitions/defaults/export visibility, type tests,
   equality/ordering, ETF and hashing. They must not be treated as tuples or
   silently ignored.
2. **Exception metadata is largely done.** Line information, `error_info`,
   `backtrace_depth` (system flag + truncation of raised stacktraces) and
   `process_info` `current_location`/`current_stacktrace` now match BEAM;
   `exception_SUITE` and `trycatch_SUITE` pass except `error_info`, which needs
   `test_server:start_peer`.
3. **Test infrastructure needs further support.** Cases that generate Erlang,
   Core or assembly modules need real compilation/loading and their original
   fixtures/options. Missing lifecycle configuration must be distinguished
   from runtime failures.
4. **Mixed native tests need case-level classification.** Ports, remote
   nodes/PID identities, native drivers, tracing/JIT instrumentation, physical
   heap layout, sharing and GC/reduction accounting are not interchangeable
   with JavaScript language execution. Preserve useful arithmetic, matching
   and process checks in those suites.
5. **Remaining language failures must still be investigated.** In particular,
   receive probes that exit while awaiting a result and any remaining
   comprehension, exception or function-application failures are not
   justified platform exclusions.
6. **Stress results need realistic budgets.** Some original bodies create
   thousands of processes or allocate progressively larger lists/maps.
   Rerun them with suitable limits, or explicitly validate a source-level
   semantic component separately; never count a shortened stress loop as
   the original testcase passing.

## Status at last session

* Maps now use BEAM flatmap order (sorted by `erts_internal:cmp_term`), with
  binary-search lookup; `maps:to_list/1` is therefore key-ordered.
* `map_SUITE`: 55 pass. Remaining failures need heap sharing
  (`t_update_assoc_sharing`, `t_bif_map_merge`), internal hash state
  (`t_bif_map_next`, `t_hashmap_balance`), peers (`t_gc_rare_map_overflow`),
  the port term type (`t_erts_internal_hash`) or `dbg` (`t_tracing`);
  `t_map_compare` passes with a ~90 s budget and `benchmarks` is a
  performance case.
* Still open: native records (OTP 29 `Recs` chunk and record opcodes), a port
  term type (`guard_SUITE:type_tests`, `fun_SUITE:ordering`), and
  interpreter performance (profiling is scheduled for a later phase).
