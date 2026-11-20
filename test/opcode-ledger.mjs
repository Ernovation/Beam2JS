import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
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
console.log(`Verified ${rows.length} opcode identities against installed OTP 29.1.2`);
