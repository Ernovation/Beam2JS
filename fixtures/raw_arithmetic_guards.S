{module,raw_arithmetic_guards}.
{exports,[{add,2},{subtract,2},{multiply,2},{negate,1},{keep,3},{literal,1},
          {divide,2},{keep_divide,3},{divide_literal,1},
          {absolute,1},{keep_abs,2},{abs_literal,0},
          {truncate,1},{round_value,1},{floor_value,1},{ceil_value,1},
          {keep_trunc,2},{keep_round,2},{keep_floor,2},{keep_ceil,2},{round_literal,0},
          {convert_float,1},{keep_float,2},{float_literal,0}]}.
{attributes,[]}.
{labels,73}.

{function,add,2,2}.
{label,1}.
{func_info,{atom,raw_arithmetic_guards},{atom,add},2}.
{label,2}.
{gc_bif,'+',{f,3},2,[{x,0},{x,1}],{x,0}}.
return.
{label,3}.
{move,{atom,failed},{x,0}}.
return.

{function,subtract,2,5}.
{label,4}.
{func_info,{atom,raw_arithmetic_guards},{atom,subtract},2}.
{label,5}.
{gc_bif,'-',{f,6},2,[{tr,{x,0},any},{tr,{x,1},any}],{x,1}}.
{move,{x,1},{x,0}}.
return.
{label,6}.
{move,{atom,failed},{x,0}}.
return.

{function,multiply,2,8}.
{label,7}.
{func_info,{atom,raw_arithmetic_guards},{atom,multiply},2}.
{label,8}.
{gc_bif,'*',{f,9},2,[{x,0},{x,1}],{x,0}}.
return.
{label,9}.
{move,{atom,failed},{x,0}}.
return.

{function,negate,1,11}.
{label,10}.
{func_info,{atom,raw_arithmetic_guards},{atom,negate},1}.
{label,11}.
{gc_bif,'-',{f,12},1,[{x,0}],{x,0}}.
return.
{label,12}.
{move,{atom,failed},{x,0}}.
return.

{function,keep,3,14}.
{label,13}.
{func_info,{atom,raw_arithmetic_guards},{atom,keep},3}.
{label,14}.
{gc_bif,'+',{f,15},3,[{x,0},{x,1}],{x,2}}.
{label,15}.
{move,{x,2},{x,0}}.
return.

{function,literal,1,17}.
{label,16}.
{func_info,{atom,raw_arithmetic_guards},{atom,literal},1}.
{label,17}.
{gc_bif,'*',{f,18},1,[{x,0},{float,-0.0}],{x,0}}.
return.
{label,18}.
{move,{atom,failed},{x,0}}.
return.

{function,divide,2,20}.
{label,19}.
{func_info,{atom,raw_arithmetic_guards},{atom,divide},2}.
{label,20}.
{gc_bif,'/',{f,21},2,[{tr,{x,0},any},{tr,{x,1},any}],{x,1}}.
{move,{x,1},{x,0}}.
return.
{label,21}.
{move,{atom,failed},{x,0}}.
return.

{function,keep_divide,3,23}.
{label,22}.
{func_info,{atom,raw_arithmetic_guards},{atom,keep_divide},3}.
{label,23}.
{gc_bif,'/',{f,24},3,[{x,0},{x,1}],{x,2}}.
{label,24}.
{move,{x,2},{x,0}}.
return.

{function,divide_literal,1,26}.
{label,25}.
{func_info,{atom,raw_arithmetic_guards},{atom,divide_literal},1}.
{label,26}.
{gc_bif,'/',{f,27},1,[{x,0},{integer,2}],{x,0}}.
return.
{label,27}.
{move,{atom,failed},{x,0}}.
return.

{function,absolute,1,29}.
{label,28}.
{func_info,{atom,raw_arithmetic_guards},{atom,absolute},1}.
{label,29}.
{gc_bif,abs,{f,30},1,[{tr,{x,0},any}],{x,0}}.
return.
{label,30}.
{move,{atom,failed},{x,0}}.
return.

{function,keep_abs,2,32}.
{label,31}.
{func_info,{atom,raw_arithmetic_guards},{atom,keep_abs},2}.
{label,32}.
{gc_bif,abs,{f,33},2,[{x,0}],{x,1}}.
{label,33}.
{move,{x,1},{x,0}}.
return.

