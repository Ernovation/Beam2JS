-module(beam2js_server).
-behaviour(gen_server).

%% Serves BEAM modules to browsers as JavaScript, compiling them on request.
%% A GET for <module_root><Module>.mjs compiles the module's .beam file;
%% <module_root><Name>.nif.mjs serves a JavaScript NIF file unchanged.

-export([start/1, start_link/1, stop/1, port/1, main/1]).
-export([init/1, handle_call/3, handle_cast/2, handle_info/2, terminate/2]).
-export([do/1]).

-include_lib("inets/include/httpd.hrl").
-include_lib("kernel/include/file.hrl").

-define(JS, "text/javascript; charset=utf-8").
-define(MAX_NAME, 255).

-type option() ::
    {port, inet:port_number()} |
    {ip, inet:ip_address()} |
    {module_root, string()} |
    {beam_dirs, code_path | [file:filename()]} |
    {nif_dirs, [file:filename()]} |
    {document_root, file:filename() | undefined}.
-export_type([option/0]).

%% Public API

-spec start([option()] | #{atom() => term()}) -> {ok, pid()} | {error, term()}.
start(Options) -> gen_server:start(?MODULE, normalize(Options), []).

-spec start_link([option()] | #{atom() => term()}) -> {ok, pid()} | {error, term()}.
start_link(Options) -> gen_server:start_link(?MODULE, normalize(Options), []).

stop(Server) -> gen_server:stop(Server).

-spec port(pid()) -> inet:port_number().
port(Server) -> gen_server:call(Server, port).

%% Command line: beam2js serve [Options]
main(Args) ->
    case parse_args(Args, #{beam_dirs => [], nif_dirs => [], code_paths => [],
                            document_root => "."}) of
        {ok, #{beam_dirs := BeamDirs, code_paths := Paths} = Parsed} ->
            ok = code:add_pathsa(lists:reverse(Paths)),
            Options = (maps:remove(code_paths, Parsed))#{
                beam_dirs => case BeamDirs of [] -> code_path; _ -> lists:reverse(BeamDirs) end,
                nif_dirs => lists:reverse(maps:get(nif_dirs, Parsed))},
            case start(Options) of
                {ok, Server} ->
                    #{ip := Ip, module_root := Root} = normalize(Options),
                    io:format("Serving on http://~s:~B/ (modules under http://~s:~B~s)~n",
                              [inet:ntoa(Ip), port(Server), inet:ntoa(Ip), port(Server), Root]),
                    Ref = monitor(process, Server),
                    receive {'DOWN', Ref, process, Server, _} -> erlang:halt(1) end;
                {error, Reason} ->
                    io:format(standard_error, "beam2js serve: ~tp~n", [Reason]),
                    erlang:halt(1)
            end;
        {error, Message} ->
            io:format(standard_error, "beam2js serve: ~ts~n~ts", [Message, usage()]),
            erlang:halt(2)
    end.

usage() ->
    "usage: beam2js serve [--port N] [--ip ADDRESS] [--root DIR | --no-root]\n"
    "                     [--module-root PATH] [--beam-dir DIR]... [--nif-dir DIR]...\n"
    "                     [--pa DIR]...\n".

parse_args([], Acc) -> {ok, Acc};
parse_args(["--port", Port | Rest], Acc) ->
    case string:to_integer(Port) of
        {N, ""} when N >= 0, N =< 65535 -> parse_args(Rest, Acc#{port => N});
        _ -> {error, "invalid port " ++ Port}
    end;
parse_args(["--ip", Ip | Rest], Acc) ->
    case inet:parse_address(Ip) of
        {ok, Address} -> parse_args(Rest, Acc#{ip => Address});
        _ -> {error, "invalid address " ++ Ip}
    end;
parse_args(["--root", Dir | Rest], Acc) -> parse_args(Rest, Acc#{document_root => Dir});
parse_args(["--no-root" | Rest], Acc) -> parse_args(Rest, Acc#{document_root => undefined});
parse_args(["--module-root", Path | Rest], Acc) -> parse_args(Rest, Acc#{module_root => Path});
parse_args(["--beam-dir", Dir | Rest], #{beam_dirs := Dirs} = Acc) ->
    parse_args(Rest, Acc#{beam_dirs := [Dir | Dirs]});
parse_args(["--nif-dir", Dir | Rest], #{nif_dirs := Dirs} = Acc) ->
    parse_args(Rest, Acc#{nif_dirs := [Dir | Dirs]});
parse_args(["--pa", Dir | Rest], #{code_paths := Dirs} = Acc) ->
    parse_args(Rest, Acc#{code_paths := [Dir | Dirs]});
parse_args([Arg | _], _) -> {error, "unexpected argument " ++ Arg}.

normalize(Options) when is_list(Options) -> normalize(maps:from_list(Options));
normalize(Options) when is_map(Options) ->
    Root0 = maps:get(module_root, Options, "/modules/"),
    Root1 = case Root0 of "/" ++ _ -> Root0; _ -> "/" ++ Root0 end,
    Root = case lists:last(Root1) of $/ -> Root1; _ -> Root1 ++ "/" end,
    Abs = fun(Dirs) -> [filename:absname(Dir) || Dir <- Dirs] end,
    #{port => maps:get(port, Options, 8080),
      ip => maps:get(ip, Options, {127, 0, 0, 1}),
      module_root => Root,
      beam_dirs => case maps:get(beam_dirs, Options, code_path) of
                       code_path -> code_path;
                       Dirs when is_list(Dirs) -> Abs(Dirs)
                   end,
      nif_dirs => Abs(maps:get(nif_dirs, Options, [])),
      document_root => case maps:get(document_root, Options, undefined) of
                           undefined -> undefined;
                           Dir -> filename:absname(Dir)
                       end}.

%% gen_server

init(#{port := Port, ip := Ip, document_root := DocRoot} = Options) ->
    process_flag(trap_exit, true),
    case inets:start() of
        ok -> ok;
        {error, {already_started, inets}} -> ok
    end,
    Cache = ets:new(?MODULE, [set, public, {read_concurrency, true}]),
    State = Options#{cache => Cache},
    Static = DocRoot =/= undefined,
    Config = [{port, Port}, {bind_address, Ip},
              {server_name, "beam2js"},
              {server_root, element(2, file:get_cwd())},
              {document_root, case Static of true -> DocRoot; false -> element(2, file:get_cwd()) end},
              {directory_index, ["index.html"]},
              {mime_types, [{"html", "text/html; charset=utf-8"}, {"mjs", ?JS}, {"js", ?JS},
                            {"css", "text/css"}, {"json", "application/json"},
                            {"svg", "image/svg+xml"}, {"png", "image/png"},
                            {"wasm", "application/wasm"}, {"txt", "text/plain; charset=utf-8"}]},
              {modules, [?MODULE | case Static of true -> [mod_alias, mod_get, mod_head]; false -> [] end]},
              {beam2js_server, State}],
    case inets:start(httpd, Config) of
        {ok, Httpd} ->
            monitor(process, Httpd),
            {ok, State#{httpd => Httpd}};
        {error, Reason} -> {stop, Reason}
    end.

handle_call(port, _From, #{httpd := Httpd} = State) ->
    [{port, Port}] = httpd:info(Httpd, [port]),
    {reply, Port, State}.

handle_cast(_Message, State) -> {noreply, State}.

handle_info({'DOWN', _, process, Httpd, Reason}, #{httpd := Httpd} = State) ->
    {stop, Reason, maps:remove(httpd, State)};
handle_info(_Message, State) -> {noreply, State}.

terminate(_Reason, #{httpd := Httpd}) -> inets:stop(httpd, Httpd);
terminate(_Reason, _State) -> ok.

%% httpd module callback

do(#mod{method = Method, request_uri = Uri, config_db = Db, data = Data}) ->
    State = httpd_util:lookup(Db, beam2js_server),
    case proplists:get_value(response, Data) of
        undefined when Method =:= "GET"; Method =:= "HEAD" ->
            Path = lists:takewhile(fun(C) -> C =/= $? andalso C =/= $# end, Uri),
            case metadata_request(Uri) of
                none -> route(Method, Path, State, Data);
                Operation ->
                    Result = file_metadata(Operation, Path, State),
                    {break, [{response, response(Method, Result)} | Data]}
            end;
        _ -> {proceed, Data}
    end.

%% Optional filesystem metadata for browser prim_file. Ordinary file content
%% is still fetched at its normal URL; this never reads outside the static root.
metadata_request(Uri) ->
    case uri_string:parse(Uri) of
        #{query := Query} ->
            case Query of
                "beam2js=stat" -> stat;
                "beam2js=list" -> list;
                _ -> none
            end;
        _ -> none
    end.

file_metadata(_, _, #{document_root := undefined}) ->
    not_found();
file_metadata(Operation, "/" ++ Encoded, #{document_root := Root}) ->
    try
        Decoded = unicode:characters_to_list(uri_string:percent_decode(unicode:characters_to_binary(Encoded))),
        false = lists:any(fun(C) -> C =:= 0 orelse C =:= $\\ end, Decoded),
        Relative = filelib:safe_relative_path(Decoded, Root),
        true = Relative =/= unsafe,
        File = filename:join(Root, Relative),
        metadata_result(Operation, File)
    catch
        error:badarg -> not_found();
        error:{badmatch, _} -> not_found()
    end.

metadata_result(stat, File) ->
    case file:read_file_info(File, [{time, posix}]) of
        {ok, Info} ->
            metadata_json(#{size => Info#file_info.size, type => Info#file_info.type,
                            atime => Info#file_info.atime, mtime => Info#file_info.mtime,
                            ctime => Info#file_info.ctime, mode => Info#file_info.mode});
        {error, Reason} -> metadata_error(Reason)
    end;
metadata_result(list, File) ->
    case file:list_dir(File) of
        {ok, Names} ->
            metadata_json(lists:sort([unicode:characters_to_binary(Name) || Name <- Names]));
        {error, Reason} -> metadata_error(Reason)
    end.

metadata_json(Value) ->
    {200, "application/vnd.beam2js.file+json", iolist_to_binary(json:encode(Value))}.

metadata_error(Reason) ->
    Code = case Reason of enoent -> 404; eacces -> 403; _ -> 400 end,
    {Code, "application/vnd.beam2js.file+json",
     iolist_to_binary(json:encode(#{error => Reason}))}.

route(Method, Path, #{module_root := Root, document_root := DocRoot} = State, Data) ->
    case lists:prefix(Root, Path) of
        true ->
            Response = case decode(lists:nthtail(length(Root), Path)) of
                {ok, Name} -> serve(Name, State);
                error -> not_found()
            end,
            case Response of
                %% Other files under the module root, such as precompiled
                %% modules or page assets, may come from the document root.
                {404, _, _} when DocRoot =/= undefined -> {proceed, Data};
                _ -> {break, [{response, response(Method, Response)} | Data]}
            end;
        false when Path =:= "/" ->
            case DocRoot =/= undefined andalso
                 filelib:is_regular(filename:join(DocRoot, "index.html")) of
                true -> {proceed, Data};
                false -> {break, [{response, response(Method, welcome(Root))} | Data]}
            end;
        false when DocRoot =:= undefined ->
            Response = not_found(),
            {break, [{response, response(Method, Response)} | Data]};
        false -> {proceed, Data}
    end.

%% Shown at "/" when the document root has no index.html of its own, so
%% opening the printed server URL does not end in an error page.
welcome(Root) ->
    Href = unicode:characters_to_binary(Root),
    {200, "text/html; charset=utf-8",
     <<"<!doctype html><title>beam2js serve</title>"
       "<h1>beam2js serve</h1><p>Compiled modules are served under "
       "<a href=\"", Href/binary, "\">", Href/binary, "</a>. "
       "Open the HTML page of your application, for example "
       "<code>", Href/binary, "index.html</code>.</p>\n">>}.

response(Method, {Code, Type, Body}) ->
    Headers = [{code, Code}, {content_type, Type},
               {content_length, integer_to_list(byte_size(Body))},
               {cache_control, "no-cache"}],
    {response, Headers, case Method of "HEAD" -> nobody; _ -> Body end}.

decode(Encoded) ->
    try uri_string:percent_decode(Encoded) of
        Name when is_list(Name) -> valid_name(unicode:characters_to_list(list_to_binary(Name)));
        _ -> error
    catch _:_ -> error
    end.

%% Names map onto a single file name: no separators, no leading dot, no NUL.
valid_name(Name) when is_list(Name), Name =/= [], length(Name) =< ?MAX_NAME + 8 ->
    case hd(Name) =/= $. andalso
         not lists:any(fun(C) -> C =:= $/ orelse C =:= $\\ orelse C =:= 0 end, Name) of
        true -> {ok, Name};
        false -> error
    end;
valid_name(_) -> error.

serve(Name, State) ->
    case lists:suffix(".nif.mjs", Name) of
        true -> serve_nif(lists:sublist(Name, length(Name) - 8), State);
        false ->
            case lists:suffix(".mjs", Name) of
                true -> serve_module(lists:sublist(Name, length(Name) - 4), State);
                false -> not_found()
            end
    end.

serve_nif([], _State) -> not_found();
serve_nif(Name, #{nif_dirs := NifDirs} = State) ->
    case find(Name ++ ".nif.mjs", NifDirs, State) of
        {ok, File} ->
            case file:read_file(File) of
                {ok, Source} -> {200, ?JS, Source};
                {error, _} -> not_found()
            end;
        error -> not_found()
    end.

serve_module(Module, #{cache := Cache} = State) when length(Module) =< ?MAX_NAME ->
    case find(Module ++ ".beam", [], State) of
        {ok, File} ->
            case compile(File, Cache) of
                {ok, Source} -> {200, ?JS, Source};
                {error, Reason} ->
                    logger:warning("beam2js: cannot compile ~ts: ~ts", [File, Reason]),
                    {500, "text/plain; charset=utf-8",
                     unicode:characters_to_binary(["beam2js: ", Module, ": ", Reason, "\n"])}
            end;
        error -> not_found()
    end;
serve_module(_, _) -> not_found().

not_found() -> {404, "text/plain; charset=utf-8", <<"Not found\n">>}.

find(File, ExtraDirs, #{beam_dirs := BeamDirs}) ->
    case find_in(File, ExtraDirs) of
        {ok, _} = Found -> Found;
        error when BeamDirs =:= code_path ->
            case code:where_is_file(File) of
                non_existing -> error;
                Path -> {ok, Path}
            end;
        error -> find_in(File, BeamDirs)
    end.

find_in(_File, []) -> error;
find_in(File, [Dir | Dirs]) ->
    Path = filename:join(Dir, File),
    case filelib:is_regular(Path) of
        true -> {ok, Path};
        false -> find_in(File, Dirs)
    end.

%% Compiled output is cached per BEAM file and reused while its size and
%% modification time are unchanged.
compile(File, Cache) ->
    case file:read_file_info(File, [{time, posix}]) of
        {ok, #file_info{size = Size, mtime = Mtime}} ->
            Key = {Size, Mtime},
            case ets:lookup(Cache, File) of
                [{File, Key, Result}] -> Result;
                _ ->
                    Result = case file:read_file(File) of
                        {ok, Binary} -> beam2js:compile_binary(Binary);
                        {error, Reason} -> {error, file:format_error(Reason)}
                    end,
                    ets:insert(Cache, {File, Key, Result}),
                    Result
            end;
        {error, Reason} -> {error, file:format_error(Reason)}
    end.
