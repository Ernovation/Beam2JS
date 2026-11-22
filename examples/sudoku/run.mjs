import {Runtime} from '../../runtime/beam2js.mjs';
import {register} from '../../_build/sudoku/sudoku.mjs';

const runtime = new Runtime();
register(runtime);
const result = runtime.invoke('sudoku', 'solve', [runtime.invoke('sudoku', 'sample', [])]);
if (!runtime.isType('is_tuple', result) || runtime.tupleElement(result, 1) !== runtime.atom('ok')) {
  throw new Error(`Sudoku solver failed: ${String(result)}`);
}

for (let rows = runtime.tupleElement(result, 2); rows !== runtime.nil(); rows = runtime.listTail(rows)) {
  const cells = [];
  for (let row = runtime.listHead(rows); row !== runtime.nil(); row = runtime.listTail(row)) {
    cells.push(String(runtime.listHead(row)));
  }
  console.log(cells.join(' '));
}
