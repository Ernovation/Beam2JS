{module,raw_identity}.
{exports,[{self_tail,0},{self_last,0},{self_call,0},
          {alive_tail,1},{alive_last,1},{alive_call,1}]}.
{attributes,[]}.
{labels,13}.

{function,self_tail,0,2}.
{label,1}.
{func_info,{atom,raw_identity},{atom,self_tail},0}.
{label,2}.
{call_ext_only,0,{extfunc,erlang,self,0}}.

{function,self_last,0,4}.
{label,3}.
{func_info,{atom,raw_identity},{atom,self_last},0}.
{label,4}.
{allocate,0,0}.
{call_ext_last,0,{extfunc,erlang,self,0},0}.

{function,self_call,0,6}.
{label,5}.
{func_info,{atom,raw_identity},{atom,self_call},0}.
{label,6}.
{allocate,0,0}.
{call_ext,0,{extfunc,erlang,self,0}}.
{test_heap,2,1}.
{put_tuple2,{x,0},{list,[{x,0}]}}.
{deallocate,0}.
return.

{function,alive_tail,1,8}.
{label,7}.
{func_info,{atom,raw_identity},{atom,alive_tail},1}.
{label,8}.
{call_ext_only,1,{extfunc,erlang,is_process_alive,1}}.

{function,alive_last,1,10}.
{label,9}.
{func_info,{atom,raw_identity},{atom,alive_last},1}.
{label,10}.
{allocate,0,1}.
{call_ext_last,1,{extfunc,erlang,is_process_alive,1},0}.

{function,alive_call,1,12}.
{label,11}.
{func_info,{atom,raw_identity},{atom,alive_call},1}.
{label,12}.
{allocate,0,1}.
{call_ext,1,{extfunc,erlang,is_process_alive,1}}.
{test_heap,2,1}.
{put_tuple2,{x,0},{list,[{x,0}]}}.
{deallocate,0}.
return.
