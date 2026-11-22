-module(spawn_probe).
-export([record/3]).

record(Parent, First, Second) ->
    Parent ! {child, self(), First, Second},
    ok.
