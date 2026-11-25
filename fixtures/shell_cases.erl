%% The building blocks of the interactive shell, run from OTP's own BEAM
%% files: scanning, parsing, linting, evaluation, pretty printing and
%% formatting, plus the stdlib data structures and BIF-backed modules they use.
%% test/shell-cases.mjs runs every scenario under OTP and under Beam2JS.
-module(shell_cases).
-export([scenarios/0, run/1]).

%% Exceptions without stack traces, which differ between OTP and Beam2JS.
-define(C(Expr), (try Expr catch Class__:Reason__ -> {Class__, strip(Reason__)} end)).

scenarios() ->
    [S || {S, _} <- cases()].

run(Scenario) ->
    {Scenario, Fun} = lists:keyfind(Scenario, 1, cases()),
    try Fun()
    catch Class:Reason -> {Class, strip(Reason)}
    end.

strip({Reason, [{_, _, _, _} | _]}) -> Reason;
strip(Reason) -> Reason.

eval(String) ->
    {ok, Tokens, _} = erl_scan:string(String),
    {ok, Exprs} = erl_parse:parse_exprs(Tokens),
    {value, Value, _} = erl_eval:exprs(Exprs, erl_eval:new_bindings()),
    Value.

fmt(Format, Args) ->
    unicode:characters_to_binary(io_lib:format(Format, Args)).

