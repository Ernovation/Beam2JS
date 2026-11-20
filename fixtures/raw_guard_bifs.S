{module,raw_guard_bifs}.
{exports,[{head,1},{tail,1},{size,1},{element,2},{keep,3},{element_alias,2},{literal_index,1}]}.
{attributes,[]}.
{labels,22}.

{function,head,1,2}.
{label,1}.
{func_info,{atom,raw_guard_bifs},{atom,head},1}.
{label,2}.
{bif,hd,{f,3},[{x,0}],{x,0}}.
return.
{label,3}.
{move,{atom,failed},{x,0}}.
return.

{function,tail,1,5}.
{label,4}.
{func_info,{atom,raw_guard_bifs},{atom,tail},1}.
{label,5}.
{bif,tl,{f,6},[{x,0}],{x,0}}.
return.
{label,6}.
{move,{atom,failed},{x,0}}.
return.

{function,size,1,8}.
{label,7}.
{func_info,{atom,raw_guard_bifs},{atom,size},1}.
{label,8}.
{bif,tuple_size,{f,9},[{x,0}],{x,0}}.
return.
{label,9}.
{move,{atom,failed},{x,0}}.
return.

{function,element,2,11}.
{label,10}.
{func_info,{atom,raw_guard_bifs},{atom,element},2}.
{label,11}.
{bif,element,{f,12},[{x,0},{x,1}],{x,0}}.
return.
{label,12}.
{move,{atom,failed},{x,0}}.
return.

{function,keep,3,14}.
{label,13}.
{func_info,{atom,raw_guard_bifs},{atom,keep},3}.
{label,14}.
{bif,element,{f,15},[{x,0},{x,1}],{x,2}}.
{label,15}.
{move,{x,2},{x,0}}.
return.

{function,element_alias,2,17}.
{label,16}.
{func_info,{atom,raw_guard_bifs},{atom,element_alias},2}.
{label,17}.
{bif,element,{f,18},[{tr,{x,0},any},{tr,{x,1},any}],{x,1}}.
{move,{x,1},{x,0}}.
return.
{label,18}.
{move,{x,1},{x,0}}.
return.

{function,literal_index,1,20}.
{label,19}.
{func_info,{atom,raw_guard_bifs},{atom,literal_index},1}.
{label,20}.
{bif,element,{f,21},[{integer,2},{x,0}],{x,0}}.
return.
{label,21}.
{move,{atom,failed},{x,0}}.
return.
