import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const sourceHash = '55c88258e90745e701d00702266c6422e35c31c6796ce2086ea00fa00f9d8816';
const inventoryPath = new URL('../docs/bifs-otp-29.1.2.md', import.meta.url);
const args = process.argv.slice(2);
const check = args[0] === '--check';
const sourcePath = args[check ? 1 : 0];
if (!sourcePath || args.length !== (check ? 2 : 1)) {
  throw new Error('usage: node tools/bif-inventory.mjs [--check] PATH_TO_BIF_TAB');
}

const source = readFileSync(sourcePath);
if (createHash('sha256').update(source).digest('hex') !== sourceHash) {
  throw new Error('bif.tab does not match the pinned OTP 29.1.2 source');
}

const entries = [];
for (const line of source.toString('utf8').split('\n')) {
  if (!line.trim() || line.trimStart().startsWith('#')) continue;
  const match = line.match(/^\s*(bif|ubif|hbif)\s+([a-zA-Z0-9_]+):(?:'([^']+)'|([a-zA-Z0-9_]+))\/(\d+)(?:\s+.*)?$/);
  if (!match) throw new Error(`unrecognized bif.tab declaration: ${line}`);
  const [, kind, module, quotedName, bareName, arity] = match;
  entries.push({kind, module, name: quotedName ?? bareName, arity: Number(arity)});
}
if (entries.length !== 553) throw new Error('unexpected OTP 29.1.2 BIF declaration count');

// These runtime built-ins are not declared in bif.tab.
for (const [name, arity] of [['apply', 2], ['apply', 3], ['yield', 0]]) {
  entries.push({kind: 'runtime', module: 'erlang', name, arity});
}
const key = ({module, name, arity}) => `${module}:${name}/${arity}`;
if (new Set(entries.map(key)).size !== entries.length) throw new Error('duplicate BIF identity');
entries.sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);

const query = `{ok,V}=file:read_file(filename:join([code:root_dir(),"releases",
erlang:system_info(otp_release),"OTP_VERSION"])),
"29.1.2"=string:trim(binary_to_list(V)),
Loop=fun F() ->
  case io:get_line(standard_io, "") of
    eof -> ok;
    Line ->
      [Ms,Ns,As]=string:split(string:trim(Line), "\\t", all),
      M=list_to_atom(Ms), N=list_to_atom(Ns), A=list_to_integer(As),
      Guard=M =:= erlang andalso erl_internal:guard_bif(N,A),
      Op=M =:= erlang andalso (erl_internal:arith_op(N,A) orelse
           erl_internal:bool_op(N,A) orelse erl_internal:comp_op(N,A)),
      io:format("~s\\t~s\\t~B\\t~p\\t~p\\t~p\\t~p\\t~p\\t~p~n",
        [Ms,Ns,A,erlang:is_builtin(M,N,A),Guard,Op,
         erl_bifs:is_pure(M,N,A),erl_bifs:is_safe(M,N,A),
         erl_bifs:is_exit_bif(M,N,A)]),
      F()
  end
end,
Loop(), halt().`;
const input = entries.map(({module, name, arity}) => `${module}\t${name}\t${arity}`).join('\n') + '\n';
const output = execFileSync('erl', ['-noshell', '-eval', query], {
  input, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
}).trimEnd().split('\n');
if (output.length !== entries.length) throw new Error('unexpected OTP classifier output');
for (let i = 0; i < entries.length; i++) {
  const fields = output[i].split('\t');
  const entry = entries[i];
  if (fields.length !== 9 || fields[0] !== entry.module || fields[1] !== entry.name ||
      Number(fields[2]) !== entry.arity || fields.slice(3).some(value => !['true', 'false'].includes(value))) {
    throw new Error(`invalid OTP classifier output for ${key(entry)}`);
  }
  [entry.builtin, entry.guard, entry.operator, entry.pure, entry.safe, entry.alwaysRaises] =
    fields.slice(3).map(value => value === 'true');
}
for (const entry of entries.filter(entry => entry.kind === 'runtime')) {
  if (!entry.builtin) throw new Error(`expected runtime built-in: ${key(entry)}`);
}

