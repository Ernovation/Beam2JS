{module,raw_length_guards}.
{exports,[{size,1},{keep,2},{literal,0},{bits,1},{bytes,1},
          {keep_bits,2},{keep_bytes,2},{literal_bits,0},{literal_bytes,0}]}.
{attributes,[]}.
{labels,28}.

{function,size,1,2}.
{label,1}.
{func_info,{atom,raw_length_guards},{atom,size},1}.
{label,2}.
{gc_bif,length,{f,3},1,[{tr,{x,0},any}],{x,0}}.
return.
{label,3}.
{move,{atom,failed},{x,0}}.
return.

{function,bits,1,11}.
{label,10}.
{func_info,{atom,raw_length_guards},{atom,bits},1}.
{label,11}.
{gc_bif,bit_size,{f,12},1,[{tr,{x,0},any}],{x,0}}.
return.
{label,12}.
{move,{atom,failed},{x,0}}.
return.

{function,bytes,1,14}.
{label,13}.
{func_info,{atom,raw_length_guards},{atom,bytes},1}.
{label,14}.
{gc_bif,byte_size,{f,15},1,[{tr,{x,0},any}],{x,0}}.
return.
{label,15}.
{move,{atom,failed},{x,0}}.
return.

{function,keep_bits,2,17}.
{label,16}.
{func_info,{atom,raw_length_guards},{atom,keep_bits},2}.
{label,17}.
{gc_bif,bit_size,{f,18},2,[{x,0}],{x,1}}.
{label,18}.
{move,{x,1},{x,0}}.
return.

{function,keep_bytes,2,20}.
{label,19}.
{func_info,{atom,raw_length_guards},{atom,keep_bytes},2}.
{label,20}.
{gc_bif,byte_size,{f,21},2,[{x,0}],{x,1}}.
{label,21}.
{move,{x,1},{x,0}}.
return.

{function,literal_bits,0,23}.
{label,22}.
{func_info,{atom,raw_length_guards},{atom,literal_bits},0}.
{label,23}.
{gc_bif,bit_size,{f,24},0,[{literal,<<5:3>>}],{x,0}}.
return.
{label,24}.
{move,{atom,failed},{x,0}}.
return.

{function,literal_bytes,0,26}.
{label,25}.
{func_info,{atom,raw_length_guards},{atom,literal_bytes},0}.
{label,26}.
{gc_bif,byte_size,{f,27},0,[{literal,<<5:9>>}],{x,0}}.
return.
{label,27}.
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
