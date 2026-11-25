%% rebar3 plugin with the Beam2JS development commands; see the README's
%% "Development commands" section. Shared helpers for the providers.
-module(beam2js_tasks).
-export([init/1]).
-export([provider/2, root/1, compiler/1, run/3, run/4, format_error/1]).

init(State0) ->
    lists:foldl(fun(Module, {ok, State}) -> Module:init(State) end, {ok, State0},
                [beam2js_prv_otplib, beam2js_prv_examples, beam2js_prv_build, beam2js_prv_demo,
                 beam2js_prv_test]).

provider(Module, Options) ->
    providers:create([{module, Module}, {namespace, default}, {bare, true} | Options]).

root(State) ->
    rebar_state:dir(State).

%% The escript built by rebar3 escriptize.
compiler(State) ->
    filename:join([rebar_dir:base_dir(State), "bin", "beam2js"]).

run(State, Command, Args) ->
    run(State, Command, Args, fun(_) -> ok end).

%% Runs Command in the project root, copying its output to the terminal and
%% passing every chunk to OnOutput.
run(State, Command, Args, OnOutput) ->
    Executable = executable(Command),
    rebar_api:debug("Running ~ts ~ts", [Executable, lists:join(" ", Args)]),
    Port = open_port({spawn_executable, Executable},
                     [{args, Args}, {cd, root(State)}, {env, environment()}, binary, stream, exit_status,
                      stderr_to_stdout, use_stdio, hide]),
    case relay(Port, OnOutput) of
        0 -> ok;
        Status -> {error, {beam2js_tasks, {failed, Command, Args, Status}}}
    end.

%% rebar3 runs inside the Erlang VM, whose launcher puts erts-*/bin first on
%% the PATH and sets its own variables; give commands the user's environment.
environment() ->
    ErtsBin = filename:join([code:root_dir(), "erts-" ++ erlang:system_info(version), "bin"]),
    Path = [Dir || Dir <- string:split(os:getenv("PATH", ""), ":", all), Dir =/= ErtsBin],
    [{"PATH", lists:join(":", Path)} | [{Name, false} || Name <- ["BINDIR", "ROOTDIR", "EMU", "PROGNAME"]]].

executable(Command) ->
    case filename:pathtype(Command) of
        absolute -> Command;
        _ ->
            case os:find_executable(Command) of
                false -> rebar_api:abort("~ts was not found on the PATH", [Command]);
                Path -> Path
            end
    end.

relay(Port, OnOutput) ->
    receive
        {Port, {data, Data}} ->
            ok = file:write(standard_io, Data),
            OnOutput(Data),
            relay(Port, OnOutput);
        {Port, {exit_status, Status}} ->
            Status
    end.

format_error({failed, Command, Args, Status}) ->
    io_lib:format("~ts ~ts failed with exit status ~b",
                  [filename:basename(Command), lists:join(" ", Args), Status]);
format_error(Reason) ->
    io_lib:format("~p", [Reason]).
