-module(browser_demo).
-export([run/0, listen/0]).

run() ->
    Element = dom:element_by_id(<<"message">>),
    dom:append_text(Element, <<"Hello from Erlang!">>).

listen() ->
    run(),
    Element = dom:element_by_id(<<"message">>),
    Button = dom:element_by_id(<<"button">>),
    MouseArea = dom:element_by_id(<<"mouse-area">>),
    case dom:listen(Button, click, []) of
        {ok, ClickRef} ->
            case dom:listen(MouseArea, mousemove, []) of
                {ok, MouseRef} -> loop(Element, MouseArea, ClickRef, MouseRef, 1);
                {error, Reason} -> dom:unlisten(ClickRef), {error, Reason}
            end;
        {error, Reason} -> {error, Reason}
    end.

loop(Element, MouseArea, ClickRef, MouseRef, Count) ->
    receive
        {dom_event, ClickRef, click, _Data} ->
            dom:append_text(Element, <<" Click ">>),
            dom:append_text(Element, integer_to_binary(Count)),
            dom:append_text(Element, <<"!">>),
            loop(Element, MouseArea, ClickRef, MouseRef, Count + 1);
        {dom_event, MouseRef, mousemove, #{clientX := X, clientY := Y}} ->
            dom:set_text(MouseArea, <<"Mouse: ">>),
            dom:append_text(MouseArea, integer_to_binary(trunc(X))),
            dom:append_text(MouseArea, <<", ">>),
            dom:append_text(MouseArea, integer_to_binary(trunc(Y))),
            loop(Element, MouseArea, ClickRef, MouseRef, Count);
        stop ->
            dom:unlisten(ClickRef),
            dom:unlisten(MouseRef)
    end.
