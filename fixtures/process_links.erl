-module(process_links).
%% Link, monitor, exit-signal and exception scenarios. test/process-link-cases.mjs
%% runs every scenario under OTP and under Beam2JS and requires identical results.
-compile([nowarn_deprecated_catch]).
-export([scenarios/0, run/1, id/1, crasher/0, waiter/0, forwarder/1, deep/1]).
-export([link_crash_trapped/0, spawn_link_trapped/0, spawn_link_fun_exit/0,
         link_propagates/0, link_normal_exit_ignored/0, trapped_normal_exit/0,
         trapped_many_links/0, link_dead_trapped/0, link_dead_untrapped/0,
         unlink_stops_signals/0, process_flag_previous/0,
         exit_signal_kills/0, exit_signal_trapped/0, exit_kill_untrappable/0,
         exit_kill_propagates_killed/0, exit_normal_ignored/0, exit_self_normal/0,
         exit_self_kill/0, exit_dead_pid/0, exit_badarg/0,
         monitor_crash/0, monitor_normal/0, monitor_noproc/0, monitor_name/0,
         monitor_name_noproc/0, spawn_monitor_crash/0, demonitor_flush/0,
         demonitor_info/0, uncaught_throw/0, uncaught_exit/0,
         catch_classes/0, try_inline/0, try_deep/0, try_nested/0, try_of/0,
         try_clause/0, try_stacktrace/0, try_rethrow/0, try_bif_action/0,
         try_in_loop/0]).

scenarios() ->
    [link_crash_trapped, spawn_link_trapped, spawn_link_fun_exit,
     link_propagates, link_normal_exit_ignored, trapped_normal_exit,
     trapped_many_links, link_dead_trapped, link_dead_untrapped,
     unlink_stops_signals, process_flag_previous,
     exit_signal_kills, exit_signal_trapped, exit_kill_untrappable,
     exit_kill_propagates_killed, exit_normal_ignored, exit_self_normal,
     exit_self_kill, exit_dead_pid, exit_badarg,
     monitor_crash, monitor_normal, monitor_noproc, monitor_name,
     monitor_name_noproc, spawn_monitor_crash, demonitor_flush,
     demonitor_info, uncaught_throw, uncaught_exit,
     catch_classes, try_inline, try_deep, try_nested, try_of,
     try_clause, try_stacktrace, try_rethrow, try_bif_action,
     try_in_loop].

%% Runs a scenario in a fresh process so trap_exit and links cannot leak between scenarios.
run(Name) ->
    Self = self(),
    {Pid, Ref} = spawn_monitor(fun() -> Self ! {self(), result, ?MODULE:Name()} end),
    receive
        {Pid, result, Result} ->
            receive {'DOWN', Ref, process, Pid, _} -> Result end;
        {'DOWN', Ref, process, Pid, Reason} ->
            {died, reason(Reason)}
    after 2000 ->
        timeout
    end.

id(X) -> X.
crasher() -> erlang:error(boom).
waiter() -> receive stop -> ok end.
forwarder(Parent) ->
    process_flag(trap_exit, true),
    Parent ! ready,
    receive Message -> Parent ! {forwarded, Message} end.
deep(0) -> erlang:error(deep);
deep(N) -> deep(N - 1), ok.

%% Stack traces differ between OTP and Beam2JS, so only their presence is compared.
reason({Reason, [{M, F, A, Info} | _]}) when is_atom(M), is_atom(F), is_list(Info),
                                           (is_integer(A) orelse is_list(A)) ->
    {reason(Reason), stacktrace};
reason(Reason) -> Reason.

sleep() -> receive after 20 -> ok end.

down(Pid) ->
    receive {'DOWN', _, process, Pid, Reason} -> {down, reason(Reason)}
    after 1000 -> no_down
    end.

%% Links

link_crash_trapped() ->
    process_flag(trap_exit, true),
    Pid = spawn(?MODULE, crasher, []),
    link(Pid),
    receive {'EXIT', Pid, Reason} -> {exit, reason(Reason)} after 1000 -> timeout end.

spawn_link_trapped() ->
    process_flag(trap_exit, true),
    Pid = spawn_link(?MODULE, crasher, []),
    receive {'EXIT', Pid, Reason} -> {exit, reason(Reason)} after 1000 -> timeout end.

