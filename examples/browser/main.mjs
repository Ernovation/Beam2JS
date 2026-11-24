import {Runtime} from '../../runtime/beam2js.mjs';

const runtime = new Runtime({moduleBaseURL: new URL('./', import.meta.url)});

const button = document.getElementById('button');
const stopButton = document.getElementById('stop');
const status = document.getElementById('status');
if (!button || !stopButton || !status) throw new Error('Browser demo controls not found');

const receiver = runtime.spawnProcess('browser_demo', 'listen', []);

function cleanup() {
  stopButton.removeEventListener('click', onStop);
  window.removeEventListener('pagehide', onStop);
  button.disabled = true;
  stopButton.disabled = true;
}

function onStop() {
  cleanup();
  if (runtime.isProcessAlive(receiver.pid)) {
    status.textContent = 'Stopping...';
    runtime.sendMessage(receiver, runtime.atom('stop'));
  }
}

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
