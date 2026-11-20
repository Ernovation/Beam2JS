{module,raw_bitwise_guards}.
{exports,[{both,2},{either,2},{different,2},{invert,1},{keep,3},{literal,1},{literal_big,1}]}.
{attributes,[]}.
{labels,22}.

{function,both,2,2}.
{label,1}.
{func_info,{atom,raw_bitwise_guards},{atom,both},2}.
{label,2}.
{gc_bif,'band',{f,3},2,[{x,0},{x,1}],{x,0}}.
return.
{label,3}.
{move,{atom,failed},{x,0}}.
return.

{function,either,2,5}.
{label,4}.
{func_info,{atom,raw_bitwise_guards},{atom,either},2}.
{label,5}.
{gc_bif,'bor',{f,6},2,[{tr,{x,0},any},{tr,{x,1},any}],{x,1}}.
{move,{x,1},{x,0}}.
return.
{label,6}.
{move,{atom,failed},{x,0}}.
return.

{function,different,2,8}.
{label,7}.
{func_info,{atom,raw_bitwise_guards},{atom,different},2}.
{label,8}.
{gc_bif,'bxor',{f,9},2,[{x,0},{x,1}],{x,0}}.
return.
{label,9}.
{move,{atom,failed},{x,0}}.
return.

{function,invert,1,11}.
{label,10}.
{func_info,{atom,raw_bitwise_guards},{atom,invert},1}.
{label,11}.
{gc_bif,'bnot',{f,12},1,[{x,0}],{x,0}}.
return.
{label,12}.
{move,{atom,failed},{x,0}}.
return.

{function,keep,3,14}.
{label,13}.
{func_info,{atom,raw_bitwise_guards},{atom,keep},3}.
{label,14}.
{gc_bif,'bxor',{f,15},3,[{x,0},{x,1}],{x,2}}.
{label,15}.
{move,{x,2},{x,0}}.
return.

{function,literal,1,17}.
{label,16}.
{func_info,{atom,raw_bitwise_guards},{atom,literal},1}.
{label,17}.
{gc_bif,'band',{f,18},1,[{x,0},{integer,255}],{x,0}}.
return.
{label,18}.
{move,{atom,failed},{x,0}}.
return.

{function,literal_big,1,20}.
{label,19}.
{func_info,{atom,raw_bitwise_guards},{atom,literal_big},1}.
{label,20}.
{gc_bif,'band',{f,21},1,[{x,0},{integer,-340282366920938463463374607431768211456}],{x,0}}.
return.
{label,21}.
{move,{atom,failed},{x,0}}.
return.
