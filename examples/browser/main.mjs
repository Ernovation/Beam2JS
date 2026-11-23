import {Runtime} from '../../runtime/beam2js.mjs';
import {register} from './browser_demo.mjs';
import {registerDom} from './dom.mjs';

const runtime = new Runtime();
registerDom(runtime, document);
register(runtime);

const button = document.getElementById('button');
const stopButton = document.getElementById('stop');
const status = document.getElementById('status');
if (!button || !stopButton || !status) throw new Error('Browser demo controls not found');

const receiver = runtime.spawnProcess('browser_demo', 'listen', []);

function cleanup() {
  button.removeEventListener('click', onClick);
  stopButton.removeEventListener('click', onStop);
  window.removeEventListener('pagehide', onStop);
  button.disabled = true;
  stopButton.disabled = true;
}

function onClick() {
  if (!runtime.isProcessAlive(receiver.pid)) {
    cleanup();
    return;
  }
  runtime.sendMessage(receiver, runtime.tuple([
    runtime.atom('dom_event'), runtime.atom('click'),
  ]));
}

function onStop() {
  cleanup();
  if (runtime.isProcessAlive(receiver.pid)) {
    status.textContent = 'Stopping...';
    runtime.sendMessage(receiver, runtime.atom('stop'));
  }
}

button.addEventListener('click', onClick);
stopButton.addEventListener('click', onStop);
window.addEventListener('pagehide', onStop);
void receiver.result.then(
  () => {
    cleanup();
    status.textContent = 'Stopped.';
  },
  error => {
    cleanup();
    status.textContent = `Failed: ${error.message}`;
    console.error('Browser event process failed:', error);
  },
);
