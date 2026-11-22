-module(process_identity).
-export([self_pid/0, self_pair/0, reentrant/0, pid_guard/1, pid_body/1, pid_order/1,
         compare/1, compare_self/0, alive/1, alive_self/0]).

self_pid() -> self().

self_pair() -> {self(), self_pid()}.

reentrant() -> {self(), identity_probe:reenter(), self()}.

pid_guard(Value) when is_pid(Value) -> yes;
pid_guard(_) -> no.

pid_body(Value) -> is_pid(Value).

pid_order(Value) when Value > atom, Value < {} -> yes;
pid_order(_) -> no.

compare(Value) when Value =:= self() -> same;
compare(_) -> different.

compare_self() -> compare(self()).

alive(Pid) -> erlang:is_process_alive(Pid).

alive_self() -> erlang:is_process_alive(self()).
