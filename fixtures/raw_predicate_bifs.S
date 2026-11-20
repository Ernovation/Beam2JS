{module,raw_predicate_bifs}.
{exports,[{register,2},{literal_atom,0},{literal_integer,0}]}.
{attributes,[]}.
{labels,7}.

{function,register,2,2}.
{label,1}.
{func_info,{atom,raw_predicate_bifs},{atom,register},2}.
{label,2}.
{bif,is_integer,{f,0},[{x,1}],{x,1}}.
{move,{x,1},{x,0}}.
return.

{function,literal_atom,0,4}.
{label,3}.
{func_info,{atom,raw_predicate_bifs},{atom,literal_atom},0}.
{label,4}.
{bif,is_boolean,{f,0},[{atom,true}],{x,0}}.
return.

{function,literal_integer,0,6}.
{label,5}.
{func_info,{atom,raw_predicate_bifs},{atom,literal_integer},0}.
{label,6}.
{bif,is_atom,{f,0},[{integer,42}],{x,0}}.
return.
