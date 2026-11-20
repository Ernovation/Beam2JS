import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const ledger = readFileSync(new URL('../docs/opcodes-otp-29.1.2.md', import.meta.url), 'utf8');
const rows = [...ledger.matchAll(/^\| (\d+) \| `([a-zA-Z0-9_]+)\/(\d+)` \| (active|deprecated) \|/gm)];
assert.equal(rows.length, 191);
const recorded = rows.map(([, number, name, arity]) => `${number} ${name} ${arity}`);

const otp = execFileSync('erl', ['-noshell', '-eval',
  '{ok,V}=file:read_file(filename:join([code:root_dir(),"releases",' +
  'erlang:system_info(otp_release),"OTP_VERSION"])), ' +
  'io:format("~s~n",[string:trim(binary_to_list(V))]), ' +
  'lists:foreach(fun(N) -> try beam_opcodes:opname(N) of ' +
  '{Name,Arity} -> io:format("~B ~s ~B~n",[N,Name,Arity]) ' +
  'catch error:badarg -> ok end end, lists:seq(1,255)), halt().'],
{encoding: 'utf8', timeout: 30000}).trimEnd().split('\n');
assert.equal(otp.shift(), '29.1.2', 'opcode comparison requires OTP 29.1.2');
assert.deepEqual(recorded, otp);

const row = name => {
  const found = ledger.split('\n').find(line => line.includes(`| \`${name}/`));
  assert.ok(found, `missing opcode ${name}`);
  return found;
};
for (const [, , name, , lifecycle] of rows) {
  if (lifecycle === 'active') {
    assert.doesNotMatch(row(name), /OTP: Not yet inventoried/, `missing OTP notes for ${name}`);
  } else {
    assert.match(row(name), /OTP: Obsolete; OTP 29 loader refuses it\./);
  }
}
assert.match(row('call_last'), /deallocates a frame and tail-transfers/);
assert.match(row('bif1'), /zero label denotes exception, otherwise failure branches/);
assert.match(row('bif1'), /Beam2JS: Normalized is_integer.*zero failure label/);
assert.match(row('bif1'), /hd, tl and tuple_size with nonzero failure label/);
assert.match(row('bif2'), /Beam2JS: Normalized element.*nonzero failure label/);
assert.match(row('gc_bif1'), /Beam2JS: Normalized bnot and length guards.*nonzero failure label/);
assert.match(row('gc_bif2'), /Beam2JS: Normalized band, bor, bxor, div and rem guards.*nonzero failure label/);
assert.match(row('select_val'), /value\/label pairs.*failure label/);
assert.match(row('select_val'), /Beam2JS:.*exact matching/);
assert.match(row('select_tuple_arity'), /Beam2JS:.*distinct nonnegative/);
assert.match(row('is_tagged_tuple'), /Beam2JS:.*atom tag/);
assert.match(ledger, /type-tagged x registers \(hints are ignored, not validated\)/);
assert.match(row('wait_timeout'), /resume the receive loop.*continue on timeout.*raise/);
assert.match(row('bs_start_match4'), /no_fail or resume/);
assert.match(row('bs_match'), /ensure_at_least.*ensure_exactly.*binary.*integer.*skip.*get_tail/);
assert.match(row('put_record'), /zero failure label raises, otherwise failure branches/);
assert.match(row('is_eq_exact'), /OTP:.*Beam2JS:/);
for (const name of ['is_integer', 'is_number', 'is_atom', 'is_boolean', 'is_float',
  'is_lt', 'is_ge', 'is_eq', 'is_ne', 'is_eq_exact', 'is_ne_exact', 'label',
  'func_info', 'int_code_end', 'allocate', 'deallocate', 'return', 'move',
  'jump', 'call_only', 'call_ext_only', 'is_tuple', 'select_val', 'select_tuple_arity',
  'bif0', 'bif1', 'bif2', 'gc_bif1', 'gc_bif2', 'gc_bif3']) {
  assert.match(row(name), /Raw evidence:/);
}

const wrongSource = spawnSync(process.execPath, [
  new URL('../tools/opcode-ledger.mjs', import.meta.url).pathname,
  '--check', new URL('../package.json', import.meta.url).pathname,
], {encoding: 'utf8', timeout: 30000});
assert.notEqual(wrongSource.status, 0);
assert.match(wrongSource.stderr, /does not match the pinned OTP 29\.1\.2 source/);
console.log(`Verified ${rows.length} opcode identities against installed OTP 29.1.2`);
