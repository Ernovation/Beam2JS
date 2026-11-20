# Generic opcode ledger: OTP 29.1.2

Source: [OTP 29.1.2 genop.tab](https://github.com/erlang/otp/blob/OTP-29.1.2/lib/compiler/src/genop.tab),
BEAM format 0, SHA-256 `70ae56774acabc7becbdc13b7c146bbbb8767f25e1495ea47656c0d2dd44311f`. Numbers, names,
arities, deprecated markers and any operand names below are extracted from that
file, independently of `beam_disasm`. Operand names are illustrative, not
validated types or an exhaustive list of forms. "Not specified" means the
table has no matching `@spec`, not that the instruction has no operands.
Known discrepancies in upstream spec annotations are not used to determine
arity. Active means not marked deprecated in this table; it does not establish
loader acceptance or compiler emission.

## Status key

Each entry has five status columns: decoding (D), validation (V), lowering
(L), runtime semantics (R), and tests (T). Their initial values are:

- **?**: raw opcode/operand mapping not fully independently verified. OTP's
  internal disassembler is used, but can normalize or consume instructions.
- **N**: not implemented or not independently tested for this raw opcode.
- **P**: partial support or tests for a similarly named *normalized* form;
  complete raw mapping, all variants, and full Erlang semantics remain unverified.

All entries currently have D = ? and V = N: there is no raw opcode decoder or
complete validation. Entries with P in L/R/T refer only to the narrow normalized
forms described in their notes; all others are N. Selected raw guard encodings
have been checked as described below, but Beam2JS has no raw decoder. N for
lowering does not mean
that the disassembler necessarily exposes that raw opcode unchanged. N for
tests means no raw-opcode-specific Beam2JS differential coverage; it does not imply
that an instruction never appears in a fixture. Tests marked P cover only
selected normalized forms, not comprehensive opcode or operand coverage.
The comparison and type-test slice is exercised against OTP in Node and
Chromium, including stripped input. Supported source operands include ordinary
and type-tagged x registers (hints are ignored, not validated), as well as
supported literals; y registers are not supported. `func_info` raises a host error, not an Erlang exception. `line`
is ignored and its effect on executable/debug metadata is not established.

The operand column preserves names from available upstream specifications.
The OTP notes summarize selected forms and control-flow behavior from
[`genop.tab`](https://github.com/erlang/otp/blob/OTP-29.1.2/lib/compiler/src/genop.tab),
[`beam_asm.erl`](https://github.com/erlang/otp/blob/OTP-29.1.2/lib/compiler/src/beam_asm.erl)
and [`beam_validator.erl`](https://github.com/erlang/otp/blob/OTP-29.1.2/lib/compiler/src/beam_validator.erl).
They include assembler-level terms, not exhaustive raw encodings or a guarantee
that every combination is accepted by the loader. Typed x/y registers, atom,
integer, nil, literal-table, label and list encodings are described in the
assembler; individual instruction constraints still require verification.
Where present, the separate Beam2JS note describes the normalized slice.
Unlisted operand forms, failure edges and historical deprecated forms remain to
be investigated. This is an initial inventory, not a compatibility claim.

## Raw operand encoding

The OTP 29.1.2 [assembler](https://github.com/erlang/otp/blob/OTP-29.1.2/lib/compiler/src/beam_asm.erl)
emits a generic opcode byte followed by compact tagged operands.
The low three bits identify `u` (0, unsigned), `i` (1, integer),
`a` (2, atom table index), `x` (3, x register), `y` (4, y register),
`f` (5, label), `h` (6, historical character tag) or `z` (7, extended).
Atom index zero denotes nil; label zero is a special failure label rather than
a normal branch target. Operand tags alone do not establish that a particular
instruction accepts the value.

For ordinary tagged numbers, bit 3 clear encodes a four-bit nonnegative value
in the high nibble. With bit 3 set and bit 4 clear, the upper three bits and
the next byte encode an 11-bit nonnegative value. With both bits set, the high
three bits select a big-endian payload length of two through eight bytes; seven
instead means a following `u`-tagged value giving the payload length minus nine. Long `i` payloads
are signed two's-complement. The assembler uses literal-table references for
integer magnitudes at least 2^128 and for floats.

The loader's [operand reader](https://github.com/erlang/otp/blob/OTP-29.1.2/erts/emulator/beam/beam_file.c)
recognizes extended tags `z=1` for an operand list, `z=2` for a float
register, `z=3` for allocation information, `z=4` for a literal-table
reference and `z=5` for a type-tagged register. Lists are allowed only as the
last generic operand. The old `z=0` inline-float form is rejected by this
loader. Extended values have additional operands; they are not single-byte
standalone values.

`npm run test:opcodes` assembles and loads small guard functions and compares
their entire raw code streams with independently specified bytes. It covers
the five type tests and six comparisons in Beam2JS's normalized subset using
x and y registers, with and without `any` type hints; binary comparisons cover
x/x, y/x and x/y. `is_eq_exact/3` additionally covers atom, nil, float-literal
and integer operands, compact integer boundaries and literal-table thresholds. It
checks successful and failing paths in OTP, including numeric equality and
signed-zero examples.
The test also reads the raw guard instructions in the compiler-generated
[`guards.erl`](../fixtures/guards.erl), including stripped input. For example,
`different/2` compiles to `is_eq_exact/3` with its failure branch leading
to the unequal result, rather than a raw `is_ne_exact/3`. These examples do
not verify all operand combinations, assembler transformations or Beam2JS raw
decoding.

The [control-flow assembly fixture](../fixtures/raw_control_flow.S) checks
the complete raw instruction stream and import table for labels, function
metadata, moves, return, jump, and local and external tail calls. In
particular, the raw `call_only/2` uses a local label while the disassembler
returns a module/function/arity target; `call_ext_only/2` uses an import
index which the disassembler resolves to an external function. OTP, Node and
Chromium exercise the fixture's results, including stripped input. Stack
allocation, deallocation and x-to-y moves are also present in the raw guard
fixtures, but are not implemented by Beam2JS.

The [selection fixture](../fixtures/raw_select.S) verifies the complete raw
streams for `select_val/3` with atom, integer and float choices and for
`select_tuple_arity/3`. The final `z=1` operand is followed by an unsigned
count of list *elements*, not pairs, then alternating values and labels; float
choices use literal-table references. The fixture checks matching and default
branches in OTP, Node and Chromium, including stripped input. Its tuple
selection is preceded by `is_tuple/2`. The
[compiler-generated selection fixture](../fixtures/select_slice.erl) and
[signed-zero and big-integer fixture](../fixtures/raw_select_zero.S) also
exercise exact selection. Focused tests also check that the OTP compiler validator rejects
mixed atom/integer choices and a tuple-selection source not established as a
tuple; these checks do not establish loader rejection of malformed input.
Beam2JS supports the tested normalized selection forms but rejects mixed or
duplicate choices, zero labels and unsupported operands.
The [typed selection fixture](../fixtures/typed_select_slice.erl) exercises a
compiler-generated type-tagged x source in OTP, Node and Chromium, including
stripped input.
Tuple-arity selection assumes a tuple source and raises a host error otherwise.

The [BIF assembly fixture](../fixtures/raw_bifs.S) checks raw `bif0/2`,
`bif1/4`, `bif2/5`, `gc_bif1/5`, `gc_bif2/6` and `gc_bif3/7`
instructions and their import table against OTP, including stripped input.
The tested `hd/1` and `+/2` forms branch on guard failure with a nonzero
label but raise `badarg` and `badarith` respectively with label zero.
`bif0/2` has no failure-label operand; the disassembler represents its
tested `self/0` form with `nofail`. These are selected forms, not complete
coverage of BIFs or operands. Beam2JS rejects this full fixture because it
includes unsupported BIFs and exception forms. Separately, it supports selected
non-failing normalized type-predicate BIF instructions for supported operands;
the compiler-generated and assembly fixtures are tested against OTP in Node
and Chromium, including stripped input. Nonzero-label `hd/1`, `tl/1`,
`tuple_size/1` and `element/2` guard instructions are tested using
[compiler-generated](../fixtures/guard_bifs.erl) and
[assembly](../fixtures/raw_guard_bifs.S) fixtures in OTP, Node and Chromium,
including stripped input. Invalid arguments branch without writing the
destination; zero-label exception forms are rejected. The
[length guard fixture](../fixtures/length_guards.erl) and
[assembly fixture](../fixtures/raw_length_guards.S) exercise nonzero-label
`length/1` on proper, improper and non-list inputs in OTP, Node and Chromium,
including stripped input. They also check 10,000-element proper and improper
lists. Traversal is synchronous and can block the host event loop; OTP
reductions and scheduling are not reproduced. Zero-label exception forms are
rejected. The
[bitwise guard fixture](../fixtures/bitwise_guards.erl) and
[assembly fixture](../fixtures/raw_bitwise_guards.S) cover nonzero-label
`band`, `bor`, `bxor` and `bnot` on integers, including negative and
large values, aliased destinations and invalid arguments, in OTP, Node and
Chromium with stripped input. Their zero-label exception forms are rejected;
OTP garbage collection, resource limits and scheduling effects are not reproduced.
The [integer guard fixture](../fixtures/integer_guards.erl) and
[assembly fixture](../fixtures/raw_integer_guards.S) exercise nonzero-label
`div` and `rem`, including negative and large integers, aliased
destinations, non-integers and zero divisors in OTP, Node and Chromium with
stripped input. Division truncates toward zero; the remainder has the
dividend's sign. Zero-label exception forms are rejected.
The
[list fixture](../fixtures/list_slice.erl)
also exercises nil, list construction and extraction, including an aliased
`get_list` source and destination. The integer-word `test_heap` form is a
no-op; OTP GC, memory exhaustion and scheduler effects are not reproduced.
The [tuple fixture](../fixtures/tuple_slice.erl) exercises construction,
tagged matching, extraction and the empty tuple literal. The
[literal fixture](../fixtures/literal_terms.erl) exercises nested proper and
improper lists and tuples in moves, comparisons and construction, including
stripped input. A 10,000-element literal is also tested in OTP, Node and
Chromium. Only integer, float, atom, list and tuple literal values are
supported; unsupported nested values reject compilation. The tuple arity and
extraction forms assume the input has passed the appropriate tuple test;
malformed input can raise a host error rather than an Erlang exception.

The loader also accepts the tested `any`-hinted x and y guard operands when
their `Type` chunk is removed, treating them as ordinary registers. OTP
29.1.2's disassembler fails on those same files, so Beam2JS rejects them.
With the chunk present, the disassembler exposes a type-tagged register.
Beam2JS reads the underlying x register without validating or relying on the
type hint. The [typed guard fixture](../fixtures/raw_typed.S) checks hinted
x-register type tests and comparisons against OTP in Node and Chromium,
including stripped input. Typed and ordinary y registers remain unsupported.

## Obsolete instructions

The leading `-` in `genop.tab` denotes an obsolete instruction. OTP 29.1.2's
[`beam_makeops` documentation](https://github.com/erlang/otp/blob/OTP-29.1.2/erts/emulator/internal_doc/beam_makeops.md)
states that the compiler must not generate these instructions and the loader
refuses them. The [generator](https://github.com/erlang/otp/blob/OTP-29.1.2/erts/emulator/utils/beam_makeops)
prohibits their specific instructions and transformations; the
[loader](https://github.com/erlang/otp/blob/OTP-29.1.2/erts/emulator/beam/beam_load.c)
reports a recompile error when neither exists. Raw operands are decoded first,
so malformed input can fail earlier. Representative zero-, two- and eight-operand
obsolete opcodes are checked against the pinned loader by `npm run test:opcodes`;
this is not an exhaustive empirical test of all historical forms.

This describes OTP's loader, not a guarantee that Beam2JS rejects every such
input: its current disassembler-based pipeline does not independently validate
the raw opcode stream. Rejection is not opcode implementation, and older OTP
releases may have accepted these instructions.

Regenerate or verify using the exact upstream file:

```sh
curl -fsSL https://raw.githubusercontent.com/erlang/otp/OTP-29.1.2/lib/compiler/src/genop.tab -o /tmp/beam2js-genop.tab
node tools/opcode-ledger.mjs /tmp/beam2js-genop.tab > docs/opcodes-otp-29.1.2.md
node tools/opcode-ledger.mjs --check /tmp/beam2js-genop.tab
```

| Opcode | Instruction | Lifecycle | Operand names | D | V | L | R | T | Forms / control-flow notes |
| ---: | --- | --- | --- | :-: | :-: | :-: | :-: | :-: | --- |
| 1 | `label/1` | active | Lbl | ? | N | P | P | P | OTP: Defines a module-local branch target; execution continues. Raw evidence: Unsigned label values in guard and control-flow fixtures. Beam2JS: Label; next instruction. |
| 2 | `func_info/3` | active | M F A | ? | N | P | P | P | OTP: Module atom, function atom and arity; function-clause failure path. Raw evidence: Module/function atom indexes and unsigned arities 0, 1 and 2. Beam2JS: Matching module/function/arity; function-clause host error. |
| 3 | `int_code_end/0` | active | not specified | ? | N | N | N | N | OTP: Marks the end of the code stream; consumed by the disassembler. Raw evidence: Zero-operand end marker at the end of the tested code streams. |
| 4 | `call/2` | active | Arity Label | ? | N | N | N | N | OTP: Local label and arity; saves a continuation before transferring control. |
| 5 | `call_last/3` | active | Arity Label Deallocate | ? | N | N | N | N | OTP: Local label and arity; deallocates a frame and tail-transfers. |
| 6 | `call_only/2` | active | Arity Label | ? | N | P | P | P | OTP: Local label and arity; tail transfer without a new continuation. Raw evidence: Arity 1 and local label target; disassembler resolves the label to module/function/arity. Beam2JS: Known local target, arity 0..255; tail transfer. |
| 7 | `call_ext/2` | active | Arity Destination | ? | N | N | N | N | OTP: Import-table destination and arity; saves a continuation before transferring control. |
| 8 | `call_ext_last/3` | active | Arity Destination Deallocate | ? | N | N | N | N | OTP: Import-table destination and arity; deallocates a frame and tail-transfers. |
| 9 | `bif0/2` | active | Bif Reg | ? | N | N | N | N | OTP: BIF import and destination; the assembler treats zero-argument BIFs as non-failing. Raw evidence: Import index for self/0 and x destination; disassembler exposes nofail. |
| 10 | `bif1/4` | active | Lbl Bif Arg Reg | ? | N | P | P | P | OTP: Failure label, BIF import, arguments and destination; zero label denotes exception, otherwise failure branches. Raw evidence: hd/1 import, x source/destination, nonzero failure label or exception label zero. Beam2JS: Normalized is_integer, is_number, is_atom, is_boolean, is_float, is_list or is_tuple BIF with zero failure label; hd, tl and tuple_size with nonzero failure label; supported term source and x destination only. |
| 11 | `bif2/5` | active | Lbl Bif Arg1 Arg2 Reg | ? | N | P | P | P | OTP: Failure label, BIF import, arguments and destination; zero label denotes exception, otherwise failure branches. Raw evidence: element/2 import, two x sources, x destination and nonzero failure label. Beam2JS: Normalized element BIF with supported index and tuple operands, x destination and nonzero failure label; invalid arguments branch without changing the destination. |
| 12 | `allocate/2` | active | StackNeed Live | ? | N | N | N | N | OTP: Stack size and live count; allocate_heap also reserves heap. Saves continuation; stack slots are not initialized. Raw evidence: Stack size 1 and live x-register count 1 or 2 in guard fixtures. |
| 13 | `allocate_heap/3` | active | StackNeed HeapNeed Live | ? | N | N | N | N | OTP: Stack size and live count; allocate_heap also reserves heap. Saves continuation; stack slots are not initialized. |
| 14 | `allocate_zero/2` | deprecated | StackNeed Live | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Deprecated zero-initializing stack allocation; heap variant also reserves heap. |
| 15 | `allocate_heap_zero/3` | deprecated | StackNeed HeapNeed Live | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Deprecated zero-initializing stack allocation; heap variant also reserves heap. |
| 16 | `test_heap/2` | active | HeapNeed Live | ? | N | P | P | P | OTP: Heap need and live x-register count; may perform GC and continues. Beam2JS: Nonnegative word count and live x-register count; no-op under JavaScript GC, without OTP resource or scheduling semantics. |
| 17 | `init/1` | deprecated | N | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Deprecated initialization of one stack slot to nil. |
| 18 | `deallocate/1` | active | N | ? | N | N | N | N | OTP: Restores continuation and removes the indicated stack frame. Raw evidence: Stack size 1 on both guard outcomes. |
| 19 | `return/0` | active | (none) | ? | N | P | P | P | OTP: Returns x0 to the continuation. Raw evidence: Zero-operand return in guard and control-flow fixtures. Beam2JS: Return x0 to caller. |
| 20 | `send/0` | active | (none) | ? | N | N | N | N | OTP: Sends x1 to destination x0 and returns the message in x0; may raise. |
| 21 | `remove_message/0` | active | (none) | ? | N | N | N | N | OTP: Removes the selected mailbox message and clears timeout state. |
| 22 | `timeout/0` | active | (none) | ? | N | N | N | N | OTP: Resets receive position and timeout state. |
| 23 | `loop_rec/2` | active | Label Source | ? | N | N | N | N | OTP: Loads current message into a destination, or branches when the mailbox is exhausted. |
| 24 | `loop_rec_end/1` | active | Label | ? | N | N | N | N | OTP: Advances mailbox scan and branches back to the receive loop. |
| 25 | `wait/1` | active | Label | ? | N | N | N | N | OTP: Suspends until a message arrives; resumes at the receive label. |
| 26 | `wait_timeout/2` | active | Label Time | ? | N | N | N | N | OTP: Receive label and timeout term; may suspend, resume the receive loop, continue on timeout, or raise on invalid timeout. |
| 27 | `m_plus/4` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 28 | `m_minus/4` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 29 | `m_times/4` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 30 | `m_div/4` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 31 | `int_div/4` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 32 | `int_rem/4` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 33 | `int_band/4` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 34 | `int_bor/4` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 35 | `int_bxor/4` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 36 | `int_bsl/4` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 37 | `int_bsr/4` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 38 | `int_bnot/3` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 39 | `is_lt/3` | active | Lbl Arg1 Arg2 | ? | N | P | P | P | OTP: Two terms; branches when the first is not less than the second. Raw evidence: Failure label; x/x, y/x or x/y, with an any hint on the first register or on a second y. Beam2JS: Supported integer/float/atom/list/tuple operands; fallthrough or nonzero label. Tested in Node and Chromium. |
| 40 | `is_ge/3` | active | Lbl Arg1 Arg2 | ? | N | P | P | P | OTP: Two terms; branches when the first is less than the second. Raw evidence: Failure label; x/x, y/x or x/y, with an any hint on the first register or on a second y. Beam2JS: Supported integer/float/atom/list/tuple operands; fallthrough or nonzero label. Tested in Node and Chromium. |
| 41 | `is_eq/3` | active | Lbl Arg1 Arg2 | ? | N | P | P | P | OTP: Two terms; branches when non-exact equality fails. Raw evidence: Failure label; x/x, y/x or x/y, with an any hint on the first register or on a second y. Beam2JS: Supported operands; numeric equality including mixed numbers and nested compound terms. |
| 42 | `is_ne/3` | active | Lbl Arg1 Arg2 | ? | N | P | P | P | OTP: Two terms; branches when non-exact equality succeeds. Raw evidence: Failure label; x/x, y/x or x/y, with an any hint on the first register or on a second y. Beam2JS: Supported operands; numeric inequality including mixed numbers and nested compound terms. |
| 43 | `is_eq_exact/3` | active | Lbl Arg1 Arg2 | ? | N | P | P | P | OTP: Two terms; branches when exact equality fails. Raw evidence: Failure label; x/x, y/x or x/y, with an any hint on the first register or on a second y; also x followed by atom, nil, integer or float literal. Beam2JS: Supported operands; structural list/tuple equality and distinct signed float zeros. |
| 44 | `is_ne_exact/3` | active | Lbl Arg1 Arg2 | ? | N | P | P | P | OTP: Two terms; branches when exact equality succeeds. Raw evidence: Failure label; x/x, y/x or x/y, with an any hint on the first register or on a second y. Beam2JS: Supported operands; structural list/tuple inequality and distinct signed float zeros. |
| 45 | `is_integer/2` | active | Lbl Arg1 | ? | N | P | P | P | OTP: One term and a failure label; branches if the named type or value test fails, otherwise continues. Raw evidence: Failure label and x or y register, with or without an any type hint. Beam2JS: Supported operands only; type-test branch. |
| 46 | `is_float/2` | active | Lbl Arg1 | ? | N | P | P | P | OTP: One term and a failure label; branches if the named type or value test fails, otherwise continues. Raw evidence: Failure label and x or y register, with or without an any type hint. Beam2JS: Supported operands only; type-test branch. |
| 47 | `is_number/2` | active | Lbl Arg1 | ? | N | P | P | P | OTP: One term and a failure label; branches if the named type or value test fails, otherwise continues. Raw evidence: Failure label and x or y register, with or without an any type hint. Beam2JS: Supported operands only; type-test branch. |
| 48 | `is_atom/2` | active | Lbl Arg1 | ? | N | P | P | P | OTP: One term and a failure label; branches if the named type or value test fails, otherwise continues. Raw evidence: Failure label and x or y register, with or without an any type hint. Beam2JS: Supported operands only; type-test branch. |
| 49 | `is_pid/2` | active | Lbl Arg1 | ? | N | N | N | N | OTP: One term and a failure label; branches if the named type or value test fails, otherwise continues. |
| 50 | `is_reference/2` | active | Lbl Arg1 | ? | N | N | N | N | OTP: One term and a failure label; branches if the named type or value test fails, otherwise continues. |
| 51 | `is_port/2` | active | Lbl Arg1 | ? | N | N | N | N | OTP: One term and a failure label; branches if the named type or value test fails, otherwise continues. |
| 52 | `is_nil/2` | active | Lbl Arg1 | ? | N | P | P | P | OTP: One term and a failure label; branches if the named type or value test fails, otherwise continues. Beam2JS: Supported operands only; branches unless source is the empty list. |
| 53 | `is_binary/2` | active | Lbl Arg1 | ? | N | N | N | N | OTP: One term and a failure label; branches if the named type or value test fails, otherwise continues. |
| 54 | `is_constant/2` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 55 | `is_list/2` | active | Lbl Arg1 | ? | N | P | P | P | OTP: One term and a failure label; branches if the named type or value test fails, otherwise continues. Beam2JS: Supported operands only; accepts nil and proper or improper cons cells. |
| 56 | `is_nonempty_list/2` | active | Lbl Arg1 | ? | N | P | P | P | OTP: One term and a failure label; branches if the named type or value test fails, otherwise continues. Beam2JS: Supported operands only; accepts proper or improper cons cells. |
| 57 | `is_tuple/2` | active | Lbl Arg1 | ? | N | P | P | P | OTP: One term and a failure label; branches if the named type or value test fails, otherwise continues. Raw evidence: Failure label and x register before tuple-arity selection. Beam2JS: Supported operands only; type-test branch. |
| 58 | `test_arity/3` | active | Lbl Arg1 Arity | ? | N | P | P | P | OTP: Tuple and arity; branches if arity differs. Validator requires a tuple. Beam2JS: Supported tuple source and nonnegative safe-integer arity; invalid source raises a host error. |
| 59 | `select_val/3` | active | Arg FailLabel Destinations | ? | N | P | P | P | OTP: Term and value/label pairs; branches to matching value or failure label. Validator requires homogeneous atom, integer or float choices. Raw evidence: x source, failure label and two atom, integer or float value/label pairs in an extended list. Beam2JS: Supported source and homogeneous, distinct atom/integer/float choices with nonzero labels; exact matching. |
| 60 | `select_tuple_arity/3` | active | Tuple FailLabel Destinations | ? | N | P | P | P | OTP: Tuple and arity/label pairs; branches to matching arity or failure label. Raw evidence: x source, failure label and two unsigned arity/label pairs in an extended list. Beam2JS: Supported tuple source and distinct nonnegative safe-integer arities with nonzero labels; invalid source raises a host error. |
| 61 | `jump/1` | active | Label | ? | N | P | P | P | OTP: Unconditional branch to a local label. Raw evidence: Nonzero local label target in the control-flow fixture. Beam2JS: Nonzero local label; unconditional branch. |
| 62 | `catch/2` | active | not specified | ? | N | N | N | N | OTP: Installs a handler using a y register and handler label; continues into protected code. |
| 63 | `catch_end/1` | active | not specified | ? | N | N | N | N | OTP: Uses the active y-register handler tag to leave or enter the corresponding handler. |
| 64 | `move/2` | active | Source Destination | ? | N | P | P | P | OTP: Term source and x/y destination; assembler also encodes typed registers and literal-table values. Raw evidence: Atom, integer or x-register source to x destination; x source to y destination. Beam2JS: x register or supported integer/float/atom/list/tuple literal to x register; fallthrough. |
| 65 | `get_list/3` | active | Source Head Tail | ? | N | P | P | P | OTP: Cons source and head/tail destinations; validator requires a cons. Beam2JS: Supported nonempty list source and distinct x destinations; captures the source before writes. |
| 66 | `get_tuple_element/3` | active | Source Element Destination | ? | N | P | P | P | OTP: Tuple source, zero-based position and destination; validator requires a suitable tuple. Beam2JS: Supported tuple source, zero-based index and x destination; invalid source or index raises a host error. |
| 67 | `set_tuple_element/3` | active | NewElement Tuple Position | ? | N | N | N | N | OTP: New value, tuple and position; destructive update. OTP 29 compiler no longer emits it. |
| 68 | `put_string/3` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 69 | `put_list/3` | active | not specified | ? | N | P | P | P | OTP: Head and tail terms and destination; constructs a cons. Beam2JS: Supported head and tail terms to x destination; constructs an immutable cons. |
| 70 | `put_tuple/2` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 71 | `put/1` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 72 | `badmatch/1` | active | not specified | ? | N | N | N | N | OTP: Raises badmatch with the supplied term; no normal fallthrough. |
| 73 | `if_end/0` | active | not specified | ? | N | N | N | N | OTP: Raises if_clause; no normal fallthrough. |
| 74 | `case_end/1` | active | not specified | ? | N | N | N | N | OTP: Raises case_clause with the supplied term; no normal fallthrough. |
| 75 | `call_fun/1` | active | Arity | ? | N | N | N | N | OTP: Arity; fun in x[arity], arguments in preceding x registers; non-tail call may raise. |
| 76 | `make_fun/3` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 77 | `is_function/2` | active | Lbl Arg1 | ? | N | N | N | N | OTP: One term and a failure label; branches if the named type or value test fails, otherwise continues. |
| 78 | `call_ext_only/2` | active | Arity Label | ? | N | P | P | P | OTP: Import-table destination and arity; tail transfer without a new continuation. Raw evidence: Arity 1 and import index 0; disassembler resolves the import to module/function/arity. Beam2JS: External target, arity 0..255; tail transfer. |
| 79 | `bs_start_match/2` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 80 | `bs_get_integer/5` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 81 | `bs_get_float/5` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 82 | `bs_get_binary/5` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 83 | `bs_skip_bits/4` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 84 | `bs_test_tail/2` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 85 | `bs_save/1` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 86 | `bs_restore/1` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 87 | `bs_init/2` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 88 | `bs_final/2` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 89 | `bs_put_integer/5` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 90 | `bs_put_binary/5` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 91 | `bs_put_float/5` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 92 | `bs_put_string/2` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 93 | `bs_need_buf/1` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 94 | `fclearerror/0` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 95 | `fcheckerror/1` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 96 | `fmove/2` | active | not specified | ? | N | N | N | N | OTP: Transfers between floating registers and term registers; valid direction affects allocation. |
| 97 | `fconv/2` | active | not specified | ? | N | N | N | N | OTP: Converts a numeric term to a floating register; may raise. |
| 98 | `fadd/4` | active | not specified | ? | N | N | N | N | OTP: Floating-register operands and destination; arithmetic failures use exception handling. |
| 99 | `fsub/4` | active | not specified | ? | N | N | N | N | OTP: Floating-register operands and destination; arithmetic failures use exception handling. |
| 100 | `fmul/4` | active | not specified | ? | N | N | N | N | OTP: Floating-register operands and destination; arithmetic failures use exception handling. |
| 101 | `fdiv/4` | active | not specified | ? | N | N | N | N | OTP: Floating-register operands and destination; arithmetic failures use exception handling. |
| 102 | `fnegate/3` | active | not specified | ? | N | N | N | N | OTP: Floating-register operands and destination; arithmetic failures use exception handling. |
| 103 | `make_fun2/1` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 104 | `try/2` | active | not specified | ? | N | N | N | N | OTP: Installs a handler using a y register and handler label; continues into protected code. |
| 105 | `try_end/1` | active | not specified | ? | N | N | N | N | OTP: Uses the active y-register handler tag to leave or enter the corresponding handler. |
| 106 | `try_case/1` | active | not specified | ? | N | N | N | N | OTP: Uses the active y-register handler tag to leave or enter the corresponding handler. |
| 107 | `try_case_end/1` | active | not specified | ? | N | N | N | N | OTP: Raises try_clause with the supplied term; no normal fallthrough. |
| 108 | `raise/2` | active | not specified | ? | N | N | N | N | OTP: Raw trace and value; raises an exception. |
| 109 | `bs_init2/6` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 110 | `bs_bits_to_bytes/3` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 111 | `bs_add/5` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 112 | `apply/1` | active | not specified | ? | N | N | N | N | OTP: Dynamic module/function call; arity arguments plus module and function occupy x registers; non-tail. |
| 113 | `apply_last/2` | active | not specified | ? | N | N | N | N | OTP: Dynamic tail call with frame deallocation. |
| 114 | `is_boolean/2` | active | Lbl Arg1 | ? | N | P | P | P | OTP: One term and a failure label; branches if the named type or value test fails, otherwise continues. Raw evidence: Failure label and x or y register, with or without an any type hint. Beam2JS: Supported operands only; true and false are atoms. |
| 115 | `is_function2/3` | active | Lbl Arg1 Arity | ? | N | N | N | N | OTP: Term and arity term; branches if not a fun of that arity. |
| 116 | `bs_start_match2/5` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 117 | `bs_get_integer2/7` | active | not specified | ? | N | N | N | N | OTP: Failure label, match context, live count, size, unit, flags and destination; binary size may be all. |
| 118 | `bs_get_float2/7` | active | not specified | ? | N | N | N | N | OTP: Failure label, match context, live count, size, unit, flags and destination; binary size may be all. |
| 119 | `bs_get_binary2/7` | active | not specified | ? | N | N | N | N | OTP: Failure label, match context, live count, size, unit, flags and destination; binary size may be all. |
| 120 | `bs_skip_bits2/5` | active | not specified | ? | N | N | N | N | OTP: Failure label, match context, size, unit and flags; advances or branches. |
| 121 | `bs_test_tail2/3` | active | not specified | ? | N | N | N | N | OTP: Failure label, match context and expected remaining bit count; continues or branches. |
| 122 | `bs_save2/2` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 123 | `bs_restore2/2` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 124 | `gc_bif1/5` | active | Lbl Live Bif Arg Reg | ? | N | P | P | P | OTP: As BIFs, with live x-register count and possible GC; zero failure label denotes exception. Raw evidence: -/1 import, x source/destination, live count 1 and nonzero failure label. Beam2JS: Normalized bnot and length guards, supported source, x destination, live count 0..1024 and nonzero failure label; invalid arguments branch. Length traversal is synchronous. OTP GC, resource and scheduling effects are not reproduced. |
| 125 | `gc_bif2/6` | active | Lbl Live Bif Arg1 Arg2 Reg | ? | N | P | P | P | OTP: As BIFs, with live x-register count and possible GC; zero failure label denotes exception. Raw evidence: +/2 import, two x sources, x destination, live count 2 and nonzero or zero failure label. Beam2JS: Normalized band, bor, bxor, div and rem guards, supported sources, x destination, live count 0..1024 and nonzero failure label; non-integers and zero divisors branch. OTP GC, resource and scheduling effects are not reproduced. |
| 126 | `bs_final2/2` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 127 | `bs_bits_to_bytes2/2` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 128 | `put_literal/2` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 129 | `is_bitstr/2` | active | Lbl Arg1 | ? | N | N | N | N | OTP: One term and a failure label; branches if the named type or value test fails, otherwise continues. |
| 130 | `bs_context_to_binary/1` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 131 | `bs_test_unit/3` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 132 | `bs_match_string/4` | active | not specified | ? | N | N | N | N | OTP: Failure label, match context, bit count and string-table data; continues or branches. |
| 133 | `bs_init_writable/0` | active | not specified | ? | N | N | N | N | OTP: Uses x0; initializes writable binary state. |
| 134 | `bs_append/8` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 135 | `bs_private_append/6` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 136 | `trim/2` | active | N Remaining | ? | N | N | N | N | OTP: Removes stack slots while preserving continuation; N plus remaining must match the frame size. |
| 137 | `bs_init_bits/6` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 138 | `bs_get_utf8/5` | active | not specified | ? | N | N | N | N | OTP: Failure label, match context, live count, flags and destination; extracts a code point or branches. |
| 139 | `bs_skip_utf8/4` | active | not specified | ? | N | N | N | N | OTP: Failure label, match context, live count and flags; advances or branches. |
| 140 | `bs_get_utf16/5` | active | not specified | ? | N | N | N | N | OTP: Failure label, match context, live count, flags and destination; extracts a code point or branches. |
| 141 | `bs_skip_utf16/4` | active | not specified | ? | N | N | N | N | OTP: Failure label, match context, live count and flags; advances or branches. |
| 142 | `bs_get_utf32/5` | active | not specified | ? | N | N | N | N | OTP: Failure label, match context, live count, flags and destination; extracts a code point or branches. |
| 143 | `bs_skip_utf32/4` | active | not specified | ? | N | N | N | N | OTP: Failure label, match context, live count and flags; advances or branches. |
| 144 | `bs_utf8_size/3` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 145 | `bs_put_utf8/3` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 146 | `bs_utf16_size/3` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 147 | `bs_put_utf16/3` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 148 | `bs_put_utf32/3` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 149 | `on_load/0` | active | not specified | ? | N | N | N | N | OTP: Marks an on-load function; module loading behavior is required. |
| 150 | `recv_mark/1` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 151 | `recv_set/1` | deprecated | not specified | ? | N | N | N | N | OTP: Obsolete; OTP 29 loader refuses it. Historical forms not yet inventoried. |
| 152 | `gc_bif3/7` | active | Lbl Live Bif Arg1 Arg2 Arg3 Reg | ? | N | N | N | N | OTP: As BIFs, with live x-register count and possible GC; zero failure label denotes exception. Raw evidence: binary_part/3 import, three x sources, x destination, live count 3 and nonzero failure label. |
| 153 | `line/1` | active | not specified | ? | N | P | P | P | OTP: Line-table location index; metadata rather than ordinary control flow. Beam2JS: Line metadata; ignored. |
| 154 | `put_map_assoc/5` | active | not specified | ? | N | N | N | N | OTP: Failure label, source, destination, live count and key/value list; exact updates require existing keys. |
| 155 | `put_map_exact/5` | active | not specified | ? | N | N | N | N | OTP: Failure label, source, destination, live count and key/value list; exact updates require existing keys. |
| 156 | `is_map/2` | active | not specified | ? | N | N | N | N | OTP: One term and a failure label; branches if the named type or value test fails, otherwise continues. |
| 157 | `has_map_fields/3` | active | not specified | ? | N | N | N | N | OTP: Failure label, map source and key list; branches when a key is missing. |
| 158 | `get_map_elements/3` | active | not specified | ? | N | N | N | N | OTP: Failure label, map source and key/destination list; branches if extraction fails. |
| 159 | `is_tagged_tuple/4` | active | Lbl Reg N Atom | ? | N | P | P | P | OTP: Term, arity and atom tag; branches if tuple, size or first element does not match. Beam2JS: Supported source, positive safe-integer arity and atom tag; falls through or branches. |
| 160 | `build_stacktrace/0` | active | (none) | ? | N | N | N | N | OTP: Converts raw stack trace in x0 to a trace term; other x registers are destroyed and GC may occur. |
| 161 | `raw_raise/0` | active | (none) | ? | N | N | N | N | OTP: Class in x0, reason in x1, raw trace in x2; raises or continues with badarg in x0 for invalid class. |
| 162 | `get_hd/2` | active | Source Head | ? | N | P | P | P | OTP: Cons source and destination; validator requires a cons. Beam2JS: Supported nonempty list source and x destination; invalid source raises a host error. |
| 163 | `get_tl/2` | active | Source Tail | ? | N | P | P | P | OTP: Cons source and destination; validator requires a cons. Beam2JS: Supported nonempty list source and x destination; invalid source raises a host error. |
| 164 | `put_tuple2/2` | active | Destination Elements | ? | N | P | P | P | OTP: Destination and list of term operands; constructs a tuple. Beam2JS: Supported element operands and x destination; constructs an immutable tuple. |
| 165 | `bs_get_tail/3` | active | Ctx Dst Live | ? | N | N | N | N | OTP: Match context, destination and live count; returns the remaining bitstring. |
| 166 | `bs_start_match3/4` | active | Fail Bin Live Dst | ? | N | N | N | N | OTP: Failure label, binary, live count and destination; starts a match or branches. |
| 167 | `bs_get_position/3` | active | Ctx Dst Live | ? | N | N | N | N | OTP: Match context, destination and live count; saves the match position. |
| 168 | `bs_set_position/2` | active | not specified | ? | N | N | N | N | OTP: Match context and saved position; restores the match position. |
| 169 | `swap/2` | active | Register1 Register2 | ? | N | N | N | N | OTP: Two registers; exchanges their contents. |
| 170 | `bs_start_match4/4` | active | Fail Bin Live Dst | ? | N | N | N | N | OTP: Failure label, no_fail or resume tag, binary/context, live count and destination. |
| 171 | `make_fun3/3` | active | OldIndex Dst EnvTerms | ? | N | N | N | N | OTP: Fun-table index, destination and list of captured terms; constructs a closure. |
| 172 | `init_yregs/1` | active | ListOfYRegs | ? | N | N | N | N | OTP: List of y registers; validator requires a nonempty ordered set. |
| 173 | `recv_marker_bind/2` | active | Marker Reference | ? | N | N | N | N | OTP: Receive marker and reference; associates the marker with the reference. |
| 174 | `recv_marker_clear/1` | active | Reference | ? | N | N | N | N | OTP: Reference; clears its associated receive marker. |
| 175 | `recv_marker_reserve/1` | active | Marker | ? | N | N | N | N | OTP: Destination; reserves a receive marker. |
| 176 | `recv_marker_use/1` | active | Reference | ? | N | N | N | N | OTP: Reference; moves the receive cursor to its associated marker. |
| 177 | `bs_create_bin/6` | active | Fail Alloc Live Unit Dst OpList | ? | N | N | N | N | OTP: Failure label, heap need, live count, unit, destination and segment list; failure may branch or raise. |
| 178 | `call_fun2/3` | active | Tag Arity Func | ? | N | N | N | N | OTP: Arity and fun; tag is local fun index, safe or unsafe. Non-tail call may raise. |
| 179 | `nif_start/0` | active | (none) | ? | N | N | N | N | OTP: NIF function-entry marker; execution continues. |
| 180 | `badrecord/1` | active | Value | ? | N | N | N | N | OTP: Raises badrecord with the supplied term; no normal fallthrough. |
| 181 | `update_record/5` | active | Hint Size Src Dst Updates=[Index, Value] | ? | N | N | N | N | OTP: Tuple size, source, destination and index/value list; copy or reuse hint. |
| 182 | `bs_match/3` | active | Fail Ctx {commands,Commands} | ? | N | N | N | N | OTP: Failure label and match context; commands include ensure_at_least, ensure_exactly, binary, integer, skip, get_tail and exact comparison. |
| 183 | `executable_line/2` | active | Location Index | ? | N | N | N | N | OTP: Line location and index; executable-line metadata. |
| 184 | `debug_line/4` | active | Kind Location Index Live | ? | N | N | N | N | OTP: Entry or line kind, location, index and live count; debug metadata. |
| 185 | `bif3/6` | active | Lbl Bif Arg1 Arg2 Arg3 Reg | ? | N | N | N | N | OTP: Failure label, BIF import, arguments and destination; zero label denotes exception, otherwise failure branches. |
| 186 | `is_any_native_record/2` | active | Lbl Term | ? | N | N | N | N | OTP: One term and a failure label; branches if the named type or value test fails, otherwise continues. |
| 187 | `is_native_record/4` | active | Lbl Rec Module Name | ? | N | N | N | N | OTP: Term, module atom and record-name atom; branches on mismatch. |
| 188 | `get_record_elements/3` | active | Lbl Rec Elements=[FieldName, Register] | ? | N | N | N | N | OTP: Failure label, record and field/destination pairs; branches if extraction fails. |
| 189 | `put_record/6` | active | Lbl Id Src Dst Live Updates | ? | N | N | N | N | OTP: Create from nil or update from a register; zero failure label raises, otherwise failure branches. |
| 190 | `is_record_accessible/3` | active | Lbl Rec Scope | ? | N | N | N | N | OTP: Record and external or auto_local scope; branches if fields are inaccessible. |
| 191 | `get_record_field/5` | active | Lbl Rec Id Field Dst | ? | N | N | N | N | OTP: Record, identifier, field and destination; zero failure label raises, otherwise failure branches. |
