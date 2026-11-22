-module(scheduler_fixture).
-export([count/2]).

count(Id, N) ->
    count(Id, N, 0).

count(Id, 0, Sum) ->
    {Id, Sum};
count(Id, N, Sum) when N > 0 ->
    Next = N - 1,
    NextSum = Sum + N,
    scheduler_probe:mark(Id, N),
    count(Id, Next, NextSum).
