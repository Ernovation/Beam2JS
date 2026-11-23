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
  ['erlang:list_to_tuple/1', {exceptions: 'badarg for improper or non-list input'}],
  ['erlang:tuple_to_list/1', {exceptions: 'badarg for non-tuple input'}],
  ['erlang:integer_to_list/1', {exceptions: 'badarg for non-integer input'}],
  ['erlang:integer_to_list/2', {exceptions: 'badarg for non-integer input or invalid base'}],
  ['erlang:integer_to_binary/1', {exceptions: 'badarg for non-integer input'}],
  ['erlang:integer_to_binary/2', {exceptions: 'badarg for non-integer input or invalid base'}],
  ['erlang:binary_to_list/1', {exceptions: 'badarg for non-binary input'}],
  ['erlang:binary_to_list/3', {exceptions: 'badarg for non-binary input or invalid range'}],
  ['erlang:bit_size/1', {exceptions: 'badarg for non-bitstring input'}],
  ['erlang:byte_size/1', {exceptions: 'badarg for non-bitstring input'}],
  ['erlang:element/2', {exceptions: 'badarg for invalid index or non-tuple'}],
  ['erlang:not/1', {exceptions: 'badarg for non-boolean input'}],
  ['erlang:and/2', {exceptions: 'badarg for non-boolean input'}],
  ['erlang:or/2', {exceptions: 'badarg for non-boolean input'}],
  ['erlang:xor/2', {exceptions: 'badarg for non-boolean input'}],
  ['erlang:abs/1', {exceptions: 'badarg for non-number input'}],
  ['erlang:trunc/1', {exceptions: 'badarg for non-number input'}],
  ['erlang:round/1', {exceptions: 'badarg for non-number input'}],
  ['erlang:floor/1', {exceptions: 'badarg for non-number input'}],
  ['erlang:ceil/1', {exceptions: 'badarg for non-number input'}],
  ['erlang:float/1', {exceptions: 'badarg for non-number input or integer-to-float overflow'}],
  ['erlang:div/2', {exceptions: 'badarith for zero divisor or non-integer input'}],
  ['erlang:rem/2', {exceptions: 'badarith for zero divisor or non-integer input'}],
  ['erlang:+/2', {exceptions: 'badarith for non-number input or float overflow'}],
  ['erlang:-/1', {exceptions: 'badarith for non-number input'}],
  ['erlang:-/2', {exceptions: 'badarith for non-number input or float overflow'}],
  ['erlang:*/2', {exceptions: 'badarith for non-number input or float overflow'}],
  ['erlang://2', {exceptions: 'badarith for non-number input, zero divisor or float conversion/result overflow'}],
  ['erlang:band/2', {exceptions: 'badarith for non-integer input'}],
  ['erlang:bor/2', {exceptions: 'badarith for non-integer input'}],
  ['erlang:bxor/2', {exceptions: 'badarith for non-integer input'}],
  ['erlang:bnot/1', {exceptions: 'badarith for non-integer input'}],
  ['erlang:binary_part/2', {exceptions: 'badarg for invalid arguments or out-of-bounds range'}],
  ['erlang:binary_part/3', {exceptions: 'badarg for invalid arguments or out-of-bounds range'}],
  ['erlang:map_get/2', {exceptions: '{badkey,Key} if absent; {badmap,Map} for non-map'}],
  ['erlang:is_map_key/2', {exceptions: '{badmap,Map} for non-map'}],
  ['erlang:map_size/1', {exceptions: '{badmap,Map} for non-map'}],
  ['erlang:tuple_size/1', {exceptions: 'badarg for non-tuple'}],
  ['maps:get/2', {exceptions: '{badkey,Key} if absent; {badmap,Map} for non-map'}],
  ['maps:is_key/2', {exceptions: '{badmap,Map} for non-map'}],
  ['erlang:list_to_atom/1', {effects: 'may add a permanent atom to the global atom table'}],
  ['erlang:self/0', {effects: 'reads calling process identity', host: 'process runtime'}],
  ['erlang:make_ref/0', {effects: 'creates a unique local reference', host: 'runtime identity'}],
  ['erlang:get/0', {effects: 'reads the calling process dictionary', host: 'process runtime'}],
  ['erlang:get/1', {effects: 'reads a key from the calling process dictionary', host: 'process runtime'}],
  ['erlang:get_keys/0', {effects: 'lists the calling process dictionary keys', host: 'process runtime'}],
  ['erlang:get_keys/1', {effects: 'lists keys with an exact matching value', host: 'process runtime'}],
  ['erlang:put/2', {effects: 'updates the calling process dictionary', host: 'process runtime'}],
  ['erlang:erase/0', {effects: 'clears the calling process dictionary', host: 'process runtime'}],
  ['erlang:erase/1', {effects: 'removes a key from the calling process dictionary', host: 'process runtime'}],
  ['erlang:monotonic_time/0', {effects: 'reads the runtime monotonic clock', host: 'clock / scheduler'}],
  ['erlang:monotonic_time/1', {effects: 'reads the runtime monotonic clock in the requested unit',
    exceptions: 'badarg for invalid time unit', host: 'clock / scheduler'}],
  ['erlang:is_process_alive/1', {effects: 'reads process liveness',
    exceptions: 'badarg for non-PID or non-local PID', host: 'process runtime'}],
  ['erlang:process_info/2', {effects: 'reads selected local process state',
    exceptions: 'badarg for invalid PID or item', host: 'process runtime'}],
  ['erlang:spawn/3', {effects: 'schedules a local process',
    exceptions: 'badarg for non-atom module/function or improper argument list', host: 'process runtime'}],
  ['erlang:register/2', {effects: 'registers a local process name',
    exceptions: 'badarg for invalid or already registered name or process', host: 'process runtime'}],
  ['erlang:unregister/1', {effects: 'removes a local process name',
    exceptions: 'badarg for unregistered or non-atom name', host: 'process runtime'}],
  ['erlang:whereis/1', {effects: 'looks up a local process name',
    exceptions: 'badarg for non-atom name', host: 'process runtime'}],
  ['erlang:registered/0', {effects: 'lists local registered names', host: 'process runtime'}],
  ['erlang:!/2', {effects: 'sends a message to a local PID or registered name',
    exceptions: 'badarg for invalid destination', host: 'process runtime'}],
  ['erlang:send/2', {effects: 'sends a message to a local PID or registered name',
    exceptions: 'badarg for invalid destination', host: 'process runtime'}],
  ['erlang:send_after/3', {effects: 'schedules a message to a local PID or name',
    exceptions: 'badarg for negative or non-integer delay or invalid destination', host: 'clock / scheduler'}],
  ['erlang:send_after/4', {effects: 'schedules a relative or absolute message to a local PID or name',
    exceptions: 'badarg for invalid arguments or options', host: 'clock / scheduler'}],
  ['erlang:start_timer/3', {effects: 'schedules a timeout tuple to a local PID or name',
    exceptions: 'badarg for negative or non-integer delay or invalid destination', host: 'clock / scheduler'}],
  ['erlang:start_timer/4', {effects: 'schedules a relative or absolute timeout tuple to a local PID or name',
    exceptions: 'badarg for invalid arguments or options', host: 'clock / scheduler'}],
  ['erlang:read_timer/1', {effects: 'reads remaining timer time',
    exceptions: 'badarg for non-reference', host: 'clock / scheduler'}],
  ['erlang:read_timer/2', {effects: 'reads remaining timer time, optionally asynchronously',
    exceptions: 'badarg for non-reference or invalid options', host: 'clock / scheduler'}],
  ['erlang:cancel_timer/1', {effects: 'cancels a timer',
    exceptions: 'badarg for non-reference', host: 'clock / scheduler'}],
  ['erlang:cancel_timer/2', {effects: 'cancels a timer, optionally asynchronously',
    exceptions: 'badarg for non-reference or invalid options', host: 'clock / scheduler'}],
]);
const instructionAndCallable = new Set([
  'erlang:is_integer/1', 'erlang:is_number/1', 'erlang:is_atom/1',
  'erlang:is_boolean/1', 'erlang:is_float/1', 'erlang:is_list/1', 'erlang:is_tuple/1',
  'erlang:is_binary/1', 'erlang:is_bitstring/1', 'erlang:is_pid/1', 'erlang:is_reference/1',
  'erlang:self/0', 'erlang:!/2', 'erlang:get/1',
  'erlang:hd/1', 'erlang:tl/1', 'erlang:length/1', 'erlang:tuple_size/1', 'erlang:element/2',
  'erlang:bit_size/1', 'erlang:byte_size/1', 'erlang:binary_part/2', 'erlang:binary_part/3',
  'erlang:abs/1', 'erlang:trunc/1', 'erlang:round/1', 'erlang:floor/1', 'erlang:ceil/1', 'erlang:float/1',
  'erlang:+/2', 'erlang:-/1', 'erlang:-/2', 'erlang:*/2', 'erlang://2', 'erlang:=:=/2',
  'erlang:==/2', 'erlang:/=/2', 'erlang:=/=/2', 'erlang:</2', 'erlang:=</2',
  'erlang:>/2', 'erlang:>=/2',
  'erlang:band/2', 'erlang:bor/2', 'erlang:bxor/2', 'erlang:bnot/1', 'erlang:div/2', 'erlang:rem/2',
  'erlang:not/1', 'erlang:and/2', 'erlang:or/2', 'erlang:xor/2',
]);
const callableOnly = new Set(['erlang:is_process_alive/1', 'erlang:process_info/2', 'erlang:spawn/3', 'erlang:send/2', 'erlang:make_ref/0',
  'erlang:list_to_tuple/1', 'erlang:tuple_to_list/1',
  'erlang:integer_to_list/1', 'erlang:integer_to_list/2',
  'erlang:integer_to_binary/1', 'erlang:integer_to_binary/2',
  'erlang:binary_to_list/1', 'erlang:binary_to_list/3',
  'erlang:monotonic_time/0', 'erlang:monotonic_time/1',
  'erlang:get/0', 'erlang:get_keys/0', 'erlang:get_keys/1', 'erlang:put/2', 'erlang:erase/0', 'erlang:erase/1',
  'erlang:send_after/3', 'erlang:send_after/4', 'erlang:start_timer/3', 'erlang:start_timer/4',
  'erlang:read_timer/1', 'erlang:cancel_timer/1',
  'erlang:read_timer/2', 'erlang:cancel_timer/2',
  'erlang:register/2', 'erlang:unregister/1', 'erlang:whereis/1', 'erlang:registered/0']);
