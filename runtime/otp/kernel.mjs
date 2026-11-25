// Native replacements for kernel and erts modules whose OTP implementations
// depend on a booted node: init (the boot process), code (a client of
// code_server, which reads .beam files from disk) and net_kernel (the
// distribution server; a Beam2JS node is never distributed). Beam2JS loads modules
// through its own loader, so these modules talk to the runtime directly.
import {BITSTRING, is, isAtom, listToArray, arrayToList, bool, charlist, charlistText, binary} from './term.mjs';
import {readFileBytes} from './file.mjs';

// Modules made only of the native definitions below; the loader never fetches them.
export const nativeModules = new Set(['init', 'code', 'net_kernel', 'erl_prim_loader', 'application']);

const environments = new WeakMap();
const histories = new WeakMap();
function environment(rt) {
  if (!environments.has(rt)) environments.set(rt, new Map());
  return environments.get(rt);
}

const badarg = rt => rt.raiseError(rt.atom('badarg'));
const ok = rt => rt.atom('ok');

function moduleName(rt, term) {
  if (!isAtom(term)) badarg(rt);
  return Symbol.keyFor(term);
}

// Where a loaded module came from, as code:which/1 and code:is_loaded/1 report it.
function loadedFrom(rt, name) {
  if (nativeModules.has(name) || name === 'erlang') return rt.atom('preloaded');
  // The object file, as in OTP; the module itself was loaded from Name.mjs.
  return charlist(rt, new URL(`${encodeURIComponent(name)}.beam`, rt.moduleBaseURL).href);
}

function isLoaded(rt, name) {
  return name === 'erlang' || rt.modules.has(name);
}

// An action that loads modules (suspending the process if needed) and then
// returns done(rt, failedNames).
function load(names, done) {
  return {type: 'load', modules: names, done};
}

function ensureLoaded(rt, term) {
  const name = moduleName(rt, term);
  return load([name], (rt, failed) => failed.length
    ? rt.tuple([rt.atom('error'), rt.atom('nofile')])
    : rt.tuple([rt.atom('module'), term]));
}

function stringList(rt, values) {
  return arrayToList(rt, values.map(value => charlist(rt, String(value))));
}

function initArguments(rt) {
  return Object.entries(rt.initArguments);
}

