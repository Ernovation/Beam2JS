-module(fun_slice).
-export([add/2, captured/1, exported/0, indirect/2, apply_export/1]).

add(A, B) -> A + B.

captured(Base) ->
    fun(Value) -> Base + Value end.

exported() -> fun add/2.

indirect(Fun, Args) -> apply(Fun, Args).

apply_export(Value) -> (fun add/2)(Value, 2).
