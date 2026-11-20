import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'beam2js-obsolete-'));
const ledger = readFileSync(new URL('../docs/opcodes-otp-29.1.2.md', import.meta.url), 'utf8');

function insertOpcode(beam, number, arity) {
  assert.equal(beam.toString('ascii', 0, 4), 'FOR1');
  assert.equal(beam.toString('ascii', 8, 12), 'BEAM');
  let offset = 12;
  while (offset < beam.length) {
    const size = beam.readUInt32BE(offset + 4);
    const start = offset + 8;
    const next = start + ((size + 3) & ~3);
    if (beam.toString('ascii', offset, offset + 4) === 'Code') {
      const code = beam.subarray(start, start + size);
      assert.equal(code.readUInt32BE(0), 16);
      assert.equal(code.at(-1), 3, 'expected int_code_end');
      const header = Buffer.from(code.subarray(0, 20));
      header.writeUInt32BE(Math.max(header.readUInt32BE(8), number), 8);
      const changed = Buffer.concat([
        header, code.subarray(20, -1), Buffer.from([number]),
        // Zero bytes are compact-encoded unsigned zero operands.
        Buffer.alloc(arity), Buffer.from([3]),
      ]);
      const chunk = Buffer.alloc(8);
      chunk.write('Code');
      chunk.writeUInt32BE(changed.length, 4);
      const result = Buffer.concat([
        beam.subarray(0, offset), chunk, changed,
        Buffer.alloc((4 - changed.length % 4) % 4), beam.subarray(next),
      ]);
      result.writeUInt32BE(result.length - 8, 4);
      return result;
    }
    offset = next;
  }
  throw new Error('fixture has no Code chunk');
}

function load(path) {
  const result = spawnSync('erl', ['+S', '1:1', '-pa', dir, '-noshell', '-eval',
    'ok=logger:add_handler(obsolete_test,obsolete_loader_logger,#{config=>#{recipient=>self()}}), ' +
    '[Path]=init:get_plain_arguments(), {ok,B}=file:read_file(Path), ' +
    'Result=code:load_binary(slice_helper,Path,B), io:format("LOAD_RESULT=~p~n",[Result]), ' +
    'case Result of {error,badfile} -> ' +
    'receive {loader_log,Log} -> io:format("LOADER_LOG=~s~n",[Log]) ' +
    'after 5000 -> erlang:error(loader_log_timeout) end; _ -> ok end, halt().', '-extra', path],
  {encoding: 'utf8', timeout: 30000});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout + result.stderr;
}

try {
  execFileSync('erlc', ['-o', dir, 'fixtures/slice_helper.erl', 'test/obsolete_loader_logger.erl'],
    {timeout: 30000});
  const fixture = join(dir, 'slice_helper.beam');
  const beam = readFileSync(fixture);
  assert.match(load(fixture), /LOAD_RESULT=\{module,slice_helper\}/);

  for (const [name, expectedArity] of [['fclearerror', 0], ['allocate_zero', 2], ['bs_append', 8]]) {
    const match = ledger.match(new RegExp(`^\\| (\\d+) \\| \`${name}/(\\d+)\` \\| deprecated \\|`, 'm'));
    assert.ok(match, `missing deprecated ${name}`);
    const [, number, arity] = match;
    assert.equal(Number(arity), expectedArity);
    const path = join(dir, `${name}.beam`);
    writeFileSync(path, insertOpcode(beam, Number(number), Number(arity)));
    const output = load(path);
    assert.match(output, /LOAD_RESULT=\{error,badfile\}/, name);
    assert.match(output, /please re-compile this module with an Erlang\/OTP 29 compiler/, name);
  }
  console.log('Verified OTP loader rejection of representative obsolete opcodes');
} finally {
  rmSync(dir, {recursive: true, force: true});
}
