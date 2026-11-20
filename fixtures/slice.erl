-module(slice).
-export([id/1, value/0, choose/1, choose_number/1, only/1, local/1,
         remote/1, strange/0, unicode_atom/0]).
-compile(no_inline).

id(X) -> X.
value() -> 123456789012345678901234567890.
choose(yes) -> 1;
choose(_) -> 0.
choose_number(1) -> -1;
choose_number(_) -> 0.
only(yes) -> 9.
local(X) -> private(X).
private(X) -> X.
remote(X) -> slice_helper:id(X).
strange() -> 'quote"back\\slash'.
unicode_atom() -> '\x{1F600}'.
