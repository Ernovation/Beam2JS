-module(bif_body).
-export([head/1, tail/1, size/1, element/2, length/1, head_across/1,
         stack_head/2, stack_tail/2, stack_size/2, stack_element/2, stack_length/2, stack_bits/2, stack_bytes/2,
         bits/1, bytes/1, part/3, part2/2, part_across/3, stack_part/4, stack_part2/3,
         stack_predicates/2, from_list/1, to_list/1, tuple_roundtrip/1,
         bool_not/1, bool_and/2, bool_or/2, bool_xor/2,
         guard_not/1, guard_and/2, guard_or/2, guard_xor/2,
         integer_chars/1, integer_chars_base/2, integer_binary/1,
         integer_binary_base/2, integer_text_pair/2,
         binary_list/1, binary_list_range/3, binary_list_across/3]).

head(Value) -> hd(Value).
tail(Value) -> tl(Value).
size(Value) -> tuple_size(Value).
element(Index, Value) -> erlang:element(Index, Value).
length(Value) -> erlang:length(Value).
from_list(Value) -> erlang:list_to_tuple(Value).
to_list(Value) -> erlang:tuple_to_list(Value).

tuple_roundtrip(Value) ->
    Tuple = erlang:list_to_tuple(Value),
    {ok, erlang:tuple_to_list(Tuple)}.

bool_not(Value) -> not Value.
bool_and(Left, Right) -> Left and Right.
bool_or(Left, Right) -> Left or Right.
bool_xor(Left, Right) -> Left xor Right.

guard_not(Value) when not Value -> yes;
guard_not(_) -> no.
guard_and(Left, Right) when Left and Right -> yes;
guard_and(_, _) -> no.
guard_or(Left, Right) when Left or Right -> yes;
guard_or(_, _) -> no.
guard_xor(Left, Right) when Left xor Right -> yes;
guard_xor(_, _) -> no.

integer_chars(Value) -> integer_to_list(Value).
integer_chars_base(Value, Base) -> integer_to_list(Value, Base).
integer_binary(Value) -> integer_to_binary(Value).
integer_binary_base(Value, Base) -> integer_to_binary(Value, Base).

integer_text_pair(Value, Base) ->
    Chars = integer_to_list(Value, Base),
    {Chars, integer_to_binary(Value, Base)}.

binary_list(Value) -> binary_to_list(Value).
binary_list_range(Value, First, Last) -> binary_to_list(Value, First, Last).
binary_list_across(Value, First, Last) ->
    {ok, binary_to_list(Value, First, Last)}.

head_across(Value) ->
    Result = head(Value),
    {ok, Result}.

stack_head(Value, Other) ->
    First = slice_helper:id(Other),
    Result = hd(Value),
    Second = slice_helper:id(First),
    {Result, Second}.

stack_tail(Value, Other) ->
    First = slice_helper:id(Other),
    Result = tl(Value),
    Second = slice_helper:id(First),
    {Result, Second}.

stack_size(Value, Other) ->
    First = slice_helper:id(Other),
    Result = tuple_size(Value),
    Second = slice_helper:id(First),
    {Result, Second}.

stack_element(Value, Other) ->
    First = slice_helper:id(Other),
    Result = erlang:element(1, Value),
    Second = slice_helper:id(First),
    {Result, Second}.

stack_length(Value, Other) ->
    First = slice_helper:id(Other),
    Result = erlang:length(Value),
    Second = slice_helper:id(First),
    {Result, Second}.

stack_bits(Value, Other) ->
    First = slice_helper:id(Other),
    Result = bit_size(Value),
    Second = slice_helper:id(First),
    {Result, Second}.

stack_bytes(Value, Other) ->
    First = slice_helper:id(Other),
    Result = byte_size(Value),
    Second = slice_helper:id(First),
    {Result, Second}.

bits(Value) -> bit_size(Value).
bytes(Value) -> byte_size(Value).
part(Value, Position, Length) -> binary_part(Value, Position, Length).
part2(Value, Range) -> binary_part(Value, Range).

part_across(Value, Position, Length) ->
    Result = part(Value, Position, Length),
    {ok, Result}.

stack_part(Value, Position, Length, Other) ->
    First = slice_helper:id(Other),
    Result = binary_part(Value, Position, Length),
    Second = slice_helper:id(First),
    {Result, Second}.

stack_part2(Value, Range, Other) ->
    First = slice_helper:id(Other),
    Result = binary_part(Value, Range),
    Second = slice_helper:id(First),
    {Result, Second}.

stack_predicates(Value, Other) ->
    First = slice_helper:id(Other),
    Integer = is_integer(Value),
    Number = is_number(Value),
    Atom = is_atom(Value),
    Boolean = is_boolean(Value),
    Float = is_float(Value),
    List = is_list(Value),
    Tuple = is_tuple(Value),
    Binary = is_binary(Value),
    Bitstring = is_bitstring(Value),
    Pid = is_pid(Value),
    Reference = is_reference(Value),
    Second = slice_helper:id(First),
    {Integer, Number, Atom, Boolean, Float, List, Tuple, Binary, Bitstring, Pid, Reference, Second}.
