{module,raw_predicate_bifs}.
{exports,[{register,2},{literal_atom,0},{literal_integer,0},
          {binary_register,2},{bits_register,2},{binary_literal,0},{bits_literal,0}]}.
{attributes,[]}.
{labels,15}.

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

{function,binary_register,2,8}.
{label,7}.
{func_info,{atom,raw_predicate_bifs},{atom,binary_register},2}.
{label,8}.
{bif,is_binary,{f,0},[{tr,{x,1},any}],{x,1}}.
{move,{x,1},{x,0}}.
return.

{function,bits_register,2,10}.
{label,9}.
{func_info,{atom,raw_predicate_bifs},{atom,bits_register},2}.
{label,10}.
{bif,is_bitstring,{f,0},[{x,1}],{x,1}}.
{move,{x,1},{x,0}}.
return.

{function,binary_literal,0,12}.
{label,11}.
{func_info,{atom,raw_predicate_bifs},{atom,binary_literal},0}.
{label,12}.
{bif,is_binary,{f,0},[{literal,<<5:3>>}],{x,0}}.
return.

{function,bits_literal,0,14}.
{label,13}.
{func_info,{atom,raw_predicate_bifs},{atom,bits_literal},0}.
{label,14}.
{bif,is_bitstring,{f,0},[{literal,<<>>}],{x,0}}.
return.
