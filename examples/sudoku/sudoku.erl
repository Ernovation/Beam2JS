-module(sudoku).
-export([sample/0, solve/1]).

sample() ->
    [[5,3,0,0,7,0,0,0,0],
     [6,0,0,1,9,5,0,0,0],
     [0,9,8,0,0,0,0,6,0],
     [8,0,0,0,6,0,0,0,3],
     [4,0,0,8,0,3,0,0,1],
     [7,0,0,0,2,0,0,0,6],
     [0,6,0,0,0,0,2,8,0],
     [0,0,0,4,1,9,0,0,5],
     [0,0,0,0,8,0,0,7,9]].

solve(Grid) ->
    case valid_rows(Grid, 9) of
        false -> invalid;
        true ->
            case valid_clues(Grid, Grid, 0) of
                false -> invalid;
                true -> search(Grid, 0)
            end
    end.

valid_rows([], 0) -> true;
valid_rows([Row | Rows], Count) when Count > 0 ->
    valid_cells(Row, 9) andalso valid_rows(Rows, Count - 1);
valid_rows(_, _) -> false.

valid_cells([], 0) -> true;
valid_cells([Value | Cells], Count)
  when Count > 0, is_integer(Value), Value >= 0, Value =< 9 ->
    valid_cells(Cells, Count - 1);
valid_cells(_, _) -> false.

valid_clues(_, [], _) -> true;
valid_clues(Grid, [Row | Rows], RowIndex) ->
    valid_clue_row(Grid, Row, RowIndex, 0) andalso
        valid_clues(Grid, Rows, RowIndex + 1).

valid_clue_row(_, [], _, _) -> true;
valid_clue_row(Grid, [Value | Cells], Row, Col) ->
    (Value =:= 0 orelse
        available(set_cell(Grid, Row, Col, 0), Row, Col, Value)) andalso
        valid_clue_row(Grid, Cells, Row, Col + 1).

search(Grid, 81) -> {ok, Grid};
search(Grid, Position) ->
    Row = Position div 9,
    Col = Position rem 9,
    case nth(Col, nth(Row, Grid)) of
        0 -> try_values(Grid, Position, Row, Col, 1);
        _ -> search(Grid, Position + 1)
    end.

try_values(_, _, _, _, 10) -> unsolvable;
try_values(Grid, Position, Row, Col, Value) ->
    case available(Grid, Row, Col, Value) of
        false -> try_values(Grid, Position, Row, Col, Value + 1);
        true ->
            case search(set_cell(Grid, Row, Col, Value), Position + 1) of
                unsolvable -> try_values(Grid, Position, Row, Col, Value + 1);
                {ok, _} = Result -> Result
            end
    end.

available(Grid, Row, Col, Value) ->
    not contains(nth(Row, Grid), Value) andalso
        column_free(Grid, Col, Value) andalso
        box_free(drop((Row div 3) * 3, Grid), (Col div 3) * 3, Value, 3).

contains([], _) -> false;
contains([Value | _], Value) -> true;
contains([_ | Rest], Value) -> contains(Rest, Value).

column_free([], _, _) -> true;
column_free([Row | Rows], Col, Value) ->
    nth(Col, Row) =/= Value andalso column_free(Rows, Col, Value).

box_free(_, _, _, 0) -> true;
box_free([Row | Rows], Col, Value, Count) ->
    box_cells(drop(Col, Row), Value, 3) andalso
        box_free(Rows, Col, Value, Count - 1).

box_cells(_, _, 0) -> true;
box_cells([Cell | Cells], Value, Count) ->
    Cell =/= Value andalso box_cells(Cells, Value, Count - 1).

nth(0, [Value | _]) -> Value;
nth(Index, [_ | Rest]) -> nth(Index - 1, Rest).

drop(0, List) -> List;
drop(Count, [_ | Rest]) -> drop(Count - 1, Rest).

set_cell(Grid, Row, Col, Value) ->
    set_nth(Grid, Row, set_nth(nth(Row, Grid), Col, Value)).

set_nth([_ | Rest], 0, Value) -> [Value | Rest];
set_nth([Head | Rest], Index, Value) ->
    [Head | set_nth(Rest, Index - 1, Value)].
