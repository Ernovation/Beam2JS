{module,raw_scheduler}.
{exports,[{busy,1}]}.
{attributes,[]}.
{labels,4}.

{function,busy,1,2}.
{label,1}.
{func_info,{atom,raw_scheduler},{atom,busy},1}.
{label,2}.
{test,is_eq_exact,{f,3},[{x,0},{integer,0}]}.
{move,{atom,done},{x,0}}.
return.
{label,3}.
{gc_bif,'-',{f,0},1,[{x,0},{integer,1}],{x,0}}.
{jump,{f,2}}.
