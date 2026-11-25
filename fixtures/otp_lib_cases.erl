%% OTP library and erlang BIF behaviour needed by the shell: ets, binary,
%% unicode, math, string, term conversion, hashing, the external term format
%% and process features (aliases, monitors with options, group leaders).
%% test/otp-lib-cases.mjs runs every scenario under OTP and under Beam2JS.
-module(otp_lib_cases).
-export([scenarios/0, run/1, id/1]).
-define(E(Expr), try Expr catch EC:ER -> {EC, strip(ER)} end).

scenarios() ->
    [S || {S, _} <- cases()].

run(Scenario) ->
    {Scenario, Fun} = lists:keyfind(Scenario, 1, cases()),
    try Fun()
    catch Class:Reason -> {Class, strip(Reason)}
    end.

strip({badarg, _}) -> badarg;
strip(Reason) -> Reason.

id(X) -> X.

cases() ->
    [{unary_plus, fun() ->
          {[apply(erlang, '+', [V]) || V <- id([1 bsl 4096, -1, 0, 1.25, -0.0])],
           ?E(apply(erlang, '+', [id(not_a_number)]))}
      end},
     {node_arguments, fun() ->
          {node(self()), node(make_ref()), ?E(node(id(not_a_pid))),
           ?E(node(id({pid, 0}))), ?E(node(id([])))}
      end},
     {apply_error_reasons, fun() ->
          Fun = id(42),
          {?E(apply(Fun, [])), ?E(apply(Fun, [0])),
           ?E(apply(Fun, id(not_a_list))), ?E(apply(Fun, id([1 | bad_tail])))}
      end},
     {map_error_reasons, fun() ->
          Map = id(#{}),
          Bad = id(not_a_map),
          Key = id(missing),
          {?E(Map#{Key := 1}), ?E(Bad#{key => 1}), ?E(map_get(Key, Bad)),
           ?E(is_map_key(Key, Bad)), ?E(map_size(Bad))}
      end},
     {map_guard_failures, fun() ->
          [{guard_exact(M), guard_assoc(M), guard_get(M)} ||
              M <- id([#{key => old}, #{}, not_a_map])]
      end},
     {bif_stack_arguments, fun() ->
          Key = id(missing),
          Map = id(not_a_map),
          try map_get(Key, Map)
          catch error:Reason:Stack ->
              [{erlang, map_get, Args, _} | _] = Stack,
              {Reason, Args}
          end
      end},
     {map_key_comparison, fun() ->
          Compare = fun(A, B) -> {A < B, A == B, A > B} end,
          I = id(1),
          F = id(1.0),
          {Compare(#{I => a}, #{F => a}),
           Compare(#{[I] => a}, #{[F] => a}),
           Compare(#{key => I}, #{key => F}),
           Compare(#{id(-0.0) => a}, #{id(0.0) => a})}
      end},
     {ets_set, fun() ->
          T = ets:new(t, [set]),
          true = ets:insert(T, [{a, 1}, {b, 2}, {c, 3}]),
          true = ets:insert(T, {a, 10}),
          R = {ets:lookup(T, a), ets:lookup(T, zz), ets:member(T, b), ets:info(T, size),
               lists:sort(ets:tab2list(T)), ets:insert_new(T, {a, 0}), ets:insert_new(T, {d, 4}),
               ets:lookup_element(T, b, 2), ets:take(T, c), ets:info(T, size), ets:info(T, type),
               ?E(ets:lookup_element(T, nope, 2)), ets:lookup_element(T, nope, 2, dflt)},
          true = ets:delete(T),
          {R, ets:info(T)}
      end},
     {ets_ordered, fun() ->
          T = ets:new(o, [ordered_set, named_table, {keypos, 2}]),
          ets:insert(T, [{x, 3, c}, {x, 1, a}, {x, 2.0, b}, {x, 5, e}]),
          F = ets:first(T),
          {F, ets:next(T, F), ets:last(T), ets:prev(T, 5), ets:next(T, 5), ets:lookup(T, 2),
           ets:tab2list(T), ets:first_lookup(T), ets:next_lookup(T, 3),
           ets:select(T, [{{x, '$1', '$2'}, [{'>', '$1', 1}], [{{'$2', '$1'}}]}]),
           ets:select_reverse(T, [{{x, '$1', '_'}, [], ['$1']}]),
           ets:match(T, {x, '$1', '$2'}), ets:match_object(T, {x, '_', c}),
           ets:select_count(T, [{{x, '$1', '_'}, [{is_integer, '$1'}], [true]}]),
           ets:select_delete(T, [{{x, '$1', '_'}, [{'<', '$1', 3}], [true]}]),
           ets:tab2list(T), ets:delete(T)}
      end},
     {ets_bag, fun() ->
          B = ets:new(b, [bag]),
          ets:insert(B, [{k, 1}, {k, 2}, {k, 1}, {j, 3}]),
          D = ets:new(d, [duplicate_bag]),
          ets:insert(D, [{k, 1}, {k, 2}, {k, 1}]),
          R = {lists:sort(ets:lookup(B, k)), lists:sort(ets:lookup(D, k)), ets:info(D, size),
               ets:delete_object(D, {k, 1}), ets:lookup(D, k), lists:sort(ets:lookup_element(B, k, 2))},
          ets:delete(B), ets:delete(D),
          R
      end},
     {ets_counters, fun() ->
          T = ets:new(c, [set, public]),
          ets:insert(T, {n, 0, 10}),
          {ets:update_counter(T, n, 5), ets:update_counter(T, n, {3, -20, 0, 100}),
           ets:update_counter(T, n, [{2, 1}, {3, 1}]), ets:update_counter(T, m, 7, {m, 0}),
           ets:update_element(T, n, {3, x}), ets:update_element(T, zz, {2, y}), ets:lookup(T, n),
           ?E(ets:update_counter(T, n, {3, 1})), ?E(ets:update_counter(T, zz, 1))}
      end},
     {ets_chunks, fun() ->
          T = ets:new(ch, [ordered_set]),
          ets:insert(T, [{I} || I <- lists:seq(1, 7)]),
          {A, C1} = ets:select(T, [{{'$1'}, [], ['$1']}], 3),
          {B, C2} = ets:select(C1),
          {C, C3} = ets:select(C2),
          {A, B, C, C3, ets:match(T, {'$1'}, 10)}
      end},
     {ets_errors, fun() ->
          T = ets:new(e, []),
          {?E(ets:insert(T, {})), ?E(ets:insert(no_table, {a})), ?E(ets:new(e, [bogus])),
           ?E(ets:lookup(T, a, b)), ets:whereis(nope), ets:info(no_table)}
      end},
     {ets_named, fun() ->
          ets:new(named_x, [named_table, public]),
          R1 = ?E(ets:new(named_x, [named_table])),
          ets:insert(named_x, {1, one}),
          ets:rename(named_x, named_y),
          R = {R1, ets:lookup(named_y, 1), ets:info(named_y, named_table), ets:info(named_y, name),
               is_reference(ets:whereis(named_y))},
          ets:delete(named_y),
          R
      end},
     {ets_owner_exit, fun() ->
          Self = self(),
          Pid = spawn(fun() -> T = ets:new(o, [public]), Self ! {tab, T}, receive stop -> ok end end),
          T = receive {tab, Tab} -> Tab end,
          ets:insert(T, {a}),
          Ref = monitor(process, Pid),
          Pid ! stop,
          receive {'DOWN', Ref, _, _, _} -> ok end,
          {ets:info(T, size), ?E(ets:lookup(T, a))}
      end},
     {ets_heir, fun() ->
          Self = self(),
          Pid = spawn(fun() -> T = ets:new(h, [{heir, Self, gift}]), Self ! {tab, T}, receive stop -> ok end end),
          T = receive {tab, Tab} -> Tab end,
          Pid ! stop,
          receive {'ETS-TRANSFER', T, Pid, Data} -> {Data, ets:info(T, owner) =:= Self} end
      end},
     {match_spec, fun() ->
          MS = ets:match_spec_compile([{{'$1', '$2'}, [{is_atom, '$1'}, {'>', '$2', 1}],
                                        [{{'$2', {const, x}, '$_'}}]}]),
          {ets:is_compiled_ms(MS), ets:is_compiled_ms(foo),
           ets:match_spec_run([{a, 2}, {b, 1}, {"c", 3}, {d, 5}], MS),
           erlang:match_spec_test({a, 3}, [{{'$1', '$2'}, [], [['$1' | '$2']]}], table),
           erlang:match_spec_test({a, 3}, [{{'$1', '$2'}, [{'=:=', '$1', b}], ['$$']}], table),
           ets:test_ms({a, 3}, [{{'$1', '$2'}, [{'orelse', {'==', '$2', 3}, {hd, '$1'}}], [{element, 1, '$_'}]}])}
      end},
     {binary_module, fun() ->
          S = <<"hello wonderful world">>,
          {binary:match(S, <<"o">>), binary:match(S, [<<"wo">>, <<"won">>]), binary:matches(S, <<"o">>),
           binary:match(S, <<"o">>, [{scope, {5, 10}}]), binary:split(S, <<" ">>),
           binary:split(S, <<" ">>, [global]), binary:split(<<",a,,b,,">>, <<",">>, [global, trim]),
           binary:split(<<",a,,b,,">>, <<",">>, [global, trim_all]), binary:part(S, 6, 3), binary:part(S, {9, -3}),
           binary:at(S, 1), binary:first(S), binary:last(S), binary:copy(<<"ab">>, 3),
           binary:decode_unsigned(<<1, 2>>), binary:decode_unsigned(<<1, 2>>, little),
           binary:encode_unsigned(258), binary:encode_unsigned(258, little),
           binary:longest_common_prefix([<<"abcd">>, <<"abxy">>]), binary:longest_common_suffix([<<"xyz">>, <<"ayz">>]),
           binary:replace(S, <<"o">>, <<"0">>, [global]), binary:bin_to_list(<<"ab">>),
           binary:match(S, binary:compile_pattern([<<"wor">>, <<"ld">>])), ?E(binary:at(S, 99)),
           ?E(binary:match(S, <<>>)), binary:list_to_bin([1, <<2>>, [3]])}
      end},
     {unicode_module, fun() ->
          {unicode:characters_to_binary([1, 2, 16#110000, 3]),
           unicode:characters_to_binary([<<"a">>, <<255>>, "b"]),
           unicode:characters_to_binary(<<"a", 226, 130>>),
           unicode:characters_to_list(<<"h", 195, 169, "llo"/utf8>>),
           unicode:characters_to_binary("héllo", unicode, latin1),
           unicode:characters_to_list(<<0, 104, 0, 105>>, utf16),
           unicode:characters_to_binary([16#1F600]), unicode:bin_is_7bit(<<"abc">>),
           unicode:characters_to_nfc_list("e\x{301}"), ?E(unicode:characters_to_binary([a]))}
      end},
     {string_module, fun() ->
          {string:list_to_float("1.5e3abc"), string:list_to_float("abc"), string:to_float("2.5x"),
           string:to_integer("42 rest"), string:split("a,b,c", ","), string:lexemes("a  b c", " "),
           string:uppercase("héllo"), string:pad("ab", 5, both), string:trim("  x  "),
           string:find("hello world", "o w"), string:length("héllo"), string:reverse("abc"),
           string:slice("hello", 1, 3), string:equal("A", "a", true), string:tokens("a b", " ")}
      end},
     {math_module, fun() ->
          {math:sqrt(16), math:pow(2, 10), math:log(math:exp(1)), math:floor(-1.5), math:ceil(1.2),
           math:fmod(7.5, 2), math:atan2(1, 1), math:log2(1024), math:log10(1000), math:pi(),
           ?E(math:log(0)), ?E(math:sqrt(-1)), ?E(math:sqrt(a)), math:sin(0), math:cosh(0)}
      end},
     {conversions, fun() ->
          {list_to_integer("-123"), list_to_integer("ff", 16), binary_to_integer(<<"777">>, 8),
           ?E(list_to_integer("12a")), list_to_float("1.25"), ?E(list_to_float("1")),
           binary_to_float(<<"-0.5e2">>), float_to_list(1.5), float_to_list(0.1, [{decimals, 3}]),
           float_to_list(123.456, [{decimals, 1}, compact]), float_to_binary(2.0, [short]),
           float_to_list(1.0e20, [{scientific, 3}]), integer_to_list(255, 16), integer_to_binary(-10),
           atom_to_binary(hello), binary_to_atom(<<"hello">>), list_to_existing_atom("hello"),
           ?E(list_to_existing_atom("beam2js_no_such_atom_xyz")), binary_to_existing_atom(<<"ok">>, utf8),
           atom_to_list('hé'), atom_to_list(list_to_atom([104, 233])), tuple_to_list({1, 2}), list_to_tuple([a])}
      end},
     {iodata, fun() ->
          {iolist_to_binary([1, [2, <<3>>], <<4>> | <<5>>]), iolist_size([<<1, 2>>, 3 | <<4>>]),
           list_to_binary(["ab", $c]), ?E(list_to_binary([256])), ?E(iolist_size(a)),
           bitstring_to_list(<<1, 2, 3:4>>), list_to_bitstring([<<1>>, <<2:3>>]), split_binary(<<1, 2, 3>>, 1),
           binary_to_list(<<1, 2, 3, 4>>, 2, 3), erlang:iolist_to_iovec([<<"a">>, "b"])}
      end},
     {external_format, fun() ->
          T = {1, -1, 1 bsl 70, 1.5, atom, "str", [1 | 2], <<1, 2>>, <<1:3>>, #{1 => 1, 2 => [x]},
               {}, [], 'héllo'},
          B = term_to_binary(T),
          {B, binary_to_term(B) =:= T, binary_to_term(B, [used]) =:= {T, byte_size(B)},
           term_to_binary(fun lists:map/2), binary_to_term(term_to_binary(fun lists:map/2)) =:= fun lists:map/2,
           ?E(binary_to_term(<<131, 100>>)), erlang:external_size(T) =:= byte_size(B),
           ?E(binary_to_term(<<131, 119, 3, "zzq">>, [safe]))}
      end},
     {hashing, fun() ->
          Terms = [0, 1, -1, 1 bsl 40, 1.5, atom, "abc", <<"abc">>, {a, b}, [1, 2], #{k => v}, [], <<1:3>>],
          {[erlang:phash2(X) || X <- Terms], [erlang:phash2(X, 1000) || X <- Terms],
           [erlang:phash(X, 1 bsl 32) || X <- Terms], erlang:md5("abc"), erlang:crc32("abc"),
           erlang:adler32(<<"abc">>), erlang:crc32(erlang:crc32("ab"), "c"),
           erlang:md5_final(erlang:md5_update(erlang:md5_init(), "abc"))}
      end},
     {tuples_and_misc, fun() ->
          {erlang:make_tuple(3, x), erlang:make_tuple(3, x, [{1, a}, {3, c}]), erlang:append_element({a}, b),
           erlang:delete_element(2, {a, b, c}), erlang:insert_element(2, {a, c}, b), max(1, 1.0), min(a, 1),
           is_integer(5, 1, 10), erlang:fun_info(fun lists:map/2, arity), erlang:fun_info_mfa(fun lists:map/2),
           erlang:fun_to_list(fun lists:map/2), erlang:function_exported(lists, map, 2),
           erlang:is_builtin(erlang, self, 0), erlang:convert_time_unit(1500, millisecond, second),
           erlang:convert_time_unit(-1, second, millisecond), node(), nodes(), is_alive(),
           erlang:system_info(wordsize), erlang:system_info(otp_release)}
      end},
     {aliases, fun() ->
          Alias = alias(),
          Self = self(),
          spawn(fun() -> Alias ! {via_alias, 1} end),
          R1 = receive {via_alias, N} -> N after 1000 -> timeout end,
          true = unalias(Alias),
          Alias ! dropped,
          R2 = receive dropped -> received after 50 -> dropped end,
          Once = alias([reply]),
          Once ! first, Once ! second,
          R3 = [receive M -> M after 50 -> none end || _ <- [1, 2]],
          {R1, R2, R3, unalias(Alias), is_reference(Self ! x) orelse ok}
      end},
     {monitor_options, fun() ->
          Pid = spawn(fun() -> receive stop -> exit(bye) end end),
          Ref = monitor(process, Pid, [{tag, gone}, {alias, demonitor}]),
          Pid ! stop,
          R = receive {gone, Ref, process, Pid, Why} -> Why after 1000 -> timeout end,
          Dead = monitor(process, Pid, [{tag, late}]),
          R2 = receive {late, Dead, process, Pid, Why2} -> Why2 after 1000 -> timeout end,
          {R, R2}
      end},
     {group_leaders, fun() ->
          GL = group_leader(),
          Self = self(),
          Child = spawn(fun() -> Self ! {gl, group_leader()}, receive go -> Self ! {gl2, group_leader()} end end),
          R1 = receive {gl, G1} -> G1 =:= GL end,
          group_leader(Self, Child),
          Child ! go,
          R2 = receive {gl2, G2} -> G2 =:= Self end,
          {R1, R2}
      end},
     {spawn_variants, fun() ->
          Self = self(),
          P1 = spawn(node(), fun() -> Self ! p1 end),
          P2 = spawn(node(), ?MODULE, id, [x]),
          {P3, Ref} = spawn_opt(fun() -> ok end, [monitor, link]),
          P4 = spawn_opt(?MODULE, id, [y], []),
          R = receive p1 -> ok end,
          Down = receive {'DOWN', Ref, process, P3, Reason} -> Reason end,
          {R, Down, is_pid(P1), is_pid(P2), is_pid(P4), erlang:send(Self, msg, [noconnect]),
           receive msg -> got end}
      end},
     {process_info_items, fun() ->
          Self = self(),
          Pid = spawn(fun() -> process_flag(trap_exit, true), receive stop -> ok end end),
          link(Pid),
          timer_sleep(),
          Info = process_info(Pid, [trap_exit, links, initial_call, status, message_queue_len]),
          Pid ! stop,
          {Info =:= [{trap_exit, true}, {links, [Self]}, {initial_call, {erlang, apply, 2}},
                     {status, waiting}, {message_queue_len, 0}],
           lists:member(Self, processes()), is_list(process_info(Self))}
      end}].

timer_sleep() ->
    receive after 20 -> ok end.

guard_exact(Map) when map_size(Map#{key := value}) =:= 1 -> true;
guard_exact(_) -> false.

guard_assoc(Map) when map_size(Map#{key => value}) =:= 1 -> true;
guard_assoc(_) -> false.

guard_get(Map) when map_get(key, Map) =:= old -> true;
guard_get(_) -> false.
