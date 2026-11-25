%% rebar3 test [SUITE...]: runs the JavaScript test suites from package.json
%% against freshly built compiler and bundled OTP modules.
-module(beam2js_prv_test).
-export([init/1, do/1, format_error/1]).

init(State) ->
    Provider = beam2js_tasks:provider(?MODULE, [
        {name, test},
        {deps, [otplib]},
        {example, "rebar3 test shell lists"},
        {opts, [{suite, undefined, undefined, string, "Suite to run; more may follow"}]},
        {short_desc, "Run all test suites, or the named ones."},
        {desc, "Builds the compiler and the bundled OTP modules, installs the Node.js "
               "dependencies if needed, then runs npm test, or npm run test:SUITE for every "
               "SUITE given (for example toolchain, execution, shell or browser)."}]),
    {ok, rebar_state:add_provider(State, Provider)}.

do(State) ->
    {Options, More} = rebar_state:command_parsed_args(State),
    Suites = proplists:get_all_values(suite, Options) ++ More,
    Root = beam2js_tasks:root(State),
    Runs = case Suites of
               [] -> [["test"]];
               _ -> [["run", "--silent", "test:" ++ Suite] || Suite <- Suites]
           end,
    Install = case filelib:is_dir(filename:join(Root, "node_modules/playwright")) of
                  true -> [];
                  false -> [["ci"]]
              end,
    run_all(State, Install ++ Runs).

format_error(Reason) ->
    beam2js_tasks:format_error(Reason).

run_all(State, []) ->
    {ok, State};
run_all(State, [Args | Rest]) ->
    case beam2js_tasks:run(State, "npm", Args) of
        ok -> run_all(State, Rest);
        Error -> Error
    end.
