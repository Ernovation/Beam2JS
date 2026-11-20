{module,raw_control_flow}.
{exports,[{id,1},{local,1},{remote,1},{jump,0},{move_atom,0},{move_integer,0},{pick,2}]}.
{attributes,[]}.
{labels,16}.

{function,id,1,2}.
{label,1}.
{func_info,{atom,raw_control_flow},{atom,id},1}.
{label,2}.
return.

{function,local,1,4}.
{label,3}.
{func_info,{atom,raw_control_flow},{atom,local},1}.
{label,4}.
{call_only,1,{f,2}}.

{function,remote,1,6}.
{label,5}.
{func_info,{atom,raw_control_flow},{atom,remote},1}.
{label,6}.
{call_ext_only,1,{extfunc,slice_helper,id,1}}.

{function,jump,0,8}.
{label,7}.
{func_info,{atom,raw_control_flow},{atom,jump},0}.
{label,8}.
{jump,{f,9}}.
{move,{atom,bad},{x,0}}.
return.
{label,9}.
{move,{integer,42},{x,0}}.
return.

{function,move_atom,0,11}.
{label,10}.
{func_info,{atom,raw_control_flow},{atom,move_atom},0}.
{label,11}.
{move,{atom,answer},{x,0}}.
return.

{function,move_integer,0,13}.
{label,12}.
{func_info,{atom,raw_control_flow},{atom,move_integer},0}.
{label,13}.
{move,{integer,-1},{x,0}}.
return.

{function,pick,2,15}.
{label,14}.
{func_info,{atom,raw_control_flow},{atom,pick},2}.
{label,15}.
{move,{x,1},{x,0}}.
return.
