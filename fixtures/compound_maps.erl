-module(compound_maps).
-export([literal/0, exact/2, exact_update/2, assoc_update/2,
         has_fields/3, nested/0, map_in_list/0, tuple_with_map/0,
         from_and_convert/0, ordered/0]).

literal() -> #{a => 1, b => [2, 3], c => {4, #{d => 5}}}.
exact(Key, Map) ->
    case Map of
        #{Key := Value} -> {ok, Value};
        _ -> error
    end.
exact_update(Key, Map) -> Map#{Key := #{new => true}}.
assoc_update(Key, Map) -> Map#{Key => [new, value]}.
has_fields(A, B, Map) ->
    case Map of
        #{a := A, b := B} -> yes;
        _ -> no
    end.
nested() -> [{#{name => alice}, {tag, #{items => [1, 2, 3]}}}].
map_in_list() -> [#{kind => a}, #{kind => b}].
tuple_with_map() -> {ok, #{status => ready, values => [1, 2, 3]}}.
from_and_convert() ->
    Map = maps:from_list([{b, 2}, {a, 1}, {b, 3}]),
    {maps:to_list(Map), maps:keys(Map), maps:values(Map), maps:size(Map)}.
ordered() ->
    Map = #{c => 3, a => 1, b => 2},
    {maps:to_list(Map), maps:keys(Map), maps:values(Map)}.
