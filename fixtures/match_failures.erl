-module(match_failures).
-export([case_value/1, match_value/1, if_value/1, only/1, across/1]).

case_value(Value) ->
    case Value of
        yes -> 1;
        no -> 2
    end.

match_value(Value) ->
    {ok, Result} = Value,
    Result.

if_value(Value) ->
    if
        Value =:= yes -> 1;
        Value =:= no -> 2
    end.

only(ok) ->
    accepted.

across(Value) ->
    Result = case_value(Value),
    {ok, Result}.
