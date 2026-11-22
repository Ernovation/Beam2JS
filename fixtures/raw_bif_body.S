{module,raw_bif_body}.
{exports,[{head_y,1},{element_alias,2},{length_y,1},{length_literal,0},
          {bits_y,1},{part_alias,3},{part2_alias,2},{part_literal,0},
          {predicate_tail,1},{predicate_last,1},{predicate_call,1},
          {head_call_tail,1},{element_call_last,2},{length_call,1},
          {bits_call_tail,1},{part2_call_last,2},{part3_call,3},
          {abs_call_tail,1},{round_call_last,1},{float_call,1}]}.
{attributes,[]}.
{labels,41}.

{function,head_y,1,2}.
{label,1}.
{func_info,{atom,raw_bif_body},{atom,head_y},1}.
{label,2}.
{allocate,1,1}.
{move,{x,0},{y,0}}.
{bif,hd,{f,0},[{y,0}],{x,0}}.
{deallocate,1}.
return.

{function,element_alias,2,4}.
{label,3}.
{func_info,{atom,raw_bif_body},{atom,element_alias},2}.
{label,4}.
{bif,element,{f,0},[{tr,{x,0},any},{tr,{x,1},any}],{x,1}}.
{move,{x,1},{x,0}}.
return.

{function,length_y,1,6}.
{label,5}.
{func_info,{atom,raw_bif_body},{atom,length_y},1}.
{label,6}.
{allocate,1,1}.
{move,{x,0},{y,0}}.
{gc_bif,length,{f,0},1,[{y,0}],{x,0}}.
{deallocate,1}.
return.

{function,length_literal,0,8}.
{label,7}.
{func_info,{atom,raw_bif_body},{atom,length_literal},0}.
{label,8}.
{gc_bif,length,{f,0},0,[{literal,[one,two]}],{x,0}}.
return.

{function,bits_y,1,10}.
{label,9}.
{func_info,{atom,raw_bif_body},{atom,bits_y},1}.
{label,10}.
{allocate,1,1}.
{move,{x,0},{y,0}}.
{gc_bif,bit_size,{f,0},1,[{y,0}],{x,0}}.
{deallocate,1}.
return.

{function,part_alias,3,12}.
{label,11}.
{func_info,{atom,raw_bif_body},{atom,part_alias},3}.
{label,12}.
{gc_bif,binary_part,{f,0},3,[{tr,{x,0},any},{tr,{x,1},any},{tr,{x,2},any}],{x,1}}.
{move,{x,1},{x,0}}.
return.

{function,part2_alias,2,14}.
{label,13}.
{func_info,{atom,raw_bif_body},{atom,part2_alias},2}.
{label,14}.
{gc_bif,binary_part,{f,0},2,[{x,0},{x,1}],{x,1}}.
{move,{x,1},{x,0}}.
return.

{function,part_literal,0,16}.
{label,15}.
{func_info,{atom,raw_bif_body},{atom,part_literal},0}.
{label,16}.
{gc_bif,binary_part,{f,0},0,[{literal,<<0,1,2>>},{integer,3},{integer,-2}],{x,0}}.
return.

{function,predicate_tail,1,18}.
{label,17}.
{func_info,{atom,raw_bif_body},{atom,predicate_tail},1}.
{label,18}.
{call_ext_only,1,{extfunc,erlang,is_binary,1}}.

{function,predicate_last,1,20}.
{label,19}.
{func_info,{atom,raw_bif_body},{atom,predicate_last},1}.
{label,20}.
{allocate,0,1}.
{call_ext_last,1,{extfunc,erlang,is_list,1},0}.

{function,predicate_call,1,22}.
{label,21}.
{func_info,{atom,raw_bif_body},{atom,predicate_call},1}.
{label,22}.
{allocate,0,1}.
{call_ext,1,{extfunc,erlang,is_atom,1}}.
{test_heap,3,1}.
{put_tuple2,{x,0},{list,[{atom,result},{x,0}]}}.
{deallocate,0}.
return.

{function,bits_call_tail,1,30}.
{label,29}.
{func_info,{atom,raw_bif_body},{atom,bits_call_tail},1}.
{label,30}.
{call_ext_only,1,{extfunc,erlang,bit_size,1}}.

{function,part2_call_last,2,32}.
{label,31}.
{func_info,{atom,raw_bif_body},{atom,part2_call_last},2}.
{label,32}.
{allocate,0,2}.
{call_ext_last,2,{extfunc,erlang,binary_part,2},0}.

{function,part3_call,3,34}.
{label,33}.
{func_info,{atom,raw_bif_body},{atom,part3_call},3}.
{label,34}.
{allocate,0,3}.
{call_ext,3,{extfunc,erlang,binary_part,3}}.
{test_heap,3,1}.
{put_tuple2,{x,0},{list,[{atom,result},{x,0}]}}.
{deallocate,0}.
return.

{function,head_call_tail,1,24}.
{label,23}.
{func_info,{atom,raw_bif_body},{atom,head_call_tail},1}.
{label,24}.
{call_ext_only,1,{extfunc,erlang,hd,1}}.

{function,element_call_last,2,26}.
{label,25}.
{func_info,{atom,raw_bif_body},{atom,element_call_last},2}.
{label,26}.
{allocate,0,2}.
{call_ext_last,2,{extfunc,erlang,element,2},0}.

{function,length_call,1,28}.
{label,27}.
{func_info,{atom,raw_bif_body},{atom,length_call},1}.
{label,28}.
{allocate,0,1}.
{call_ext,1,{extfunc,erlang,length,1}}.
{test_heap,3,1}.
{put_tuple2,{x,0},{list,[{atom,result},{x,0}]}}.
{deallocate,0}.
return.

{function,abs_call_tail,1,36}.
{label,35}.
{func_info,{atom,raw_bif_body},{atom,abs_call_tail},1}.
{label,36}.
{call_ext_only,1,{extfunc,erlang,abs,1}}.

{function,round_call_last,1,38}.
{label,37}.
{func_info,{atom,raw_bif_body},{atom,round_call_last},1}.
{label,38}.
{allocate,0,1}.
{call_ext_last,1,{extfunc,erlang,round,1},0}.

{function,float_call,1,40}.
{label,39}.
{func_info,{atom,raw_bif_body},{atom,float_call},1}.
{label,40}.
{allocate,0,1}.
{call_ext,1,{extfunc,erlang,float,1}}.
{test_heap,3,1}.
{put_tuple2,{x,0},{list,[{atom,result},{x,0}]}}.
{deallocate,0}.
return.
