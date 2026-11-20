import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const sourceHash = '70ae56774acabc7becbdc13b7c146bbbb8767f25e1495ea47656c0d2dd44311f';
const ledgerPath = new URL('../docs/opcodes-otp-29.1.2.md', import.meta.url);
const args = process.argv.slice(2);
const check = args[0] === '--check';
const sourcePath = args[check ? 1 : 0];
if (!sourcePath || args.length !== (check ? 2 : 1)) {
  throw new Error('usage: node tools/opcode-ledger.mjs [--check] PATH_TO_GENOP_TAB');
}

const source = readFileSync(sourcePath);
if (createHash('sha256').update(source).digest('hex') !== sourceHash) {
  throw new Error('genop.tab does not match the pinned OTP 29.1.2 source');
}

// These describe normalized instructions accepted by beam2js, not verified
// one-to-one mappings from raw opcodes.
const partial = new Map([
  ['label', 'Label; next instruction.'],
  ['func_info', 'Matching module/function/arity; function-clause host error.'],
  ['line', 'Line metadata; ignored.'],
  ['move', 'x register or supported integer/float/atom/list/tuple literal to x register; fallthrough.'],
  ['bif1', 'Normalized is_integer, is_number, is_atom, is_boolean, is_float, is_list or is_tuple BIF with zero failure label; hd, tl and tuple_size with nonzero failure label; supported term source and x destination only.'],
  ['bif2', 'Normalized element BIF with supported index and tuple operands, x destination and nonzero failure label; invalid arguments branch without changing the destination.'],
  ['gc_bif1', 'Normalized bnot and length guards, supported source, x destination, live count 0..1024 and nonzero failure label; invalid arguments branch. Length traversal is synchronous. OTP GC, resource and scheduling effects are not reproduced.'],
  ['gc_bif2', 'Normalized band, bor, bxor, div and rem guards, supported sources, x destination, live count 0..1024 and nonzero failure label; non-integers and zero divisors branch. OTP GC, resource and scheduling effects are not reproduced.'],
  ['test_heap', 'Nonnegative word count and live x-register count; no-op under JavaScript GC, without OTP resource or scheduling semantics.'],
  ['put_list', 'Supported head and tail terms to x destination; constructs an immutable cons.'],
  ['get_list', 'Supported nonempty list source and distinct x destinations; captures the source before writes.'],
  ['get_hd', 'Supported nonempty list source and x destination; invalid source raises a host error.'],
  ['get_tl', 'Supported nonempty list source and x destination; invalid source raises a host error.'],
  ['put_tuple2', 'Supported element operands and x destination; constructs an immutable tuple.'],
  ['get_tuple_element', 'Supported tuple source, zero-based index and x destination; invalid source or index raises a host error.'],
  ['test_arity', 'Supported tuple source and nonnegative safe-integer arity; invalid source raises a host error.'],
  ['is_lt', 'Supported integer/float/atom/list/tuple operands; fallthrough or nonzero label. Tested in Node and Chromium.'],
  ['is_ge', 'Supported integer/float/atom/list/tuple operands; fallthrough or nonzero label. Tested in Node and Chromium.'],
  ['is_eq', 'Supported operands; numeric equality including mixed numbers and nested compound terms.'],
  ['is_ne', 'Supported operands; numeric inequality including mixed numbers and nested compound terms.'],
  ['is_eq_exact', 'Supported operands; structural list/tuple equality and distinct signed float zeros.'],
  ['is_ne_exact', 'Supported operands; structural list/tuple inequality and distinct signed float zeros.'],
  ['is_integer', 'Supported operands only; type-test branch.'],
  ['is_number', 'Supported operands only; type-test branch.'],
  ['is_atom', 'Supported operands only; type-test branch.'],
  ['is_boolean', 'Supported operands only; true and false are atoms.'],
  ['is_float', 'Supported operands only; type-test branch.'],
  ['is_nil', 'Supported operands only; branches unless source is the empty list.'],
  ['is_list', 'Supported operands only; accepts nil and proper or improper cons cells.'],
  ['is_nonempty_list', 'Supported operands only; accepts proper or improper cons cells.'],
  ['is_tuple', 'Supported operands only; type-test branch.'],
  ['is_tagged_tuple', 'Supported source, positive safe-integer arity and atom tag; falls through or branches.'],
  ['select_val', 'Supported source and homogeneous, distinct atom/integer/float choices with nonzero labels; exact matching.'],
  ['select_tuple_arity', 'Supported tuple source and distinct nonnegative safe-integer arities with nonzero labels; invalid source raises a host error.'],
  ['jump', 'Nonzero local label; unconditional branch.'],
  ['call_only', 'Known local target, arity 0..255; tail transfer.'],
  ['call_ext_only', 'External target, arity 0..255; tail transfer.'],
  ['return', 'Return x0 to caller.'],
]);

