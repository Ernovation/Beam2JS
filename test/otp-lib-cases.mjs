// OTP library and BIF behaviour: compiles fixtures/otp_lib_cases.erl with
// OTP's ets, binary, unicode, string and math modules, and requires Beam2JS
// to match OTP on every scenario.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {otpDifferential} from './otp-differential.mjs';

const otpModules = ['lists', 'ets', 'binary', 'unicode', 'unicode_util', 'string', 'math', 'maps'];

export async function otpLibChecks() {
  const {failures, count} = await otpDifferential({module: 'otp_lib_cases', otpModules, minScenarios: 24});
  for (const failure of failures) console.error(failure.length > 800 ? `${failure.slice(0, 800)}...` : failure);
  assert.equal(failures.length, 0, `${failures.length} of ${count} scenarios differ from OTP`);
  return count;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const count = await otpLibChecks();
  console.log(`OTP library behaviour matched OTP on all ${count} scenarios`);
}
