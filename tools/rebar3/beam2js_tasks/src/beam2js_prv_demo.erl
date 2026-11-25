%% rebar3 demo NAME: builds the examples and runs one of them. The browser
%% and server demos start beam2js serve; stop them with Ctrl-C.
-module(beam2js_prv_demo).
-export([init/1, do/1, format_error/1]).

init(State) ->
    Provider = beam2js_tasks:provider(?MODULE, [
        {name, demo},
        {deps, [otplib, examples]},
        {example, "rebar3 demo browser --port 8000"},
        {opts, [{example, undefined, undefined, string, "sudoku, browser, server or shell"},
                {port, $p, "port", {integer, 8080}, "TCP port of the web server"},
                {ip, $i, "ip", {string, "127.0.0.1"}, "Listening address of the web server"}]},
        {short_desc, "Run an example: sudoku, browser, server or shell."},
        {desc, "Builds the examples and runs one. sudoku prints a solved puzzle with Node.js; "
               "browser, server and shell start beam2js serve for the page at /examples/NAME/ "
               "until stopped with Ctrl-C."}]),
    {ok, rebar_state:add_provider(State, Provider)}.

do(State) ->
    {Options, _} = rebar_state:command_parsed_args(State),
    case proplists:get_value(example, Options) of
        "sudoku" ->
            ok_state(State, beam2js_tasks:run(State, "node", ["examples/sudoku/run.mjs"]));
        Name when Name =:= "browser"; Name =:= "server"; Name =:= "shell" ->
            Args = ["serve", "--port", integer_to_list(proplists:get_value(port, Options)),
                    "--ip", proplists:get_value(ip, Options) | serve_args(Name)],
            Page = "examples/" ++ Name ++ "/",
            ok_state(State, beam2js_tasks:run(State, beam2js_tasks:compiler(State), Args,
                                               page_announcer(Page)));
        undefined ->
            {error, {?MODULE, missing}};
        Other ->
            {error, {?MODULE, {unknown, Other}}}
    end.

format_error(missing) ->
    "Name the example to run: rebar3 demo sudoku|browser|server|shell";
format_error({unknown, Name}) ->
    io_lib:format("Unknown example ~ts; choose sudoku, browser, server or shell", [Name]);
format_error(Reason) ->
    beam2js_tasks:format_error(Reason).

serve_args("browser") -> ["--beam-dir", "_build/browser", "--module-root", "/examples/browser/"];
serve_args("server") -> ["--pa", "_build/server"];
serve_args("shell") -> [].

ok_state(State, ok) -> {ok, State};
ok_state(_State, Error) -> Error.

%% Prints the demo page's URL once the server reports its address.
page_announcer(Page) ->
    fun(Data) ->
        case get(beam2js_demo_announced) =:= undefined andalso
             re:run(Data, "Serving on (http://\\S+/)", [{capture, all_but_first, list}]) of
            {match, [Base]} ->
                put(beam2js_demo_announced, true),
                io:format("Open ~ts~ts (Ctrl-C to stop)~n", [Base, Page]);
            _ ->
                ok
        end
    end.
