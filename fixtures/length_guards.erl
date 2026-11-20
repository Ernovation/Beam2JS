-module(length_guards).
-export([two/1]).

two(Value) when length(Value) =:= 2 -> yes;
two(_) -> no.
