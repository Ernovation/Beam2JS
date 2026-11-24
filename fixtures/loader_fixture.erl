-module(loader_fixture).
-on_load(init/0).
-export([run/1, native/2, erlang_only/1, load/2, wrapped_load/2]).

init() -> erlang:load_nif("loader_fixture", 17).

run(Value) ->
    Result = loader_helper:id(Value),
    {erlang_only(Result), native(Result, 2), private_native(Result)}.

erlang_only(Value) -> Value + 1.
native(_, _) -> erlang:nif_error(nif_not_loaded).
private_native(_) -> erlang:nif_error(nif_not_loaded).

load(Name, Info) ->
    loader_helper:id(Info),
    erlang:load_nif(Name, Info).

wrapped_load(Name, Info) ->
    {erlang:load_nif(Name, Info), native(1, 2)}.

