-module(process_timer).
-export([send_later/3, start/3, wrapped/3, read/1, cancel/1, receive_one/0]).

send_later(Time, Destination, Message) ->
    erlang:send_after(Time, Destination, Message).

start(Time, Destination, Message) ->
    erlang:start_timer(Time, Destination, Message).

wrapped(Time, Destination, Message) ->
    {started, erlang:start_timer(Time, Destination, Message)}.

read(Reference) -> erlang:read_timer(Reference).

cancel(Reference) -> erlang:cancel_timer(Reference).

receive_one() -> receive Message -> Message end.
