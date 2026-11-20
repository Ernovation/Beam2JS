-module(guard_bifs).
-export([head/1, tail/1, size/1, element/2]).

head(Value) when hd(Value) =:= yes -> yes;
head(_) -> no.

tail(Value) when tl(Value) =:= yes -> yes;
tail(_) -> no.

size(Value) when tuple_size(Value) =:= 2 -> yes;
size(_) -> no.

element(Index, Value) when erlang:element(Index, Value) =:= yes -> yes;
element(_, _) -> no.
