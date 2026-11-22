{module,raw_dictionary}.
{exports,[{read_tail,1},{read_last,1},{read_call,1}]}.
{attributes,[]}.
{labels,7}.

{function,read_tail,1,2}.
{label,1}.
{func_info,{atom,raw_dictionary},{atom,read_tail},1}.
{label,2}.
{call_ext_only,1,{extfunc,erlang,get,1}}.

{function,read_last,1,4}.
{label,3}.
{func_info,{atom,raw_dictionary},{atom,read_last},1}.
{label,4}.
{allocate,0,1}.
{call_ext_last,1,{extfunc,erlang,get,1},0}.

{function,read_call,1,6}.
{label,5}.
{func_info,{atom,raw_dictionary},{atom,read_call},1}.
{label,6}.
{allocate,0,1}.
{call_ext,1,{extfunc,erlang,get,1}}.
{test_heap,2,1}.
{put_tuple2,{x,0},{list,[{x,0}]}}.
{deallocate,0}.
return.
