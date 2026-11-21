-module(arithmetic_body).
-export([add/2, subtract/2, multiply/2, divide/2, negate/1, across/2, divide_across/2,
         ratio_add/4, ratio_subtract/4, ratio_multiply/4, ratio_negate/2,
         quotient/2, remainder/2, bit_and/2, bit_or/2, bit_xor/2, bit_not/1,
         quotient_across/2, absolute/1, truncate/1, round_value/1, floor_value/1,
         ceil_value/1, convert_float/1, absolute_across/1]).

add(A, B) -> A + B.
subtract(A, B) -> A - B.
multiply(A, B) -> A * B.
divide(A, B) -> A / B.
negate(A) -> -A.

across(A, B) ->
    Value = add(A, B),
    {ok, Value}.

divide_across(A, B) ->
    Value = divide(A, B),
    {ok, Value}.

ratio_add(A, B, C, D) -> A / B + C / D.
ratio_subtract(A, B, C, D) -> A / B - C / D.
ratio_multiply(A, B, C, D) -> (A / B) * (C / D).
ratio_negate(A, B) -> -(A / B).

quotient(A, B) -> A div B.
remainder(A, B) -> A rem B.
bit_and(A, B) -> A band B.
bit_or(A, B) -> A bor B.
bit_xor(A, B) -> A bxor B.
bit_not(A) -> bnot A.

quotient_across(A, B) ->
    Value = quotient(A, B),
    {ok, Value}.

absolute(Value) -> abs(Value).
truncate(Value) -> trunc(Value).
round_value(Value) -> round(Value).
floor_value(Value) -> floor(Value).
ceil_value(Value) -> ceil(Value).
convert_float(Value) -> float(Value).

absolute_across(Value) ->
    Result = absolute(Value),
    {ok, Result}.
