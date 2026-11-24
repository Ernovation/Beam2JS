-module(fun_maps).
-export([map_values/1, filter_even/1, fold_sum/1, merge/2, intersect/2,
         update_present/1, update_default/1, groups/1, groups_values/1]).

map_values(Map) ->
    maps:map(fun(_Key, Value) -> Value + 1 end, Map).

filter_even(Map) ->
    maps:filter(fun(_Key, Value) -> (Value rem 2) =:= 0 end, Map).

fold_sum(Map) ->
    maps:fold(fun(_Key, Value, Acc) -> Acc + Value end, 0, Map).

merge(Left, Right) ->
    maps:merge_with(fun(_Key, L, R) -> L + R end, Left, Right).

intersect(Left, Right) ->
    maps:intersect_with(fun(_Key, L, R) -> {L, R} end, Left, Right).

update_present(Map) ->
    maps:update_with(a, fun(Value) -> Value + 1 end, Map).

update_default(Map) ->
    maps:update_with(a, fun(Value) -> Value + 1 end, 42, Map).

groups(List) ->
    maps:groups_from_list(fun(Value) -> Value rem 2 end, List).

groups_values(List) ->
    maps:groups_from_list(fun(Value) -> Value rem 2 end,
                          fun(Value) -> Value * 10 end, List).
