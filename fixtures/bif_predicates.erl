-module(bif_predicates).
-export([integer/1, number/1, atom/1, boolean/1, float/1, binary/1, bitstring/1]).

integer(X) -> is_integer(X).
number(X) -> is_number(X).
atom(X) -> is_atom(X).
boolean(X) -> is_boolean(X).
float(X) -> is_float(X).
binary(X) -> is_binary(X).
bitstring(X) -> is_bitstring(X).
