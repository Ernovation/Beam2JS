-module(browser_shell).
-export([echo/1, files/1, loader/0, tty/0]).

echo(Value) -> {loaded_on_demand, Value}.

files(Name) ->
    {ok, All} = file:read_file(Name),
    {ok, Fd} = file:open(Name, [read, raw, binary, {read_ahead, 16}]),
    {ok, HandleInfo} = file:read_file_info(Fd),
    file_info = element(1, HandleInfo),
    {ok, <<"{hello">>} = file:read(Fd, 6),
    {ok, <<"{hello">>} = file:pread(Fd, 0, 6),
    {ok, 6} = file:position(Fd, cur),
    {ok, 0} = file:position(Fd, bof),
    {ok, <<"{hello, \"browser\"}.\n">>} = file:read_line(Fd),
    {ok, _} = file:position(Fd, eof),
    eof = file:read(Fd, 1),
    ok = file:close(Fd),
    {ok, Terms} = file:consult(Name),
    {ok, Info} = file:read_file_info(Name),
    file_info = element(1, Info),
    regular = element(3, Info),
    {ok, Names} = file:list_dir("fixtures"),
    true = lists:member("browser_shell.terms", Names),
    ok = file:set_cwd("fixtures"),
    {ok, All} = file:read_file("browser_shell.terms"),
    ok = file:set_cwd(".."),
    {error, erofs} = file:rename(Name, "not-written"),
    {error, erofs} = file:make_symlink(Name, "not-linked"),
    {byte_size(All), Terms}.

loader() ->
    {ok, Source, Path} = erl_prim_loader:get_file("browser_shell.beam"),
    {ok, Source, Path} = erl_prim_loader:get_file("browser_shell.mjs"),
    true = is_binary(Source),
    ".mjs" = filename:extension(Path),
    {{ok, Source}, http} = erl_prim_loader:prim_read_file(http, "browser_shell.beam"),
    {ok, Info} = erl_prim_loader:read_file_info("browser_shell.beam"),
    regular = element(3, Info),
    error = erl_prim_loader:read_file("missing-loader-file"),
    Fun = fun(M, P, B) -> {ok, {M, filename:extension(P), is_binary(B)}} end,
    {ok, {[{browser_shell, {browser_shell, ".mjs", true}}], [{not_a_real_module, nofile}]}} =
        erl_prim_loader:get_modules([browser_shell, not_a_real_module], Fun),
    ok.

tty() ->
    [1, 0, 2, 0] = [prim_tty:npwcwidth(C) || C <- [$A, 16#301, 16#4e2d, 7]],
    {ok, 3} = prim_tty:wcswidth(<<$A:32/little, 16#4e2d:32/little>>),
    {ok, <<"\e[2;3H">>} = prim_tty:tputs(element(2, prim_tty:tigetstr("cup")), [1, 2]),
    true = prim_tty:isatty(stdin),
    {ok, Columns} = io:columns(user),
    true = Columns > 0,
    ok.
