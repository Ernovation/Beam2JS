import {Runtime} from '../../runtime/beam2js.mjs';
import {register} from './browser_demo.mjs';
import {registerDom} from './dom.mjs';

const runtime = new Runtime();
registerDom(runtime, document);
register(runtime);
runtime.invoke('browser_demo', 'run', []);
