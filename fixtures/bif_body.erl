-module(bif_body).
-export([head/1, tail/1, size/1, element/2, length/1, head_across/1,
         bits/1, bytes/1, part/3, part2/2, part_across/3]).

head(Value) -> hd(Value).
tail(Value) -> tl(Value).
size(Value) -> tuple_size(Value).
element(Index, Value) -> erlang:element(Index, Value).
length(Value) -> erlang:length(Value).

head_across(Value) ->
    Result = head(Value),
    {ok, Result}.

bits(Value) -> bit_size(Value).
bytes(Value) -> byte_size(Value).
part(Value, Position, Length) -> binary_part(Value, Position, Length).
part2(Value, Range) -> binary_part(Value, Range).

part_across(Value, Position, Length) ->
    Result = part(Value, Position, Length),
    {ok, Result}.
