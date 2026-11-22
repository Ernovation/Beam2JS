-module(process_send).
-export([send/2, send_two/3, wrapped/2, self_send/1, callable/2]).

send(Destination, Message) -> Destination ! Message.
send_two(Destination, First, Second) -> Destination ! First, Destination ! Second.
wrapped(Destination, Message) -> {sent, Destination ! Message}.
self_send(Message) -> self() ! Message.
callable(Destination, Message) -> erlang:send(Destination, Message).
