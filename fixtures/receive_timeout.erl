-module(receive_timeout).
-export([poll/0, timed/1, sleep/1, self_timed/1, twice/0,
         announced/1, sleep_announced/1, two_announced/1, reset_after/0,
         delayed_reset/1, literal/0, literal_announced/0]).

poll() ->
    receive
        message -> received
    after 0 ->
        timeout
    end.

timed(Time) ->
    receive
        {wanted, Value} -> {message, Value}
    after Time ->
        timeout
    end.

sleep(Time) ->
    receive after Time -> done end.

self_timed(Time) ->
    self() ! {wanted, found},
    timed(Time).

twice() ->
    First = timed(0),
    Second = timed(0),
    {First, Second}.

announced(Time) ->
    receive_probe:mark(),
    timed(Time).

sleep_announced(Time) ->
    receive_probe:mark(),
    sleep(Time).

two_announced(Time) ->
    receive_probe:mark(),
    First = receive {first, Value1} -> Value1 after Time -> first_timeout end,
    receive_probe:mark(),
    Second = receive {second, Value2} -> Value2 after Time -> second_timeout end,
    {First, Second}.

reset_after() ->
    self() ! {later, 123},
    First = receive {first, Value1} -> Value1 after 0 -> timeout end,
    Second = receive {later, Value2} -> Value2 end,
    {First, Second}.

delayed_reset(Time) ->
    receive_probe:mark(),
    First = receive {first, Value1} -> Value1 after Time -> timeout end,
    Second = receive {later, Value2} -> Value2 end,
    {First, Second}.

literal() ->
    receive {wanted, Value} -> Value after 10 -> timeout end.

literal_announced() ->
    receive_probe:mark(),
    literal().
