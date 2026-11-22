-module(arithmetic_body).
-export([add/2, subtract/2, multiply/2, divide/2, negate/1, across/2, divide_across/2,
         ratio_add/4, ratio_subtract/4, ratio_multiply/4, ratio_negate/2,
         quotient/2, remainder/2, bit_and/2, bit_or/2, bit_xor/2, bit_not/1,
         stack_and/3, stack_or/3, stack_xor/3, stack_not/2, stack_div/3, stack_rem/3,
         stack_add/3, stack_subtract/3, stack_multiply/3, stack_divide/3,
         stack_negate/2, stack_absolute/2, stack_trunc/2, stack_round/2,
         stack_floor/2, stack_ceil/2, stack_float/2,
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

stack_and(A, B, Other) ->
    First = slice_helper:id(Other),
    Result = A band B,
    Second = slice_helper:id(First),
    {Result, Second}.

stack_or(A, B, Other) ->
    First = slice_helper:id(Other),
    Result = A bor B,
    Second = slice_helper:id(First),
    {Result, Second}.

stack_xor(A, B, Other) ->
    First = slice_helper:id(Other),
    Result = A bxor B,
    Second = slice_helper:id(First),
    {Result, Second}.

stack_not(A, Other) ->
    First = slice_helper:id(Other),
    Result = bnot A,
    Second = slice_helper:id(First),
    {Result, Second}.

stack_div(A, B, Other) ->
    First = slice_helper:id(Other),
    Result = A div B,
    Second = slice_helper:id(First),
    {Result, Second}.

stack_rem(A, B, Other) ->
    First = slice_helper:id(Other),
    Result = A rem B,
    Second = slice_helper:id(First),
    {Result, Second}.

stack_add(A, B, Other) ->
    First = slice_helper:id(Other),
    Result = A + B,
    Second = slice_helper:id(First),
    {Result, Second}.

stack_subtract(A, B, Other) ->
    First = slice_helper:id(Other),
    Result = A - B,
    Second = slice_helper:id(First),
    {Result, Second}.

stack_multiply(A, B, Other) ->
    First = slice_helper:id(Other),
    Result = A * B,
    Second = slice_helper:id(First),
    {Result, Second}.

stack_divide(A, B, Other) ->
    First = slice_helper:id(Other),
    Result = A / B,
    Second = slice_helper:id(First),
    {Result, Second}.

stack_negate(A, Other) ->
    First = slice_helper:id(Other),
    Result = -A,
    Second = slice_helper:id(First),
    {Result, Second}.

stack_absolute(A, Other) ->
    First = slice_helper:id(Other),
    Result = abs(A),
    Second = slice_helper:id(First),
    {Result, Second}.

stack_trunc(A, Other) ->
    First = slice_helper:id(Other),
    Result = trunc(A),
    Second = slice_helper:id(First),
    {Result, Second}.

stack_round(A, Other) ->
    First = slice_helper:id(Other),
    Result = round(A),
    Second = slice_helper:id(First),
    {Result, Second}.

stack_floor(A, Other) ->
    First = slice_helper:id(Other),
    Result = floor(A),
    Second = slice_helper:id(First),
    {Result, Second}.

stack_ceil(A, Other) ->
    First = slice_helper:id(Other),
    Result = ceil(A),
    Second = slice_helper:id(First),
    {Result, Second}.

stack_float(A, Other) ->
    First = slice_helper:id(Other),
    Result = float(A),
    Second = slice_helper:id(First),
    {Result, Second}.

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
