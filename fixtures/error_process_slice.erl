-module(error_process_slice).
-export([try_error/0, catch_error/0, throw_value/0, exit_value/0,
         process_flag/1, link_peer/1, monitor_peer/1, demonitor_peer/2,
         child_exit/1, parent_trapped/0]).

try_error() ->
    try erlang:error(badarg) of
        Value -> {ok, Value}
    catch
        error:Reason:Stack -> {caught, error, Reason, Stack}
    end.

catch_error() ->
    catch erlang:error(badarg).

throw_value() -> try throw(reason) catch throw:Reason -> Reason end.

exit_value() -> try exit(reason) catch exit:Reason -> Reason end.

process_flag(Trap) -> erlang:process_flag(trap_exit, Trap).

link_peer(Pid) -> erlang:link(Pid).

monitor_peer(Pid) -> erlang:monitor(process, Pid).

demonitor_peer(Ref, Options) -> erlang:demonitor(Ref, Options).

child_exit(Reason) -> exit(Reason).

parent_trapped() ->
    process_flag(trap_exit, true),
    receive
        {'EXIT', Pid, Reason} -> {Pid, Reason}
    after 5000 -> timeout
    end.
