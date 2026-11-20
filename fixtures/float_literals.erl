-module(float_literals).
-export([positive_zero/0, negative_zero/0, smallest/0, largest/0]).

positive_zero() -> 0.0.
negative_zero() -> -0.0.
smallest() -> 5.0e-324.
largest() -> 1.7976931348623157e308.
