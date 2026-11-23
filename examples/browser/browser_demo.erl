-module(browser_demo).
-export([run/0, listen/0]).

run() ->
    Element = dom:element_by_id(<<"message">>),
    dom:append_text(Element, <<"Hello from Erlang!">>).

listen() ->
    run(),
    Element = dom:element_by_id(<<"message">>),
    loop(Element, 1).

loop(Element, Count) ->
    receive
        {dom_event, click} ->
            dom:append_text(Element, <<" Click ">>),
            dom:append_text(Element, integer_to_binary(Count)),
            dom:append_text(Element, <<"!">>),
            loop(Element, Count + 1);
        stop ->
            ok
    end.
