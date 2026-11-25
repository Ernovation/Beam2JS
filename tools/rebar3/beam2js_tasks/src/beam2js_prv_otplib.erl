%% rebar3 otplib: rebuilds the OTP modules bundled in runtime/otp/lib when
%% the compiler, the runtime's Erlang sources or the OTP installation changed.
-module(beam2js_prv_otplib).
-export([init/1, do/1, format_error/1]).

init(State) ->
    Provider = beam2js_tasks:provider(?MODULE, [
        {name, otplib},
        {deps, [escriptize]},
        {example, "rebar3 otplib [--force]"},
        {opts, [{force, $f, "force", {boolean, false}, "Rebuild even if the inputs are unchanged"}]},
        {short_desc, "Build the OTP modules bundled with the runtime."},
        {desc, "Compiles the core OTP modules and runtime/otp/src/*.erl into runtime/otp/lib/ "
               "with tools/build-otp-lib.mjs. Skipped when the compiler sources, the runtime's "
               "Erlang sources, the build script and the OTP version are unchanged since the "
               "last build."}]),
    {ok, rebar_state:add_provider(State, Provider)}.

do(State) ->
    {Options, _} = rebar_state:command_parsed_args(State),
    Root = beam2js_tasks:root(State),
    Stamp = filename:join(rebar_dir:base_dir(State), "beam2js_otplib.stamp"),
    Hash = inputs_hash(Root),
    case not proplists:get_value(force, Options, false) andalso file:read_file(Stamp) of
        {ok, Hash} ->
            rebar_api:info("Bundled OTP modules are up to date", []),
            {ok, State};
        _ ->
            rebar_api:info("Building bundled OTP modules", []),
            case beam2js_tasks:run(State, "node", ["tools/build-otp-lib.mjs"]) of
                ok ->
                    ok = file:write_file(Stamp, Hash),
                    {ok, State};
                Error ->
                    Error
            end
    end.

format_error(Reason) ->
    beam2js_tasks:format_error(Reason).

inputs_hash(Root) ->
    Files = lists:sort(filelib:wildcard("src/*.erl", Root) ++
                       filelib:wildcard("runtime/otp/src/*.erl", Root)) ++
            ["rebar.config", "tools/build-otp-lib.mjs"],
    Contents = [{File, read(filename:join(Root, File))} || File <- Files],
    Otp = {erlang:system_info(otp_release), erlang:system_info(version), code:root_dir()},
    binary:encode_hex(crypto:hash(sha256, term_to_binary({Otp, Contents}))).

read(Path) ->
    case file:read_file(Path) of
        {ok, Binary} -> Binary;
        {error, _} -> missing
    end.
