-module(literal_terms).
-export([nested/0, improper/0, escaped/1, exact/1, numeric/1, prepend/1, pair/1]).

nested() -> {alpha, [1, 2], {[], -0.0, 340282366920938463463374607431768211457}}.
improper() -> [alpha, {beta, 3} | tail].
escaped(X) when X =:= {'quote"back\\slash', '\x{1F600}'} -> yes;
escaped(_) -> no.
exact(X) when X =:= {key, [1, 2]} -> yes;
exact(_) -> no.
numeric(X) when X == {key, [1.0, -0.0]} -> yes;
numeric(_) -> no.
prepend(Tail) -> [{alpha, [1]} | Tail].
pair(Value) -> {{alpha, [1]}, Value}.
