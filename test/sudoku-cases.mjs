export async function sudokuChecks(runtime, expectedSolution) {
  const list = values => values.reduceRight((tail, value) => runtime.cons(value, tail), runtime.nil());
  const gridTerm = grid => list(grid.map(row =>
    list(row.map(value => typeof value === 'number' ? BigInt(value) : value))));
  const readList = value => {
    const items = [];
    while (value !== runtime.nil()) {
      items.push(runtime.listHead(value));
      value = runtime.listTail(value);
    }
    return items;
  };
  const readGrid = grid => readList(grid).map(row => readList(row).map(Number));
  const expect = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const sample = runtime.invoke('sudoku', 'sample', []);
  const clues = readGrid(sample);
  const solved = runtime.invoke('sudoku', 'solve', [sample]);
  expect(runtime.isType('is_tuple', solved) && runtime.tupleElement(solved, 1) === runtime.atom('ok'),
    'sample did not solve');
  const solution = readGrid(runtime.tupleElement(solved, 2));
  expect(same(solution, expectedSolution), 'sample differs from OTP');
  expect(same(readGrid(sample), clues), 'solver changed the input');
  expect(solution.length === 9 && solution.every(row => row.length === 9), 'invalid solution shape');
  const ordered = values => values.slice().sort((a, b) => a - b).join('') === '123456789';
  for (let row = 0; row < 9; row++) {
    expect(ordered(solution[row]), 'invalid solution row');
    expect(ordered(solution.map(line => line[row])), 'invalid solution column');
    for (let col = 0; col < 9; col++) {
      expect(clues[row][col] === 0 || clues[row][col] === solution[row][col], 'clue was changed');
    }
  }
  for (let row = 0; row < 9; row += 3) {
    for (let col = 0; col < 9; col += 3) {
      const box = [];
      for (let r = row; r < row + 3; r++) {
        for (let c = col; c < col + 3; c++) box.push(solution[r][c]);
      }
      expect(ordered(box), 'invalid solution box');
    }
  }
  const almostSolved = solution.map(row => row.slice());
  almostSolved[0][0] = 0;
  almostSolved[8][8] = 0;
  const process = runtime.spawnProcess('sudoku', 'solve', [gridTerm(almostSolved)]);
  const asyncResult = await process.result;
  expect(runtime.tupleElement(asyncResult, 1) === runtime.atom('ok') &&
    same(readGrid(runtime.tupleElement(asyncResult, 2)), solution), 'scheduled solve failed');
  const solvedAgain = runtime.invoke('sudoku', 'solve', [gridTerm(solution)]);
  expect(runtime.tupleElement(solvedAgain, 1) === runtime.atom('ok') &&
    same(readGrid(runtime.tupleElement(solvedAgain, 2)), solution), 'solved puzzle changed');

  const blank = () => Array.from({length: 9}, () => Array(9).fill(0));
  const impossible = blank();
  impossible[0] = [1, 2, 3, 4, 5, 6, 7, 8, 0];
  impossible[1][8] = 9;
  expect(runtime.invoke('sudoku', 'solve', [gridTerm(impossible)]) === runtime.atom('unsolvable'),
    'valid impossible puzzle not rejected');
  for (const [r1, c1, r2, c2] of [[0, 0, 0, 1], [0, 0, 3, 0], [0, 0, 1, 1]]) {
    const duplicate = blank();
    duplicate[r1][c1] = 1;
    duplicate[r2][c2] = 1;
    expect(runtime.invoke('sudoku', 'solve', [gridTerm(duplicate)]) === runtime.atom('invalid'),
      'duplicate clue accepted');
  }
  const badValue = blank();
  badValue[0][0] = 10;
  const negative = blank();
  negative[0][0] = -1;
  const nonInteger = blank();
  nonInteger[0][0] = runtime.float(1);
  const shortRow = blank();
  shortRow[0].pop();
  const malformed = [
    gridTerm(badValue), gridTerm(negative), gridTerm(nonInteger), gridTerm(shortRow),
    gridTerm(blank().slice(1)), runtime.nil(), runtime.atom('bad'),
    runtime.cons(list(Array(9).fill(0n)), runtime.atom('bad')),
  ];
  for (const grid of malformed) {
    expect(runtime.invoke('sudoku', 'solve', [grid]) === runtime.atom('invalid'), 'invalid grid accepted');
  }
  return solution;
}
