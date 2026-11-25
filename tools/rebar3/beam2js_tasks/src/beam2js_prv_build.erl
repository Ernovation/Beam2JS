%% rebar3 build: everything needed to run the tests and examples.
-module(beam2js_prv_build).
-export([init/1, do/1, format_error/1]).

init(State) ->
    Provider = beam2js_tasks:provider(?MODULE, [
        {name, build},
        {deps, [otplib, examples]},
        {example, "rebar3 build"},
        {opts, []},
        {short_desc, "Build the compiler, the bundled OTP modules and the examples."},
        {desc, "Runs escriptize, otplib and examples."}]),
    {ok, rebar_state:add_provider(State, Provider)}.

do(State) ->
    {ok, State}.

format_error(Reason) ->
    beam2js_tasks:format_error(Reason).