const rawEvidence = new Map([
  ['label', 'Unsigned label values in guard and control-flow fixtures.'],
  ['func_info', 'Module/function atom indexes and unsigned arities 0, 1 and 2.'],
  ['int_code_end', 'Zero-operand end marker at the end of the tested code streams.'],
  ['allocate', 'Stack size 1 and live x-register count 1 or 2 in guard fixtures.'],
  ['deallocate', 'Stack size 1 on both guard outcomes.'],
  ['return', 'Zero-operand return in guard and control-flow fixtures.'],
  ['move', 'Atom, integer or x-register source to x destination; x source to y destination.'],
  ['jump', 'Nonzero local label target in the control-flow fixture.'],
  ['call_only', 'Arity 1 and local label target; disassembler resolves the label to module/function/arity.'],
  ['call_ext_only', 'Arity 1 and import index 0; disassembler resolves the import to module/function/arity.'],
  ['bif0', 'Import index for self/0 and x destination; disassembler exposes nofail.'],
  ['bif1', 'hd/1 import, x source/destination, nonzero failure label or exception label zero.'],
  ['bif2', 'element/2 import, two x sources, x destination and nonzero failure label.'],
  ['gc_bif1', '-/1 import, x source/destination, live count 1 and nonzero failure label.'],
  ['gc_bif2', '+/2 import, two x sources, x destination, live count 2 and nonzero or zero failure label.'],
  ['gc_bif3', 'binary_part/3 import, three x sources, x destination, live count 3 and nonzero failure label.'],
  ['is_integer', 'Failure label and x or y register, with or without an any type hint.'],
  ['is_number', 'Failure label and x or y register, with or without an any type hint.'],
  ['is_atom', 'Failure label and x or y register, with or without an any type hint.'],
  ['is_boolean', 'Failure label and x or y register, with or without an any type hint.'],
  ['is_float', 'Failure label and x or y register, with or without an any type hint.'],
  ['is_tuple', 'Failure label and x register before tuple-arity selection.'],
  ['is_lt', 'Failure label; x/x, y/x or x/y, with an any hint on the first register or on a second y.'],
  ['is_ge', 'Failure label; x/x, y/x or x/y, with an any hint on the first register or on a second y.'],
  ['is_eq', 'Failure label; x/x, y/x or x/y, with an any hint on the first register or on a second y.'],
  ['is_ne', 'Failure label; x/x, y/x or x/y, with an any hint on the first register or on a second y.'],
  ['is_eq_exact', 'Failure label; x/x, y/x or x/y, with an any hint on the first register or on a second y; also x followed by atom, nil, integer or float literal.'],
  ['is_ne_exact', 'Failure label; x/x, y/x or x/y, with an any hint on the first register or on a second y.'],
  ['select_val', 'x source, failure label and two atom, integer or float value/label pairs in an extended list.'],
  ['select_tuple_arity', 'x source, failure label and two unsigned arity/label pairs in an extended list.'],
]);

const variants = new Map();
function describe(names, description) {
  for (const name of names.split(' ')) {
    if (variants.has(name)) throw new Error(`duplicate opcode description: ${name}`);
    variants.set(name, description);
  }
}

