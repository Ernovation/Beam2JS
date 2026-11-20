-module(integer_guards).
-export([quotient/2, remainder/2]).

quotient(A, B) when A div B =:= -2 -> yes;
quotient(_, _) -> no.

remainder(A, B) when A rem B =:= -1 -> yes;
remainder(_, _) -> no.