export function kernelBifs() {
  const modules = new Map();
  const def = (module, name, arity, fn) => {
    if (!modules.has(module)) modules.set(module, []);
    modules.get(module).push([name, arity, fn]);
  };
  const envKey = (rt, app, key) => {
    moduleName(rt, app); moduleName(rt, key);
    return JSON.stringify([Symbol.keyFor(app), Symbol.keyFor(key)]);
  };
  def('application', 'get_env', 2, (rt, [app, key]) => {
    const value = environment(rt).get(envKey(rt, app, key));
    return value === undefined ? rt.atom('undefined') : rt.tuple([rt.atom('ok'), value]);
  });
  def('application', 'get_env', 3, (rt, [app, key, fallback]) =>
    environment(rt).get(envKey(rt, app, key)) ?? fallback);
  for (const arity of [3, 4]) def('application', 'set_env', arity, (rt, [app, key, value]) => {
    environment(rt).set(envKey(rt, app, key), value);
    return ok(rt);
  });
  for (const arity of [2, 3]) def('application', 'unset_env', arity, (rt, [app, key]) => {
    environment(rt).delete(envKey(rt, app, key));
    return ok(rt);
  });
  // No application controller is booted: kernel and stdlib count as running,
  // and other applications behave as if their .app file were missing.
  const running = ['kernel', 'stdlib'];
  const appInfo = rt => arrayToList(rt, running.map(app =>
    rt.tuple([rt.atom(app), charlist(rt, app), charlist(rt, '')])));
  const missingApp = (rt, app) => rt.tuple([charlist(rt, 'no such file or directory'),
    charlist(rt, `${moduleName(rt, app)}.app`)]);
  for (const name of ['start', 'ensure_started']) for (const arity of [1, 2]) {
    def('application', name, arity, (rt, [app]) => {
      if (!running.includes(moduleName(rt, app))) return rt.tuple([rt.atom('error'), missingApp(rt, app)]);
      return name === 'start' ? rt.tuple([rt.atom('error'), rt.tuple([rt.atom('already_started'), app])]) : ok(rt);
    });
  }
  for (const arity of [1, 2, 3]) def('application', 'ensure_all_started', arity, (rt, [apps]) => {
    for (const app of rt.isType('is_list', apps) ? listToArray(apps) : [apps]) {
      if (!running.includes(moduleName(rt, app))) {
        return rt.tuple([rt.atom('error'), rt.tuple([app, missingApp(rt, app)])]);
      }
    }
    return rt.tuple([rt.atom('ok'), arrayToList(rt, [])]);
  });
  def('application', 'stop', 1, (rt, [app]) => {
    moduleName(rt, app);
    return rt.tuple([rt.atom('error'), rt.tuple([rt.atom('not_started'), app])]);
  });
  def('application', 'loaded_applications', 0, appInfo);
  def('application', 'which_applications', 0, appInfo);
  def('application', 'which_applications', 1, appInfo);

  // No kernel_safe_sup or disk_log is booted in a browser. Keep session
  // history locally instead of waiting for that supervisor indefinitely.
  def('group_history', 'load', 0, rt => arrayToList(rt, histories.get(rt) ?? []));
  def('group_history', 'add', 1, (rt, [line]) => {
    const history = histories.get(rt) ?? [];
    history.unshift(line);
    history.length = Math.min(history.length, 1000);
    histories.set(rt, history);
    return ok(rt);
  });

  // init
  def('init', 'get_arguments', 0, rt => arrayToList(rt, initArguments(rt).map(([flag, values]) =>
    rt.tuple([rt.atom(flag), stringList(rt, values)]))));
  def('init', 'get_argument', 1, (rt, [flag]) => {
    const values = initArguments(rt).filter(([name]) => name === moduleName(rt, flag));
    if (!values.length) return rt.atom('error');
    return rt.tuple([rt.atom('ok'), arrayToList(rt, values.map(([, list]) => stringList(rt, list)))]);
  });
  def('init', 'get_plain_arguments', 0, rt => stringList(rt, rt.plainArguments));
  def('init', 'script_name', 0, rt => charlist(rt, 'beam2js'));
  def('init', 'get_status', 0, rt => rt.tuple([rt.atom('started'), rt.atom('started')]));
  def('init', 'notify_when_started', 1, rt => rt.atom('started'));
  def('init', 'wait_until_started', 0, ok);
  def('init', 'fetch_loaded', 0, rt => arrayToList(rt, [...rt.modules.keys()].map(name =>
    rt.tuple([rt.atom(name), loadedFrom(rt, name)]))));
  def('init', 'ensure_loaded', 1, (rt, [module]) => ensureLoaded(rt, module));
  def('init', 'run_on_load_handlers', 0, ok);
  def('init', 'get_configfd', 1, rt => rt.atom('none'));
  def('init', 'set_configfd', 2, ok);
  def('init', 'archive_extension', 0, rt => charlist(rt, '.ez'));
  def('init', 'objfile_extension', 0, rt => charlist(rt, '.mjs'));
  def('init', 'code_path_choice', 0, rt => rt.atom('relaxed'));
  for (const name of ['stop', 'reboot', 'restart']) {
    def('init', name, 0, () => ({type: 'tail', module: 'erlang', name: 'halt', args: [0n], external: true}));
  }
  def('init', 'stop', 1, (rt, [status]) => ({type: 'tail', module: 'erlang', name: 'halt', args: [status], external: true}));

  // code
  def('code', 'ensure_loaded', 1, (rt, [module]) => ensureLoaded(rt, module));
  def('code', 'load_file', 1, (rt, [module]) => ensureLoaded(rt, module));
  def('code', 'ensure_modules_loaded', 1, (rt, [list]) => {
    const names = (listToArray(list) ?? badarg(rt)).map(term => moduleName(rt, term));
    return load(names, (rt, failed) => failed.length
      ? rt.tuple([rt.atom('error'), arrayToList(rt, failed.map(name =>
        rt.tuple([rt.atom(name), rt.atom('nofile')])))])
      : rt.atom('ok'));
  });
  def('code', 'is_loaded', 1, (rt, [module]) => {
    const name = moduleName(rt, module);
    return isLoaded(rt, name) ? rt.tuple([rt.atom('file'), loadedFrom(rt, name)]) : rt.atom('false');
  });
  def('code', 'which', 1, (rt, [module]) => {
    const name = moduleName(rt, module);
    return load([name], (rt, failed) => failed.length ? rt.atom('non_existing') : loadedFrom(rt, name));
  });
  def('code', 'all_loaded', 0, rt => arrayToList(rt, ['erlang', ...rt.modules.keys()].map(name =>
    rt.tuple([rt.atom(name), loadedFrom(rt, name)]))));
  def('code', 'all_available', 0, rt => arrayToList(rt, ['erlang', ...rt.modules.keys()].map(name =>
    rt.tuple([charlist(rt, name), loadedFrom(rt, name), rt.atom('true')]))));
  def('code', 'get_mode', 0, rt => rt.atom('interactive'));
  def('code', 'get_path', 0, rt => arrayToList(rt, [charlist(rt, rt.moduleBaseURL)]));
  for (const [name, arity] of [['set_path', 1], ['set_path', 2], ['add_paths', 1], ['add_paths', 2],
    ['add_pathsa', 1], ['add_pathsa', 2], ['add_pathsz', 1], ['add_pathsz', 2]]) def('code', name, arity, ok);
  for (const [name, arity] of [['add_path', 1], ['add_path', 2], ['add_patha', 1], ['add_patha', 2],
    ['add_pathz', 1], ['add_pathz', 2]]) def('code', name, arity, rt => rt.atom('true'));
  def('code', 'del_path', 1, rt => rt.atom('false'));
  def('code', 'root_dir', 0, rt => charlist(rt, '/'));
  def('code', 'lib_dir', 0, rt => charlist(rt, '/lib'));
  def('code', 'lib_dir', 1, (rt, [app]) => {
    moduleName(rt, app);
    return rt.tuple([rt.atom('error'), rt.atom('bad_name')]);
  });
  def('code', 'priv_dir', 1, (rt, [app]) => {
    moduleName(rt, app);
    return rt.tuple([rt.atom('error'), rt.atom('bad_name')]);
  });
  def('code', 'objfile_extension', 0, rt => charlist(rt, '.mjs'));
  def('code', 'where_is_file', 1, (rt, [file]) => {
    if (charlistText(file) === null) badarg(rt);
    return rt.atom('non_existing');
  });
  def('code', 'get_object_code', 1, rt => rt.atom('error'));
  // Loads File.beam (for example written by compile:file to the in-memory
  // file system) through the self-hosted compiler.
  const loadAbs = (rt, file, module) => {
    const path = isAtom(file) ? Symbol.keyFor(file) : charlistText(file);
    if (path === null || path === undefined || (module !== undefined && !isAtom(module))) badarg(rt);
    const name = module === undefined ? path.slice(path.lastIndexOf('/') + 1) : moduleName(rt, module);
    return {type: 'async', run: async () => {
      const bytes = await readFileBytes(rt, charlist(rt, path + '.beam'));
      if (typeof bytes === 'string') return rt.tuple([rt.atom('error'), rt.atom('nofile')]);
      const reason = await rt.loadBinary(name, binary(rt, bytes));
      return reason === null ? rt.tuple([rt.atom('module'), rt.atom(name)])
        : rt.tuple([rt.atom('error'), rt.atom(reason)]);
    }};
  };
  def('code', 'load_abs', 1, (rt, [file]) => loadAbs(rt, file));
  def('code', 'load_abs', 2, (rt, [file, module]) => loadAbs(rt, file, module));
  def('code', 'load_binary', 3, (rt, [module, file, beam]) => {
    if (!isAtom(module) || (!isAtom(file) && charlistText(file) === null) || !is(beam, BITSTRING) || beam[1][1] % 8 !== 0) badarg(rt);
    const name = moduleName(rt, module);
    return {type: 'async', run: async () => {
      const reason = await rt.loadBinary(name, beam);
      return reason === null ? rt.tuple([rt.atom('module'), module]) : rt.tuple([rt.atom('error'), rt.atom(reason)]);
    }};
  });
  def('code', 'get_doc', 1, rt => rt.tuple([rt.atom('error'), rt.atom('missing')]));
  def('code', 'get_doc', 2, rt => rt.tuple([rt.atom('error'), rt.atom('missing')]));
  def('code', 'modified_modules', 0, rt => rt.nil());
  def('code', 'is_sticky', 1, rt => rt.atom('false'));
  def('code', 'stick_mod', 1, rt => rt.atom('true'));
  def('code', 'unstick_mod', 1, rt => rt.atom('true'));
  def('code', 'purge', 1, (rt, [module]) => { moduleName(rt, module); return rt.atom('false'); });
  def('code', 'soft_purge', 1, (rt, [module]) => { moduleName(rt, module); return rt.atom('true'); });
  def('code', 'delete', 1, (rt, [module]) => bool(rt, rt.deleteModule(moduleName(rt, module))));
  def('code', 'module_status', 1, (rt, [module]) =>
    rt.atom(isLoaded(rt, moduleName(rt, module)) ? 'loaded' : 'not_loaded'));
  def('code', 'coverage_support', 0, rt => rt.atom('false'));
  def('code', 'get_coverage_mode', 0, rt => rt.atom('none'));
  def('code', 'get_coverage_mode', 1, rt => rt.atom('none'));
  def('code', 'set_coverage_mode', 1, rt => rt.atom('none'));
  for (const [name, arity] of [['get_coverage', 2], ['reset_coverage', 1]]) def('code', name, arity, rt => badarg(rt));
  def('code', 'get_debug_info', 1, rt => rt.atom('none'));

  // The default user IO server (runtime/otp/src/beam2js_user.erl).
  def('beam2js_user', 'write', 1, (rt, [data]) => {
    if (!is(data, BITSTRING) || data[1][1] % 8 !== 0) badarg(rt);
    rt.writeStdout(new TextDecoder().decode(data[1][0]));
    return rt.atom('ok');
  });

  // net_kernel: a node that is not distributed.
  def('net_kernel', 'dflag_unicode_io', 1, rt => rt.atom('true'));
  def('net_kernel', 'get_state', 0, rt => rt.map([[rt.atom('started'), rt.atom('no')]]));
  def('net_kernel', 'get_net_ticktime', 0, rt => rt.atom('ignored'));
  def('net_kernel', 'nodename', 0, rt => rt.atom('ignored'));
  def('net_kernel', 'stop', 0, rt => rt.tuple([rt.atom('error'), rt.atom('not_allowed')]));

  return modules;
}
