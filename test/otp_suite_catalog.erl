-module(otp_suite_catalog).
-export([main/1]).

main([Root, Output]) ->
    ok = filelib:ensure_dir(filename:join(Output, "catalog.json")),
    lists:foreach(fun(Relative) ->
        Helper = filename:join(Root, Relative),
        {ok, Module, HelperBeam} = compile_relative(Helper, [binary]),
        {module, Module} = code:load_binary(Module, Helper, HelperBeam),
        lists:foreach(fun(Kind) ->
            Target = filename:join([Output, Kind, atom_to_list(Module) ++ ".beam"]),
            ok = filelib:ensure_dir(Target),
            ok = file:write_file(Target, HelperBeam)
        end, ["emulator", "compiler"])
    end, ["lib/compiler/test/test_lib.erl", "erts/emulator/test/trace_sessions.erl"]),
    Dirs = [{emulator, "erts/emulator/test"}, {compiler, "lib/compiler/test"}],
    %% Other helper modules (erl_md5, erts_test_utils, ext_records, ...) are
    %% used only by suites in their own directory; skip any that don't compile.
    [helper(Kind, File, Output) ||
        {Kind, Dir} <- Dirs,
        File <- filelib:wildcard(filename:join([Root, Dir, "*.erl"])),
        not lists:suffix("_SUITE.erl", File),
        not lists:member(filename:basename(File), ["test_lib.erl", "trace_sessions.erl"])],
    Files = [{Kind, File} ||
                {Kind, Dir} <- Dirs,
                File <- filelib:wildcard(filename:join([Root, Dir, "*_SUITE.erl"]))],
    Results = [prepare(Kind, File, Root, Output) || {Kind, File} <- Files],
    ok = file:write_file(filename:join(Output, "catalog.json"), json:encode(Results)).

%% Like Common Test, compile from the test directory with a relative name so
%% stack traces name the suite's own file "Mod.erl" rather than a full path.
compile_relative(Source, Options) ->
    {ok, Cwd} = file:get_cwd(),
    ok = file:set_cwd(filename:dirname(Source)),
    try
        compile:file(filename:basename(Source), Options)
    after
        ok = file:set_cwd(Cwd)
    end.

helper(Kind, Source, Output) ->
    case compile_relative(Source, [binary, debug_info, {i, filename:dirname(Source)}]) of
        {ok, Module, Beam} ->
            Target = filename:join([Output, atom_to_list(Kind), atom_to_list(Module) ++ ".beam"]),
            ok = filelib:ensure_dir(Target),
            ok = file:write_file(Target, Beam);
        _ ->
            ok
    end.

prepare(Kind, Source, Root, Output) ->
    Name = filename:basename(Source, ".erl"),
    Dir = filename:join(Output, atom_to_list(Kind)),
    ok = filelib:ensure_dir(filename:join(Dir, "unused")),
    Base = #{kind => Kind, name => text(Name), source => text(Source)},
    Options = [binary, debug_info, return_errors, return_warnings,
               {i, filename:dirname(Source)},
               {i, filename:join([Root, "lib", "compiler", "src"])}],
    case compile_relative(Source, Options) of
        {ok, Mod, Beam, _Warnings} ->
            BeamFile = filename:join(Dir, Name ++ ".beam"),
            JSFile = filename:join(Dir, Name ++ ".mjs"),
            ok = file:write_file(BeamFile, Beam),
            {module, Mod} = code:load_binary(Mod, Source, Beam),
            Discovery = try
                Groups = case erlang:function_exported(Mod, groups, 0) of
                    true -> Mod:groups();
                    false -> []
                end,
                {ok, {Mod, [{abstract_code, {raw_abstract_v1, Forms}}]}} =
                    beam_lib:chunks(Beam, [abstract_code]),
                Functions = maps:from_list([{{F, A}, Form} ||
                    {function, _, F, A, _} = Form <- Forms]),
                Cases = [Case#{calls => dependencies(Mod,
                    [{maps:get(testcase, Case), 1}], Functions, [], [])} ||
                    Case <- expand(Mod:all(), Groups, [])],
                #{cases => [Case#{testcase => text(maps:get(testcase, Case)),
                                  groups => [text(G) || G <- maps:get(groups, Case)]} ||
                            Case <- Cases]}
            catch Class:Reason ->
                #{discovery_error => describe({Class, Reason})}
            after
                code:delete(Mod),
                code:purge(Mod)
            end,
            Translation = case beam2js:compile_file(BeamFile, JSFile) of
                ok -> #{compiled => true};
                {error, Error} -> #{compiled => false, compile_error => text(Error)}
            end,
            maps:merge(maps:merge(Base, Discovery), Translation);
        {error, Errors, _Warnings} ->
            Base#{compiled => false, compile_error => describe(Errors)}
    end.

expand([], _, _) -> [];
expand([{group, Group} | Rest], Groups, Path) ->
    Tests = case lists:keyfind(Group, 1, Groups) of
        {Group, _, Members} -> Members;
        {Group, Members} -> Members
    end,
    expand(Tests, Groups, Path ++ [Group]) ++ expand(Rest, Groups, Path);
expand([{group, Group, _Properties} | Rest], Groups, Path) ->
    expand([{group, Group} | Rest], Groups, Path);
expand([Case | Rest], Groups, Path) when is_atom(Case) ->
    [#{testcase => Case, groups => Path} | expand(Rest, Groups, Path)].

dependencies(_, [], _, _, Calls) -> lists:usort(Calls);
dependencies(Mod, [FA | Rest], Functions, Seen, Calls) ->
    case lists:member(FA, Seen) orelse not maps:is_key(FA, Functions) of
        true -> dependencies(Mod, Rest, Functions, Seen, Calls);
        false ->
            {Local, Remote} = calls(maps:get(FA, Functions), Mod, [], []),
            dependencies(Mod, Local ++ Rest, Functions, [FA | Seen], Remote ++ Calls)
    end.

calls({call, _, {remote, _, {atom, _, Mod}, {atom, _, F}}, Args}, Mod, L, R) ->
    calls(Args, Mod, [{F, length(Args)} | L], R);
calls({call, _, {remote, _, {atom, _, M}, {atom, _, F}}, Args}, Mod, L, R) ->
    calls(Args, Mod, L, [text(io_lib:format("~s:~s/~p", [M, F, length(Args)])) | R]);
calls({call, _, {atom, _, F}, Args}, Mod, L, R) ->
    calls(Args, Mod, [{F, length(Args)} | L], R);
calls(Tuple, Mod, L, R) when is_tuple(Tuple) ->
    calls(tuple_to_list(Tuple), Mod, L, R);
calls([Head | Tail], Mod, L, R) ->
    {L1, R1} = calls(Head, Mod, L, R),
    calls(Tail, Mod, L1, R1);
calls(_, _, L, R) -> {L, R}.

describe(Term) -> text(io_lib:format("~tP", [Term, 20])).
text(Atom) when is_atom(Atom) -> atom_to_binary(Atom);
text(Chars) -> unicode:characters_to_binary(Chars).
