// Compiles the OTP modules that ship with the runtime, and the runtime's own
// Erlang modules in runtime/otp/src/, into runtime/otp/lib/. The loader falls
// back to these when a module is not found under the configured module root. Re-run after upgrading OTP or changing the compiler:
//   node tools/build-otp-lib.mjs
import {execFileSync} from 'node:child_process';
import {mkdirSync, existsSync, mkdtempSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

export const bundledModules = ['erts_internal', 'persistent_term', 'atomics', 'counters', 'prim_eval', 'maps', 'lists',
  'prim_file', 'prim_buffer', 'prim_tty'];

const compiler = resolve('_build/default/bin/beam2js');
const output = resolve('runtime/otp/lib');
mkdirSync(output, {recursive: true});

const root = execFileSync('erl', ['-noshell', '-eval', 'io:format("~s", [code:root_dir()]), halt().'], {encoding: 'utf8'});
const ertsVersion = execFileSync('erl', ['-noshell', '-eval',
  'io:format("~s", [erlang:system_info(version)]), halt().'], {encoding: 'utf8'});

for (const name of bundledModules) {
  let beam = execFileSync('erl', ['-noshell', '-eval', `io:format("~s", [code:which(${name})]), halt().`],
    {encoding: 'utf8'});
  if (beam === 'preloaded') beam = join(root, 'lib', `erts-${ertsVersion}`, 'ebin', `${name}.beam`);
  if (!existsSync(beam)) throw new Error(`cannot find ${name}.beam`);
  execFileSync(compiler, [beam, join(output, `${name}.mjs`)], {stdio: 'inherit'});
  console.log(`compiled ${name}`);
}

const sources = resolve('runtime/otp/src');
const scratch = mkdtempSync(join(tmpdir(), 'beam2js-otp-'));
try {
  for (const file of readdirSync(sources).filter(name => name.endsWith('.erl'))) {
    const name = file.slice(0, -4);
    execFileSync('erlc', ['-o', scratch, join(sources, file)], {stdio: 'inherit'});
    execFileSync(compiler, [join(scratch, `${name}.beam`), join(output, `${name}.mjs`)], {stdio: 'inherit'});
    console.log(`compiled ${name}`);
  }
} finally {
  rmSync(scratch, {recursive: true, force: true});
}
