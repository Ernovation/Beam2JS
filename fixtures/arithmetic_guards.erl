-module(arithmetic_guards).
-export([add/2, subtract/2, multiply/2, negate/1, divide/2, absolute/1,
         truncate/1, round_value/1, floor_value/1, ceil_value/1, convert_float/1]).

add(A, B) when A + B =:= 5 -> yes;
add(_, _) -> no.

subtract(A, B) when A - B =:= 5 -> yes;
subtract(_, _) -> no.

multiply(A, B) when A * B =:= 6 -> yes;
multiply(_, _) -> no.

negate(A) when -A =:= 5 -> yes;
negate(_) -> no.

divide(A, B) when A / B =:= 2.5 -> yes;
divide(_, _) -> no.

absolute(A) when abs(A) =:= 5 -> yes;
absolute(_) -> no.

truncate(A) when trunc(A) =:= 5 -> yes;
truncate(_) -> no.

round_value(A) when round(A) =:= 5 -> yes;
round_value(_) -> no.

floor_value(A) when floor(A) =:= 5 -> yes;
floor_value(_) -> no.

ceil_value(A) when ceil(A) =:= 5 -> yes;
ceil_value(_) -> no.

convert_float(A) when float(A) =:= 5.0 -> yes;
convert_float(_) -> no.