const categories = new Map();
function category(names, label) {
  for (const name of names.split(' ')) {
    if (categories.has(name)) throw new Error(`duplicate category: ${name}`);
    categories.set(name, label);
  }
}
category('abs ceil floor float round trunc', 'number');
category('+ - * / div rem band bor bxor bsl bsr bnot', 'arithmetic');
category('== /= =:= =/= < =< > >=', 'comparison');
category('and or xor not', 'boolean');
category('is_atom is_binary is_bitstring is_boolean is_float is_function is_integer is_list is_map is_number is_pid is_port is_record is_reference is_tuple', 'type test');
category('hd tl length ++ -- append subtract list_to_tuple tuple_to_list', 'list / tuple');
category('element setelement tuple_size make_tuple append_element insert_element delete_element', 'tuple');
category('is_map_key map_get map_size', 'map');
category('bit_size byte_size binary_part split_binary list_to_binary list_to_bitstring iolist_to_binary iolist_size', 'binary / bitstring');
category('atom_to_list atom_to_binary binary_to_atom binary_to_existing_atom list_to_atom list_to_existing_atom binary_to_float binary_to_integer binary_to_list binary_to_term bitstring_to_list float_to_binary float_to_list integer_to_binary integer_to_list list_to_float list_to_integer term_to_binary term_to_iovec', 'conversion / encoding');
category('self spawn spawn_link spawn_opt spawn_request spawn_request_abandon process_flag process_info processes is_process_alive group_leader hibernate yield', 'process / scheduling');
category('! send send_after start_timer cancel_timer read_timer', 'message / timer');
category('link unlink monitor demonitor exit_signal alias unalias', 'signal / monitor');
category('register unregister registered whereis', 'process registry');
category('get get_keys put erase', 'process dictionary');
category('throw error exit raise', 'exception / signal');
category('apply make_fun fun_info', 'function / call');
category('node nodes monitor_node setnode is_alive', 'distribution');
category('date time localtime universaltime localtime_to_universaltime universaltime_to_localtime now monotonic_time system_time time_offset timestamp', 'clock / calendar');
category('load_nif delete_module module_loaded function_exported get_module_info call_on_load_function finish_after_on_load', 'module / native loading');
category('make_ref unique_integer', 'identity / uniqueness');
category('system_info system_flag statistics system_profile', 'runtime system');

const moduleCategories = new Map([
  ['atomics', 'shared atomic state'], ['binary', 'binary / bitstring'],
  ['code', 'module / code'], ['erl_ddll', 'native driver'],
  ['erl_debugger', 'debugger'], ['erts_debug', 'runtime debugging'],
  ['ets', 'shared term table'], ['file', 'file / OS'],
  ['io', 'I/O'], ['lists', 'list'], ['maps', 'map'],
  ['math', 'number'], ['net_kernel', 'distribution'],
  ['os', 'OS / clock'], ['persistent_term', 'shared persistent state'],
  ['prim_file', 'file / OS'], ['re', 'regular expression'],
  ['records', 'native record'], ['string', 'text'],
  ['unicode', 'text / encoding'],
]);

