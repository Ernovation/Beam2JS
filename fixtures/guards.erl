-module(guards).
-export([integer/1, number/1, atom/1, boolean/1, float/1, binary/1, bitstring/1, less/2, different/2]).

integer(X) when is_integer(X) -> yes;
integer(_) -> no.

number(X) when is_number(X) -> yes;
number(_) -> no.

atom(X) when is_atom(X) -> yes;
atom(_) -> no.

boolean(X) when is_boolean(X) -> yes;
boolean(_) -> no.

float(X) when is_float(X) -> yes;
float(_) -> no.

binary(X) when is_binary(X) -> yes;
binary(_) -> no.

bitstring(X) when is_bitstring(X) -> yes;
bitstring(_) -> no.

less(X, Y) when X < Y -> yes;
less(_, _) -> no.

different(X, Y) when X =/= Y -> yes;
different(_, _) -> no.
