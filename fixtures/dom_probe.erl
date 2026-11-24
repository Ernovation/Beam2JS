-module(dom_probe).
-export([listen/2]).

%% Subscribes and then waits only for `stop`, so DOM events stay in the mailbox.
listen(Element, Type) ->
    {ok, _} = dom:listen(Element, Type, []),
    receive stop -> ok end.
