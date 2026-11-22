# BIF inventory: OTP 29.1.2

The initial inventory contains the 553 declarations in
[`bif.tab`](https://github.com/erlang/otp/blob/OTP-29.1.2/erts/emulator/beam/bif.tab)
(SHA-256 `55c88258e90745e701d00702266c6422e35c31c6796ce2086ea00fa00f9d8816`) and the three exported
`erlang:apply/2`, `erlang:apply/3` and `erlang:yield/0` built-ins
reported by OTP but absent from that table. It is not yet a complete inventory
of all compiler intrinsics, optional native functions or OTP library functions.
The table includes internal and potentially unavailable declarations; it is not
a public API list. Identities are module/name/arity, including operators.

Runtime and compiler classifications below are collected from an installed
OTP **29.1.2**, using `erlang:is_builtin/3`,
[`erl_internal`](https://github.com/erlang/otp/blob/OTP-29.1.2/lib/stdlib/src/erl_internal.erl)
and [`erl_bifs`](https://github.com/erlang/otp/blob/OTP-29.1.2/lib/compiler/src/erl_bifs.erl).
They are release/build observations, not proof of Beam2JS support.

- **Kind**: `bif`, `ubif`, `hbif` are the upstream table declarations;
  `runtime` denotes the three runtime-discovered entries. In particular,
  `ubif` alone does not mean a function is allowed in a guard.
- **Runtime BIF**: result of `erlang:is_builtin/3`; a negative result for a
  table declaration is retained rather than assuming it is available.
- **Guard**: `BIF` is recognized by `erl_internal:guard_bif/2`; `operator`
  is an arithmetic, boolean or comparison guard operator. `no` means neither
  classifier applies. Guard syntax and individual argument restrictions still
  matter; failure in a guard is not an ordinary propagated exception.
- **Effects**: `optimizer-pure` means OTP's conservative `is_pure/3`
  optimizer list includes it. This is not a security, resource-use, allocation,
  host-independence or complete side-effect guarantee. `?` is unclassified,
  not a claim that the function has side effects. Specific notes identify
  selected observable effects independently of the optimizer classification.
- **Exceptions**: `optimizer-safe` or `always-raises` reflects the
  respective OTP optimizer classifier, not an exhaustive exception contract;
  `?` means not classified. Reasons and exceptional effects require individual
  investigation and differential tests.
- **Host**: known broad dependencies are noted; `?` means not investigated,
  not host-independent. Categories are broad families, not complete semantics.
- **Beam2JS**: `instruction-and-callable` means the corresponding normalized
  instruction (including `send/0` for `!/2`) and external callable BIF are supported for the implemented integer,
  float, atom, list, tuple, bitstring, local PID and local reference terms. Failing list, tuple, binary and numeric BIFs
  branch in guards and raise `badarg` in body and callable forms.
  `callable-only` means external calls are supported without a specialized BIF instruction.
  `guard-instruction-only` means the listed BIF instruction is supported
  only with a nonzero guard failure label, for the implemented terms.
  `body-and-guard-instruction-only` covers both guard and zero-label forms
  of selected numeric BIF instructions, including `badarg` failures.
  `arithmetic-instruction-only` covers both guard and zero-label forms of
  selected arithmetic instructions, including `badarith` failures and the
  supported floating-point-register sequence. Implemented forms are
  tested against OTP in Node and Chromium, including stripped input. The
  instruction-only classifications do not imply callable BIF dispatch; all other entries
  are `not implemented`. Some operations may instead use partially implemented
  guard instructions.

Compiler-recognized or auto-imported functions are not necessarily C BIFs.
For example, `erlang:spawn/1` is recognized by `erl_internal:bif/2`
but `erlang:is_builtin/3` reports false; `lists:map/2` is ordinary Erlang
code, whereas `lists:member/2` is a runtime BIF. Neither compiler recognition
nor being exported by an OTP module alone establishes a BIF implementation.

## Selected OTP behavior

The following observations are backed by the pinned
[`erlang` reference](https://github.com/erlang/otp/blob/OTP-29.1.2/erts/preloaded/src/erlang.erl)
and focused OTP tests; they are not exhaustive exception or resource contracts.
`npm run test:bifs` checks representative direct calls and guard failures.
The [raw BIF fixture](../fixtures/raw_bifs.S) additionally checks selected
guard and exception paths and their raw encodings via `npm run test:opcodes`.

- `hd/1` and `tl/1` accept nonempty cons cells, including improper lists;
  `length/1` requires a proper list. Invalid inputs tested here raise
  `badarg` in a body. Nonzero-label `length/1` guard instructions are
  tested in OTP, Node and Chromium, including stripped
  [compiler-generated](../fixtures/length_guards.erl) and
  [assembly](../fixtures/raw_length_guards.S) fixtures and 10,000-element
  proper and improper lists. Zero-label forms are tested in
  [body](../fixtures/bif_body.erl) and [assembly](../fixtures/raw_bif_body.S)
  fixtures. Callable forms are also tested through direct and external calls,
  including invalid inputs and stripped input. Traversal is synchronous and can block the host event loop; OTP
  scheduling behavior is not implemented.
- `element/2` uses one-based tuple indexes; a non-tuple or invalid index
  raises `badarg` in a body. `tuple_size/1` returns the number of tuple
  elements and raises `badarg` for a non-tuple. Guard and zero-label
  instructions and callable forms are tested in Node and Chromium, including
  invalid indexes and stripped input.
- `bit_size/1` counts bits and `byte_size/1` rounds the bit length up
  to whole bytes, including for partial-byte bitstrings. Both raise `badarg`
  for non-bitstrings in a body. Their nonzero-label guard instructions are
  tested against OTP in Node and Chromium, including stripped
  [compiler-generated](../fixtures/length_guards.erl) and
  [assembly](../fixtures/raw_length_guards.S) fixtures. Zero-label forms are
  tested in [body](../fixtures/bif_body.erl) and
  [assembly](../fixtures/raw_bif_body.S) fixtures. Callable forms are tested
  through direct and external calls in both hosts, including stripped input.
- `map_get/2` raises `{badkey,Key}` for an absent key and `{badmap,Map}`
  for a non-map. `is_map_key/2` returns `false` for an absent key, while it
  and `map_size/1` raise `{badmap,Map}` for a non-map. Map lookups use
  exact key equivalence, including integer versus float and the signs of float
  zero; compound keys match by their term contents.
- `maps:get/2` and `maps:is_key/2` are runtime BIFs with the corresponding
  lookup and error behavior, but are not classified as guard BIFs.
  `maps:get/3` is an ordinary OTP function rather than a runtime BIF; it
  returns its default for a missing key and raises `{badmap,Map}` for a
  non-map. The [map guard fixture](../fixtures/bif_map_guards.erl) checks
  successful and failing `erlang` guard calls, including stripped input.
- Unary `-/1` and binary `+/2`, `-/2` and `*/2` accept numbers;
  non-numbers and floating-point overflow raise `badarith` in a body. Integer
  results can exceed machine word size and mixed integer/float arithmetic
  yields a float. Nonzero-label guard forms are tested against OTP in Node
  and Chromium using [compiler-generated](../fixtures/arithmetic_guards.erl)
  and [assembly](../fixtures/raw_arithmetic_guards.S) fixtures, including
  stripped input. Zero-label forms and floating-register arithmetic are tested
  in [body](../fixtures/arithmetic_body.erl) and
  [assembly](../fixtures/raw_arithmetic_body.S) and
  [floating-register](../fixtures/raw_float_registers.S) fixtures, including
  signed zero and overflow. OTP resource limits and scheduling are not implemented.
- `abs/1` accepts integers and floats, preserves their type and turns
  negative float zero into positive zero; non-numbers raise `badarg` in a
  body. Nonzero-label guard instructions are tested in the same arithmetic
  fixtures, including large integers, subnormals, aliased destinations and
  stripped input. Zero-label forms are tested in the body and assembly fixtures
  above; callable forms are tested in Node and Chromium, including external
  tail calls from [assembly](../fixtures/raw_bif_body.S).
  OTP resource limits and scheduling are not implemented.
- `trunc/1`, `round/1`, `floor/1` and `ceil/1` accept integers and
  floats and return integers; non-numbers raise `badarg` in a body.
  `trunc/1` rounds toward zero, `round/1` rounds to the nearest integer
  with ties away from zero, and `floor/1` and `ceil/1` round down and up.
  Nonzero-label guards are tested in the same arithmetic fixtures, including
  half-integer boundaries, signed zeros, large numbers, aliased destinations
  and stripped input. Zero-label forms are tested in the body and assembly
  fixtures above; callable forms are tested in Node and Chromium.
  OTP resource limits and scheduling are not implemented.
- `float/1` converts an integer to a float or returns a float unchanged,
  including the sign of zero. Non-numbers and integer-to-float overflow raise
  `badarg` in a body. Nonzero-label guards are tested in the same arithmetic
  fixtures, including conversion rounding and overflow boundaries, aliased
  destinations and stripped input. Zero-label forms are tested in the body
  and assembly fixtures above; callable forms are tested in Node and Chromium,
  including external non-tail calls. OTP resource limits and scheduling are not implemented.
- Binary `//2` converts both operands to floats and always returns a float.
  Non-numbers, zero divisors, integer-to-float conversion overflow and float
  result overflow raise `badarith` in a body. Its nonzero-label guard
  instructions are tested in the same arithmetic fixtures, including signed
  zeros, subnormals, conversion boundaries, destination aliasing and stripped
  input. Zero-label instruction forms are tested in
  [assembly](../fixtures/raw_arithmetic_body.S), while the floating-register
  sequence for ordinary division is tested in the
  [body](../fixtures/arithmetic_body.erl) and
  [assembly](../fixtures/raw_float_registers.S) fixtures. OTP resource limits
  and scheduling are not implemented.
- `band/2`, `bor/2`, `bxor/2` and `bnot/1` operate on signed
  integers and raise `badarith` for non-integers in a body. Their
  nonzero-label guard instructions are tested against OTP in Node and
  Chromium, including stripped [compiler-generated](../fixtures/bitwise_guards.erl)
  and [assembly](../fixtures/raw_bitwise_guards.S) fixtures. Zero-label forms
  are tested in [body](../fixtures/arithmetic_body.erl) and
  [assembly](../fixtures/raw_arithmetic_body.S) fixtures. OTP resource limits,
  garbage collection and scheduling are not implemented.
- Integer `div/2` truncates toward zero and `rem/2` has the dividend's
  sign; zero divisors and non-integers raise `badarith` in a body. Their
  nonzero-label guard instructions are tested against OTP in Node and
  Chromium, including stripped [compiler-generated](../fixtures/integer_guards.erl)
  and [assembly](../fixtures/raw_integer_guards.S) fixtures. Zero-label forms
  are tested in the same body and assembly fixtures. OTP resource and
  scheduling behavior are not implemented.
- `binary_part/2` and `binary_part/3` use a zero-based start; the
  two-argument form accepts a `{Start,Length}` tuple. A negative length selects bytes
  preceding that start; a valid empty range is allowed. Invalid types,
  non-byte-aligned bitstrings and out-of-bounds ranges tested here raise
  `badarg` in a body. Their nonzero-label guard instructions are tested in
  OTP, Node and Chromium with [compiler-generated](../fixtures/guard_bifs.erl)
  and [assembly](../fixtures/raw_guard_bifs.S) fixtures, including stripped
  input. Zero-label and callable forms are tested in the body and assembly
  fixtures above, including direct calls and propagated errors. Successful
  slices copy synchronously.
- `self/0` returns the calling process's PID; distinct processes have
  distinct live identities. It depends on a process runtime, not a pure
  host-value conversion. Beam2JS supports the instruction and callable forms,
  plus `is_pid/1` and PID type-test instructions for local process identities.
  Tests cover yields, calls, terminated processes and reentrant host invocations
  in Node and Chromium, including stripped input. PID ordering within the runtime
  is an implementation-defined local order, not a distributed OTP identity.
- `is_process_alive/1` returns whether a local PID identifies a live process,
  and raises `badarg` for non-PIDs or non-local PIDs. Callable forms are tested
  for runnable, executing, completed and failed processes in Node and Chromium,
  including stripped input. Cross-runtime PIDs are treated as non-local.
- `make_ref/0` creates an opaque unique local reference; `is_reference/1`
  supports callable, body and guard forms. OTP, Node and Chromium tests cover
  uniqueness, equality, ordering relative to atoms and PIDs, and messaging,
  including stripped input. Reference ordering within Beam2JS is local and
  implementation-defined; distributed identity and serialization are unsupported.
- `get/0,1`, `get_keys/0,1`, `put/2` and `erase/0,1` operate on a
  process-local dictionary. Keys and value filters use exact term equality;
  list order is unspecified. The compiler-generated `get/1` instruction
  and callable forms are tested in OTP, Node and Chromium, including stripped
  input. Dictionary scans and term comparisons execute synchronously.
- `spawn/3` returns a new PID and schedules a local child; non-atom module or
  function arguments and improper argument lists raise `badarg` in the parent.
  Tests cover direct, tail and non-tail calls in Node and Chromium, including
  stripped input. Missing or private targets and more than 255 arguments fail
  asynchronously with a host diagnostic, rather than OTP's `undef`. Argument
  traversal is synchronous; monitors are unsupported.
- `register/2`, `unregister/1`, `whereis/1` and `registered/0`
  support local process names. A process may have one name, which is removed
  when it exits. Registry behavior and invalid inputs are tested against OTP
  in Node and Chromium, including stripped input. Ports and distributed
  registries are unsupported.
- `!/2` and `send/2` return the sent term and append it to a live local
  PID or registered name's mailbox; a dead local PID discards the message. Invalid destinations
  and unregistered atoms raise `badarg`. Distributed PIDs and registered-name
  node tuples are unsupported. The `send` instruction and callable forms are
  tested against OTP in Node and Chromium, including stripped input and per-sender
  ordering.
- `send_after/3,4` and `start_timer/3,4` schedule messages to local PIDs or names and
  return references. The four-argument forms accept relative and absolute
  deadlines using the runtime clock; `monotonic_time/0,1` reads that clock.
  `read_timer/1` and `cancel_timer/1` return remaining
  milliseconds or `false`. Their two-argument forms also support asynchronous
  access and, for cancellation, suppressing result information.
  PID-addressed timers are canceled when the destination
  exits; names are resolved when the timer expires.
  OTP, Node and Chromium tests cover delivery and cancellation, including
  stripped input. Relative delays and future absolute deadlines more than
  4294967295 milliseconds away, or absolute deadlines outside safe-integer
  precision, produce host diagnostics. Distributed timers are unsupported.
- OTP emits a non-failing `bif` instruction for direct body calls to the
  seven predicates in [this fixture](../fixtures/bif_predicates.erl) and
  `is_list/1` in the [list fixture](../fixtures/list_slice.erl) and
  `is_tuple/1` in the [tuple fixture](../fixtures/tuple_slice.erl).
  Beam2JS lowers these instructions for supported terms to Erlang `true` or
  `false` atoms. Selected register and literal operands are also checked in
  [assembly](../fixtures/raw_predicate_bifs.S), in Node and Chromium against
  OTP, including stripped input. All nine are also callable through external
  calls or the host invocation API; [assembly](../fixtures/raw_bif_body.S)
  tests tail and non-tail calls. Built-ins take precedence over a registered
  `erlang` function of the same name and arity. `is_list/1` accepts improper cons cells.
  `is_binary/1` accepts bitstrings whose length is divisible by eight;
  `is_bitstring/1` accepts partial-byte bitstrings too.

Failure of these guard BIFs or operators in a guard fails the guard rather than
propagating the body exception. Apart from the type predicates, process and message BIFs and the
list, tuple, binary and numeric BIFs above, the Beam2JS runtime does not implement these
callable BIFs. Beam2JS lowers the nonzero-label `hd/1`, `tl/1`, `length/1`,
`tuple_size/1`, `element/2`, `bit_size/1`, `byte_size/1` and
`binary_part/2` and `binary_part/3` guard
instructions for supported terms, with differential coverage from the
[guard fixture](../fixtures/guard_bifs.erl), [size fixture](../fixtures/length_guards.erl)
and their assembly fixtures. Their zero-label forms are supported and raise
`badarg` on invalid inputs.

Regenerate or verify using the exact upstream file and OTP 29.1.2:

```sh
node tools/bif-inventory.mjs /path/to/otp/erts/emulator/beam/bif.tab > docs/bifs-otp-29.1.2.md
node tools/bif-inventory.mjs --check /path/to/otp/erts/emulator/beam/bif.tab
```

| Module | Name/arity | Kind | Runtime BIF | Category | Guard | Effects | Exceptions | Host | Beam2JS |
| --- | --- | --- | :-: | --- | --- | --- | --- | --- | --- |
| `atomics` | `add/3` | bif | yes | shared atomic state | no | ? | ? | ? | not implemented |
| `atomics` | `add_get/3` | bif | yes | shared atomic state | no | ? | ? | ? | not implemented |
| `atomics` | `compare_exchange/4` | bif | yes | shared atomic state | no | ? | ? | ? | not implemented |
| `atomics` | `exchange/3` | bif | yes | shared atomic state | no | ? | ? | ? | not implemented |
| `atomics` | `get/2` | bif | yes | shared atomic state | no | ? | ? | ? | not implemented |
| `atomics` | `info/1` | bif | yes | shared atomic state | no | ? | ? | ? | not implemented |
| `atomics` | `put/3` | bif | yes | shared atomic state | no | ? | ? | ? | not implemented |
| `binary` | `at/2` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `compile_pattern/1` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `copy/1` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `copy/2` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `decode_unsigned/1` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `decode_unsigned/2` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `encode_unsigned/1` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `encode_unsigned/2` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `first/1` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `last/1` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `list_to_bin/1` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `longest_common_prefix/1` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `longest_common_suffix/1` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `match/2` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `match/3` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `matches/2` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `matches/3` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `part/2` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `part/3` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `referenced_byte_size/1` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `split/2` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `binary` | `split/3` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `code` | `coverage_support/0` | bif | yes | module / code | no | ? | ? | ? | not implemented |
| `code` | `get_coverage/2` | bif | yes | module / code | no | ? | ? | ? | not implemented |
| `code` | `get_coverage_mode/0` | bif | yes | module / code | no | ? | ? | ? | not implemented |
| `code` | `get_coverage_mode/1` | bif | yes | module / code | no | ? | ? | ? | not implemented |
| `code` | `get_debug_info/1` | bif | yes | module / code | no | ? | ? | ? | not implemented |
| `code` | `reset_coverage/1` | bif | yes | module / code | no | ? | ? | ? | not implemented |
| `code` | `set_coverage_mode/1` | bif | yes | module / code | no | ? | ? | ? | not implemented |
| `erl_ddll` | `demonitor/1` | bif | yes | native driver | no | ? | ? | OS / host | not implemented |
| `erl_ddll` | `format_error_int/1` | bif | yes | native driver | no | ? | ? | OS / host | not implemented |
| `erl_ddll` | `info/2` | bif | yes | native driver | no | ? | ? | OS / host | not implemented |
| `erl_ddll` | `loaded_drivers/0` | bif | yes | native driver | no | ? | ? | OS / host | not implemented |
| `erl_ddll` | `monitor/2` | bif | yes | native driver | no | ? | ? | OS / host | not implemented |
| `erl_ddll` | `try_load/3` | bif | yes | native driver | no | ? | ? | OS / host | not implemented |
| `erl_ddll` | `try_unload/2` | bif | yes | native driver | no | ? | ? | OS / host | not implemented |
| `erl_debugger` | `breakpoint/3` | bif | yes | debugger | no | ? | ? | ? | not implemented |
| `erl_debugger` | `breakpoints/1` | bif | yes | debugger | no | ? | ? | ? | not implemented |
| `erl_debugger` | `breakpoints/3` | bif | yes | debugger | no | ? | ? | ? | not implemented |
| `erl_debugger` | `instrumentations/0` | bif | yes | debugger | no | ? | ? | ? | not implemented |
| `erl_debugger` | `peek_stack_frame_slot/4` | bif | yes | debugger | no | ? | ? | ? | not implemented |
| `erl_debugger` | `peek_xreg/3` | bif | yes | debugger | no | ? | ? | ? | not implemented |
| `erl_debugger` | `register/1` | bif | yes | debugger | no | ? | ? | ? | not implemented |
| `erl_debugger` | `stack_frames/2` | bif | yes | debugger | no | ? | ? | ? | not implemented |
| `erl_debugger` | `supported/0` | bif | yes | debugger | no | ? | ? | ? | not implemented |
| `erl_debugger` | `toggle_instrumentations/1` | bif | yes | debugger | no | ? | ? | ? | not implemented |
| `erl_debugger` | `unregister/2` | bif | yes | debugger | no | ? | ? | ? | not implemented |
| `erl_debugger` | `whereis/0` | bif | yes | debugger | no | ? | ? | ? | not implemented |
| `erl_debugger` | `xregs_count/1` | bif | yes | debugger | no | ? | ? | ? | not implemented |
| `erlang` | `!/2` | bif | yes | message / timer | no | sends a message to a local PID or registered name | badarg for invalid destination | process runtime | instruction-and-callable |
| `erlang` | `*/2` | ubif | yes | arithmetic | operator | optimizer-pure | badarith for non-number input or float overflow | ? | arithmetic-instruction-only |
| `erlang` | `++/2` | bif | yes | list / tuple | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `+/1` | ubif | yes | arithmetic | operator | optimizer-pure | ? | ? | not implemented |
| `erlang` | `+/2` | ubif | yes | arithmetic | operator | optimizer-pure | badarith for non-number input or float overflow | ? | arithmetic-instruction-only |
| `erlang` | `--/2` | bif | yes | list / tuple | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `-/1` | ubif | yes | arithmetic | operator | optimizer-pure | badarith for non-number input | ? | arithmetic-instruction-only |
| `erlang` | `-/2` | ubif | yes | arithmetic | operator | optimizer-pure | badarith for non-number input or float overflow | ? | arithmetic-instruction-only |
| `erlang` | `//2` | ubif | yes | arithmetic | operator | optimizer-pure | badarith for non-number input, zero divisor or float conversion/result overflow | ? | arithmetic-instruction-only |
| `erlang` | `/=/2` | ubif | yes | comparison | operator | optimizer-pure | optimizer-safe | ? | not implemented |
| `erlang` | `</2` | ubif | yes | comparison | operator | optimizer-pure | optimizer-safe | ? | not implemented |
| `erlang` | `=/=/2` | ubif | yes | comparison | operator | optimizer-pure | optimizer-safe | ? | not implemented |
| `erlang` | `=:=/2` | ubif | yes | comparison | operator | optimizer-pure | optimizer-safe | ? | not implemented |
| `erlang` | `=</2` | ubif | yes | comparison | operator | optimizer-pure | optimizer-safe | ? | not implemented |
| `erlang` | `==/2` | ubif | yes | comparison | operator | optimizer-pure | optimizer-safe | ? | not implemented |
| `erlang` | `>/2` | ubif | yes | comparison | operator | optimizer-pure | optimizer-safe | ? | not implemented |
| `erlang` | `>=/2` | ubif | yes | comparison | operator | optimizer-pure | optimizer-safe | ? | not implemented |
| `erlang` | `abs/1` | ubif | yes | number | BIF | optimizer-pure | badarg for non-number input | ? | instruction-and-callable |
| `erlang` | `adler32/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `adler32/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `adler32_combine/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `alias/1` | bif | yes | signal / monitor | no | ? | ? | ? | not implemented |
| `erlang` | `and/2` | ubif | yes | boolean | operator | optimizer-pure | ? | ? | not implemented |
| `erlang` | `append/2` | bif | yes | list / tuple | no | ? | ? | ? | not implemented |
| `erlang` | `append_element/2` | bif | yes | tuple | no | ? | ? | ? | not implemented |
| `erlang` | `apply/2` | runtime | yes | function / call | no | ? | ? | ? | not implemented |
| `erlang` | `apply/3` | runtime | yes | function / call | no | ? | ? | ? | not implemented |
| `erlang` | `atom_to_binary/2` | bif | yes | conversion / encoding | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `atom_to_list/1` | bif | yes | conversion / encoding | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `band/2` | ubif | yes | arithmetic | operator | optimizer-pure | badarith for non-integer input | ? | arithmetic-instruction-only |
| `erlang` | `binary_part/2` | ubif | yes | binary / bitstring | BIF | optimizer-pure | badarg for invalid arguments or out-of-bounds range | ? | instruction-and-callable |
| `erlang` | `binary_part/3` | ubif | yes | binary / bitstring | BIF | optimizer-pure | badarg for invalid arguments or out-of-bounds range | ? | instruction-and-callable |
| `erlang` | `binary_to_atom/2` | ubif | yes | conversion / encoding | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `binary_to_existing_atom/2` | ubif | yes | conversion / encoding | no | ? | ? | ? | not implemented |
| `erlang` | `binary_to_float/1` | bif | yes | conversion / encoding | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `binary_to_list/1` | bif | yes | conversion / encoding | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `binary_to_list/3` | bif | yes | conversion / encoding | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `binary_to_term/1` | bif | yes | conversion / encoding | no | ? | ? | ? | not implemented |
| `erlang` | `binary_to_term/2` | bif | yes | conversion / encoding | no | ? | ? | ? | not implemented |
| `erlang` | `bit_size/1` | ubif | yes | binary / bitstring | BIF | optimizer-pure | badarg for non-bitstring input | ? | instruction-and-callable |
| `erlang` | `bitstring_to_list/1` | bif | yes | conversion / encoding | no | ? | ? | ? | not implemented |
| `erlang` | `bnot/1` | ubif | yes | arithmetic | operator | optimizer-pure | badarith for non-integer input | ? | arithmetic-instruction-only |
| `erlang` | `bor/2` | ubif | yes | arithmetic | operator | optimizer-pure | badarith for non-integer input | ? | arithmetic-instruction-only |
| `erlang` | `bsl/2` | ubif | yes | arithmetic | operator | optimizer-pure | ? | ? | not implemented |
| `erlang` | `bsr/2` | ubif | yes | arithmetic | operator | optimizer-pure | ? | ? | not implemented |
| `erlang` | `bump_reductions/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `bxor/2` | ubif | yes | arithmetic | operator | optimizer-pure | badarith for non-integer input | ? | arithmetic-instruction-only |
| `erlang` | `byte_size/1` | ubif | yes | binary / bitstring | BIF | optimizer-pure | badarg for non-bitstring input | ? | instruction-and-callable |
| `erlang` | `call_on_load_function/1` | bif | yes | module / native loading | no | ? | ? | ? | not implemented |
| `erlang` | `cancel_timer/1` | bif | yes | message / timer | no | cancels a timer | badarg for non-reference | clock / scheduler | callable-only |
| `erlang` | `cancel_timer/2` | bif | yes | message / timer | no | cancels a timer, optionally asynchronously | badarg for non-reference or invalid options | clock / scheduler | callable-only |
| `erlang` | `ceil/1` | ubif | yes | number | BIF | optimizer-pure | badarg for non-number input | ? | instruction-and-callable |
| `erlang` | `check_old_code/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `crc32/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `crc32/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `crc32_combine/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `date/0` | bif | yes | clock / calendar | no | ? | optimizer-safe | clock / scheduler | not implemented |
| `erlang` | `decode_packet/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `delete_element/2` | bif | yes | tuple | no | ? | ? | ? | not implemented |
| `erlang` | `delete_module/1` | bif | yes | module / native loading | no | ? | ? | ? | not implemented |
| `erlang` | `demonitor/1` | bif | yes | signal / monitor | no | ? | ? | ? | not implemented |
| `erlang` | `demonitor/2` | bif | yes | signal / monitor | no | ? | ? | ? | not implemented |
| `erlang` | `display/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `display_string/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `dist_ctrl_get_data/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `dist_ctrl_get_data_notification/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `dist_ctrl_get_opt/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `dist_ctrl_input_handler/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `dist_ctrl_put_data/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `dist_ctrl_set_opt/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `dist_get_stat/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `div/2` | ubif | yes | arithmetic | operator | optimizer-pure | badarith for zero divisor or non-integer input | ? | arithmetic-instruction-only |
| `erlang` | `dt_append_vm_tag_data/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `dt_get_tag/0` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `dt_get_tag_data/0` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `dt_prepend_vm_tag_data/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `dt_put_tag/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `dt_restore_tag/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `dt_spread_tag/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `element/2` | ubif | yes | tuple | BIF | optimizer-pure | badarg for invalid index or non-tuple | ? | instruction-and-callable |
| `erlang` | `erase/0` | bif | yes | process dictionary | no | clears the calling process dictionary | ? | process runtime | callable-only |
| `erlang` | `erase/1` | hbif | yes | process dictionary | no | removes a key from the calling process dictionary | ? | process runtime | callable-only |
| `erlang` | `error/1` | bif | yes | exception / signal | no | ? | always-raises | ? | not implemented |
| `erlang` | `error/2` | bif | yes | exception / signal | no | ? | always-raises | ? | not implemented |
| `erlang` | `error/3` | bif | yes | exception / signal | no | ? | ? | ? | not implemented |
| `erlang` | `exit/1` | bif | yes | exception / signal | no | ? | always-raises | ? | not implemented |
| `erlang` | `exit/2` | bif | yes | exception / signal | no | ? | ? | ? | not implemented |
| `erlang` | `exit/3` | bif | yes | exception / signal | no | ? | ? | ? | not implemented |
| `erlang` | `exit_signal/2` | bif | yes | signal / monitor | no | ? | ? | ? | not implemented |
| `erlang` | `exit_signal/3` | bif | yes | signal / monitor | no | ? | ? | ? | not implemented |
| `erlang` | `external_size/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `external_size/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `finish_after_on_load/2` | bif | yes | module / native loading | no | ? | ? | ? | not implemented |
| `erlang` | `finish_loading/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `float/1` | ubif | yes | number | BIF | optimizer-pure | badarg for non-number input or integer-to-float overflow | ? | instruction-and-callable |
| `erlang` | `float_to_binary/1` | bif | yes | conversion / encoding | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `float_to_binary/2` | bif | yes | conversion / encoding | no | ? | ? | ? | not implemented |
| `erlang` | `float_to_list/1` | bif | yes | conversion / encoding | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `float_to_list/2` | bif | yes | conversion / encoding | no | ? | ? | ? | not implemented |
| `erlang` | `floor/1` | ubif | yes | number | BIF | optimizer-pure | badarg for non-number input | ? | instruction-and-callable |
| `erlang` | `fun_info/2` | bif | yes | function / call | no | ? | ? | ? | not implemented |
| `erlang` | `fun_info_mfa/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `fun_to_list/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `function_exported/3` | bif | yes | module / native loading | no | ? | ? | ? | not implemented |
| `erlang` | `get/0` | bif | yes | process dictionary | no | reads the calling process dictionary | optimizer-safe | process runtime | callable-only |
| `erlang` | `get/1` | bif | yes | process dictionary | no | reads a key from the calling process dictionary | optimizer-safe | process runtime | instruction-and-callable |
| `erlang` | `get_keys/0` | bif | yes | process dictionary | no | lists the calling process dictionary keys | ? | process runtime | callable-only |
| `erlang` | `get_keys/1` | bif | yes | process dictionary | no | lists keys with an exact matching value | optimizer-safe | process runtime | callable-only |
| `erlang` | `get_module_info/1` | bif | yes | module / native loading | no | ? | ? | ? | not implemented |
| `erlang` | `get_module_info/2` | bif | yes | module / native loading | no | ? | ? | ? | not implemented |
| `erlang` | `group_leader/0` | bif | yes | process / scheduling | no | ? | optimizer-safe | ? | not implemented |
| `erlang` | `halt/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `has_prepared_code_on_load/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `hd/1` | ubif | yes | list / tuple | BIF | optimizer-pure | badarg for empty or non-cons input | ? | instruction-and-callable |
| `erlang` | `hibernate/3` | hbif | yes | process / scheduling | no | ? | ? | ? | not implemented |
| `erlang` | `insert_element/3` | bif | yes | tuple | no | ? | ? | ? | not implemented |
| `erlang` | `integer_to_binary/1` | bif | yes | conversion / encoding | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `integer_to_binary/2` | bif | yes | conversion / encoding | no | ? | ? | ? | not implemented |
| `erlang` | `integer_to_list/1` | bif | yes | conversion / encoding | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `integer_to_list/2` | bif | yes | conversion / encoding | no | ? | ? | ? | not implemented |
| `erlang` | `iolist_size/1` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `erlang` | `iolist_to_binary/1` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `erlang` | `iolist_to_iovec/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `is_atom/1` | ubif | yes | type test | BIF | optimizer-pure | optimizer-safe | ? | instruction-and-callable |
| `erlang` | `is_binary/1` | ubif | yes | type test | BIF | optimizer-pure | optimizer-safe | ? | instruction-and-callable |
| `erlang` | `is_bitstring/1` | ubif | yes | type test | BIF | optimizer-pure | optimizer-safe | ? | instruction-and-callable |
| `erlang` | `is_boolean/1` | ubif | yes | type test | BIF | optimizer-pure | optimizer-safe | ? | instruction-and-callable |
| `erlang` | `is_builtin/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `is_float/1` | ubif | yes | type test | BIF | optimizer-pure | optimizer-safe | ? | instruction-and-callable |
| `erlang` | `is_function/1` | ubif | yes | type test | BIF | optimizer-pure | optimizer-safe | ? | not implemented |
| `erlang` | `is_function/2` | ubif | yes | type test | BIF | optimizer-pure | ? | ? | not implemented |
| `erlang` | `is_integer/1` | ubif | yes | type test | BIF | optimizer-pure | optimizer-safe | ? | instruction-and-callable |
| `erlang` | `is_integer/3` | ubif | yes | type test | BIF | optimizer-pure | ? | ? | not implemented |
| `erlang` | `is_list/1` | ubif | yes | type test | BIF | optimizer-pure | optimizer-safe | ? | instruction-and-callable |
| `erlang` | `is_map/1` | ubif | yes | type test | BIF | optimizer-pure | optimizer-safe | ? | not implemented |
| `erlang` | `is_map_key/2` | ubif | yes | map | BIF | optimizer-pure | {badmap,Map} for non-map | ? | not implemented |
| `erlang` | `is_number/1` | ubif | yes | type test | BIF | optimizer-pure | optimizer-safe | ? | instruction-and-callable |
| `erlang` | `is_pid/1` | ubif | yes | type test | BIF | optimizer-pure | optimizer-safe | ? | instruction-and-callable |
| `erlang` | `is_port/1` | ubif | yes | type test | BIF | optimizer-pure | optimizer-safe | ? | not implemented |
| `erlang` | `is_process_alive/1` | bif | yes | process / scheduling | no | reads process liveness | badarg for non-PID or non-local PID | process runtime | callable-only |
| `erlang` | `is_record/1` | ubif | yes | type test | BIF | optimizer-pure | optimizer-safe | ? | not implemented |
| `erlang` | `is_record/2` | ubif | yes | type test | BIF | optimizer-pure | ? | ? | not implemented |
| `erlang` | `is_record/3` | ubif | yes | type test | BIF | optimizer-pure | ? | ? | not implemented |
| `erlang` | `is_reference/1` | ubif | yes | type test | BIF | optimizer-pure | optimizer-safe | ? | instruction-and-callable |
| `erlang` | `is_tuple/1` | ubif | yes | type test | BIF | optimizer-pure | optimizer-safe | ? | instruction-and-callable |
| `erlang` | `length/1` | ubif | yes | list / tuple | BIF | optimizer-pure | badarg for improper or non-list input | ? | instruction-and-callable |
| `erlang` | `link/1` | bif | yes | signal / monitor | no | ? | ? | ? | not implemented |
| `erlang` | `link/2` | bif | yes | signal / monitor | no | ? | ? | ? | not implemented |
| `erlang` | `list_to_atom/1` | ubif | yes | conversion / encoding | no | optimizer-pure; may add a permanent atom to the global atom table | ? | ? | not implemented |
| `erlang` | `list_to_binary/1` | bif | yes | binary / bitstring | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `list_to_bitstring/1` | bif | yes | binary / bitstring | no | ? | ? | ? | not implemented |
| `erlang` | `list_to_existing_atom/1` | ubif | yes | conversion / encoding | no | ? | ? | ? | not implemented |
| `erlang` | `list_to_float/1` | bif | yes | conversion / encoding | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `list_to_pid/1` | bif | yes | ? | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `list_to_port/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `list_to_ref/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `list_to_tuple/1` | bif | yes | list / tuple | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `load_nif/2` | bif | yes | module / native loading | no | ? | ? | native / distribution | not implemented |
| `erlang` | `loaded/0` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `localtime/0` | bif | yes | clock / calendar | no | ? | ? | clock / scheduler | not implemented |
| `erlang` | `localtime_to_universaltime/2` | bif | yes | clock / calendar | no | ? | ? | ? | not implemented |
| `erlang` | `make_fun/3` | bif | yes | function / call | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `make_ref/0` | bif | yes | identity / uniqueness | no | creates a unique local reference | optimizer-safe | runtime identity | callable-only |
| `erlang` | `make_tuple/2` | bif | yes | tuple | no | ? | ? | ? | not implemented |
| `erlang` | `make_tuple/3` | bif | yes | tuple | no | ? | ? | ? | not implemented |
| `erlang` | `map_get/2` | ubif | yes | map | BIF | optimizer-pure | {badkey,Key} if absent; {badmap,Map} for non-map | ? | not implemented |
| `erlang` | `map_size/1` | ubif | yes | map | BIF | ? | {badmap,Map} for non-map | ? | not implemented |
| `erlang` | `match_spec_test/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `max/2` | ubif | yes | ? | BIF | optimizer-pure | optimizer-safe | ? | not implemented |
| `erlang` | `md5/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `md5_final/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `md5_init/0` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `md5_update/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `min/2` | ubif | yes | ? | BIF | optimizer-pure | optimizer-safe | ? | not implemented |
| `erlang` | `module_loaded/1` | bif | yes | module / native loading | no | ? | ? | ? | not implemented |
| `erlang` | `monitor/2` | bif | yes | signal / monitor | no | ? | ? | ? | not implemented |
| `erlang` | `monitor/3` | bif | yes | signal / monitor | no | ? | ? | ? | not implemented |
| `erlang` | `monitor_node/2` | bif | yes | distribution | no | ? | ? | native / distribution | not implemented |
| `erlang` | `monitor_node/3` | bif | yes | distribution | no | ? | ? | native / distribution | not implemented |
| `erlang` | `monotonic_time/0` | bif | yes | clock / calendar | no | reads the runtime monotonic clock | ? | clock / scheduler | callable-only |
| `erlang` | `monotonic_time/1` | bif | yes | clock / calendar | no | reads the runtime monotonic clock in the requested unit | badarg for invalid time unit | clock / scheduler | callable-only |
| `erlang` | `nif_error/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `nif_error/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `node/0` | ubif | yes | distribution | BIF | ? | optimizer-safe | ? | not implemented |
| `erlang` | `node/1` | ubif | yes | distribution | BIF | ? | ? | ? | not implemented |
| `erlang` | `nodes/0` | bif | yes | distribution | no | ? | optimizer-safe | native / distribution | not implemented |
| `erlang` | `nodes/1` | bif | yes | distribution | no | ? | ? | native / distribution | not implemented |
| `erlang` | `nodes/2` | bif | yes | distribution | no | ? | ? | native / distribution | not implemented |
| `erlang` | `not/1` | ubif | yes | boolean | operator | optimizer-pure | ? | ? | not implemented |
| `erlang` | `now/0` | bif | yes | clock / calendar | no | ? | ? | clock / scheduler | not implemented |
| `erlang` | `or/2` | ubif | yes | boolean | operator | optimizer-pure | ? | ? | not implemented |
| `erlang` | `phash/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `phash2/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `phash2/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `pid_to_list/1` | bif | yes | ? | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `port_get_data/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `port_set_data/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `port_to_list/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `ports/0` | bif | yes | ? | no | ? | optimizer-safe | ? | not implemented |
| `erlang` | `posixtime_to_universaltime/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `pre_loaded/0` | bif | yes | ? | no | ? | optimizer-safe | ? | not implemented |
| `erlang` | `process_flag/2` | bif | yes | process / scheduling | no | ? | ? | ? | not implemented |
| `erlang` | `process_info/1` | hbif | yes | process / scheduling | no | ? | ? | ? | not implemented |
| `erlang` | `process_info/2` | hbif | yes | process / scheduling | no | ? | ? | ? | not implemented |
| `erlang` | `processes/0` | bif | yes | process / scheduling | no | ? | optimizer-safe | ? | not implemented |
| `erlang` | `put/2` | hbif | yes | process dictionary | no | updates the calling process dictionary | ? | process runtime | callable-only |
| `erlang` | `raise/3` | bif | yes | exception / signal | no | ? | ? | ? | not implemented |
| `erlang` | `read_timer/1` | bif | yes | message / timer | no | reads remaining timer time | badarg for non-reference | clock / scheduler | callable-only |
| `erlang` | `read_timer/2` | bif | yes | message / timer | no | reads remaining timer time, optionally asynchronously | badarg for non-reference or invalid options | clock / scheduler | callable-only |
| `erlang` | `ref_to_list/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `register/2` | bif | yes | process registry | no | registers a local process name | badarg for invalid or already registered name or process | process runtime | callable-only |
| `erlang` | `registered/0` | bif | yes | process registry | no | lists local registered names | optimizer-safe | process runtime | callable-only |
| `erlang` | `rem/2` | ubif | yes | arithmetic | operator | optimizer-pure | badarith for zero divisor or non-integer input | ? | arithmetic-instruction-only |
| `erlang` | `resume_process/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `round/1` | ubif | yes | number | BIF | optimizer-pure | badarg for non-number input | ? | instruction-and-callable |
| `erlang` | `self/0` | ubif | yes | process / scheduling | BIF | reads calling process identity | optimizer-safe | process runtime | instruction-and-callable |
| `erlang` | `send/2` | bif | yes | message / timer | no | sends a message to a local PID or registered name | badarg for invalid destination | process runtime | callable-only |
| `erlang` | `send/3` | bif | yes | message / timer | no | ? | ? | ? | not implemented |
| `erlang` | `send_after/3` | bif | yes | message / timer | no | schedules a message to a local PID or name | badarg for negative or non-integer delay or invalid destination | clock / scheduler | callable-only |
| `erlang` | `send_after/4` | bif | yes | message / timer | no | schedules a relative or absolute message to a local PID or name | badarg for invalid arguments or options | clock / scheduler | callable-only |
| `erlang` | `seq_trace/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `seq_trace_info/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `seq_trace_print/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `seq_trace_print/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `setelement/3` | bif | yes | tuple | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `setnode/2` | bif | yes | distribution | no | ? | ? | native / distribution | not implemented |
| `erlang` | `size/1` | ubif | yes | ? | BIF | optimizer-pure | ? | ? | not implemented |
| `erlang` | `spawn/3` | bif | yes | process / scheduling | no | schedules a local process | badarg for non-atom module/function or improper argument list | process runtime | callable-only |
| `erlang` | `spawn_link/3` | bif | yes | process / scheduling | no | ? | ? | ? | not implemented |
| `erlang` | `spawn_opt/4` | bif | yes | process / scheduling | no | ? | ? | ? | not implemented |
| `erlang` | `spawn_request_abandon/1` | bif | yes | process / scheduling | no | ? | ? | ? | not implemented |
| `erlang` | `split_binary/2` | bif | yes | binary / bitstring | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `start_timer/3` | bif | yes | message / timer | no | schedules a timeout tuple to a local PID or name | badarg for negative or non-integer delay or invalid destination | clock / scheduler | callable-only |
| `erlang` | `start_timer/4` | bif | yes | message / timer | no | schedules a relative or absolute timeout tuple to a local PID or name | badarg for invalid arguments or options | clock / scheduler | callable-only |
| `erlang` | `statistics/1` | bif | yes | runtime system | no | ? | ? | ? | not implemented |
| `erlang` | `subtract/2` | bif | yes | list / tuple | no | ? | ? | ? | not implemented |
| `erlang` | `system_flag/2` | bif | yes | runtime system | no | ? | ? | ? | not implemented |
| `erlang` | `system_info/1` | bif | yes | runtime system | no | ? | ? | ? | not implemented |
| `erlang` | `system_profile/0` | bif | yes | runtime system | no | ? | ? | ? | not implemented |
| `erlang` | `system_profile/2` | bif | yes | runtime system | no | ? | ? | ? | not implemented |
| `erlang` | `system_time/0` | bif | yes | clock / calendar | no | ? | ? | clock / scheduler | not implemented |
| `erlang` | `system_time/1` | bif | yes | clock / calendar | no | ? | ? | clock / scheduler | not implemented |
| `erlang` | `term_to_binary/1` | bif | yes | conversion / encoding | no | ? | optimizer-safe | ? | not implemented |
| `erlang` | `term_to_binary/2` | bif | yes | conversion / encoding | no | ? | ? | ? | not implemented |
| `erlang` | `term_to_iovec/1` | bif | yes | conversion / encoding | no | ? | ? | ? | not implemented |
| `erlang` | `term_to_iovec/2` | bif | yes | conversion / encoding | no | ? | ? | ? | not implemented |
| `erlang` | `throw/1` | bif | yes | exception / signal | no | ? | always-raises | ? | not implemented |
| `erlang` | `time/0` | bif | yes | clock / calendar | no | ? | optimizer-safe | clock / scheduler | not implemented |
| `erlang` | `time_offset/0` | bif | yes | clock / calendar | no | ? | ? | clock / scheduler | not implemented |
| `erlang` | `time_offset/1` | bif | yes | clock / calendar | no | ? | ? | clock / scheduler | not implemented |
| `erlang` | `timestamp/0` | bif | yes | clock / calendar | no | ? | ? | clock / scheduler | not implemented |
| `erlang` | `tl/1` | ubif | yes | list / tuple | BIF | optimizer-pure | badarg for empty or non-cons input | ? | instruction-and-callable |
| `erlang` | `trace_delivered/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `trace_info/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `trunc/1` | ubif | yes | number | BIF | optimizer-pure | badarg for non-number input | ? | instruction-and-callable |
| `erlang` | `tuple_size/1` | ubif | yes | tuple | BIF | optimizer-pure | badarg for non-tuple | ? | instruction-and-callable |
| `erlang` | `tuple_to_list/1` | bif | yes | list / tuple | no | optimizer-pure | ? | ? | not implemented |
| `erlang` | `unalias/1` | bif | yes | signal / monitor | no | ? | ? | ? | not implemented |
| `erlang` | `unique_integer/0` | bif | yes | identity / uniqueness | no | ? | ? | ? | not implemented |
| `erlang` | `unique_integer/1` | bif | yes | identity / uniqueness | no | ? | ? | ? | not implemented |
| `erlang` | `universaltime/0` | bif | yes | clock / calendar | no | ? | ? | clock / scheduler | not implemented |
| `erlang` | `universaltime_to_localtime/1` | bif | yes | clock / calendar | no | ? | ? | ? | not implemented |
| `erlang` | `universaltime_to_posixtime/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erlang` | `unlink/1` | bif | yes | signal / monitor | no | ? | ? | ? | not implemented |
| `erlang` | `unregister/1` | bif | yes | process registry | no | removes a local process name | badarg for unregistered or non-atom name | process runtime | callable-only |
| `erlang` | `whereis/1` | bif | yes | process registry | no | looks up a local process name | badarg for non-atom name | process runtime | callable-only |
| `erlang` | `xor/2` | ubif | yes | boolean | operator | optimizer-pure | ? | ? | not implemented |
| `erlang` | `yield/0` | runtime | yes | process / scheduling | no | ? | ? | ? | not implemented |
| `error_logger` | `warning_map/0` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_debug` | `breakpoint/2` | bif | yes | runtime debugging | no | ? | ? | ? | not implemented |
| `erts_debug` | `copy_shared/2` | bif | yes | runtime debugging | no | ? | ? | ? | not implemented |
| `erts_debug` | `dirty/3` | bif | yes | runtime debugging | no | ? | ? | ? | not implemented |
| `erts_debug` | `dirty_cpu/2` | bif | yes | runtime debugging | no | ? | ? | ? | not implemented |
| `erts_debug` | `dirty_io/2` | bif | yes | runtime debugging | no | ? | ? | ? | not implemented |
| `erts_debug` | `disassemble/1` | bif | yes | runtime debugging | no | ? | ? | ? | not implemented |
| `erts_debug` | `dist_ext_to_term/2` | bif | yes | runtime debugging | no | ? | ? | ? | not implemented |
| `erts_debug` | `flat_size/1` | bif | yes | runtime debugging | no | ? | ? | ? | not implemented |
| `erts_debug` | `get_internal_state/1` | bif | yes | runtime debugging | no | ? | ? | ? | not implemented |
| `erts_debug` | `instructions/0` | bif | yes | runtime debugging | no | ? | ? | ? | not implemented |
| `erts_debug` | `interpreter_size/0` | bif | yes | runtime debugging | no | ? | ? | ? | not implemented |
| `erts_debug` | `lcnt_clear/0` | bif | yes | runtime debugging | no | ? | ? | ? | not implemented |
| `erts_debug` | `lcnt_collect/0` | bif | yes | runtime debugging | no | ? | ? | ? | not implemented |
| `erts_debug` | `lcnt_control/1` | bif | yes | runtime debugging | no | ? | ? | ? | not implemented |
| `erts_debug` | `lcnt_control/2` | bif | yes | runtime debugging | no | ? | ? | ? | not implemented |
| `erts_debug` | `map_info/1` | bif | yes | runtime debugging | no | ? | ? | ? | not implemented |
| `erts_debug` | `same/2` | bif | yes | runtime debugging | no | ? | ? | ? | not implemented |
| `erts_debug` | `set_internal_state/2` | bif | yes | runtime debugging | no | ? | ? | ? | not implemented |
| `erts_debug` | `size_shared/1` | bif | yes | runtime debugging | no | ? | ? | ? | not implemented |
| `erts_debug` | `unaligned_bitstring/2` | bif | yes | runtime debugging | no | ? | ? | ? | not implemented |
| `erts_internal` | `abort_pending_connection/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `atomics_new/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `beamfile_chunk/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `beamfile_module_md5/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `binary_to_integer/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `check_dirty_process_code/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `check_process_code/1` | hbif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `cmp_term/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `counters_add/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `counters_get/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `counters_info/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `counters_new/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `counters_put/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `create_dist_channel/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `dirty_process_handle_signals/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `dist_spawn_request/4` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `erase_persistent_terms/0` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `ets_lookup_binary_info/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `ets_raw_first/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `ets_raw_next/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `ets_super_user/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `garbage_collect/1` | hbif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `gather_alloc_histograms/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `gather_carrier_info/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `get_creation/0` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `get_dflags/0` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `group_leader/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `group_leader/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `is_process_alive/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `is_process_executing_dirty/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `is_system_process/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `list_to_integer/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `map_hashmap_children/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `map_next/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `map_to_tuple_keys/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `new_connection/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `no_aux_work_threads/0` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `notify_breakpoint_hit/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `open_port/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `perf_counter_unit/0` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `port_call/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `port_close/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `port_command/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `port_connect/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `port_control/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `port_info/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `port_info/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `prepare_loading/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `process_display/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `process_flag/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `processes_next/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `purge_module/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `request_system_task/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `request_system_task/4` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `scheduler_wall_time/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `spawn_request/4` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `spawn_system_process/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `suspend_process/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `system_check/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `system_monitor/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `system_monitor/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `term_to_string/2` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `term_type/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `time_unit/0` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `trace/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `trace/4` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `trace_info/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `trace_pattern/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `trace_pattern/4` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `trace_session_create/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_internal` | `trace_session_destroy/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_literal_area_collector` | `release_area_switch/0` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_literal_area_collector` | `send_copy_request/3` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_trace_cleaner` | `check/0` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `erts_trace_cleaner` | `send_trace_clean_signal/1` | bif | yes | ? | no | ? | ? | ? | not implemented |
| `ets` | `delete/1` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `delete/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `delete_object/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `first/1` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `first_lookup/1` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `give_away/3` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `info/1` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `info/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `insert/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `insert_new/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `internal_delete_all/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `internal_request_all/0` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `internal_select_delete/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `is_compiled_ms/1` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `last/1` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `last_lookup/1` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `lookup/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `lookup_element/3` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `lookup_element/4` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `match/1` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `match/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `match/3` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `match_object/1` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `match_object/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `match_object/3` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `match_spec_compile/1` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `match_spec_run_r/3` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `member/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `new/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `next/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `next_lookup/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `prev/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `prev_lookup/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `rename/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `safe_fixtable/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `select/1` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `select/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `select/3` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `select_count/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `select_replace/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `select_reverse/1` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `select_reverse/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `select_reverse/3` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `setopts/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `slot/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `take/2` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `update_counter/3` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `update_counter/4` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `update_element/3` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `update_element/4` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `ets` | `whereis/1` | bif | yes | shared term table | no | ? | ? | ? | not implemented |
| `file` | `native_name_encoding/0` | bif | yes | file / OS | no | ? | ? | OS / host | not implemented |
| `io` | `printable_range/0` | bif | yes | I/O | no | ? | ? | OS / host | not implemented |
| `lists` | `keyfind/3` | bif | yes | list | no | ? | ? | ? | not implemented |
| `lists` | `keymember/3` | bif | yes | list | no | ? | ? | ? | not implemented |
| `lists` | `keysearch/3` | bif | yes | list | no | ? | ? | ? | not implemented |
| `lists` | `member/2` | bif | yes | list | no | ? | ? | ? | not implemented |
| `lists` | `reverse/2` | bif | yes | list | no | ? | ? | ? | not implemented |
| `maps` | `find/2` | bif | yes | map | no | ? | ? | ? | not implemented |
| `maps` | `from_keys/2` | bif | yes | map | no | ? | ? | ? | not implemented |
| `maps` | `from_list/1` | bif | yes | map | no | ? | ? | ? | not implemented |
| `maps` | `get/2` | bif | yes | map | no | optimizer-pure | {badkey,Key} if absent; {badmap,Map} for non-map | ? | not implemented |
| `maps` | `is_key/2` | bif | yes | map | no | optimizer-pure | {badmap,Map} for non-map | ? | not implemented |
| `maps` | `keys/1` | bif | yes | map | no | ? | ? | ? | not implemented |
| `maps` | `merge/2` | bif | yes | map | no | ? | ? | ? | not implemented |
| `maps` | `put/3` | bif | yes | map | no | ? | ? | ? | not implemented |
| `maps` | `remove/2` | bif | yes | map | no | ? | ? | ? | not implemented |
| `maps` | `take/2` | bif | yes | map | no | ? | ? | ? | not implemented |
| `maps` | `update/3` | bif | yes | map | no | ? | ? | ? | not implemented |
| `maps` | `values/1` | bif | yes | map | no | ? | ? | ? | not implemented |
| `math` | `acos/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `acosh/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `asin/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `asinh/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `atan/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `atan2/2` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `atanh/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `ceil/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `cos/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `cosh/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `erf/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `erfc/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `exp/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `floor/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `fmod/2` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `log/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `log10/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `log2/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `pow/2` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `sin/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `sinh/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `sqrt/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `tan/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `math` | `tanh/1` | bif | yes | number | no | optimizer-pure | ? | ? | not implemented |
| `net_kernel` | `dflag_unicode_io/1` | bif | yes | distribution | no | ? | ? | OS / host | not implemented |
| `os` | `env/0` | bif | yes | OS / clock | no | ? | ? | OS / host | not implemented |
| `os` | `getenv/1` | bif | yes | OS / clock | no | ? | ? | OS / host | not implemented |
| `os` | `getpid/0` | bif | yes | OS / clock | no | ? | ? | OS / host | not implemented |
| `os` | `perf_counter/0` | bif | yes | OS / clock | no | ? | ? | OS / host | not implemented |
| `os` | `putenv/2` | bif | yes | OS / clock | no | ? | ? | OS / host | not implemented |
| `os` | `set_signal/2` | bif | yes | OS / clock | no | ? | ? | OS / host | not implemented |
| `os` | `system_time/0` | bif | yes | OS / clock | no | ? | ? | OS / host | not implemented |
| `os` | `system_time/1` | bif | yes | OS / clock | no | ? | ? | OS / host | not implemented |
| `os` | `timestamp/0` | bif | yes | OS / clock | no | ? | ? | OS / host | not implemented |
| `os` | `unsetenv/1` | bif | yes | OS / clock | no | ? | ? | OS / host | not implemented |
| `persistent_term` | `erase/1` | bif | yes | shared persistent state | no | ? | ? | ? | not implemented |
| `persistent_term` | `get/0` | bif | yes | shared persistent state | no | ? | ? | ? | not implemented |
| `persistent_term` | `get/1` | bif | yes | shared persistent state | no | ? | ? | ? | not implemented |
| `persistent_term` | `get/2` | bif | yes | shared persistent state | no | ? | ? | ? | not implemented |
| `persistent_term` | `info/0` | bif | yes | shared persistent state | no | ? | ? | ? | not implemented |
| `persistent_term` | `put/2` | bif | yes | shared persistent state | no | ? | ? | ? | not implemented |
| `persistent_term` | `put_new/2` | bif | yes | shared persistent state | no | ? | ? | ? | not implemented |
| `prim_file` | `internal_name2native/1` | bif | yes | file / OS | no | ? | ? | OS / host | not implemented |
| `prim_file` | `internal_native2name/1` | bif | yes | file / OS | no | ? | ? | OS / host | not implemented |
| `prim_file` | `internal_normalize_utf8/1` | bif | yes | file / OS | no | ? | ? | OS / host | not implemented |
| `prim_file` | `is_translatable/1` | bif | yes | file / OS | no | ? | ? | OS / host | not implemented |
| `re` | `compile/1` | bif | yes | regular expression | no | ? | ? | ? | not implemented |
| `re` | `compile/2` | bif | yes | regular expression | no | ? | ? | ? | not implemented |
| `re` | `import/1` | bif | yes | regular expression | no | ? | ? | ? | not implemented |
| `re` | `inspect/2` | bif | yes | regular expression | no | ? | ? | ? | not implemented |
| `re` | `internal_run/4` | bif | yes | regular expression | no | ? | ? | ? | not implemented |
| `re` | `run/2` | bif | yes | regular expression | no | ? | ? | ? | not implemented |
| `re` | `run/3` | bif | yes | regular expression | no | ? | ? | ? | not implemented |
| `re` | `version/0` | bif | yes | regular expression | no | ? | ? | ? | not implemented |
| `records` | `create/4` | bif | yes | native record | no | ? | ? | ? | not implemented |
| `records` | `get/2` | bif | yes | native record | no | ? | ? | ? | not implemented |
| `records` | `get_definition/2` | bif | yes | native record | no | ? | ? | ? | not implemented |
| `records` | `get_field_names/1` | bif | yes | native record | no | ? | ? | ? | not implemented |
| `records` | `get_module/1` | bif | yes | native record | no | ? | ? | ? | not implemented |
| `records` | `get_name/1` | bif | yes | native record | no | ? | ? | ? | not implemented |
| `records` | `is_exported/1` | bif | yes | native record | no | ? | ? | ? | not implemented |
| `records` | `update/4` | bif | yes | native record | no | ? | ? | ? | not implemented |
| `string` | `list_to_float/1` | bif | yes | text | no | ? | ? | ? | not implemented |
| `unicode` | `bin_is_7bit/1` | bif | yes | text / encoding | no | ? | ? | ? | not implemented |
| `unicode` | `characters_to_binary/2` | bif | yes | text / encoding | no | ? | ? | ? | not implemented |
| `unicode` | `characters_to_list/2` | bif | yes | text / encoding | no | ? | ? | ? | not implemented |
