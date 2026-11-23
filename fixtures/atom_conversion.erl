-module(atom_conversion).
-export([to_list/1]).

to_list(Atom) ->
    erlang:atom_to_list(Atom).
