{module,raw_spawn}.
{exports,[{tail,3},{last,3},{call,3}]}.
{attributes,[]}.
{labels,7}.

{function,tail,3,2}.
{label,1}.
{func_info,{atom,raw_spawn},{atom,tail},3}.
{label,2}.
{call_ext_only,3,{extfunc,erlang,spawn,3}}.

{function,last,3,4}.
{label,3}.
{func_info,{atom,raw_spawn},{atom,last},3}.
{label,4}.
{allocate,0,3}.
{call_ext_last,3,{extfunc,erlang,spawn,3},0}.

{function,call,3,6}.
{label,5}.
{func_info,{atom,raw_spawn},{atom,call},3}.
{label,6}.
{allocate,0,3}.
{call_ext,3,{extfunc,erlang,spawn,3}}.
{test_heap,2,1}.
{put_tuple2,{x,0},{list,[{x,0}]}}.
{deallocate,0}.
return.
