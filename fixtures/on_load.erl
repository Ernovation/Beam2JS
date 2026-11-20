-module(on_load).
-on_load(init/0).
-export([value/0]).

init() -> ok.
value() -> 1.
