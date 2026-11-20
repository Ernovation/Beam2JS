{module,raw_typed}.
{exports,[{check,1},{compare,2}]}.
{attributes,[]}.
{labels,7}.

{function,check,1,2}.
{label,1}.
{func_info,{atom,raw_typed},{atom,check},1}.
{label,2}.
{test,is_integer,{f,3},[{tr,{x,0},any}]}.
{move,{atom,yes},{x,0}}.
return.
{label,3}.
{move,{atom,no},{x,0}}.
return.

{function,compare,2,5}.
{label,4}.
{func_info,{atom,raw_typed},{atom,compare},2}.
{label,5}.
{test,is_eq_exact,{f,6},[{tr,{x,0},any},{tr,{x,1},any}]}.
{move,{atom,yes},{x,0}}.
return.
{label,6}.
{move,{atom,no},{x,0}}.
return.

