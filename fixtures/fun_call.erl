-module(fun_call).
-export([captured_call/2, exported_call/1, bad_arity/1]).

captured_call(Base, Value) ->
    Fun = fun(Other) -> Base + Other end,
    Fun(Value).

exported_call(Value) ->
    Fun = fun fun_slice:add/2,
    Fun(Value, 2).

bad_arity(Value) ->
    Fun = fun fun_slice:add/2,
    Fun(Value).