function categoryOf(entry) {
  return entry.module === 'erlang' ? categories.get(entry.name) || '?' :
    moduleCategories.get(entry.module) || '?';
}
function hostDependency(entry) {
  if (['os', 'file', 'prim_file', 'io', 'erl_ddll', 'net_kernel'].includes(entry.module)) {
    return 'OS / host';
  }
  if (entry.module === 'erlang' &&
      ['date', 'time', 'localtime', 'universaltime', 'now', 'monotonic_time',
        'system_time', 'time_offset', 'timestamp', 'send_after', 'start_timer',
        'cancel_timer', 'read_timer'].includes(entry.name)) return 'clock / scheduler';
  if (entry.module === 'erlang' &&
      ['load_nif', 'setnode', 'nodes', 'monitor_node'].includes(entry.name)) return 'native / distribution';
  return '?';
}
const details = new Map([
  ['erlang:hd/1', {exceptions: 'badarg for empty or non-cons input'}],
  ['erlang:tl/1', {exceptions: 'badarg for empty or non-cons input'}],
  ['erlang:length/1', {exceptions: 'badarg for improper or non-list input'}],
  ['erlang:element/2', {exceptions: 'badarg for invalid index or non-tuple'}],
  ['erlang:div/2', {exceptions: 'badarith for zero divisor or non-integer input'}],
  ['erlang:rem/2', {exceptions: 'badarith for zero divisor or non-integer input'}],
  ['erlang:+/2', {exceptions: 'badarith for non-number input'}],
  ['erlang:-/1', {exceptions: 'badarith for non-number input'}],
  ['erlang:band/2', {exceptions: 'badarith for non-integer input'}],
  ['erlang:bor/2', {exceptions: 'badarith for non-integer input'}],
  ['erlang:bxor/2', {exceptions: 'badarith for non-integer input'}],
  ['erlang:bnot/1', {exceptions: 'badarith for non-integer input'}],
  ['erlang:binary_part/3', {exceptions: 'badarg for invalid arguments or out-of-bounds range'}],
  ['erlang:map_get/2', {exceptions: '{badkey,Key} if absent; {badmap,Map} for non-map'}],
  ['erlang:is_map_key/2', {exceptions: '{badmap,Map} for non-map'}],
  ['erlang:map_size/1', {exceptions: '{badmap,Map} for non-map'}],
  ['erlang:tuple_size/1', {exceptions: 'badarg for non-tuple'}],
  ['maps:get/2', {exceptions: '{badkey,Key} if absent; {badmap,Map} for non-map'}],
  ['maps:is_key/2', {exceptions: '{badmap,Map} for non-map'}],
  ['erlang:list_to_atom/1', {effects: 'may add a permanent atom to the global atom table'}],
  ['erlang:self/0', {effects: 'reads calling process identity', host: 'process runtime'}],
]);
const instructionOnly = new Set([
  'erlang:is_integer/1', 'erlang:is_number/1', 'erlang:is_atom/1',
  'erlang:is_boolean/1', 'erlang:is_float/1', 'erlang:is_list/1', 'erlang:is_tuple/1',
]);
const guardInstructionOnly = new Set([
  'erlang:hd/1', 'erlang:tl/1', 'erlang:length/1', 'erlang:tuple_size/1', 'erlang:element/2',
  'erlang:band/2', 'erlang:bor/2', 'erlang:bxor/2', 'erlang:bnot/1',
  'erlang:div/2', 'erlang:rem/2',
]);
for (const name of details.keys()) {
  if (!entries.some(entry => key(entry) === name)) throw new Error(`unknown BIF detail: ${name}`);
}
for (const name of [...instructionOnly, ...guardInstructionOnly]) {
  if (!entries.some(entry => key(entry) === name)) throw new Error(`unknown BIF instruction: ${name}`);
}
function cell(value) {
  return value.replaceAll('|', '\\|').replaceAll('`', '\\`');
}

