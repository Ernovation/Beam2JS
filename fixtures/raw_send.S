{module,raw_send}.
{exports,[{tail,2},{last,2},{call,2},{operator,2}]}.
{attributes,[]}.
{labels,9}.

{function,tail,2,2}.
{label,1}.
{func_info,{atom,raw_send},{atom,tail},2}.
{label,2}.
{call_ext_only,2,{extfunc,erlang,send,2}}.

{function,last,2,4}.
{label,3}.
{func_info,{atom,raw_send},{atom,last},2}.
{label,4}.
{allocate,0,2}.
{call_ext_last,2,{extfunc,erlang,send,2},0}.

{function,call,2,6}.
{label,5}.
{func_info,{atom,raw_send},{atom,call},2}.
{label,6}.
{allocate,0,2}.
{call_ext,2,{extfunc,erlang,send,2}}.
{test_heap,2,1}.
{put_tuple2,{x,0},{list,[{x,0}]}}.
{deallocate,0}.
return.

{function,operator,2,8}.
{label,7}.
{func_info,{atom,raw_send},{atom,operator},2}.
{label,8}.
{call_ext_only,2,{extfunc,erlang,'!',2}}.
