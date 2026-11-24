import {Runtime} from '../../runtime/beam2js.mjs';

// The server compiles <module>.mjs requests under /modules/ from BEAM files.
const runtime = new Runtime({moduleBaseURL: new URL('/modules/', document.baseURI)});

const form = document.getElementById('form');
const result = document.getElementById('result');
const status = document.getElementById('status');

const toList = values => values.reduceRight((tail, value) => runtime.cons(value, tail), runtime.nil());
function toArray(list) {
  const values = [];
  for (; list !== runtime.nil(); list = runtime.listTail(list)) values.push(runtime.listHead(list));
  return values;
}
const numbers = id => document.getElementById(id).value.split(/[\s,]+/).filter(Boolean).map(BigInt);

async function compare() {
  status.textContent = 'Calling server_demo:compare/2...';
  try {
    const sets = await runtime.invokeAsync('server_demo', 'compare', [toList(numbers('a')), toList(numbers('b'))]);
    result.replaceChildren(...['Union', 'Intersection', 'Only in A', 'Only in B'].flatMap((label, index) => {
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = `[${toArray(runtime.tupleElement(sets, index + 1)).join(', ')}]`;
      return [term, description];
    }));
    status.textContent = 'Done.';
  } catch (error) {
    status.textContent = `Failed: ${error.message}`;
    console.error(error);
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  void compare();
});
void compare();
