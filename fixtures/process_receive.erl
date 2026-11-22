-module(process_receive).
-export([wanted/0, two/0, self_select/0, guarded/0, announced/0, two_announced/0]).

wanted() ->
    receive {wanted, Value} -> Value end.

two() ->
    First = receive {first, Value1} -> Value1 end,
    Second = receive {second, Value2} -> Value2 end,
    {First, Second}.

self_select() ->
    self() ! ignored,
    self() ! {wanted, 42},
    wanted().

guarded() ->
    receive
        {number, Value} when is_integer(Value), Value > 0 -> Value
    end.

announced() ->
    receive_probe:mark(),
    wanted().

two_announced() ->
    First = receive {first, Value1} -> Value1 end,
    receive_probe:mark(),
    Second = receive {second, Value2} -> Value2 end,
    {First, Second}.