const header = `# BIF inventory: OTP 29.1.2

The initial inventory contains the 553 declarations in
[\`bif.tab\`](https://github.com/erlang/otp/blob/OTP-29.1.2/erts/emulator/beam/bif.tab)
(SHA-256 \`${sourceHash}\`) and the three exported
\`erlang:apply/2\`, \`erlang:apply/3\` and \`erlang:yield/0\` built-ins
reported by OTP but absent from that table. It is not yet a complete inventory
of all compiler intrinsics, optional native functions or OTP library functions.
The table includes internal and potentially unavailable declarations; it is not
a public API list. Identities are module/name/arity, including operators.

Runtime and compiler classifications below are collected from an installed
OTP **29.1.2**, using \`erlang:is_builtin/3\`,
[\`erl_internal\`](https://github.com/erlang/otp/blob/OTP-29.1.2/lib/stdlib/src/erl_internal.erl)
and [\`erl_bifs\`](https://github.com/erlang/otp/blob/OTP-29.1.2/lib/compiler/src/erl_bifs.erl).
They are release/build observations, not proof of Beam2JS support.

- **Kind**: \`bif\`, \`ubif\`, \`hbif\` are the upstream table declarations;
  \`runtime\` denotes the three runtime-discovered entries. In particular,
  \`ubif\` alone does not mean a function is allowed in a guard.
- **Runtime BIF**: result of \`erlang:is_builtin/3\`; a negative result for a
  table declaration is retained rather than assuming it is available.
- **Guard**: \`BIF\` is recognized by \`erl_internal:guard_bif/2\`; \`operator\`
  is an arithmetic, boolean or comparison guard operator. \`no\` means neither
  classifier applies. Guard syntax and individual argument restrictions still
  matter; failure in a guard is not an ordinary propagated exception.
- **Effects**: \`optimizer-pure\` means OTP's conservative \`is_pure/3\`
  optimizer list includes it. This is not a security, resource-use, allocation,
  host-independence or complete side-effect guarantee. \`?\` is unclassified,
  not a claim that the function has side effects. Specific notes identify
  selected observable effects independently of the optimizer classification.
- **Exceptions**: \`optimizer-safe\` or \`always-raises\` reflects the
  respective OTP optimizer classifier, not an exhaustive exception contract;
  \`?\` means not classified. Reasons and exceptional effects require individual
  investigation and differential tests.
- **Host**: known broad dependencies are noted; \`?\` means not investigated,
  not host-independent. Categories are broad families, not complete semantics.
- **Beam2JS**: \`instruction-only\` means the listed non-failing normalized BIF
  instruction is supported for the implemented integer, float, atom, list and tuple
  terms. \`guard-instruction-only\` means the listed BIF instruction is supported
  only with a nonzero guard failure label, for the implemented terms. Both are
  tested against OTP in Node and Chromium, including stripped input. Neither
  status implies callable BIF dispatch or exception support; all other entries
  are \`not implemented\`. Some operations may instead use partially implemented
  guard instructions.

Compiler-recognized or auto-imported functions are not necessarily C BIFs.
For example, \`erlang:spawn/1\` is recognized by \`erl_internal:bif/2\`
but \`erlang:is_builtin/3\` reports false; \`lists:map/2\` is ordinary Erlang
code, whereas \`lists:member/2\` is a runtime BIF. Neither compiler recognition
nor being exported by an OTP module alone establishes a BIF implementation.

## Selected OTP behavior

The following observations are backed by the pinned
[\`erlang\` reference](https://github.com/erlang/otp/blob/OTP-29.1.2/erts/preloaded/src/erlang.erl)
and focused OTP tests; they are not exhaustive exception or resource contracts.
\`npm run test:bifs\` checks representative direct calls and guard failures.
The [raw BIF fixture](../fixtures/raw_bifs.S) additionally checks selected
guard and exception paths and their raw encodings via \`npm run test:opcodes\`.

- \`hd/1\` and \`tl/1\` accept nonempty cons cells, including improper lists;
  \`length/1\` requires a proper list. Invalid inputs tested here raise
  \`badarg\` in a body. Nonzero-label \`length/1\` guard instructions are
  tested in OTP, Node and Chromium, including stripped
  [compiler-generated](../fixtures/length_guards.erl) and
  [assembly](../fixtures/raw_length_guards.S) fixtures and 10,000-element
  proper and improper lists. Traversal is synchronous and can block the host
  event loop; OTP scheduling behavior is not implemented.
- \`element/2\` uses one-based tuple indexes; a non-tuple or invalid index
  raises \`badarg\` in a body. \`tuple_size/1\` returns the number of tuple
  elements and raises \`badarg\` for a non-tuple.
- \`map_get/2\` raises \`{badkey,Key}\` for an absent key and \`{badmap,Map}\`
  for a non-map. \`is_map_key/2\` returns \`false\` for an absent key, while it
  and \`map_size/1\` raise \`{badmap,Map}\` for a non-map. Map lookups use
  exact key equivalence, including integer versus float and the signs of float
  zero; compound keys match by their term contents.
- \`maps:get/2\` and \`maps:is_key/2\` are runtime BIFs with the corresponding
  lookup and error behavior, but are not classified as guard BIFs.
  \`maps:get/3\` is an ordinary OTP function rather than a runtime BIF; it
  returns its default for a missing key and raises \`{badmap,Map}\` for a
  non-map. The [map guard fixture](../fixtures/bif_map_guards.erl) checks
  successful and failing \`erlang\` guard calls, including stripped input.
- Unary \`-/1\` and binary \`+/2\` accept numbers; a non-number raises
  \`badarith\` in a body. Integer results can exceed machine word size and
  mixed integer/float arithmetic yields a float.
- \`band/2\`, \`bor/2\`, \`bxor/2\` and \`bnot/1\` operate on signed
  integers and raise \`badarith\` for non-integers in a body. Their
  nonzero-label guard instructions are tested against OTP in Node and
  Chromium, including stripped [compiler-generated](../fixtures/bitwise_guards.erl)
  and [assembly](../fixtures/raw_bitwise_guards.S) fixtures. Exception forms,
  OTP resource limits, garbage collection and scheduling are not implemented.
- Integer \`div/2\` truncates toward zero and \`rem/2\` has the dividend's
  sign; zero divisors and non-integers raise \`badarith\` in a body. Their
  nonzero-label guard instructions are tested against OTP in Node and
  Chromium, including stripped [compiler-generated](../fixtures/integer_guards.erl)
  and [assembly](../fixtures/raw_integer_guards.S) fixtures. Exception forms
  and OTP resource and scheduling behavior are not implemented.
- \`binary_part/3\` uses a zero-based start. A negative length selects bytes
  preceding that start; a valid empty range is allowed. Invalid types,
  non-byte-aligned bitstrings and out-of-bounds ranges tested here raise
  \`badarg\` in a body.
- \`self/0\` returns the calling process's PID; distinct processes have
  distinct live identities. It depends on a process runtime, not a pure
  host-value conversion.
- OTP emits a non-failing \`bif\` instruction for direct body calls to the
  five predicates in [this fixture](../fixtures/bif_predicates.erl) and
  \`is_list/1\` in the [list fixture](../fixtures/list_slice.erl) and
  \`is_tuple/1\` in the [tuple fixture](../fixtures/tuple_slice.erl).
  Beam2JS lowers these instructions for supported terms to Erlang \`true\` or
  \`false\` atoms. Selected register and literal operands are also checked in
  [assembly](../fixtures/raw_predicate_bifs.S), in Node and Chromium against
  OTP, including stripped input. \`is_list/1\` accepts improper cons cells.

Failure of these guard BIFs or operators in a guard fails the guard rather than
propagating the body exception. The Beam2JS runtime does not implement these
callable BIFs. Beam2JS lowers the nonzero-label \`hd/1\`, \`tl/1\`, \`length/1\`,
\`tuple_size/1\` and \`element/2\` guard instructions for supported terms,
with differential coverage from the [guard fixture](../fixtures/guard_bifs.erl)
and [assembly fixture](../fixtures/raw_guard_bifs.S). Zero-label exception
forms remain unsupported.

Regenerate or verify using the exact upstream file and OTP 29.1.2:

\`\`\`sh
node tools/bif-inventory.mjs /path/to/otp/erts/emulator/beam/bif.tab > docs/bifs-otp-29.1.2.md
node tools/bif-inventory.mjs --check /path/to/otp/erts/emulator/beam/bif.tab
\`\`\`

| Module | Name/arity | Kind | Runtime BIF | Category | Guard | Effects | Exceptions | Host | Beam2JS |
| --- | --- | --- | :-: | --- | --- | --- | --- | --- | --- |
`;
const rows = entries.map(entry => {
  const guard = entry.guard ? 'BIF' : entry.operator ? 'operator' : 'no';
  const detail = details.get(key(entry));
  const effect = [entry.pure ? 'optimizer-pure' : null, detail?.effects].filter(Boolean).join('; ') || '?';
  const exceptions = [entry.alwaysRaises ? 'always-raises' : entry.safe ? 'optimizer-safe' : null,
    detail?.exceptions].filter(Boolean).join('; ') || '?';
  const support = instructionOnly.has(key(entry)) ? 'instruction-only' :
    guardInstructionOnly.has(key(entry)) ? 'guard-instruction-only' : 'not implemented';
  return `| \`${cell(entry.module)}\` | \`${cell(entry.name)}/${entry.arity}\` | ${entry.kind} | ${entry.builtin ? 'yes' : 'no'} | ${categoryOf(entry)} | ${guard} | ${cell(effect)} | ${cell(exceptions)} | ${detail?.host ?? hostDependency(entry)} | ${support} |`;
});
const inventory = header + rows.join('\n') + '\n';
if (check) {
  if (readFileSync(inventoryPath, 'utf8') !== inventory) throw new Error('BIF inventory is out of date');
  console.log(`Verified ${entries.length} BIF entries against OTP 29.1.2`);
} else {
  process.stdout.write(inventory);
}
