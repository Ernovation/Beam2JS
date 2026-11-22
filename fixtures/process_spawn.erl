-module(process_spawn).
-export([start/3, across/3, parent_child/0]).

start(Module, Function, Args) -> erlang:spawn(Module, Function, Args).

across(Module, Function, Args) -> {started, erlang:spawn(Module, Function, Args)}.

parent_child() -> {self(), erlang:spawn(process_identity, self_pid, [])}.
