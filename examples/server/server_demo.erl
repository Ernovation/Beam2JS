-module(server_demo).
-export([compare/2]).

%% ordsets is not part of this example: the Beam2JS server compiles it from
%% the OTP installation when the browser first calls it.
compare(A, B) ->
    SetA = to_set(A),
    SetB = to_set(B),
    {ordsets:union(SetA, SetB), ordsets:intersection(SetA, SetB),
     ordsets:subtract(SetA, SetB), ordsets:subtract(SetB, SetA)}.

to_set(List) -> to_set(List, ordsets:new()).

to_set([], Set) -> Set;
to_set([X | Xs], Set) -> to_set(Xs, ordsets:add_element(X, Set)).