spawn_link_fun_exit() ->
    process_flag(trap_exit, true),
    Pid = spawn_link(fun() -> exit(custom) end),
    receive {'EXIT', Pid, Reason} -> {exit, Reason} after 1000 -> timeout end.

link_propagates() ->
    Waiter = spawn(?MODULE, waiter, []),
    _ = monitor(process, Waiter),
    spawn(fun() -> link(Waiter), erlang:error(boom) end),
    down(Waiter).

link_normal_exit_ignored() ->
    Waiter = spawn(?MODULE, waiter, []),
    spawn(fun() -> link(Waiter) end),
    sleep(),
    Alive = is_process_alive(Waiter),
    Waiter ! stop,
    Alive.

trapped_normal_exit() ->
    process_flag(trap_exit, true),
    Pid = spawn_link(fun() -> ok end),
    receive {'EXIT', Pid, Reason} -> {exit, Reason} after 1000 -> timeout end.

trapped_many_links() ->
    process_flag(trap_exit, true),
    spawn_link(fun() -> exit(one) end),
    spawn_link(fun() -> exit(two) end),
    spawn_link(fun() -> exit(three) end),
    collect_exits(3, []).

collect_exits(0, Reasons) -> Reasons;
collect_exits(N, Reasons) ->
    receive {'EXIT', _, Reason} -> collect_exits(N - 1, insert(Reason, Reasons))
    after 1000 -> timeout
    end.

insert(X, [Y | Rest]) when Y < X -> [Y | insert(X, Rest)];
insert(X, List) -> [X | List].

link_dead_trapped() ->
    process_flag(trap_exit, true),
    Dead = spawn(fun() -> ok end),
    sleep(),
    Result = link(Dead),
    receive {'EXIT', Dead, Reason} -> {Result, Reason} after 1000 -> timeout end.

link_dead_untrapped() ->
    Dead = spawn(fun() -> ok end),
    sleep(),
    try link(Dead) catch error:Reason -> {caught, Reason} end.

unlink_stops_signals() ->
    process_flag(trap_exit, true),
    Waiter = spawn(?MODULE, waiter, []),
    link(Waiter),
    unlink(Waiter),
    exit(Waiter, kill),
    receive {'EXIT', Waiter, _} -> leaked after 50 -> clean end.

process_flag_previous() ->
    First = process_flag(trap_exit, true),
    Second = process_flag(trap_exit, false),
    {First, Second}.

%% Exit signals

exit_signal_kills() ->
    Waiter = spawn(?MODULE, waiter, []),
    _ = monitor(process, Waiter),
    true = exit(Waiter, bye),
    down(Waiter).

exit_signal_trapped() ->
    Self = self(),
    Pid = spawn(?MODULE, forwarder, [Self]),
    receive ready -> ok end,
    exit(Pid, bye),
    receive {forwarded, {'EXIT', Self, Reason}} -> {trapped, Reason} after 1000 -> timeout end.

exit_kill_untrappable() ->
    Pid = spawn(?MODULE, forwarder, [self()]),
    receive ready -> ok end,
    _ = monitor(process, Pid),
    exit(Pid, kill),
    down(Pid).

exit_kill_propagates_killed() ->
    Waiter = spawn(?MODULE, waiter, []),
    _ = monitor(process, Waiter),
    Linked = spawn(fun() -> link(Waiter), waiter() end),
    sleep(),
    exit(Linked, kill),
    down(Waiter).

exit_normal_ignored() ->
    Waiter = spawn(?MODULE, waiter, []),
    exit(Waiter, normal),
    sleep(),
    Alive = is_process_alive(Waiter),
    Waiter ! stop,
    Alive.

exit_self_normal() ->
    Self = self(),
    Pid = spawn(fun() -> exit(self(), normal), Self ! not_reached end),
    _ = monitor(process, Pid),
    Down = down(Pid),
    receive not_reached -> continued after 50 -> Down end.

exit_self_kill() ->
    Pid = spawn(fun() -> process_flag(trap_exit, true), exit(self(), kill), waiter() end),
    _ = monitor(process, Pid),
    down(Pid).

