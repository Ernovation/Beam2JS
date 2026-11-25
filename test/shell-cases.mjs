// Shell building blocks: compiles fixtures/shell_cases.erl with OTP's own
// scanner, parser, linter, evaluator, formatters and stdlib modules, and
// requires Beam2JS to match OTP on every scenario.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {otpDifferential} from './otp-differential.mjs';

export const shellModules = [
  'erl_scan', 'erl_parse', 'erl_lint', 'erl_eval', 'erl_pp', 'erl_anno', 'erl_features', 'erl_internal',
  'otp_internal', 'io_lib', 'io_lib_format', 'io_lib_pretty', 'io_lib_fread', 'lists', 'string', 'unicode',
  'unicode_util', 'binary', 'maps', 'orddict', 'ordsets', 'gb_sets', 'gb_trees', 'sets', 'dict', 'proplists',
  'queue', 'ets', 'math', 'os', 're', 'io', 'sofs', 'erl_expand_records', 'beam_lib', 'epp', 'shell', 'erl_bits', 'eval_bits',
];

export async function shellChecks() {
  const {failures, count} = await otpDifferential({module: 'shell_cases', otpModules: shellModules, minScenarios: 51});
  for (const failure of failures) console.error(failure.length > 600 ? `${failure.slice(0, 600)}...` : failure);
  assert.equal(failures.length, 0, `${failures.length} of ${count} scenarios differ from OTP`);
  return count;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const count = await shellChecks();
  console.log(`shell building blocks matched OTP on all ${count} scenarios`);
}
