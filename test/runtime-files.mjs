import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const otp = fileURLToPath(new URL('../runtime/otp/', import.meta.url));

// Route entries for the runtime's helper modules, which the runtime imports
// relative to its own URL. `directory` is where the runtime is served, e.g.
// '/' for '/runtime.mjs' or '/runtime/' for '/runtime/beam2js.mjs'.
export function runtimeHelperResources(directory, wrap = body => body) {
  const entries = [];
  const walk = (relative) => {
    for (const entry of readdirSync(otp + relative, {withFileTypes: true})) {
      if (entry.isDirectory()) walk(`${relative}${entry.name}/`);
      else if (entry.name.endsWith('.mjs')) {
        entries.push([`${directory}otp/${relative}${entry.name}`,
          wrap(readFileSync(`${otp}${relative}${entry.name}`, 'utf8'))]);
      }
    }
  };
  walk('');
  return entries;
}
