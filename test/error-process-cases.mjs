import assert from 'node:assert/strict';
import {Runtime, ErlangError} from '../runtime/beam2js.mjs';

export async function errorProcessChecks() {
  const rt = new Runtime();

  const direct = new ErlangError(rt.atom('badarg'), 'error');
  assert.equal(direct.erlangClass, 'error');
  assert.equal(direct.reason, rt.atom('badarg'));

  const normal = rt.spawnProcess('erlang', 'make_ref', []);
  const parent = rt.spawnProcess('erlang', 'make_ref', []);
  rt.setTrapExit(parent.pid, rt.atom('true'));
  rt.linkProcesses(parent.pid, normal.pid);
  rt.sendExitSignal(normal.pid, parent.pid, rt.atom('boom'));
  const exitMessage = rt.processMailbox(parent)[0];
  assert.equal(rt.tupleElement(exitMessage, 1), rt.atom('EXIT'));
  assert.equal(rt.tupleElement(exitMessage, 3), rt.atom('boom'));

  const watcher = rt.spawnProcess('erlang', 'make_ref', []);
  const target = rt.spawnProcess('erlang', 'make_ref', []);
  const reference = rt.monitorProcess(watcher.pid, target.pid);
  const linkedToTarget = rt.spawnProcess('erlang', 'make_ref', []);
  rt.linkProcesses(target.pid, linkedToTarget.pid);
  rt.terminateProcess(target.pid, rt.atom('killed'));
  const down = rt.processMailbox(watcher)[0];
  assert.equal(rt.tupleElement(down, 1), rt.atom('DOWN'));
  assert.equal(rt.tupleElement(down, 5), rt.atom('killed'));
  assert.equal(rt.demonitorProcess(watcher.pid, reference), rt.atom('true'));
  assert.equal(rt.isProcessAlive(target.pid), false);
  assert.equal(rt.isProcessAlive(linkedToTarget.pid), false);
  for (const handle of [target, linkedToTarget]) {
    await assert.rejects(handle.result, error => error.erlangClass === 'exit' && error.reason === rt.atom('killed'));
  }

  const linkedLeft = rt.spawnProcess('erlang', 'make_ref', []);
  const linkedRight = rt.spawnProcess('erlang', 'make_ref', []);
  rt.linkProcesses(linkedLeft.pid, linkedRight.pid);
  rt.sendExitSignal(linkedLeft.pid, linkedRight.pid, rt.atom('normal'));
  assert.equal(rt.isProcessAlive(linkedRight.pid), true);

}

await errorProcessChecks();
