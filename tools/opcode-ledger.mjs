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
  ['move', 'x register, integer or atom to x register; fallthrough.'],
  ['is_eq_exact', 'x register, integer or atom operands; fallthrough or nonzero label.'],
  ['jump', 'Nonzero local label; unconditional branch.'],
  ['call_only', 'Known local target, arity 0..255; tail transfer.'],
  ['call_ext_only', 'External target, arity 0..255; tail transfer.'],
  ['return', 'Return x0 to caller.'],
]);

const variants = new Map([
  ['bs_start_match4', 'Failure label, no_fail or resume.'],
  ['call_fun2', 'Local fun index, safe or unsafe tag.'],
  ['bs_match', 'Command list; command and operand variants not yet inventoried.'],
  ['update_record', 'Copy or reuse hint; update list.'],
  ['debug_line', 'Entry or line kind.'],
  ['put_record', 'Create or update; failure label or exception when label is zero.'],
  ['is_record_accessible', 'External or auto_local scope; failure branch.'],
  ['get_record_field', 'Failure label or exception when label is zero.'],
]);

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

- **?**: raw opcode/operand mapping not independently verified. OTP's internal
  disassembler is used, but can normalize or consume instructions.
- **N**: not implemented or not independently tested for this raw opcode.
- **P**: partial support or tests for a similarly named *normalized* form;
  raw mapping, all variants, and full Erlang semantics remain unverified.

All entries currently have D = ? and V = N: there is no raw opcode decoder or
complete validation. Entries with P in L/R/T refer only to the narrow normalized
forms described in their notes; all others are N. N for lowering does not mean
that the disassembler necessarily exposes that raw opcode unchanged. N for
tests means no raw-opcode-specific differential coverage; it does not imply
that an instruction never appears in a fixture. Tests marked P are the existing
Node integration tests, not browser tests or comprehensive differential
coverage. \`func_info\` raises a host error, not an Erlang exception. \`line\`
is ignored and its effect on executable/debug metadata is not established.

The operand column preserves names from available upstream specifications.
Notes identify selected known variants and the current normalized slice; all
other operand types, failure edges and control-flow variants remain to be
investigated. This is an initial inventory, not a compatibility claim.

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
  const note = partial.get(name) || variants.get(name) || 'Not yet inventoried.';
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
