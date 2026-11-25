%% The default group leader of Beam2JS processes, registered as user: a
%% minimal IO server that writes output through the runtime's stdout
%% option. Input requests return eof; an interactive shell replaces this
%% server with OTP's user_drv and group.
-module(beam2js_user).
-export([start/0, server/0, write/1]).

start() ->
    Pid = spawn(?MODULE, server, []),
    try register(user, Pid) of
        true -> Pid
    catch
        error:badarg ->
            exit(Pid, kill),
            whereis(user)
    end.

server() ->
    receive
        {io_request, From, ReplyAs, Request} ->
            From ! {io_reply, ReplyAs, request(Request)},
            server();
        _ ->
            server()
    end.

request({put_chars, Encoding, Chars}) ->
    put_chars(unicode:characters_to_binary(Chars, Encoding));
request({put_chars, Encoding, M, F, A}) ->
    try apply(M, F, A) of
        Chars -> request({put_chars, Encoding, Chars})
    catch
        _:_ -> {error, F}
    end;
request({put_chars, Chars}) ->
    request({put_chars, latin1, Chars});
request({put_chars, M, F, A}) ->
    request({put_chars, latin1, M, F, A});
request({requests, Requests}) ->
    lists:foldl(fun(Request, ok) -> request(Request);
                   (_, Error) -> Error
                end, ok, Requests);
request(getopts) ->
    [{binary, false}, {encoding, unicode}];
request({setopts, _}) ->
    ok;
request({get_geometry, _}) ->
    {error, enotsup};
request(Request) when element(1, Request) =:= get_chars;
                      element(1, Request) =:= get_line;
                      element(1, Request) =:= get_until;
                      element(1, Request) =:= get_password ->
    eof;
request(_) ->
    {error, request}.

put_chars(Bin) when is_binary(Bin) ->
    write(Bin);
put_chars(_) ->
    {error, put_chars}.

%% Implemented by the runtime.
write(_Bin) ->
    erlang:nif_error(undef).
