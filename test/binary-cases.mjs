// Binary syntax: compiles fixtures/binary_cases.erl and requires Beam2JS to
// match OTP on every scenario.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {otpDifferential} from './otp-differential.mjs';

export async function binaryChecks() {
  const {failures, count} = await otpDifferential({module: 'binary_cases', otpModules: ['lists'], minScenarios: 37});
  assert.deepEqual(failures, []);
  return count;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const count = await binaryChecks();
  console.log(`binary syntax matched OTP on all ${count} scenarios`);
}
