-module(length_guards).
-export([two/1, bits/1, bytes/1]).

two(Value) when length(Value) =:= 2 -> yes;
two(_) -> no.

bits(Value) when bit_size(Value) =:= 9 -> yes;
bits(_) -> no.

bytes(Value) when byte_size(Value) =:= 2 -> yes;
bytes(_) -> no.
