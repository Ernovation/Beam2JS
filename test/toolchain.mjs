import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, realpathSync, rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';

const require = createRequire(import.meta.url);
const expected = {
  otp: '29.1.2',
  compiler: '10.0.7',
  erts: '17.1.1',
  rebar: '3.27.0',
  node: '20.19.2',
  playwright: '1.55.1',
  chromium: '140.0.7339.186',
};

const otpInfo = execFileSync('erl', ['-noshell', '-eval',
  '{ok,V}=file:read_file(filename:join([code:root_dir(),"releases",' +
  'erlang:system_info(otp_release),"OTP_VERSION"])), ' +
  'ok=application:load(compiler), {ok,C}=application:get_key(compiler,vsn), ' +
  'io:format("~s|~s|~s|~s",[string:trim(binary_to_list(V)),C,' +
  'erlang:system_info(version),code:root_dir()]), halt().'],
{encoding: 'utf8', timeout: 30000}).split('|');
assert.deepEqual(otpInfo.slice(0, 3), [expected.otp, expected.compiler, expected.erts]);
const erlc = execFileSync('which', ['erlc'], {encoding: 'utf8', timeout: 30000}).trim();
assert.equal(realpathSync(erlc), realpathSync(join(otpInfo[3], 'bin', 'erlc')));
// Outside the project, so that compiling its rebar3 plugin adds no output.
const rebar = execFileSync('rebar3', ['--version'], {cwd: tmpdir(), encoding: 'utf8', timeout: 30000});
assert.equal(rebar.trim(), `rebar ${expected.rebar} on Erlang/OTP 29 Erts ${expected.erts}`);
assert.equal(process.versions.node, expected.node);
assert.equal(require('playwright/package.json').version, expected.playwright);

const fixtureDir = mkdtempSync(join(tmpdir(), 'beam2js-toolchain-'));
try {
  execFileSync('erlc', ['-o', fixtureDir, 'fixtures/slice_helper.erl'], {timeout: 30000});
  const producer = execFileSync('erl', ['-noshell', '-eval',
    '[File]=init:get_plain_arguments(), {ok,{_,[{compile_info,Info}]}}=' +
    'beam_lib:chunks(File,[compile_info]), io:format("~s",[proplists:get_value(version,Info)]), halt().',
    '-extra', join(fixtureDir, 'slice_helper.beam')], {encoding: 'utf8', timeout: 30000});
  assert.equal(producer, expected.compiler);
} finally {
  rmSync(fixtureDir, {recursive: true, force: true});
}

const browser = await chromium.launch();
try {
  assert.equal(browser.version(), expected.chromium);
  const page = await browser.newPage();
  assert.equal(await page.evaluate(() => 21 * 2), 42);
} finally {
  await browser.close();
}

console.log(`OTP ${expected.otp} (compiler ${expected.compiler}, ERTS ${expected.erts}), ` +
  `rebar3 ${expected.rebar}, Node ${expected.node}, Playwright ${expected.playwright}, ` +
  `Chromium ${expected.chromium}`);
