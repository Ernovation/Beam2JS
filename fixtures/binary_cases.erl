%% Binary syntax: construction and matching across segment types, sizes,
%% endianness, signedness, UTF encodings, appends and failure cases.
%% test/binary-cases.mjs runs every scenario under OTP and under Beam2JS.
-module(binary_cases).
-export([scenarios/0, run/1, id/1]).

scenarios() ->
    [S || {S, _} <- cases()].

run(Scenario) ->
    {Scenario, Fun} = lists:keyfind(Scenario, 1, cases()),
    try Fun()
    catch Class:Reason -> {Class, strip(Reason)}
    end.

%% OTP attaches error_info details to some badarg exceptions; compare the reason only.
strip({badarg, _}) -> badarg;
strip(Reason) -> Reason.

id(X) -> X.

cases() ->
    [{int_sizes, fun() ->
          N = id(16#ABCDEF),
          {<<N:8>>, <<N:16>>, <<N:24>>, <<N:32>>, <<N:12>>, <<N:3>>, <<(id(-1)):17>>}
      end},
     {int_little, fun() ->
          N = id(16#ABC),
          {<<N:12/little>>, <<N:16/little>>, <<N:24/little>>, <<(id(-2)):20/little-signed>>}
      end},
     {int_big_values, fun() ->
          N = id(1 bsl 100 + 12345),
          B = <<N:128>>,
          <<M:128>> = B,
          <<L:128/little>> = <<N:128/little>>,
          {B, M =:= N, L =:= N, <<(id(-(1 bsl 70))):72/signed>>}
      end},
     {int_match, fun() ->
          B = id(<<16#AB, 16#CD, 16#EF, 16#12>>),
          <<A:4, Bb:12, C:16>> = B,
          <<D:12/little, E:20/little-signed>> = B,
          <<F:8/signed, G:24/signed>> = B,
          {A, Bb, C, D, E, F, G}
      end},
     {int_odd_little, fun() ->
          <<C:3/little, D:13/little>> = id(<<16#AB, 16#CD>>),
          <<E:20/little>> = id(<<1, 2, 3:4>>),
          {C, D, E}
      end},
     {variable_sizes, fun() ->
          S = id(5),
          <<X:S, Y:(S * 2), Rest/bits>> = id(<<255, 7, 3>>),
          {X, Y, Rest, <<(id(7)):S>>}
      end},
     {binary_segments, fun() ->
          B = id(<<1, 2, 3, 4, 5>>),
          <<H:2/binary, T/binary>> = B,
          <<_:3, Bits:13/bits, Tail/bitstring>> = B,
          {H, T, Bits, Tail, <<H/binary, 0, T/binary>>, <<B:3/binary>>}
      end},
     {binary_too_short, fun() -> <<(id(<<1>>)):2/binary>> end},
     {zipped_binary_append, fun() ->
          Xs = id([1, 2, 3]),
          Ys = id([2, 2, 2]),
          Long = lists:seq(1, 130),
          {<< <<(X+Y)>> || X <- Xs && Y <- Ys, X rem 2 == 1, X+Y > 4 >>,
           << <<(X+Y):3>> || X <- Xs && Y <- Ys >>,
           << <<((X+Y) rem 256)>> || X <- Long && Y <- Long >>}
      end},
     {unit_check, fun() ->
          case id(<<1, 2, 3>>) of
              <<X:2/binary-unit:8, _/binary-unit:16>> -> {first, X};
              <<X:1/binary-unit:8, _/binary-unit:16>> -> {second, X}
          end
      end},
     {bitstrings, fun() ->
          B = <<(id(5)):3, (id(1)):1, (id(<<255>>))/binary, (id(<<1:2>>))/bits>>,
          {B, bit_size(B), byte_size(B), is_binary(B), is_bitstring(B)}
      end},
     {floats, fun() ->
          F = id(1.5),
          {<<F/float>>, <<F:32/float>>, <<F:16/float>>, <<F:64/float-little>>,
           <<(id(3)):64/float>>, <<(id(-0.0))/float>>}
      end},
     {float_match, fun() ->
          <<A/float, B:32/float, C:16/float, D:32/float-little>> =
              id(<<1.25/float, 2.5:32/float, (-0.5):16/float, 6.0:32/float-little>>),
          {A, B, C, D}
      end},
     {float_nan, fun() ->
          case id(<<16#7FF8000000000000:64>>) of
              <<F/float>> -> {float, F};
              _ -> nomatch
          end
      end},
     {float_bad_size, fun() -> <<(id(1.0)):8/float>> end},
     {float_overflow16, fun() -> <<(id(1.0e10)):16/float>> end},
     {utf8, fun() ->
          S = [$a, 16#E9, 16#20AC, 16#1F600],
          B = << <<C/utf8>> || C <- id(S) >>,
          {B, [C || <<C/utf8>> <= B]}
      end},
     {utf16_32, fun() ->
          S = id([$a, 16#20AC, 16#1F600]),
          B16 = << <<C/utf16>> || C <- S >>,
          L16 = << <<C/utf16-little>> || C <- S >>,
          B32 = << <<C/utf32>> || C <- S >>,
          {B16, L16, B32, [C || <<C/utf16>> <= B16], [C || <<C/utf16-little>> <= L16],
           [C || <<C/utf32>> <= B32]}
      end},
     {utf_bad, fun() -> <<(id(16#D800))/utf8>> end},
     {utf_invalid_match, fun() ->
          [case id(B) of <<C/utf8, _/binary>> -> C; _ -> nomatch end ||
              B <- [<<16#C0, 16#80>>, <<16#ED, 16#A0, 16#80>>, <<16#F4, 16#90, 0, 0>>, <<16#E2, 16#82>>]]
      end},
     {string_match, fun() ->
          F = fun(<<"GET ", Path/binary>>) -> {get, Path};
                 (<<"POST ", Path/binary>>) -> {post, Path};
                 (_) -> other
              end,
          {F(id(<<"GET /a">>)), F(id(<<"POST /b">>)), F(id(<<"PUT /c">>))}
      end},
     {string_segment, fun() -> <<"abc", (id(<<"de">>))/binary, "f">> end},
     {append_loop, fun() ->
          B = lists:foldl(fun(X, Acc) -> <<Acc/binary, X>> end, <<>>, lists:seq(1, 300)),
          {byte_size(B), binary:part(B, 0, 3), binary:part(B, 297, 3)}
      end},
     {append_shared, fun() ->
          A = id(<<1, 2>>),
          B = <<A/binary, 3>>,
          C = <<A/binary, 4>>,
          D = <<B/binary, 5>>,
          {A, B, C, D}
      end},
     {append_bits, fun() ->
          A = id(<<1:3>>),
          {<<A/bits, 2:5>>, <<A/bits, 1:1>>}
      end},
     {comprehension, fun() ->
          {<< <<(X * 2)>> || <<X>> <= id(<<1, 2, 3>>) >>,
           [{X, Y} || <<X:4, Y:4>> <= id(<<16#12, 16#34>>)],
           << <<X:4>> || X <- id([1, 2, 3]) >>}
      end},
     {tail_and_position, fun() ->
          F = fun Loop(<<X, Rest/binary>>, Acc) when X > 2 -> Loop(Rest, Acc + X);
                  Loop(<<_, Rest/binary>>, Acc) -> Loop(Rest, Acc);
                  Loop(<<>>, Acc) -> Acc
              end,
          F(id(<<1, 2, 3, 4, 5>>), 0)
      end},
     {match_context_args, fun() -> count_bytes(id(<<1, 0, 2, 0, 3>>), 0) end},
     {shared_match_tails, fun() -> shared_tails(id(<<1, 2, 3, 4, 5>>), [], 0) end},
     {match_context_type, fun() -> {context_type(id(<<>>)), context_type(id(<<42>>))} end},
     {skip_and_tail, fun() ->
          <<_:2/binary, _:4, R:4, Tail/binary>> = id(<<9, 9, 16#AB, 7, 8>>),
          {R, Tail}
      end},
     {negative_size, fun() -> <<(id(1)):(id(-1))>> end},
     {bad_integer, fun() -> <<(id(a)):8>> end},
     {bad_binary, fun() -> <<(id(a))/binary>> end},
     {float_integer_match, fun() ->
          case id(<<1:8>>) of
              <<X:8/float>> -> {float, X};
              <<X:8>> -> {int, X}
          end
      end},
     {size_all_bits_fail, fun() ->
          case id(<<1:3>>) of
              <<_/binary>> -> binary;
              <<_/bitstring>> -> bits
          end
      end},
     {big_match, fun() ->
          B = id(list_to_binary(lists:seq(0, 255))),
          <<A:64, M:1000/bits, Rest/bits>> = B,
          {A, bit_size(M), bit_size(Rest), binary:last(B)}
      end},
     {list_to_bitstring_round, fun() ->
          B = id(<<1, 2, 3:4>>),
          {bitstring_to_list(B), list_to_bitstring([1, <<2, 3:4>>])}
      end},
     {split_and_size, fun() ->
          {split_binary(id(<<1, 2, 3>>), 1), bit_size(id(<<>>)), byte_size(id(<<1:9>>))}
      end},
     {record_update, fun() ->
          R = setelement(1, id({x, 1, 2, 3}), rec),
          {element(3, R), update(R)}
      end}].

-record(rec, {a, b, c}).
update(R) -> R#rec{b = new, c = also}.

count_bytes(<<0, Rest/binary>>, N) -> count_bytes(Rest, N);
count_bytes(<<_, Rest/binary>>, N) -> count_bytes(Rest, N + 1);
count_bytes(<<>>, N) -> N.

shared_tails(<<Byte, Tail/binary>>, Tails, Sum) ->
    shared_tails(Tail, [Tail | Tails], Sum + Byte);
shared_tails(<<>>, Tails, Sum) -> {Sum, Tails}.

context_type(<<_:8>>) -> ok;
context_type(Binary) ->
    try <<ok || <<_:ok>> <= Binary>>
    after ok
    end.