exit_dead_pid() ->
    Dead = spawn(fun() -> ok end),
    sleep(),
    exit(Dead, anything).

exit_badarg() ->
    try exit(id(not_a_pid), reason) catch error:Reason -> {caught, Reason} end.

%% Monitors

monitor_crash() ->
    Pid = spawn(?MODULE, crasher, []),
    Ref = monitor(process, Pid),
    receive {'DOWN', Ref, process, Pid, Reason} -> {down, reason(Reason)} after 1000 -> timeout end.

monitor_normal() ->
    Pid = spawn(fun() -> ok end),
    Ref = monitor(process, Pid),
    receive {'DOWN', Ref, process, Pid, Reason} -> {down, Reason} after 1000 -> timeout end.

monitor_noproc() ->
    Dead = spawn(fun() -> ok end),
    sleep(),
    Ref = monitor(process, Dead),
    receive {'DOWN', Ref, process, Dead, Reason} -> {down, Reason} after 1000 -> timeout end.

monitor_name() ->
    Waiter = spawn(?MODULE, waiter, []),
    register(process_links_named, Waiter),
    Ref = monitor(process, process_links_named),
    exit(Waiter, bye),
    receive {'DOWN', Ref, process, {Name, _Node}, Reason} -> {down, Name, Reason} after 1000 -> timeout end.

monitor_name_noproc() ->
    Ref = monitor(process, process_links_missing),
    receive {'DOWN', Ref, process, {Name, _Node}, Reason} -> {down, Name, Reason} after 1000 -> timeout end.

spawn_monitor_crash() ->
    {Pid, Ref} = spawn_monitor(fun() -> erlang:error(boom) end),
    receive {'DOWN', Ref, process, Pid, Reason} -> {down, reason(Reason)} after 1000 -> timeout end.

demonitor_flush() ->
    Pid = spawn(?MODULE, crasher, []),
    Ref = monitor(process, Pid),
    sleep(),
    Result = demonitor(Ref, [flush]),
    receive {'DOWN', Ref, _, _, _} -> leaked after 50 -> {Result, clean} end.

demonitor_info() ->
    Waiter = spawn(?MODULE, waiter, []),
    Ref = monitor(process, Waiter),
    First = demonitor(Ref, [info]),
    Second = demonitor(Ref, [info]),
    Waiter ! stop,
    {First, Second}.

uncaught_throw() ->
    {Pid, _} = spawn_monitor(fun() -> throw(oops) end),
    down(Pid).

uncaught_exit() ->
    {Pid, _} = spawn_monitor(fun() -> exit(custom) end),
    down(Pid).

%% Exceptions

catch_classes() ->
    {catch throw(thrown), reason_of(catch erlang:error(failed)), catch exit(exited)}.

reason_of({'EXIT', Reason}) -> {'EXIT', reason(Reason)};
reason_of(Other) -> Other.

try_inline() ->
    try element(5, id({a})) catch error:badarg -> caught end.

try_deep() ->
    try deep(3) catch error:Reason -> {caught, Reason} end.

try_nested() ->
    try
        try throw(inner) catch throw:other -> wrong end
    catch
        throw:inner -> outer
    end.

try_of() ->
    try id(1) of
        1 -> one
    catch
        _:_ -> failed
    end.

try_clause() ->
    try
        try id(2) of 1 -> one catch _:_ -> inner end
    catch
        error:{try_clause, Value} -> {try_clause, Value}
    end.

try_stacktrace() ->
    try erlang:error(traced) catch error:traced:Stack -> is_list(Stack) andalso Stack =/= [] end.

try_rethrow() ->
    try
        try erlang:error(first) catch error:first:Stack -> erlang:raise(error, second, Stack) end
    catch
        error:second -> rethrown
    end.

try_bif_action() ->
    try link(id(not_a_pid)) catch error:badarg -> caught end.

try_in_loop() ->
    loop(5, []).

loop(0, Acc) -> Acc;
loop(N, Acc) ->
    Value = try
        case N rem 2 of
            0 -> throw(N);
            1 -> N
        end
    catch
        throw:Thrown -> {thrown, Thrown}
    end,
    loop(N - 1, [Value | Acc]).