const guardInstructionOnly = new Set();
const bodyAndGuardInstructionOnly = new Set();
const arithmeticInstructionOnly = new Set();
for (const name of details.keys()) {
  if (!entries.some(entry => key(entry) === name)) throw new Error(`unknown BIF detail: ${name}`);
}
for (const name of [...instructionAndCallable, ...callableOnly, ...guardInstructionOnly, ...bodyAndGuardInstructionOnly,
  ...arithmeticInstructionOnly]) {
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
- **Beam2JS**: \`instruction-and-callable\` means the corresponding normalized
  instruction (including \`send/0\` for \`!/2\`) and external callable BIF are supported for the implemented integer,
  float, atom, list, tuple, bitstring, local PID and local reference terms. Failing list, tuple, binary and
  selected numeric BIFs branch in guards and raise \`badarg\` in body and callable forms;
  supported arithmetic operators instead raise \`badarith\`. Comparison
  operators use comparison test instructions in guards.
  \`callable-only\` means external calls are supported without a specialized BIF instruction.
  \`guard-instruction-only\` means the listed BIF instruction is supported
  only with a nonzero guard failure label, for the implemented terms.
  \`body-and-guard-instruction-only\` covers selected zero-label BIF
  instructions and their guard forms.
  \`arithmetic-instruction-only\` covers both guard and zero-label forms of
  selected arithmetic instructions, including \`badarith\` failures and the
  supported floating-point-register sequence. Implemented forms are
  tested against OTP in Node and Chromium, including stripped input. The
  instruction-only classifications do not imply callable BIF dispatch; all other entries
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

- \`=:=/2\` returns a boolean atom using exact term equality, including
  distinctions between integers and floats and between signed floating zeroes.
  Its body instruction and callable form are tested against OTP in Node and
  Chromium, including stripped assembly callers. Comparisons are synchronous.
- \`==/2\`, \`/=/2\`, \`=/=/2\`, \`</2\`, \`=</2\`, \`>/2\` and \`>=/2\`
  return boolean atoms using numeric or exact equality and Erlang term ordering.
  Callable forms and comparison test instructions are tested against OTP in
  Node and Chromium, including stripped assembly callers. Comparisons are synchronous.
- Boolean \`not/1\`, \`and/2\`, \`or/2\` and \`xor/2\` require boolean
  arguments; invalid inputs branch in guard instructions or raise \`badarg\`
  in zero-label and callable forms. Both operands of binary operators are
  validated. OTP, Node and Chromium tests cover truth tables, invalid values,
  aliased x/y destinations, external calls and stripped inputs.
- \`hd/1\` and \`tl/1\` accept nonempty cons cells, including improper lists;
  \`length/1\` requires a proper list. Invalid inputs tested here raise
  \`badarg\` in a body. Nonzero-label \`length/1\` guard instructions are
  tested in OTP, Node and Chromium, including stripped
  [compiler-generated](../fixtures/length_guards.erl) and
  [assembly](../fixtures/raw_length_guards.S) fixtures and 10,000-element
  proper and improper lists. Zero-label forms are tested in
  [body](../fixtures/bif_body.erl) and [assembly](../fixtures/raw_bif_body.S)
  fixtures. Callable forms are also tested through direct and external calls,
  including invalid inputs and stripped input. Traversal is synchronous and can block the host event loop; OTP
  scheduling behavior is not implemented.
- \`list_to_tuple/1\` and \`tuple_to_list/1\` preserve element order and
  raise \`badarg\` for an improper/non-list or non-tuple respectively. Callable
  forms are tested against OTP in Node and Chromium, including stripped
  compiler-generated callers and long lists. Conversion is synchronous and
  OTP resource limits and scheduling behavior are not implemented.
- Callable \`integer_to_list/1,2\` and \`integer_to_binary/1,2\` format integers
  using uppercase digits and an optional leading minus. The default base is 10;
  explicit bases must be integers from 2 through 36. Invalid arguments raise
  \`badarg\`. OTP, Node and Chromium tests cover all bases, large integers,
  invalid inputs, external calls and scheduler yields, including stripped
  callers. Conversion is synchronous and can block the event loop; OTP resource
  limits and scheduling behavior are not implemented. \`list_to_integer/1,2\`
  are ordinary preloaded Erlang functions, not runtime BIFs.
- Callable \`binary_to_list/1,3\` convert a binary to a list of byte integers.
  The three-argument form uses a nonempty, one-based inclusive range. Non-binaries
  and invalid ranges raise \`badarg\`. OTP, Node and Chromium tests cover empty
  and partial bitstrings, range boundaries, long binaries, external calls and
  scheduler yields, including stripped callers. Conversion is synchronous and
  can block the event loop; OTP resource limits and scheduling behavior are not
  implemented.
- \`element/2\` uses one-based tuple indexes; a non-tuple or invalid index
  raises \`badarg\` in a body. \`tuple_size/1\` returns the number of tuple
  elements and raises \`badarg\` for a non-tuple. Guard and zero-label
  instructions and callable forms are tested in Node and Chromium, including
  invalid indexes and stripped input.
- \`bit_size/1\` counts bits and \`byte_size/1\` rounds the bit length up
  to whole bytes, including for partial-byte bitstrings. Both raise \`badarg\`
  for non-bitstrings in a body. Their nonzero-label guard instructions are
  tested against OTP in Node and Chromium, including stripped
  [compiler-generated](../fixtures/length_guards.erl) and
  [assembly](../fixtures/raw_length_guards.S) fixtures. Zero-label forms are
  tested in [body](../fixtures/bif_body.erl) and
  [assembly](../fixtures/raw_bif_body.S) fixtures. Callable forms are tested
  through direct and external calls in both hosts, including stripped input.
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
- Unary \`-/1\` and binary \`+/2\`, \`-/2\` and \`*/2\` accept numbers;
  non-numbers and floating-point overflow raise \`badarith\` in a body. Integer
  results can exceed machine word size and mixed integer/float arithmetic
  yields a float. Nonzero-label guard forms are tested against OTP in Node
  and Chromium using [compiler-generated](../fixtures/arithmetic_guards.erl)
  and [assembly](../fixtures/raw_arithmetic_guards.S) fixtures, including
  stripped input. Zero-label forms and floating-register arithmetic are tested
  in [body](../fixtures/arithmetic_body.erl) and
  [assembly](../fixtures/raw_arithmetic_body.S) and
  [floating-register](../fixtures/raw_float_registers.S) fixtures, including
  signed zero and overflow. Callable forms, including external calls, are tested
  in Node and Chromium. OTP resource limits and scheduling are not implemented.
- \`abs/1\` accepts integers and floats, preserves their type and turns
  negative float zero into positive zero; non-numbers raise \`badarg\` in a
  body. Nonzero-label guard instructions are tested in the same arithmetic
  fixtures, including large integers, subnormals, aliased destinations and
  stripped input. Zero-label forms are tested in the body and assembly fixtures
  above; callable forms are tested in Node and Chromium, including external
  tail calls from [assembly](../fixtures/raw_bif_body.S).
  OTP resource limits and scheduling are not implemented.
- \`trunc/1\`, \`round/1\`, \`floor/1\` and \`ceil/1\` accept integers and
  floats and return integers; non-numbers raise \`badarg\` in a body.
  \`trunc/1\` rounds toward zero, \`round/1\` rounds to the nearest integer
  with ties away from zero, and \`floor/1\` and \`ceil/1\` round down and up.
  Nonzero-label guards are tested in the same arithmetic fixtures, including
  half-integer boundaries, signed zeros, large numbers, aliased destinations
  and stripped input. Zero-label forms are tested in the body and assembly
  fixtures above; callable forms are tested in Node and Chromium.
  OTP resource limits and scheduling are not implemented.
- \`float/1\` converts an integer to a float or returns a float unchanged,
  including the sign of zero. Non-numbers and integer-to-float overflow raise
  \`badarg\` in a body. Nonzero-label guards are tested in the same arithmetic
  fixtures, including conversion rounding and overflow boundaries, aliased
  destinations and stripped input. Zero-label forms are tested in the body
  and assembly fixtures above; callable forms are tested in Node and Chromium,
  including external non-tail calls. OTP resource limits and scheduling are not implemented.
- Binary \`//2\` converts both operands to floats and always returns a float.
  Non-numbers, zero divisors, integer-to-float conversion overflow and float
  result overflow raise \`badarith\` in a body. Its nonzero-label guard
  instructions are tested in the same arithmetic fixtures, including signed
  zeros, subnormals, conversion boundaries, destination aliasing and stripped
  input. Zero-label instruction forms are tested in
  [assembly](../fixtures/raw_arithmetic_body.S), while the floating-register
  sequence for ordinary division is tested in the
  [body](../fixtures/arithmetic_body.erl) and
  [assembly](../fixtures/raw_float_registers.S) fixtures. Callable forms are
  tested in Node and Chromium. OTP resource limits and scheduling are not implemented.
- \`band/2\`, \`bor/2\`, \`bxor/2\` and \`bnot/1\` operate on signed
  integers and raise \`badarith\` for non-integers in a body. Their
  nonzero-label guard instructions are tested against OTP in Node and
  Chromium, including stripped [compiler-generated](../fixtures/bitwise_guards.erl)
  and [assembly](../fixtures/raw_bitwise_guards.S) fixtures. Zero-label forms
  are tested in [body](../fixtures/arithmetic_body.erl) and
  [assembly](../fixtures/raw_arithmetic_body.S) fixtures. Callable forms are
  tested against OTP in Node and Chromium, including stripped external callers.
  OTP resource limits,
  garbage collection and scheduling are not implemented.
- Integer \`div/2\` truncates toward zero and \`rem/2\` has the dividend's
  sign; zero divisors and non-integers raise \`badarith\` in a body. Their
  nonzero-label guard instructions are tested against OTP in Node and
  Chromium, including stripped [compiler-generated](../fixtures/integer_guards.erl)
  and [assembly](../fixtures/raw_integer_guards.S) fixtures. Zero-label forms
  are tested in the same body and assembly fixtures. Callable forms are tested
  against OTP in Node and Chromium, including stripped external callers.
  OTP resource and scheduling behavior are not implemented.
- \`binary_part/2\` and \`binary_part/3\` use a zero-based start; the
  two-argument form accepts a \`{Start,Length}\` tuple. A negative length selects bytes
  preceding that start; a valid empty range is allowed. Invalid types,
  non-byte-aligned bitstrings and out-of-bounds ranges tested here raise
  \`badarg\` in a body. Their nonzero-label guard instructions are tested in
  OTP, Node and Chromium with [compiler-generated](../fixtures/guard_bifs.erl)
  and [assembly](../fixtures/raw_guard_bifs.S) fixtures, including stripped
  input. Zero-label and callable forms are tested in the body and assembly
  fixtures above, including direct calls and propagated errors. Successful
  slices copy synchronously.
- \`self/0\` returns the calling process's PID; distinct processes have
  distinct live identities. It depends on a process runtime, not a pure
  host-value conversion. Beam2JS supports the instruction and callable forms,
  plus \`is_pid/1\` and PID type-test instructions for local process identities.
  Tests cover yields, calls, terminated processes and reentrant host invocations
  in Node and Chromium, including stripped input. PID ordering within the runtime
  is an implementation-defined local order, not a distributed OTP identity.
- \`is_process_alive/1\` returns whether a local PID identifies a live process,
  and raises \`badarg\` for non-PIDs or non-local PIDs. Callable forms are tested
  for runnable, executing, completed and failed processes in Node and Chromium,
  including stripped input. Cross-runtime PIDs are treated as non-local.
- \`process_info/2\` supports local PID queries for \`messages\`,
  \`message_queue_len\`, \`dictionary\`, \`{dictionary, Key}\`,
  \`registered_name\` and cooperative scheduler \`status\`, individually or
  in an ordered list. Dead local PIDs return \`undefined\`; invalid PIDs and
  item specifications raise \`badarg\`. Other valid items produce a host
  diagnostic for live processes. OTP, Node and Chromium tests cover snapshots,
  ordering, lifecycle and invalid arguments, including stripped input.
  Cross-scheduler signals and the remaining information items are unsupported.
- \`make_ref/0\` creates an opaque unique local reference; \`is_reference/1\`
  supports callable, body and guard forms. OTP, Node and Chromium tests cover
  uniqueness, equality, ordering relative to atoms and PIDs, and messaging,
  including stripped input. Reference ordering within Beam2JS is local and
  implementation-defined; distributed identity and serialization are unsupported.
- \`get/0,1\`, \`get_keys/0,1\`, \`put/2\` and \`erase/0,1\` operate on a
  process-local dictionary. Keys and value filters use exact term equality;
  list order is unspecified. The compiler-generated \`get/1\` instruction
  and callable forms are tested in OTP, Node and Chromium, including stripped
  input. Dictionary scans and term comparisons execute synchronously.
- \`spawn/3\` returns a new PID and schedules a local child; non-atom module or
  function arguments and improper argument lists raise \`badarg\` in the parent.
  Tests cover direct, tail and non-tail calls in Node and Chromium, including
  stripped input. Missing or private targets and more than 255 arguments fail
  asynchronously with a host diagnostic, rather than OTP's \`undef\`. Argument
  traversal is synchronous; monitors are unsupported.
- \`register/2\`, \`unregister/1\`, \`whereis/1\` and \`registered/0\`
  support local process names. A process may have one name, which is removed
  when it exits. Registry behavior and invalid inputs are tested against OTP
  in Node and Chromium, including stripped input. Ports and distributed
  registries are unsupported.
- \`!/2\` and \`send/2\` return the sent term and append it to a live local
  PID or registered name's mailbox; a dead local PID discards the message. Invalid destinations
  and unregistered atoms raise \`badarg\`. Distributed PIDs and registered-name
  node tuples are unsupported. The \`send\` instruction and callable forms are
  tested against OTP in Node and Chromium, including stripped input and per-sender
  ordering.
- \`send_after/3,4\` and \`start_timer/3,4\` schedule messages to local PIDs or names and
  return references. The four-argument forms accept relative and absolute
  deadlines using the runtime clock; \`monotonic_time/0,1\` reads that clock.
  \`read_timer/1\` and \`cancel_timer/1\` return remaining
  milliseconds or \`false\`. Their two-argument forms also support asynchronous
  access and, for cancellation, suppressing result information.
  PID-addressed timers are canceled when the destination
  exits; names are resolved when the timer expires.
  OTP, Node and Chromium tests cover delivery and cancellation, including
  stripped input. Relative delays and future absolute deadlines more than
  4294967295 milliseconds away, or absolute deadlines outside safe-integer
  precision, produce host diagnostics. Distributed timers are unsupported.
- OTP emits a non-failing \`bif\` instruction for direct body calls to the
  seven predicates in [this fixture](../fixtures/bif_predicates.erl) and
  \`is_list/1\` in the [list fixture](../fixtures/list_slice.erl) and
  \`is_tuple/1\` in the [tuple fixture](../fixtures/tuple_slice.erl).
  Beam2JS lowers these instructions for supported terms to Erlang \`true\` or
  \`false\` atoms. Selected register and literal operands are also checked in
  [assembly](../fixtures/raw_predicate_bifs.S), in Node and Chromium against
  OTP, including stripped input. All nine are also callable through external
  calls or the host invocation API; [assembly](../fixtures/raw_bif_body.S)
  tests tail and non-tail calls. Built-ins take precedence over a registered
  \`erlang\` function of the same name and arity. \`is_list/1\` accepts improper cons cells.
  \`is_binary/1\` accepts bitstrings whose length is divisible by eight;
  \`is_bitstring/1\` accepts partial-byte bitstrings too.

Failure of these guard BIFs or operators in a guard fails the guard rather than
propagating the body exception. Apart from the type predicates, process and message BIFs and the
list, tuple, binary and numeric BIFs above, the Beam2JS runtime does not implement these
callable BIFs. Beam2JS lowers the nonzero-label \`hd/1\`, \`tl/1\`, \`length/1\`,
\`tuple_size/1\`, \`element/2\`, \`bit_size/1\`, \`byte_size/1\` and
\`binary_part/2\` and \`binary_part/3\` guard
instructions for supported terms, with differential coverage from the
[guard fixture](../fixtures/guard_bifs.erl), [size fixture](../fixtures/length_guards.erl)
and their assembly fixtures. Their zero-label forms are supported and raise
\`badarg\` on invalid inputs.

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
  const support = instructionAndCallable.has(key(entry)) ? 'instruction-and-callable' :
    callableOnly.has(key(entry)) ? 'callable-only' :
      guardInstructionOnly.has(key(entry)) ? 'guard-instruction-only' :
      bodyAndGuardInstructionOnly.has(key(entry)) ? 'body-and-guard-instruction-only' :
        arithmeticInstructionOnly.has(key(entry)) ? 'arithmetic-instruction-only' : 'not implemented';
  return `| \`${cell(entry.module)}\` | \`${cell(entry.name)}/${entry.arity}\` | ${entry.kind} | ${entry.builtin ? 'yes' : 'no'} | ${categoryOf(entry)} | ${guard} | ${cell(effect)} | ${cell(exceptions)} | ${detail?.host ?? hostDependency(entry)} | ${support} |`;
});
const inventory = header + rows.join('\n') + '\n';
if (check) {
  if (readFileSync(inventoryPath, 'utf8') !== inventory) throw new Error('BIF inventory is out of date');
  console.log(`Verified ${entries.length} BIF entries against OTP 29.1.2`);
} else {
  process.stdout.write(inventory);
}
