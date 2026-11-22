-module(process_reference).
-export([new/0, pair/0, ref_guard/1, ref_body/1, ref_order/1, compare/2]).

new() -> make_ref().

pair() -> {make_ref(), make_ref()}.

ref_guard(Value) when is_reference(Value) -> yes;
ref_guard(_) -> no.

ref_body(Value) -> is_reference(Value).

ref_order(Value) when Value > atom, Value < self() -> yes;
ref_order(_) -> no.

compare(Left, Right) when Left =:= Right -> same;
compare(_, _) -> different.
