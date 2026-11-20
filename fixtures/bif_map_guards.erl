-module(bif_map_guards).
-export([get/2, key/2, size/1, tuple/1, map_type/1, tuple_type/1]).

get(Key, Map) when map_get(Key, Map) =:= found -> yes;
get(_, _) -> no.

key(Key, Map) when is_map_key(Key, Map) -> yes;
key(_, _) -> no.

size(Map) when map_size(Map) > 0 -> yes;
size(_) -> no.

tuple(Tuple) when tuple_size(Tuple) =:= 2 -> yes;
tuple(_) -> no.

map_type(Term) when is_map(Term) -> yes;
map_type(_) -> no.

tuple_type(Term) when is_tuple(Term) -> yes;
tuple_type(_) -> no.
