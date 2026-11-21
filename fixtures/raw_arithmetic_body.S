{module,raw_arithmetic_body}.
{exports,[{add_alias,2},{divide_literal,1},{add_y,2},{negate,1},{divide,2},
          {quotient_alias,2},{remainder_literal,1},{band_y,2},{bnot_alias,1},
          {absolute_y,1},{round_alias,1},{ceil_literal,0},{float_y,1}]}.
{attributes,[]}.
{labels,27}.

{function,add_alias,2,2}.
{label,1}.
{func_info,{atom,raw_arithmetic_body},{atom,add_alias},2}.
{label,2}.
{gc_bif,'+',{f,0},2,[{tr,{x,0},any},{tr,{x,1},any}],{x,1}}.
{move,{x,1},{x,0}}.
return.

{function,divide_literal,1,4}.
{label,3}.
{func_info,{atom,raw_arithmetic_body},{atom,divide_literal},1}.
{label,4}.
{gc_bif,'/',{f,0},1,[{x,0},{integer,2}],{x,0}}.
return.

{function,add_y,2,6}.
{label,5}.
{func_info,{atom,raw_arithmetic_body},{atom,add_y},2}.
{label,6}.
{allocate,1,2}.
{move,{x,0},{y,0}}.
{gc_bif,'+',{f,0},2,[{y,0},{x,1}],{x,0}}.
{deallocate,1}.
return.

{function,negate,1,8}.
{label,7}.
{func_info,{atom,raw_arithmetic_body},{atom,negate},1}.
{label,8}.
{gc_bif,'-',{f,0},1,[{tr,{x,0},any}],{x,0}}.
return.

{function,divide,2,10}.
{label,9}.
{func_info,{atom,raw_arithmetic_body},{atom,divide},2}.
{label,10}.
{gc_bif,'/',{f,0},2,[{x,0},{x,1}],{x,0}}.
return.

{function,quotient_alias,2,12}.
{label,11}.
{func_info,{atom,raw_arithmetic_body},{atom,quotient_alias},2}.
{label,12}.
{gc_bif,'div',{f,0},2,[{tr,{x,0},any},{tr,{x,1},any}],{x,1}}.
{move,{x,1},{x,0}}.
return.

{function,remainder_literal,1,14}.
{label,13}.
{func_info,{atom,raw_arithmetic_body},{atom,remainder_literal},1}.
{label,14}.
{gc_bif,'rem',{f,0},1,[{x,0},{integer,-3}],{x,0}}.
return.

{function,band_y,2,16}.
{label,15}.
{func_info,{atom,raw_arithmetic_body},{atom,band_y},2}.
{label,16}.
{allocate,1,2}.
{move,{x,0},{y,0}}.
{gc_bif,'band',{f,0},2,[{y,0},{x,1}],{x,0}}.
{deallocate,1}.
return.

{function,bnot_alias,1,18}.
{label,17}.
{func_info,{atom,raw_arithmetic_body},{atom,bnot_alias},1}.
{label,18}.
{gc_bif,'bnot',{f,0},1,[{tr,{x,0},any}],{x,0}}.
return.

{function,absolute_y,1,20}.
{label,19}.
{func_info,{atom,raw_arithmetic_body},{atom,absolute_y},1}.
{label,20}.
{allocate,1,1}.
{move,{x,0},{y,0}}.
{gc_bif,abs,{f,0},1,[{y,0}],{x,0}}.
{deallocate,1}.
return.

{function,round_alias,1,22}.
{label,21}.
{func_info,{atom,raw_arithmetic_body},{atom,round_alias},1}.
{label,22}.
{gc_bif,round,{f,0},1,[{tr,{x,0},any}],{x,1}}.
{move,{x,1},{x,0}}.
return.

{function,ceil_literal,0,24}.
{label,23}.
{func_info,{atom,raw_arithmetic_body},{atom,ceil_literal},0}.
{label,24}.
{gc_bif,ceil,{f,0},0,[{float,-1.5}],{x,0}}.
return.

{function,float_y,1,26}.
{label,25}.
{func_info,{atom,raw_arithmetic_body},{atom,float_y},1}.
{label,26}.
{allocate,1,1}.
{move,{x,0},{y,0}}.
{gc_bif,float,{f,0},1,[{y,0}],{x,0}}.
{deallocate,1}.
return.
