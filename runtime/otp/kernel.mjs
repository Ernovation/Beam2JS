// Native replacements for kernel and erts modules whose OTP implementations
// depend on a booted node: init (the boot process), code (a client of
// code_server, which reads .beam files from disk) and net_kernel (the
// distribution server; a Beam2JS node is never distributed). Beam2JS loads modules
// through its own loader, so these modules talk to the runtime directly.
import {BITSTRING, is, isAtom, listToArray, arrayToList, charlist, charlistText} from './term.mjs';

// Modules made only of the native definitions below; the loader never fetches them.
export const nativeModules = new Set(['init', 'code', 'net_kernel']);

const badarg = rt => rt.raiseError(rt.atom('badarg'));
const ok = rt => rt.atom('ok');

function moduleName(rt, term) {
  if (!isAtom(term)) badarg(rt);
  return Symbol.keyFor(term);
}

// Where a loaded module came from, as code:which/1 and code:is_loaded/1 report it.
function loadedFrom(rt, name) {
  if (nativeModules.has(name) || name === 'erlang') return rt.atom('preloaded');
  return charlist(rt, new URL(`${encodeURIComponent(name)}.mjs`, rt.moduleBaseURL).href);
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
  def('init', 'objfile_extension', 0, rt => charlist(rt, '.beam'));
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
  def('code', 'objfile_extension', 0, rt => charlist(rt, '.beam'));
  def('code', 'where_is_file', 1, (rt, [file]) => {
    if (charlistText(file) === null) badarg(rt);
    return rt.atom('non_existing');
  });
  def('code', 'get_object_code', 1, rt => rt.atom('error'));
  def('code', 'load_abs', 1, rt => rt.tuple([rt.atom('error'), rt.atom('nofile')]));
  def('code', 'load_abs', 2, rt => rt.tuple([rt.atom('error'), rt.atom('nofile')]));
  def('code', 'load_binary', 3, rt => rt.tuple([rt.atom('error'), rt.atom('badfile')]));
  def('code', 'get_doc', 1, rt => rt.tuple([rt.atom('error'), rt.atom('missing')]));
  def('code', 'get_doc', 2, rt => rt.tuple([rt.atom('error'), rt.atom('missing')]));
  def('code', 'modified_modules', 0, rt => rt.nil());
  def('code', 'is_sticky', 1, rt => rt.atom('false'));
  def('code', 'stick_mod', 1, rt => rt.atom('true'));
  def('code', 'unstick_mod', 1, rt => rt.atom('true'));
  def('code', 'purge', 1, rt => rt.atom('false'));
  def('code', 'soft_purge', 1, rt => rt.atom('true'));
  def('code', 'delete', 1, rt => rt.atom('false'));
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
