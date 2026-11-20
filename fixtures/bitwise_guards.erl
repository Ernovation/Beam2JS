-module(bitwise_guards).
-export([both/2, either/2, different/2, invert/1]).

both(A, B) when A band B =:= 5 -> yes;
both(_, _) -> no.

either(A, B) when A bor B =:= 5 -> yes;
either(_, _) -> no.

different(A, B) when A bxor B =:= 5 -> yes;
different(_, _) -> no.

invert(A) when bnot A =:= 5 -> yes;
invert(_) -> no.
