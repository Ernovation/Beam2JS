-module(calls).
-export([local/1, remote/1, nested/2, wrapped/1, heap/2, stack/4, depth/1]).

local(Value) ->
    identity(identity(Value)).

remote(Value) ->
    pair(slice_helper:id(Value), Value).

nested(First, Second) ->
    pair(identity(First), identity(Second)).

wrapped(Value) ->
    Result = identity(Value),
    {Result, Value}.

heap(First, Second) ->
    pair(identity({First, Second}), Second).

stack(First, Second, Third, Fourth) ->
    A = slice_helper:id(First),
    B = slice_helper:id(Second),
    Pair = slice_helper:id({A, B}),
    C = slice_helper:id(Third),
    D = slice_helper:id(Fourth),
    {Pair, C, D}.

depth([]) ->
    done;
depth([_ | Rest]) ->
    identity(depth(Rest)).

identity(Value) ->
    Value.

pair(Left, Right) ->
    {Left, Right}.
