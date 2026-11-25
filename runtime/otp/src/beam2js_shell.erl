-module(beam2js_shell).
-export([start/0]).

start() ->
    %% Boot without creating the runtime's EOF-only fallback user process.
    true = group_leader(self(), self()),
    Stderr = spawn(beam2js_user, server, []),
    true = register(standard_error, Stderr),
    {ok, Signals} = gen_event:start({local, erl_signal_server}),
    ok = application:set_env(kernel, shell_history, disabled),
    Driver = user_drv:start(),
    true = is_pid(Driver),
    User = whereis(user),
    true = is_pid(User),
    [group_leader(User, Pid) ||
        Pid <- [User, Stderr, Signals, Driver,
                whereis(user_drv_reader), whereis(user_drv_writer)],
        is_pid(Pid)],
    Driver.
