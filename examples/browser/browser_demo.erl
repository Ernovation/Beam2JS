-module(browser_demo).
-export([run/0]).

run() ->
    Element = dom:element_by_id(<<"message">>),
    dom:append_text(Element, <<"Hello from Erlang!">>).