describe('label', 'Defines a module-local branch target; execution continues.');
describe('func_info', 'Module atom, function atom and arity; function-clause failure path.');
describe('int_code_end', 'Marks the end of the code stream; consumed by the disassembler.');
describe('call', 'Local label and arity; saves a continuation before transferring control.');
describe('call_ext', 'Import-table destination and arity; saves a continuation before transferring control.');
describe('call_last', 'Local label and arity; deallocates a frame and tail-transfers.');
describe('call_ext_last', 'Import-table destination and arity; deallocates a frame and tail-transfers.');
describe('call_only', 'Local label and arity; tail transfer without a new continuation.');
describe('call_ext_only', 'Import-table destination and arity; tail transfer without a new continuation.');
describe('bif0', 'BIF import and destination; the assembler treats zero-argument BIFs as non-failing.');
describe('bif1 bif2 bif3', 'Failure label, BIF import, arguments and destination; zero label denotes exception, otherwise failure branches.');
describe('gc_bif1 gc_bif2 gc_bif3', 'As BIFs, with live x-register count and possible GC; zero failure label denotes exception.');
describe('allocate allocate_heap', 'Stack size and live count; allocate_heap also reserves heap. Saves continuation; stack slots are not initialized.');
describe('allocate_zero allocate_heap_zero', 'Deprecated zero-initializing stack allocation; heap variant also reserves heap.');
describe('test_heap', 'Heap need and live x-register count; may perform GC and continues.');
describe('init', 'Deprecated initialization of one stack slot to nil.');
describe('deallocate', 'Restores continuation and removes the indicated stack frame.');
describe('return', 'Returns x0 to the continuation.');
describe('send', 'Sends x1 to destination x0 and returns the message in x0; may raise.');
describe('remove_message', 'Removes the selected mailbox message and clears timeout state.');
describe('timeout', 'Resets receive position and timeout state.');
describe('loop_rec', 'Loads current message into a destination, or branches when the mailbox is exhausted.');
describe('loop_rec_end', 'Advances mailbox scan and branches back to the receive loop.');
describe('wait', 'Suspends until a message arrives; resumes at the receive label.');
describe('wait_timeout', 'Receive label and timeout term; may suspend, resume the receive loop, continue on timeout, or raise on invalid timeout.');
describe('is_lt', 'Two terms; branches when the first is not less than the second.');
describe('is_ge', 'Two terms; branches when the first is less than the second.');
describe('is_eq', 'Two terms; branches when non-exact equality fails.');
describe('is_ne', 'Two terms; branches when non-exact equality succeeds.');
describe('is_eq_exact', 'Two terms; branches when exact equality fails.');
describe('is_ne_exact', 'Two terms; branches when exact equality succeeds.');
describe('is_integer is_float is_number is_atom is_pid is_reference is_port is_nil is_binary is_list is_nonempty_list is_tuple is_function is_boolean is_bitstr is_map is_any_native_record',
  'One term and a failure label; branches if the named type or value test fails, otherwise continues.');