cases() ->
    [{scan, fun() -> erl_scan:string("foo(X) -> X + 1.0e3 * $a. \"str\" 'q' <<1>>") end},
     {scan_error, fun() -> erl_scan:string("\"unterminated") end},
     {parse_exprs, fun() ->
          {ok, Tokens, _} = erl_scan:string("X = [1, 2 | T], #{a => X}."),
          erl_parse:parse_exprs(Tokens)
      end},
     {parse_form, fun() ->
          {ok, Tokens, _} = erl_scan:string("f(X) when X > 0 -> {ok, X}; f(_) -> error."),
          erl_parse:parse_form(Tokens)
      end},
     {parse_error, fun() ->
          {ok, Tokens, _} = erl_scan:string("X = ."),
          erl_parse:parse_exprs(Tokens)
      end},
     {eval_arith, fun() -> eval("X = 1 + 2, Y = X * 10 div 3, {X, Y, Y rem 4, 2.5 * 2, -X}.") end},
     {eval_lists, fun() -> eval("L = lists:seq(1, 10), [X * X || X <- L, X rem 2 =:= 0].") end},
     {eval_fun, fun() -> eval("F = fun(0, Acc) -> Acc; (N, Acc) -> N + Acc end, lists:foldl(F, 0, [1, 2, 3]).") end},
     {eval_recursive_fun, fun() ->
          eval("Fact = fun Fact(0) -> 1; Fact(N) -> N * Fact(N - 1) end, Fact(20).")
      end},
     {eval_case_if, fun() ->
          eval("X = 5, A = case X of 1 -> one; N when N > 3 -> big end, "
               "B = if X > 10 -> huge; true -> small end, {A, B}.")
      end},
     {eval_maps, fun() ->
          eval("M = #{a => 1, b => 2}, M2 = M#{c => 3}, #{a := A} = M2, "
               "{A, maps:size(M2), maps:get(c, M2), lists:sort(maps:to_list(M2))}.")
      end},
     {eval_binaries, fun() ->
          eval("B = <<1, 2, \"abc\">>, <<X, Rest/binary>> = B, {X, Rest, byte_size(B), << <<(C + 1)>> || <<C>> <= Rest >>}.")
      end},
     {eval_try, fun() ->
          eval("try 1 / 0 catch error:R -> {caught, R} end.")
      end},
     {eval_throw_catch, fun() -> eval("catch throw(oops).") end},
     {eval_error, fun() -> eval("1 + a.") end},
     {eval_badmatch, fun() -> eval("{a, B} = {b, 1}.") end},
     {eval_self_message, fun() ->
          eval("self() ! hello, receive Msg -> {got, Msg} after 100 -> timeout end.")
      end},
     {eval_spawn, fun() ->
          eval("P = self(), spawn(fun() -> P ! {child, 42} end), "
               "receive {child, N} -> N after 1000 -> timeout end.")
      end},
     {eval_strings, fun() -> eval("string:uppercase(\"hello\") ++ \" \" ++ atom_to_list(world).") end},
     {eval_records, fun() -> eval("R = {point, 1, 2}, element(2, setelement(2, R, 9)).") end},
     {lint_exprs, fun() ->
          {ok, Tokens, _} = erl_scan:string("X = 1, Y."),
          {ok, Exprs} = erl_parse:parse_exprs(Tokens),
          erl_lint:exprs(Exprs, [])
      end},
     {lint_module, fun() ->
          Forms = [begin {ok, T, _} = erl_scan:string(S), {ok, F} = erl_parse:parse_form(T), F end ||
                      S <- ["-module(m).", "-export([f/1]).", "f(X) -> Y = X, Z = 1, X.", "g() -> ok."]],
          erl_lint:module(Forms)
      end},
     {pp_expr, fun() ->
          {ok, Tokens, _} = erl_scan:string("case X of {a, B} when B > 1 -> [B | T]; _ -> #{k => <<\"v\">>} end."),
          {ok, [Expr]} = erl_parse:parse_exprs(Tokens),
          unicode:characters_to_binary(erl_pp:expr(Expr))
      end},
     {format_basic, fun() -> fmt("~w ~p ~s ~a ~c ~i|~n", [{a, "b"}, [1, 2], "str", atom, $x, ignored]) end},
     {format_numbers, fun() ->
          fmt("~b ~.16B ~8.3f ~e ~g ~10s| ~-6w|~5..0w ~.2f", [255, 255, 3.14159, 1234.5, 0.001, "pad", x, 42, 2.0])
      end},
     {format_pretty, fun() ->
          Term = {record, [lists:seq(1, 30), #{1 => "value", 2.5 => [a, b, c], key => {x, y}}], <<"binary">>,
                  {nested, {deeper, {deepest, "a long string that should wrap around the line"}}}},
          fmt("~p~n~P", [Term, Term, 5])
      end},
     {format_unicode, fun() -> fmt("~ts ~tp ~p", [[1050, 1086, 1090], [8364, 97], <<"bin">>]) end},
     {format_errors, fun() -> ?C(io_lib:format("~d", [a])) end},
     {io_lib_misc, fun() ->
          {io_lib:write_atom('hello world'), io_lib:write_string("a\"b"), io_lib:char_list("abc"),
           io_lib:printable_list("abc"), io_lib:printable_list([0]), io_lib:latin1_char_list([300]),
           lists:flatten(io_lib:fwrite("~w", [-1.5]))}
      end},
     {io_lib_fread, fun() -> io_lib:fread("~d ~s", "42 hello") end},
     {float_formatting, fun() ->
          {float_to_list(0.1), float_to_list(1.0e20), float_to_list(-2.5e-7),
           float_to_list(3.14159, [{decimals, 3}]), float_to_binary(1.0, [short]),
           float_to_list(123.456, [{scientific, 2}]), io_lib:format("~p", [1.0e100])}
      end},
     {number_parsing, fun() ->
          {list_to_integer("-123"), list_to_integer("ff", 16), list_to_float("1.5e3"),
           binary_to_integer(<<"77">>), string:to_integer("12abc"), string:to_float("3.5x"),
           ?C(list_to_integer("x"))}
      end},
     {string_module, fun() ->
          {string:split("a,b,c", ","), string:split("a,b,c", ",", all), string:trim("  hi  "),
           string:lexemes("a  b c", " "), string:length("héllo"), string:reverse("abc"),
           string:find("hello world", "o w"), string:replace("aXbXc", "X", "-", all),
           string:pad("x", 4, both), string:titlecase("élan"), string:casefold("ÀB"),
           string:slice("hello", 1, 3), string:equal("abc", <<"abc">>), string:is_empty(""),
           string:prefix("prefix", "pre"), string:next_grapheme("éa"), string:tokens("a b", " "),
           string:join(["a", "b"], ", "), string:str("hello", "ll"), string:chars($x, 3)}
      end},
     {unicode_module, fun() ->
          {unicode:characters_to_binary("héllo €"), unicode:characters_to_list(<<"h€"/utf8>>),
           unicode:characters_to_binary([<<"a">>, "b", [99]], unicode, utf16),
           unicode:characters_to_list(<<255, 254>>, latin1), unicode:characters_to_binary([16#D800]),
           unicode:characters_to_list(<<"a", 255>>), unicode:characters_to_nfc_list("e\x{301}"),
           unicode:bom_to_encoding(<<239, 187, 191>>)}
      end},
     {binary_module, fun() ->
          B = <<"hello world hello">>,
          {binary:split(B, <<" ">>), binary:split(B, [<<" ">>], [global]), binary:match(B, <<"wor">>),
           binary:matches(B, <<"hello">>), binary:replace(B, <<"hello">>, <<"bye">>, [global]),
           binary:part(B, {6, 5}), binary:at(B, 4), binary:first(B), binary:last(B),
           binary:bin_to_list(B, {0, 3}), binary:copy(<<"ab">>, 3), binary:encode_unsigned(65535),
           binary:decode_unsigned(<<1, 0>>), binary:longest_common_prefix([<<"abc">>, <<"abd">>]),
           binary:encode_hex(<<1, 255>>), binary:decode_hex(<<"01FF">>), binary:list_to_bin([1, [2], <<3>>])}
      end},
     {iolist_bifs, fun() ->
          L = [1, <<2, 3>>, [[4], "56"], <<>>],
          {iolist_to_binary(L), iolist_size(L), list_to_binary(L), erlang:iolist_to_iovec(L),
           binary_to_list(<<1, 2>>), bitstring_to_list(<<1, 2:3>>), ?C(iolist_size([a]))}
      end},
     {term_to_binary, fun() ->
          Terms = [42, -1, 1 bsl 80, 1.5, atom, "str", [1 | 2], {a, [b]}, <<1, 2>>, <<1:3>>, #{k => v}, [],
                   'Ünïcödé'],
          {[term_to_binary(T) || T <- Terms], [binary_to_term(term_to_binary(T)) =:= T || T <- Terms]}
      end},
     {conversions, fun() ->
          {list_to_atom("abc"), list_to_existing_atom("ok"), atom_to_binary('é'), binary_to_atom(<<"x">>),
           integer_to_list(-255, 16), list_to_tuple([a, b]), tuple_to_list({1, 2}), erlang:phash2({a, 1}),
           erlang:phash2("hello", 1000), erlang:phash2(<<1, 2, 3>>), erlang:phash2(1.5), erlang:phash2(#{a => b}),
           erlang:phash(abc, 100), list_to_integer("+7"), ?C(list_to_existing_atom("no_such_atom_xyz"))}
      end},
     {erlang_misc, fun() ->
          {max(1, 2.0), min(a, 1), node(), is_alive(), nodes(), erlang:is_builtin(erlang, hd, 1),
           erlang:function_exported(lists, map, 2), is_integer(5, 1, 10), is_integer(11, 1, 10),
           split_binary(<<1, 2, 3>>, 2), 1 bsl 70, -8 bsr 1, erlang:make_tuple(3, x),
           erlang:make_tuple(3, x, [{2, y}]), erlang:append_element({a}, b), erlang:delete_element(1, {a, b}),
           erlang:insert_element(2, {a, c}, b), size({a, b}), size(<<1, 2>>), erlang:adler32("abc"),
           erlang:crc32("abc"), erlang:md5("abc")}
      end},
     {fun_info, fun() ->
          F = fun lists:map/2,
          G = fun(X) -> X end,
          {erlang:fun_info(F, module), erlang:fun_info(F, name), erlang:fun_info(F, arity),
           erlang:fun_info(F, type), erlang:fun_info(G, arity), erlang:fun_info(G, type),
           is_function(erlang:make_fun(lists, reverse, 1), 1), (erlang:make_fun(lists, reverse, 1))([1, 2])}
      end},
     {sort_compare, fun() ->
          L = [b, 1, {x}, "s", 2.0, [], <<"b">>, #{}, a, self()],
          [element(1, erts_type(T)) || T <- lists:sort(L)]
      end},
     {data_structures, fun() ->
          S = gb_sets:from_list([3, 1, 2]),
          T = gb_trees:insert(k, v, gb_trees:empty()),
          D = dict:store(a, 1, dict:new()),
          Q = queue:in(b, queue:in(a, queue:new())),
          Sets = sets:from_list([c, a, b], [{version, 2}]),
          {gb_sets:to_list(gb_sets:add(0, S)), gb_trees:lookup(k, T), dict:to_list(dict:update_counter(a, 5, D)),
           queue:to_list(Q), lists:sort(sets:to_list(Sets)), orddict:store(b, 2, orddict:from_list([{a, 1}])),
           ordsets:union([a, c], [b]), proplists:get_value(k, [{k, 1}, k]), proplists:get_bool(k, [k])}
      end},
     {ets_tables, fun() ->
          T = ets:new(t, [set, public]),
          true = ets:insert(T, [{a, 1}, {b, 2}, {c, 3}]),
          ets:insert(T, {a, 10}),
          B = ets:new(b, [bag]),
          ets:insert(B, [{k, 1}, {k, 2}, {k, 1}]),
          O = ets:new(o, [ordered_set, named_table]),
          ets:insert(o, [{3, c}, {1, a}, {2, b}]),
          R = {ets:lookup(T, a), ets:member(T, b), lists:sort(ets:tab2list(T)), ets:lookup(B, k),
               ets:first(o), ets:next(o, 1), ets:last(o), ets:update_counter(T, b, 5),
               ets:lookup_element(T, c, 2), ets:delete(T, c), ets:lookup(T, c), ets:info(T, size),
               lists:sort(ets:match(T, {'$1', '_'})), ets:select(o, [{{'$1', '$2'}, [{'>', '$1', 1}], ['$2']}]),
               ets:foldl(fun({K, _}, Acc) -> [K | Acc] end, [], o), ets:take(T, a), ets:insert_new(T, {b, 0}),
               lists:sort(ets:match_object(T, {'_', '_'}))},
          ets:delete(T), ets:delete(B), ets:delete(o),
          {R, ?C(ets:lookup(T, a))}
      end},
     {persistent_terms, fun() ->
          persistent_term:put({?MODULE, k}, value),
          R = {persistent_term:get({?MODULE, k}), persistent_term:get({?MODULE, missing}, default),
               persistent_term:erase({?MODULE, k}), ?C(persistent_term:get({?MODULE, k}))},
          R
      end},
     {math_module, fun() ->
          {math:sqrt(16), math:pow(2, 10), math:floor(-1.5), math:ceil(1.2), math:log2(8), math:pi(),
           math:fmod(7.5, 2), ?C(math:log(-1))}
      end},
     {os_module, fun() -> {is_list(os:getenv()), os:getenv("BEAM2JS_UNSET_VARIABLE"), os:type() =/= x} end},
     {re_module, fun() ->
          {ok, MP} = re:compile("(\\d+)-(\\w+)"),
          {re:run("abc 12-xy", MP), re:run("abc 12-xy", MP, [{capture, all, list}]),
           re:run("nomatch", MP), re:replace("a1b22c", "\\d+", "#", [global, {return, list}]),
           re:split("a,b;c", "[,;]", [{return, list}]), re:run(<<"AbC">>, "abc", [caseless, {capture, none}])}
      end},
     {re_compile_errors, fun() ->
          {re:version(), element(3, re:compile("a", [unicode])), element(4, re:compile("a", [{newline, anycrlf}])),
           re:compile("a(b"), re:compile("a)b"), re:compile("[a"), re:compile("*a"), re:compile("a{2,1}"),
           ?C(re:compile(<<"a">>, [bogus])), re:run("abc", "(", [report_errors]), ?C(re:run("abc", "(")),
           ?C(re:run("abc", element(2, re:compile("b")), [caseless]))}
      end},
     {re_run_options, fun() ->
          {re:run("abc", "b", [{capture, [5]}]), re:run("abc", "(?<x>b)", [{capture, [x, "x", y]}]),
           re:run("ab", "(x)?b", [{capture, all, list}]), re:run("ab", "(x)?b", [{capture, all, binary}]),
           re:run("abc", "b", [{offset, 2}]), ?C(re:run("abc", "b", [{offset, 4}])), re:run("a\n", "a$", []),
           re:run("ab", "^b", [notbol]), re:run("xay", "a|", [notempty]),
           re:run("abc", "b", [{capture, first, index}, global]), re:run("abc", "B", [{capture, none}, caseless])}
      end},
     {re_semantics, fun() ->
          {re:run("abcb", "b", [global, {capture, all, list}]), re:run("abc", "x*", [global]),
           re:run("a\r\nb", "", [global, {newline, crlf}]), re:run(<<"a\x{e9}"/utf8>>, ".$", [unicode]),
           re:inspect(element(2, re:compile("(?<B>a)(?<A>b)(?<B>c)", [dupnames])), namelist),
           re:run("AB", "(?<B>a)(?<A>b)", [caseless, {capture, all_names, list}]),
           re:run("aaa", "a*+a"), re:run("aaa", "(?>a*)a"), re:run("abcABC", "(?i)b(?-i)c"),
           re:split("a,b,,c", ","), re:replace("abcb", "b", "[&]", [global, {return, list}])}
      end},
     {io_format_error, fun() -> ?C(io:format("~d", [a])) end}].

erts_type(T) when is_integer(T); is_float(T) -> {number};
erts_type(T) when is_atom(T) -> {atom};
erts_type(T) when is_reference(T) -> {reference};
erts_type(T) when is_function(T) -> {'fun'};
erts_type(T) when is_pid(T) -> {pid};
erts_type(T) when is_tuple(T) -> {tuple};
erts_type(T) when is_map(T) -> {map};
erts_type(T) when is_list(T) -> {list};
erts_type(T) when is_bitstring(T) -> {bitstring}.
