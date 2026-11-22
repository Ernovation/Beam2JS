-module(process_dictionary).
-export([exercise/6, undefined_value/1, value_keys/0, roundtrip/2, store/2, read/1, raw/1,
         worker/3, collect/0, parent/2, child/2]).

exercise(Key, Equivalent, Other, Value, EqualValue, DifferentValue) ->
    Missing = get(Key),
    First = put(Key, Value),
    Lookup = get(Equivalent),
    Previous = put(Equivalent, EqualValue),
    NewOther = put(Other, DifferentValue),
    Keys = get_keys(),
    Matching = get_keys(Value),
    Different = get_keys(DifferentValue),
    Pairs = get(),
    Removed = erase(Equivalent),
    Remaining = get(),
    Erased = erase(),
    {Missing, First, Lookup, Previous, NewOther, Keys, Matching, Different,
     Pairs, Removed, Remaining, Erased, get(), get_keys(), erase(Key)}.

undefined_value(Key) ->
    First = put(Key, undefined),
    Keys = get_keys(undefined),
    Previous = put(Key, 42),
    {First, Keys, Previous, erase(Key), erase(Key), get_keys()}.

value_keys() ->
    put(integer, 1),
    put(float, 1.0),
    put(negative_zero, -0.0),
    {get_keys(1), get_keys(1.0), get_keys(0.0), get_keys(-0.0)}.

roundtrip(Key, Other) ->
    {put(Key, found), get(Other), erase(Other), get(Key)}.

store(Key, Value) -> put(Key, Value).
read(Key) -> get(Key).

raw(Key) ->
    put(Key, stored),
    {raw_dictionary:read_tail(Key), raw_dictionary:read_last(Key), raw_dictionary:read_call(Key)}.

worker(Owner, Key, Value) ->
    Previous = put(Key, Value),
    Owner ! {ready, self()},
    receive
        go ->
            {Previous, get(Key), erase(Key), get(Key)}
    end.

collect() ->
    receive {ready, First} ->
        receive {ready, Second} -> {First, Second} end
    end.

parent(Key, Value) ->
    put(Key, Value),
    spawn(?MODULE, child, [self(), Key]),
    receive {child, ChildValue} -> {ChildValue, get(Key)} end.

child(Parent, Key) ->
    Parent ! {child, get(Key)}.
