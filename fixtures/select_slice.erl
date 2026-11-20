-module(select_slice).
-export([choose/1]).

choose(first) -> one;
choose(second) -> two;
choose(_) -> other.
