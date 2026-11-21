{module,raw_guard_bifs}.
{exports,[{head,1},{tail,1},{size,1},{element,2},{keep,3},{element_alias,2},{literal_index,1},
          {part,3},{part_keep,4},{part_alias_start,3},{part_alias_length,3},{part_literal,0},
          {part2,2},{part2_keep,3},{part2_alias_range,2},{part2_literal,0}]}.
{attributes,[]}.
{labels,49}.

{function,head,1,2}.
{label,1}.
{func_info,{atom,raw_guard_bifs},{atom,head},1}.
{label,2}.
{bif,hd,{f,3},[{x,0}],{x,0}}.
return.
{label,3}.
{move,{atom,failed},{x,0}}.
return.

{function,part,3,23}.
{label,22}.
{func_info,{atom,raw_guard_bifs},{atom,part},3}.
{label,23}.
{gc_bif,binary_part,{f,24},3,[{tr,{x,0},any},{tr,{x,1},any},{tr,{x,2},any}],{x,0}}.
return.
{label,24}.
{move,{atom,failed},{x,0}}.
return.

{function,part_keep,4,26}.
{label,25}.
{func_info,{atom,raw_guard_bifs},{atom,part_keep},4}.
{label,26}.
{gc_bif,binary_part,{f,27},4,[{x,0},{x,1},{x,2}],{x,3}}.
{label,27}.
{move,{x,3},{x,0}}.
return.

{function,part_alias_start,3,29}.
{label,28}.
{func_info,{atom,raw_guard_bifs},{atom,part_alias_start},3}.
{label,29}.
{gc_bif,binary_part,{f,30},3,[{x,0},{x,1},{x,2}],{x,1}}.
{label,30}.
{move,{x,1},{x,0}}.
return.

{function,part_alias_length,3,32}.
{label,31}.
{func_info,{atom,raw_guard_bifs},{atom,part_alias_length},3}.
{label,32}.
{gc_bif,binary_part,{f,33},3,[{x,0},{x,1},{x,2}],{x,2}}.
{label,33}.
{move,{x,2},{x,0}}.
return.

{function,part_literal,0,35}.
{label,34}.
{func_info,{atom,raw_guard_bifs},{atom,part_literal},0}.
{label,35}.
{gc_bif,binary_part,{f,36},0,[{literal,<<0,1,2>>},{integer,3},{integer,-2}],{x,0}}.
return.
{label,36}.
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

{function,part2,2,38}.
{label,37}.
{func_info,{atom,raw_guard_bifs},{atom,part2},2}.
{label,38}.
{gc_bif,binary_part,{f,39},2,[{tr,{x,0},any},{tr,{x,1},any}],{x,0}}.
return.
{label,39}.
{move,{atom,failed},{x,0}}.
return.

{function,part2_keep,3,41}.
{label,40}.
{func_info,{atom,raw_guard_bifs},{atom,part2_keep},3}.
{label,41}.
{gc_bif,binary_part,{f,42},3,[{x,0},{x,1}],{x,2}}.
{label,42}.
{move,{x,2},{x,0}}.
return.

{function,part2_alias_range,2,44}.
{label,43}.
{func_info,{atom,raw_guard_bifs},{atom,part2_alias_range},2}.
{label,44}.
{gc_bif,binary_part,{f,45},2,[{x,0},{x,1}],{x,1}}.
{label,45}.
{move,{x,1},{x,0}}.
return.

{function,part2_literal,0,47}.
{label,46}.
{func_info,{atom,raw_guard_bifs},{atom,part2_literal},0}.
{label,47}.
{gc_bif,binary_part,{f,48},0,[{literal,<<0,1,2>>},{literal,{3,-2}}],{x,0}}.
return.
{label,48}.
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
