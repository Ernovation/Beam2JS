-module(dynamic_apply).
-export([add/2, apply_tail/3, apply_non_tail/3, apply_bif/0,
         module_name/0, module_exports/0, module_info_all/0, keep_hidden/0]).

add(Left, Right) ->
    Left + Right.

apply_tail(Module, Function, Args) ->
    apply(Module, Function, Args).

apply_non_tail(Module, Function, Args) ->
    {result, apply(Module, Function, Args)}.

apply_bif() ->
    apply(erlang, integer_to_binary, [42]).

module_name() ->
    module_info(module).

module_exports() ->
    module_info(exports).

module_info_all() ->
    module_info().

hidden() ->
    hidden.

keep_hidden() ->
    hidden().
