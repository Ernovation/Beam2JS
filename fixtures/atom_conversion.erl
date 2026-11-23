-module(atom_conversion).
-export([to_list/1, to_binary/2, from_binary/2]).

to_list(Atom) ->
    erlang:atom_to_list(Atom).

to_binary(Atom, Encoding) ->
    erlang:atom_to_binary(Atom, Encoding).

from_binary(Binary, Encoding) ->
    erlang:binary_to_atom(Binary, Encoding).
