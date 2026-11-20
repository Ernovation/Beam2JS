-module(typed_select_slice).
-export([choose/1]).

choose({Value}) -> Value;
choose({_, Value}) -> Value;
choose(_) -> no.
