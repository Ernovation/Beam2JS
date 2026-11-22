-module(process_registry).
-export([bind/2, wrapped/2, lookup/1, unbind/1, names/0, self_bind/1,
         receive_one/0, receive_two/0]).

bind(Name, Pid) -> erlang:register(Name, Pid).
wrapped(Name, Pid) -> {bound, erlang:register(Name, Pid)}.
lookup(Name) -> erlang:whereis(Name).
unbind(Name) -> erlang:unregister(Name).
names() -> erlang:registered().

self_bind(Name) ->
    Self = self(),
    true = erlang:register(Name, Self),
    {Self, erlang:whereis(Name)}.

receive_one() -> receive Message -> Message end.
receive_two() ->
    First = receive Message1 -> Message1 end,
    Second = receive Message2 -> Message2 end,
    {First, Second}.
