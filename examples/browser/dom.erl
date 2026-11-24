-module(dom).
-on_load(init/0).
-export([element_by_id/1, append_text/2, read_text/1, read_value/1,
         get_attribute/2, set_text/2, listen/3, unlisten/1]).

init() -> erlang:load_nif("dom", 0).

element_by_id(_) -> erlang:nif_error(nif_not_loaded).
append_text(_, _) -> erlang:nif_error(nif_not_loaded).
read_text(_) -> erlang:nif_error(nif_not_loaded).
read_value(_) -> erlang:nif_error(nif_not_loaded).
get_attribute(_, _) -> erlang:nif_error(nif_not_loaded).
set_text(_, _) -> erlang:nif_error(nif_not_loaded).
listen(_, _, _) -> erlang:nif_error(nif_not_loaded).
unlisten(_) -> erlang:nif_error(nif_not_loaded).
