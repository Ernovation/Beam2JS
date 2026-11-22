-module(process_info_fixture).
-export([query/2, wrapped/2, self_report/0, target/2, ready/0]).

query(Pid, Item) -> erlang:process_info(Pid, Item).

wrapped(Pid, Item) -> {result, erlang:process_info(Pid, Item)}.

self_report() ->
    put(local, value),
    self() ! first,
    self() ! {second, 2},
    erlang:process_info(self(),
                        [dictionary, {dictionary, local}, {dictionary, missing},
                         messages, message_queue_len, registered_name, status]).

target(Parent, Key) ->
    put(Key, value),
    put(undefined_key, undefined),
    Parent ! {ready, self()},
    receive finish -> ok end.

ready() -> receive {ready, Pid} -> Pid end.
