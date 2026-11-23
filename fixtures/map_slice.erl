-module(map_slice).
-export([literal/0, exact/2, assoc/2, get/2, size/1, type/1, nested/0, update_existing/1]).

literal() -> #{name => alice, count => 2}.
exact(Key, Map) ->
    case Map of
        #{Key := Value} -> {found, Value};
        _ -> missing
    end.
assoc(Key, Map) -> Map#{Key => found}.
get(Key, Map) -> map_get(Key, Map).
size(Map) -> map_size(Map).
type(Term) -> is_map(Term).
nested() -> #{{point, 1} => #{x => 10, y => 20}}.
update_existing(Map) -> Map#{count => 3}.