describe('test_arity', 'Tuple and arity; branches if arity differs. Validator requires a tuple.');
describe('is_function2', 'Term and arity term; branches if not a fun of that arity.');
describe('is_tagged_tuple', 'Term, arity and atom tag; branches if tuple, size or first element does not match.');
describe('is_native_record', 'Term, module atom and record-name atom; branches on mismatch.');
describe('select_val', 'Term and value/label pairs; branches to matching value or failure label. Validator requires homogeneous atom, integer or float choices.');
describe('select_tuple_arity', 'Tuple and arity/label pairs; branches to matching arity or failure label.');
describe('jump', 'Unconditional branch to a local label.');
describe('catch try', 'Installs a handler using a y register and handler label; continues into protected code.');
describe('catch_end try_end try_case', 'Uses the active y-register handler tag to leave or enter the corresponding handler.');
describe('move', 'Term source and x/y destination; assembler also encodes typed registers and literal-table values.');
describe('get_list', 'Cons source and head/tail destinations; validator requires a cons.');
describe('get_hd get_tl', 'Cons source and destination; validator requires a cons.');
describe('get_tuple_element', 'Tuple source, zero-based position and destination; validator requires a suitable tuple.');
describe('set_tuple_element', 'New value, tuple and position; destructive update. OTP 29 compiler no longer emits it.');
describe('put_list', 'Head and tail terms and destination; constructs a cons.');
describe('put_tuple2', 'Destination and list of term operands; constructs a tuple.');
describe('badmatch', 'Raises badmatch with the supplied term; no normal fallthrough.');
describe('if_end', 'Raises if_clause; no normal fallthrough.');
describe('case_end', 'Raises case_clause with the supplied term; no normal fallthrough.');
describe('badrecord', 'Raises badrecord with the supplied term; no normal fallthrough.');
describe('try_case_end', 'Raises try_clause with the supplied term; no normal fallthrough.');
describe('call_fun', 'Arity; fun in x[arity], arguments in preceding x registers; non-tail call may raise.');
describe('call_fun2', 'Arity and fun; tag is local fun index, safe or unsafe. Non-tail call may raise.');
describe('apply', 'Dynamic module/function call; arity arguments plus module and function occupy x registers; non-tail.');
describe('apply_last', 'Dynamic tail call with frame deallocation.');
describe('fmove', 'Transfers between floating registers and term registers; valid direction affects allocation.');
describe('fconv', 'Converts a numeric term to a floating register; may raise.');
describe('fadd fsub fmul fdiv fnegate', 'Floating-register operands and destination; arithmetic failures use exception handling.');
describe('raise', 'Raw trace and value; raises an exception.');
describe('bs_get_integer2 bs_get_float2 bs_get_binary2', 'Failure label, match context, live count, size, unit, flags and destination; binary size may be all.');
describe('bs_skip_bits2', 'Failure label, match context, size, unit and flags; advances or branches.');
describe('bs_test_tail2', 'Failure label, match context and expected remaining bit count; continues or branches.');
describe('bs_match_string', 'Failure label, match context, bit count and string-table data; continues or branches.');
describe('bs_init_writable', 'Uses x0; initializes writable binary state.');
describe('trim', 'Removes stack slots while preserving continuation; N plus remaining must match the frame size.');
describe('bs_get_utf8 bs_get_utf16 bs_get_utf32', 'Failure label, match context, live count, flags and destination; extracts a code point or branches.');
describe('bs_skip_utf8 bs_skip_utf16 bs_skip_utf32', 'Failure label, match context, live count and flags; advances or branches.');
describe('on_load', 'Marks an on-load function; module loading behavior is required.');
describe('line', 'Line-table location index; metadata rather than ordinary control flow.');
describe('put_map_assoc put_map_exact', 'Failure label, source, destination, live count and key/value list; exact updates require existing keys.');
describe('has_map_fields', 'Failure label, map source and key list; branches when a key is missing.');
describe('get_map_elements', 'Failure label, map source and key/destination list; branches if extraction fails.');
describe('build_stacktrace', 'Converts raw stack trace in x0 to a trace term; other x registers are destroyed and GC may occur.');
describe('raw_raise', 'Class in x0, reason in x1, raw trace in x2; raises or continues with badarg in x0 for invalid class.');
describe('bs_get_tail', 'Match context, destination and live count; returns the remaining bitstring.');
describe('bs_start_match3', 'Failure label, binary, live count and destination; starts a match or branches.');
describe('bs_get_position', 'Match context, destination and live count; saves the match position.');
describe('bs_set_position', 'Match context and saved position; restores the match position.');
describe('swap', 'Two registers; exchanges their contents.');
describe('bs_start_match4', 'Failure label, no_fail or resume tag, binary/context, live count and destination.');
describe('make_fun3', 'Fun-table index, destination and list of captured terms; constructs a closure.');
describe('init_yregs', 'List of y registers; validator requires a nonempty ordered set.');
describe('recv_marker_bind', 'Receive marker and reference; associates the marker with the reference.');
describe('recv_marker_clear', 'Reference; clears its associated receive marker.');
describe('recv_marker_reserve', 'Destination; reserves a receive marker.');
describe('recv_marker_use', 'Reference; moves the receive cursor to its associated marker.');
describe('bs_create_bin', 'Failure label, heap need, live count, unit, destination and segment list; failure may branch or raise.');
describe('nif_start', 'NIF function-entry marker; execution continues.');
describe('update_record', 'Tuple size, source, destination and index/value list; copy or reuse hint.');
describe('bs_match', 'Failure label and match context; commands include ensure_at_least, ensure_exactly, binary, integer, skip, get_tail and exact comparison.');
describe('executable_line', 'Line location and index; executable-line metadata.');
describe('debug_line', 'Entry or line kind, location, index and live count; debug metadata.');
describe('get_record_elements', 'Failure label, record and field/destination pairs; branches if extraction fails.');
describe('put_record', 'Create from nil or update from a register; zero failure label raises, otherwise failure branches.');
describe('is_record_accessible', 'Record and external or auto_local scope; branches if fields are inaccessible.');
describe('get_record_field', 'Record, identifier, field and destination; zero failure label raises, otherwise failure branches.');

