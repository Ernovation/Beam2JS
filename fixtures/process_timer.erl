-module(process_timer).
-export([send_later/3, start/3, wrapped/3, send_opts/4, start_opts/4, wrapped_opts/4,
         read/1, cancel/1, read_opts/2,
         cancel_opts/2, read_reply/2, cancel_reply/2, cancel_no_reply/2,
         now/0, now_in/1, native_now/0, receive_one/0]).

send_later(Time, Destination, Message) ->
    erlang:send_after(Time, Destination, Message).

start(Time, Destination, Message) ->
    erlang:start_timer(Time, Destination, Message).

wrapped(Time, Destination, Message) ->
    {started, erlang:start_timer(Time, Destination, Message)}.

send_opts(Time, Destination, Message, Options) ->
    erlang:send_after(Time, Destination, Message, Options).

start_opts(Time, Destination, Message, Options) ->
    erlang:start_timer(Time, Destination, Message, Options).

wrapped_opts(Time, Destination, Message, Options) ->
    {started, erlang:start_timer(Time, Destination, Message, Options)}.

read(Reference) -> erlang:read_timer(Reference).

cancel(Reference) -> erlang:cancel_timer(Reference).

read_opts(Reference, Options) -> erlang:read_timer(Reference, Options).
cancel_opts(Reference, Options) -> erlang:cancel_timer(Reference, Options).

read_reply(Reference, Options) ->
    Result = erlang:read_timer(Reference, Options),
    Reply = receive Message -> Message end,
    {Result, Reply}.

cancel_reply(Reference, Options) ->
    Result = erlang:cancel_timer(Reference, Options),
    Reply = receive Message -> Message end,
    {Result, Reply}.

cancel_no_reply(Reference, Options) ->
    Result = erlang:cancel_timer(Reference, Options),
    Reply = receive Message -> {unexpected, Message} after 0 -> no_reply end,
    {Result, Reply}.

now() -> erlang:monotonic_time(millisecond).
now_in(Unit) -> erlang:monotonic_time(Unit).
native_now() -> erlang:monotonic_time().

receive_one() -> receive Message -> Message end.
