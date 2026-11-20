{module,raw_integer_guards}.
{exports,[{quotient,2},{remainder,2},{keep,3},{keep_rem,3},{literal,1},{literal_big,1}]}.
{attributes,[]}.
{labels,19}.

{function,quotient,2,2}.
{label,1}.
{func_info,{atom,raw_integer_guards},{atom,quotient},2}.
{label,2}.
{gc_bif,'div',{f,3},2,[{x,0},{x,1}],{x,0}}.
return.
{label,3}.
{move,{atom,failed},{x,0}}.
return.

{function,remainder,2,5}.
{label,4}.
{func_info,{atom,raw_integer_guards},{atom,remainder},2}.
{label,5}.
{gc_bif,'rem',{f,6},2,[{tr,{x,0},any},{tr,{x,1},any}],{x,1}}.
{move,{x,1},{x,0}}.
return.
{label,6}.
{move,{atom,failed},{x,0}}.
return.

{function,keep,3,8}.
{label,7}.
{func_info,{atom,raw_integer_guards},{atom,keep},3}.
{label,8}.
{gc_bif,'div',{f,9},3,[{x,0},{x,1}],{x,2}}.
{label,9}.
{move,{x,2},{x,0}}.
return.

{function,literal,1,11}.
{label,10}.
{func_info,{atom,raw_integer_guards},{atom,literal},1}.
{label,11}.
{gc_bif,'rem',{f,12},1,[{x,0},{integer,-3}],{x,0}}.
return.
{label,12}.
{move,{atom,failed},{x,0}}.
return.

{function,keep_rem,3,14}.
{label,13}.
{func_info,{atom,raw_integer_guards},{atom,keep_rem},3}.
{label,14}.
{gc_bif,'rem',{f,15},3,[{x,0},{x,1}],{x,2}}.
{label,15}.
{move,{x,2},{x,0}}.
return.

{function,literal_big,1,17}.
{label,16}.
{func_info,{atom,raw_integer_guards},{atom,literal_big},1}.
{label,17}.
{gc_bif,'div',{f,18},1,[{integer,-340282366920938463463374607431768211456},{x,0}],{x,0}}.
return.
{label,18}.
{move,{atom,failed},{x,0}}.
return.
