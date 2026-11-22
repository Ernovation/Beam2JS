-module(receive_timeout).
-export([poll/0]).

poll() ->
    receive
        message -> received
    after 0 ->
        timeout
    end.
