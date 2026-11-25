import {startBrowserShell} from '../../runtime/browser-shell.mjs';

const status = document.getElementById('status');
export let shell;
try {
  shell = await startBrowserShell(document.getElementById('terminal'), {
    moduleBaseURL: new URL('/modules/', document.baseURI),
    fileBaseURL: new URL('/', document.baseURI),
    onProcessError: (_pid, error) => { status.textContent = `Erlang process failed: ${error.message}`; console.error(error); },
    onHalt: code => { status.textContent = `Shell halted (${code})`; void shell.stop(); },
  });
  status.textContent = 'Shell running. Enter evaluates an expression; arrow keys edit and recall history.';
  document.getElementById('stop').addEventListener('click', async () => {
    await shell.stop(); status.textContent = 'Shell stopped.';
  });
  window.addEventListener('pagehide', () => { void shell.stop(); }, {once: true});
} catch (error) {
  status.textContent = `Could not start shell: ${error.message}`;
  console.error(error);
}
