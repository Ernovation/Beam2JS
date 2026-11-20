-module(unsupported_literal).
-export([value/0]).

value() -> {outer, [1, <<0>>]}.
