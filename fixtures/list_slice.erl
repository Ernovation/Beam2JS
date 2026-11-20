-module(list_slice).
-export([empty/0, prepend/2, head/1, tail/1, is_empty/1, list/1, swap/1]).

empty() -> [].
prepend(Head, Tail) -> [Head | Tail].
head([Head | _]) -> Head;
head(_) -> no.
tail([_ | Tail]) -> Tail;
tail(_) -> no.
is_empty([]) -> yes;
is_empty(_) -> no.
list(Term) -> is_list(Term).
swap([Head | Tail]) -> [Tail | Head];
swap(Term) -> Term.
