{module,raw_length_guards}.
{exports,[{size,1},{keep,2},{literal,0}]}.
{attributes,[]}.
{labels,10}.

{function,size,1,2}.
{label,1}.
{func_info,{atom,raw_length_guards},{atom,size},1}.
{label,2}.
{gc_bif,length,{f,3},1,[{tr,{x,0},any}],{x,0}}.
return.
{label,3}.
{move,{atom,failed},{x,0}}.
return.

{function,keep,2,5}.
{label,4}.
{func_info,{atom,raw_length_guards},{atom,keep},2}.
{label,5}.
{gc_bif,length,{f,6},2,[{x,0}],{x,1}}.
{label,6}.
{move,{x,1},{x,0}}.
return.

{function,literal,0,8}.
{label,7}.
{func_info,{atom,raw_length_guards},{atom,literal},0}.
{label,8}.
{gc_bif,length,{f,9},0,[{literal,[a,b]}],{x,0}}.
return.
{label,9}.
{move,{atom,failed},{x,0}}.
return.