const entries = [];
let spec;
for (const line of source.toString('utf8').split('\n')) {
  const specMatch = line.match(/^## @spec (\S+)(?:\s+(.*))?$/);
  if (specMatch) spec = {name: specMatch[1].replace(/\/\d+$/, ''), operands: specMatch[2] || ''};
  const match = line.match(/^(\d+):\s+(-?)([a-zA-Z0-9_]+)\/(\d+)\s*$/);
  if (!match) continue;
  const [, number, deprecated, name, arity] = match;
  const operands = spec?.name === name ? spec.operands || '(none)' : 'not specified';
  entries.push({number: Number(number), name, arity: Number(arity), deprecated: !!deprecated, operands});
  spec = undefined;
}
if (entries.length !== 191 || entries.some((entry, i) => entry.number !== i + 1)) {
  throw new Error('unexpected OTP 29.1.2 opcode inventory');
}
for (const name of [...partial.keys(), ...variants.keys(), ...rawEvidence.keys()]) {
  if (!entries.some(entry => entry.name === name)) {
    throw new Error(`unknown opcode description: ${name}`);
  }
}

function cell(value) {
  return value.replaceAll('|', '\\|').replaceAll('`', '\\`');
}

const header = `# Generic opcode ledger: OTP 29.1.2

Source: [OTP 29.1.2 genop.tab](https://github.com/erlang/otp/blob/OTP-29.1.2/lib/compiler/src/genop.tab),
BEAM format 0, SHA-256 \`${sourceHash}\`. Numbers, names,
arities, deprecated markers and any operand names below are extracted from that
file, independently of \`beam_disasm\`. Operand names are illustrative, not
validated types or an exhaustive list of forms. "Not specified" means the
table has no matching \`@spec\`, not that the instruction has no operands.
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
supported literals; y registers are not supported. \`func_info\` raises a host error, not an Erlang exception. \`line\`
is ignored and its effect on executable/debug metadata is not established.

The operand column preserves names from available upstream specifications.
The OTP notes summarize selected forms and control-flow behavior from
[\`genop.tab\`](https://github.com/erlang/otp/blob/OTP-29.1.2/lib/compiler/src/genop.tab),
[\`beam_asm.erl\`](https://github.com/erlang/otp/blob/OTP-29.1.2/lib/compiler/src/beam_asm.erl)
and [\`beam_validator.erl\`](https://github.com/erlang/otp/blob/OTP-29.1.2/lib/compiler/src/beam_validator.erl).
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
The low three bits identify \`u\` (0, unsigned), \`i\` (1, integer),
\`a\` (2, atom table index), \`x\` (3, x register), \`y\` (4, y register),
\`f\` (5, label), \`h\` (6, historical character tag) or \`z\` (7, extended).
Atom index zero denotes nil; label zero is a special failure label rather than
a normal branch target. Operand tags alone do not establish that a particular
instruction accepts the value.

For ordinary tagged numbers, bit 3 clear encodes a four-bit nonnegative value
in the high nibble. With bit 3 set and bit 4 clear, the upper three bits and
the next byte encode an 11-bit nonnegative value. With both bits set, the high
three bits select a big-endian payload length of two through eight bytes; seven
instead means a following \`u\`-tagged value giving the payload length minus nine. Long \`i\` payloads
are signed two's-complement. The assembler uses literal-table references for
integer magnitudes at least 2^128 and for floats.

The loader's [operand reader](https://github.com/erlang/otp/blob/OTP-29.1.2/erts/emulator/beam/beam_file.c)
recognizes extended tags \`z=1\` for an operand list, \`z=2\` for a float
register, \`z=3\` for allocation information, \`z=4\` for a literal-table
reference and \`z=5\` for a type-tagged register. Lists are allowed only as the
last generic operand. The old \`z=0\` inline-float form is rejected by this
loader. Extended values have additional operands; they are not single-byte
standalone values.

\`npm run test:opcodes\` assembles and loads small guard functions and compares
their entire raw code streams with independently specified bytes. It covers
the five type tests and six comparisons in Beam2JS's normalized subset using
x and y registers, with and without \`any\` type hints; binary comparisons cover
x/x, y/x and x/y. \`is_eq_exact/3\` additionally covers atom, nil, float-literal
and integer operands, compact integer boundaries and literal-table thresholds. It
checks successful and failing paths in OTP, including numeric equality and
signed-zero examples.
The test also reads the raw guard instructions in the compiler-generated
[\`guards.erl\`](../fixtures/guards.erl), including stripped input. For example,
\`different/2\` compiles to \`is_eq_exact/3\` with its failure branch leading
to the unequal result, rather than a raw \`is_ne_exact/3\`. These examples do
not verify all operand combinations, assembler transformations or Beam2JS raw
decoding.

The [control-flow assembly fixture](../fixtures/raw_control_flow.S) checks
the complete raw instruction stream and import table for labels, function
metadata, moves, return, jump, and local and external tail calls. In
particular, the raw \`call_only/2\` uses a local label while the disassembler
returns a module/function/arity target; \`call_ext_only/2\` uses an import
index which the disassembler resolves to an external function. OTP, Node and
Chromium exercise the fixture's results, including stripped input. Stack
allocation, deallocation and x-to-y moves are also present in the raw guard
fixtures, but are not implemented by Beam2JS.

The [selection fixture](../fixtures/raw_select.S) verifies the complete raw
streams for \`select_val/3\` with atom, integer and float choices and for
\`select_tuple_arity/3\`. The final \`z=1\` operand is followed by an unsigned
count of list *elements*, not pairs, then alternating values and labels; float
choices use literal-table references. The fixture checks matching and default
branches in OTP, Node and Chromium, including stripped input. Its tuple
selection is preceded by \`is_tuple/2\`. The
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

The [BIF assembly fixture](../fixtures/raw_bifs.S) checks raw \`bif0/2\`,
\`bif1/4\`, \`bif2/5\`, \`gc_bif1/5\`, \`gc_bif2/6\` and \`gc_bif3/7\`
instructions and their import table against OTP, including stripped input.
The tested \`hd/1\` and \`+/2\` forms branch on guard failure with a nonzero
label but raise \`badarg\` and \`badarith\` respectively with label zero.
\`bif0/2\` has no failure-label operand; the disassembler represents its
tested \`self/0\` form with \`nofail\`. These are selected forms, not complete
coverage of BIFs or operands. Beam2JS rejects this full fixture because it
includes unsupported BIFs and exception forms. Separately, it supports selected
non-failing normalized type-predicate BIF instructions for supported operands;
the compiler-generated and assembly fixtures are tested against OTP in Node
and Chromium, including stripped input. Nonzero-label \`hd/1\`, \`tl/1\`,
\`tuple_size/1\` and \`element/2\` guard instructions are tested using
[compiler-generated](../fixtures/guard_bifs.erl) and
[assembly](../fixtures/raw_guard_bifs.S) fixtures in OTP, Node and Chromium,
including stripped input. Invalid arguments branch without writing the
destination; zero-label exception forms are rejected. The
[length guard fixture](../fixtures/length_guards.erl) and
[assembly fixture](../fixtures/raw_length_guards.S) exercise nonzero-label
\`length/1\` on proper, improper and non-list inputs in OTP, Node and Chromium,
including stripped input. They also check 10,000-element proper and improper
lists. Traversal is synchronous and can block the host event loop; OTP
reductions and scheduling are not reproduced. Zero-label exception forms are
rejected. The
[bitwise guard fixture](../fixtures/bitwise_guards.erl) and
[assembly fixture](../fixtures/raw_bitwise_guards.S) cover nonzero-label
\`band\`, \`bor\`, \`bxor\` and \`bnot\` on integers, including negative and
large values, aliased destinations and invalid arguments, in OTP, Node and
Chromium with stripped input. Their zero-label exception forms are rejected;
OTP garbage collection, resource limits and scheduling effects are not reproduced.
The [integer guard fixture](../fixtures/integer_guards.erl) and
[assembly fixture](../fixtures/raw_integer_guards.S) exercise nonzero-label
\`div\` and \`rem\`, including negative and large integers, aliased
destinations, non-integers and zero divisors in OTP, Node and Chromium with
stripped input. Division truncates toward zero; the remainder has the
dividend's sign. Zero-label exception forms are rejected.
The
[list fixture](../fixtures/list_slice.erl)
also exercises nil, list construction and extraction, including an aliased
\`get_list\` source and destination. The integer-word \`test_heap\` form is a
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

The loader also accepts the tested \`any\`-hinted x and y guard operands when
their \`Type\` chunk is removed, treating them as ordinary registers. OTP
29.1.2's disassembler fails on those same files, so Beam2JS rejects them.
With the chunk present, the disassembler exposes a type-tagged register.
Beam2JS reads the underlying x register without validating or relying on the
type hint. The [typed guard fixture](../fixtures/raw_typed.S) checks hinted
x-register type tests and comparisons against OTP in Node and Chromium,
including stripped input. Typed and ordinary y registers remain unsupported.

## Obsolete instructions

The leading \`-\` in \`genop.tab\` denotes an obsolete instruction. OTP 29.1.2's
[\`beam_makeops\` documentation](https://github.com/erlang/otp/blob/OTP-29.1.2/erts/emulator/internal_doc/beam_makeops.md)
states that the compiler must not generate these instructions and the loader
refuses them. The [generator](https://github.com/erlang/otp/blob/OTP-29.1.2/erts/emulator/utils/beam_makeops)
prohibits their specific instructions and transformations; the
[loader](https://github.com/erlang/otp/blob/OTP-29.1.2/erts/emulator/beam/beam_load.c)
reports a recompile error when neither exists. Raw operands are decoded first,
so malformed input can fail earlier. Representative zero-, two- and eight-operand
obsolete opcodes are checked against the pinned loader by \`npm run test:opcodes\`;
this is not an exhaustive empirical test of all historical forms.

This describes OTP's loader, not a guarantee that Beam2JS rejects every such
input: its current disassembler-based pipeline does not independently validate
the raw opcode stream. Rejection is not opcode implementation, and older OTP
releases may have accepted these instructions.

Regenerate or verify using the exact upstream file:

\`\`\`sh
curl -fsSL https://raw.githubusercontent.com/erlang/otp/OTP-29.1.2/lib/compiler/src/genop.tab -o /tmp/beam2js-genop.tab
node tools/opcode-ledger.mjs /tmp/beam2js-genop.tab > docs/opcodes-otp-29.1.2.md
node tools/opcode-ledger.mjs --check /tmp/beam2js-genop.tab
\`\`\`

| Opcode | Instruction | Lifecycle | Operand names | D | V | L | R | T | Forms / control-flow notes |
| ---: | --- | --- | --- | :-: | :-: | :-: | :-: | :-: | --- |
`;
const rows = entries.map(({number, name, arity, deprecated, operands}) => {
  const implemented = partial.has(name);
  const status = implemented ? 'P' : 'N';
  const otp = deprecated
    ? `Obsolete; OTP 29 loader refuses it. ${variants.get(name) || 'Historical forms not yet inventoried.'}`
    : variants.get(name) || 'Not yet inventoried.';
  const raw = rawEvidence.get(name);
  const note = `OTP: ${otp}${raw ? ` Raw evidence: ${raw}` : ''}${implemented ? ` Beam2JS: ${partial.get(name)}` : ''}`;
  return `| ${number} | \`${name}/${arity}\` | ${deprecated ? 'deprecated' : 'active'} | ${cell(operands)} | ? | N | ${status} | ${status} | ${status} | ${cell(note)} |`;
});
const output = header + rows.join('\n') + '\n';
if (check) {
  if (readFileSync(ledgerPath, 'utf8') !== output) {
    throw new Error('opcode ledger is out of date');
  }
  console.log(`Verified ${entries.length} opcode entries against OTP 29.1.2 genop.tab`);
} else {
  process.stdout.write(output);
}
