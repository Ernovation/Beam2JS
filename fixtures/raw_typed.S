{module,raw_typed}.
{exports,[{check,1},{compare,2},{binary,1},{bits,1}]}.
{attributes,[]}.
{labels,13}.

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

{function,binary,1,8}.
{label,7}.
{func_info,{atom,raw_typed},{atom,binary},1}.
{label,8}.
{test,is_binary,{f,9},[{tr,{x,0},any}]}.
{move,{atom,yes},{x,0}}.
return.
{label,9}.
{move,{atom,no},{x,0}}.
return.

{function,bits,1,11}.
{label,10}.
{func_info,{atom,raw_typed},{atom,bits},1}.
{label,11}.
{test,is_bitstr,{f,12},[{tr,{x,0},any}]}.
{move,{atom,yes},{x,0}}.
return.
{label,12}.
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

