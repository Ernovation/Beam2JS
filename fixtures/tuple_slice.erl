-module(tuple_slice).
-export([empty/0, pair/2, first/1, second/1, is_pair/1, tuple/1, tagged/1]).

empty() -> {}.
pair(First, Second) -> {First, Second}.
first({First, _}) -> First;
first(_) -> no.
second({_, Second}) -> Second;
second(_) -> no.
is_pair(Term) when is_tuple(Term), tuple_size(Term) =:= 2 -> yes;
is_pair(_) -> no.
tuple(Term) -> is_tuple(Term).
tagged({tag, Value}) -> Value;
tagged(_) -> no.