{function,abs_literal,0,35}.
{label,34}.
{func_info,{atom,raw_arithmetic_guards},{atom,abs_literal},0}.
{label,35}.
{gc_bif,abs,{f,36},0,[{float,-0.0}],{x,0}}.
return.
{label,36}.
{move,{atom,failed},{x,0}}.
return.

{function,truncate,1,38}.
{label,37}.
{func_info,{atom,raw_arithmetic_guards},{atom,truncate},1}.
{label,38}.
{gc_bif,trunc,{f,39},1,[{tr,{x,0},any}],{x,0}}.
return.
{label,39}.
{move,{atom,failed},{x,0}}.
return.

{function,round_value,1,41}.
{label,40}.
{func_info,{atom,raw_arithmetic_guards},{atom,round_value},1}.
{label,41}.
{gc_bif,round,{f,42},1,[{tr,{x,0},any}],{x,0}}.
return.
{label,42}.
{move,{atom,failed},{x,0}}.
return.

{function,floor_value,1,44}.
{label,43}.
{func_info,{atom,raw_arithmetic_guards},{atom,floor_value},1}.
{label,44}.
{gc_bif,floor,{f,45},1,[{tr,{x,0},any}],{x,0}}.
return.
{label,45}.
{move,{atom,failed},{x,0}}.
return.

{function,ceil_value,1,47}.
{label,46}.
{func_info,{atom,raw_arithmetic_guards},{atom,ceil_value},1}.
{label,47}.
{gc_bif,ceil,{f,48},1,[{tr,{x,0},any}],{x,0}}.
return.
{label,48}.
{move,{atom,failed},{x,0}}.
return.

{function,keep_trunc,2,50}.
{label,49}.
{func_info,{atom,raw_arithmetic_guards},{atom,keep_trunc},2}.
{label,50}.
{gc_bif,trunc,{f,51},2,[{x,0}],{x,1}}.
{label,51}.
{move,{x,1},{x,0}}.
return.

{function,keep_round,2,53}.
{label,52}.
{func_info,{atom,raw_arithmetic_guards},{atom,keep_round},2}.
{label,53}.
{gc_bif,round,{f,54},2,[{x,0}],{x,1}}.
{label,54}.
{move,{x,1},{x,0}}.
return.

{function,keep_floor,2,56}.
{label,55}.
{func_info,{atom,raw_arithmetic_guards},{atom,keep_floor},2}.
{label,56}.
{gc_bif,floor,{f,57},2,[{x,0}],{x,1}}.
{label,57}.
{move,{x,1},{x,0}}.
return.

{function,keep_ceil,2,59}.
{label,58}.
{func_info,{atom,raw_arithmetic_guards},{atom,keep_ceil},2}.
{label,59}.
{gc_bif,ceil,{f,60},2,[{x,0}],{x,1}}.
{label,60}.
{move,{x,1},{x,0}}.
return.

{function,round_literal,0,62}.
{label,61}.
{func_info,{atom,raw_arithmetic_guards},{atom,round_literal},0}.
{label,62}.
{gc_bif,round,{f,63},0,[{float,0.49999999999999994}],{x,0}}.
return.
{label,63}.
{move,{atom,failed},{x,0}}.
return.

{function,convert_float,1,65}.
{label,64}.
{func_info,{atom,raw_arithmetic_guards},{atom,convert_float},1}.
{label,65}.
{gc_bif,float,{f,66},1,[{tr,{x,0},any}],{x,0}}.
return.
{label,66}.
{move,{atom,failed},{x,0}}.
return.

{function,keep_float,2,68}.
{label,67}.
{func_info,{atom,raw_arithmetic_guards},{atom,keep_float},2}.
{label,68}.
{gc_bif,float,{f,69},2,[{x,0}],{x,1}}.
{label,69}.
{move,{x,1},{x,0}}.
return.

{function,float_literal,0,71}.
{label,70}.
{func_info,{atom,raw_arithmetic_guards},{atom,float_literal},0}.
{label,71}.
{gc_bif,float,{f,72},0,[{integer,9007199254740993}],{x,0}}.
return.
{label,72}.
{move,{atom,failed},{x,0}}.
return.
