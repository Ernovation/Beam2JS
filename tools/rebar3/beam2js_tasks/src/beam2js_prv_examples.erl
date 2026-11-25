%% rebar3 examples: compiles the example Erlang modules into _build/<example>/
%% and the Sudoku solver to JavaScript. The browser and server demos are
%% compiled to JavaScript on request by beam2js serve.
-module(beam2js_prv_examples).
-export([init/1, do/1, format_error/1, examples/0]).

examples() ->
    [{sudoku, ["examples/sudoku/sudoku.erl"], [sudoku]},
     {browser, ["examples/browser/browser_demo.erl", "examples/browser/dom.erl"], []},
     {server, ["examples/server/server_demo.erl"], []}].

init(State) ->
    Provider = beam2js_tasks:provider(?MODULE, [
        {name, examples},
        {deps, [escriptize]},
        {example, "rebar3 examples"},
        {opts, []},
        {short_desc, "Build the example programs."},
        {desc, "Compiles examples/*/*.erl into _build/sudoku, _build/browser and _build/server, "
               "and compiles the Sudoku solver to JavaScript."}]),
    {ok, rebar_state:add_provider(State, Provider)}.

do(State) ->
    Root = beam2js_tasks:root(State),
    Compiler = beam2js_tasks:compiler(State),
    build(State, Root, Compiler, examples()).

format_error(Reason) ->
    beam2js_tasks:format_error(Reason).

build(State, _Root, _Compiler, []) ->
    {ok, State};
build(State, Root, Compiler, [{Name, Sources, Modules} | Rest]) ->
    rebar_api:info("Building the ~ts example", [Name]),
    Out = filename:join("_build", Name),
    ok = filelib:ensure_path(filename:join(Root, Out)),
    Steps = [{"erlc", ["-o", Out | Sources]} |
             [{Compiler, [filename:join(Out, Module) ++ Ext || Ext <- [".beam", ".mjs"]]}
              || Module <- lists:map(fun atom_to_list/1, Modules)]],
    case run_all(State, Steps) of
        ok -> build(State, Root, Compiler, Rest);
        Error -> Error
    end.

run_all(_State, []) ->
    ok;
run_all(State, [{Command, Args} | Rest]) ->
    case beam2js_tasks:run(State, Command, Args) of
        ok -> run_all(State, Rest);
        Error -> Error
    end.
