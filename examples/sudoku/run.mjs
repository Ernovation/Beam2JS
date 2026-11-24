import {Runtime} from '../../runtime/beam2js.mjs';
const runtime = new Runtime({moduleBaseURL: new URL('../../_build/sudoku/', import.meta.url)});
const sample = await runtime.invokeAsync('sudoku', 'sample', []);
const result = await runtime.invokeAsync('sudoku', 'solve', [sample]);
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
