{module,raw_bifs}.
{exports,[{self_pid,0},{head_guard,1},{head_body,1},{element_guard,2},
          {neg_guard,1},{add_guard,2},{add_body,2},{part_guard,3}]}.
{attributes,[]}.
{labels,22}.

{function,self_pid,0,2}.
{label,1}.
{func_info,{atom,raw_bifs},{atom,self_pid},0}.
{label,2}.
{bif,self,{f,0},[],{x,0}}.
return.

{function,head_guard,1,4}.
{label,3}.
{func_info,{atom,raw_bifs},{atom,head_guard},1}.
{label,4}.
{bif,hd,{f,5},[{x,0}],{x,0}}.
return.
{label,5}.
{move,{atom,failed},{x,0}}.
return.

{function,head_body,1,7}.
{label,6}.
{func_info,{atom,raw_bifs},{atom,head_body},1}.
{label,7}.
{bif,hd,{f,0},[{x,0}],{x,0}}.
return.

{function,element_guard,2,9}.
{label,8}.
{func_info,{atom,raw_bifs},{atom,element_guard},2}.
{label,9}.
{bif,element,{f,10},[{x,0},{x,1}],{x,0}}.
return.
{label,10}.
{move,{atom,failed},{x,0}}.
return.

{function,neg_guard,1,12}.
{label,11}.
{func_info,{atom,raw_bifs},{atom,neg_guard},1}.
{label,12}.
{gc_bif,'-',{f,13},1,[{x,0}],{x,0}}.
return.
{label,13}.
{move,{atom,failed},{x,0}}.
return.

{function,add_guard,2,15}.
{label,14}.
{func_info,{atom,raw_bifs},{atom,add_guard},2}.
{label,15}.
{gc_bif,'+',{f,16},2,[{x,0},{x,1}],{x,0}}.
return.
{label,16}.
{move,{atom,failed},{x,0}}.
return.

{function,add_body,2,18}.
{label,17}.
{func_info,{atom,raw_bifs},{atom,add_body},2}.
{label,18}.
{gc_bif,'+',{f,0},2,[{x,0},{x,1}],{x,0}}.
return.

{function,part_guard,3,20}.
{label,19}.
{func_info,{atom,raw_bifs},{atom,part_guard},3}.
{label,20}.
{gc_bif,binary_part,{f,21},3,[{x,0},{x,1},{x,2}],{x,0}}.
return.
{label,21}.
{move,{atom,failed},{x,0}}.
return.
