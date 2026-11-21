import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {ErlangError, Runtime} from '../runtime/beam2js.mjs';
import {registerDom} from '../examples/browser/dom.mjs';
import {callResults} from './call-cases.mjs';
import {matchResults} from './match-cases.mjs';
import {arithmeticResults} from './arithmetic-cases.mjs';

const dir = mkdtempSync(join(tmpdir(), 'beam2js-browser-'));
const compiler = resolve('_build/default/bin/beam2js');
const run = (command, args) => execFileSync(command, args, {encoding: 'utf8', timeout: 30000});
const source = path => readFileSync(resolve(path), 'utf8');

try {
  run('erlc', ['-o', dir, 'examples/browser/browser_demo.erl', 'fixtures/calls.erl',
    'fixtures/slice_helper.erl', 'fixtures/match_failures.erl', 'fixtures/arithmetic_body.erl',
    'fixtures/bif_body.erl']);
  const calls = join(dir, 'calls.beam');
  const stripped = join(dir, 'calls-stripped.beam');
  run('erl', ['-noshell', '-eval',
    '[Dir]=init:get_plain_arguments(), {ok,raw_stack}=compile:file("fixtures/raw_stack.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{ok,raw_failures}=compile:file("fixtures/raw_failures.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{ok,raw_bif_body}=compile:file("fixtures/raw_bif_body.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{ok,raw_arithmetic_body}=compile:file("fixtures/raw_arithmetic_body.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{ok,raw_float_registers}=compile:file("fixtures/raw_float_registers.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{beam_file,calls,_,_,_,Fs}=beam_disasm:file(filename:join(Dir,"calls.beam")), ' +
    '{function,stack,4,_,Is}=lists:keyfind(stack,2,Fs), ' +
    'true=lists:any(fun({init_yregs,_})->true;(_)->false end,Is), ' +
    'true=lists:any(fun({trim,_,_})->true;(_)->false end,Is), ' +
    '{beam_file,arithmetic_body,_,_,_,AFs}=beam_disasm:file(filename:join(Dir,"arithmetic_body.beam")), ' +
    '{function,divide,2,_,AIs}=lists:keyfind(divide,2,AFs), ' +
    'true=lists:any(fun({fconv,_,_})->true;(_)->false end,AIs), ' +
    'true=lists:any(fun({bif,fdiv,{f,0},_,_})->true;(_)->false end,AIs), ' +
    'true=lists:any(fun({fmove,_,_})->true;(_)->false end,AIs), ' +
    'true=lists:any(fun({test_heap,{alloc,_},_})->true;(_)->false end,AIs), ' +
    'lists:foreach(fun({Name,Op}) -> {function,Name,_,_,Code}=lists:keyfind(Name,2,AFs), ' +
    'true=lists:any(fun({bif,Actual,{f,0},_,_}) when Actual=:=Op -> true;(_)->false end,Code) end, ' +
    '[{ratio_add,fadd},{ratio_subtract,fsub},{ratio_multiply,fmul},{ratio_negate,fnegate}]), ' +
    'lists:foreach(fun({Name,Op}) -> {function,Name,_,_,Code}=lists:keyfind(Name,2,AFs), ' +
    'true=lists:any(fun({gc_bif,Actual,{f,0},_,_,_}) when Actual=:=Op -> true;(_)->false end,Code) end, ' +
    '[{quotient,\'div\'},{remainder,\'rem\'},{bit_and,\'band\'},{bit_or,\'bor\'},' +
    '{bit_xor,\'bxor\'},{bit_not,\'bnot\'},{absolute,abs},{truncate,trunc},' +
    '{round_value,round},{floor_value,floor},{ceil_value,ceil},{convert_float,float}]), ' +
    '{beam_file,bif_body,_,_,_,BFs}=beam_disasm:file(filename:join(Dir,"bif_body.beam")), ' +
    'lists:foreach(fun({Name,Op}) -> {function,Name,_,_,Code}=lists:keyfind(Name,2,BFs), ' +
    'true=lists:any(fun({bif,Actual,{f,0},_,_}) when Actual=:=Op -> true;(_)->false end,Code) end, ' +
    '[{head,hd},{tail,tl},{size,tuple_size},{element,element}]), ' +
    '{function,length,1,_,LenCode}=lists:keyfind(length,2,BFs), ' +
    'true=lists:any(fun({gc_bif,length,{f,0},_,_,_})->true;(_)->false end,LenCode), ' +
    'lists:foreach(fun({Name,Op}) -> {function,Name,_,_,Code}=lists:keyfind(Name,2,BFs), ' +
    'true=lists:any(fun({gc_bif,Actual,{f,0},_,_,_}) when Actual=:=Op -> true;(_)->false end,Code) end, ' +
    '[{bits,bit_size},{bytes,byte_size},{part,binary_part},{part2,binary_part}]), ' +
    '{beam_file,raw_bif_body,_,_,_,RFs}=beam_disasm:file(filename:join(Dir,"raw_bif_body.beam")), ' +
    'lists:foreach(fun({Name,Kind}) -> {function,Name,_,_,Code}=lists:keyfind(Name,2,RFs), ' +
    'true=lists:any(fun(I)->element(1,I)=:=Kind end,Code) end, ' +
    '[{predicate_tail,call_ext_only},{predicate_last,call_ext_last},{predicate_call,call_ext},' +
    '{head_call_tail,call_ext_only},{element_call_last,call_ext_last},{length_call,call_ext},' +
    '{bits_call_tail,call_ext_only},{part2_call_last,call_ext_last},{part3_call,call_ext}]), ' +
    'lists:foreach(fun(Name) -> Input=filename:join(Dir,Name++".beam"), ' +
    '{ok,B}=file:read_file(Input), {ok,{_,S}}=beam_lib:strip(B), ' +
    'ok=file:write_file(filename:join(Dir,Name++"-stripped.beam"),S) end, ' +
    '["calls","raw_stack","match_failures","raw_failures","arithmetic_body","raw_arithmetic_body","raw_float_registers","bif_body","raw_bif_body"]), halt().', '-extra', dir]);
  for (const [input, output] of [
    [calls, 'calls.mjs'], [stripped, 'calls-stripped.mjs'],
    [join(dir, 'raw_stack.beam'), 'raw_stack.mjs'],
    [join(dir, 'raw_stack-stripped.beam'), 'raw_stack-stripped.mjs'],
    [join(dir, 'match_failures.beam'), 'match_failures.mjs'],
    [join(dir, 'match_failures-stripped.beam'), 'match_failures-stripped.mjs'],
    [join(dir, 'raw_failures.beam'), 'raw_failures.mjs'],
    [join(dir, 'raw_failures-stripped.beam'), 'raw_failures-stripped.mjs'],
    [join(dir, 'arithmetic_body.beam'), 'arithmetic_body.mjs'],
    [join(dir, 'arithmetic_body-stripped.beam'), 'arithmetic_body-stripped.mjs'],
    [join(dir, 'raw_arithmetic_body.beam'), 'raw_arithmetic_body.mjs'],
    [join(dir, 'raw_arithmetic_body-stripped.beam'), 'raw_arithmetic_body-stripped.mjs'],
    [join(dir, 'raw_float_registers.beam'), 'raw_float_registers.mjs'],
    [join(dir, 'raw_float_registers-stripped.beam'), 'raw_float_registers-stripped.mjs'],
    [join(dir, 'bif_body.beam'), 'bif_body.mjs'],
    [join(dir, 'bif_body-stripped.beam'), 'bif_body-stripped.mjs'],
    [join(dir, 'raw_bif_body.beam'), 'raw_bif_body.mjs'],
    [join(dir, 'raw_bif_body-stripped.beam'), 'raw_bif_body-stripped.mjs'],
    [join(dir, 'slice_helper.beam'), 'slice_helper.mjs'],
    [join(dir, 'browser_demo.beam'), 'browser_demo.mjs'],
  ]) {
    run(compiler, [input, join(dir, output)]);
  }
  const oracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    'io:format("~w~n~w~n~w~n~w~n~w~n~w~n~w~n~w~n~w~n",' +
    '[calls:local(42),calls:remote(42),calls:nested(42,99),calls:wrapped(23),' +
    'calls:heap(23,99),calls:stack(11,22,33,44),raw_stack:shift(11,22,33),' +
    'raw_stack:empty(42),calls:depth(lists:seq(1,20000))]),halt().'
  ]).trimEnd().split('\n');
  const matchOracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    'Long=lists:seq(1,10000), LongImproper=lists:foldl(fun(X,Acc)->[X|Acc] end,tail,Long), ' +
    'Bin=(fun(<<_:3,B:32/bitstring,_/bitstring>>)->B end)(<<0:3,0,1,2,255,0:1013>>), ' +
    'Cases=[{match_failures,case_value,[yes]},{match_failures,case_value,[no]},' +
    '{match_failures,case_value,[other]},{match_failures,case_value,[17]},' +
    '{match_failures,case_value,[{tag,5}]},{match_failures,case_value,[<<5:3>>]},' +
    '{match_failures,match_value,[{ok,42}]},' +
    '{match_failures,match_value,[{error,42}]},{match_failures,match_value,[17]},' +
    '{match_failures,match_value,[[1|tail]]},{match_failures,match_value,[<<1,255>>]},' +
    '{match_failures,if_value,[yes]},' +
    '{match_failures,if_value,[no]},{match_failures,if_value,[other]},' +
    '{match_failures,only,[ok]},{match_failures,only,[other]},' +
    '{match_failures,across,[yes]},{match_failures,across,[other]},' +
    '{calls,match_remote,[yes]},{calls,match_remote,[other]},' +
    '{raw_failures,case_y,[{tag,5}]},{raw_failures,bad_literal,[]},' +
    '{bif_body,head,[[first,second]]},{bif_body,head,[[first|tail]]},' +
    '{bif_body,head,[[]]},{bif_body,head,[bad]},' +
    '{bif_body,tail,[[first]]},{bif_body,tail,[[first|tail]]},' +
    '{bif_body,tail,[[]]},{bif_body,tail,[17]},' +
    '{bif_body,size,[{}]},{bif_body,size,[{tag,5}]},{bif_body,size,[[]]},' +
    '{bif_body,element,[1,{tag,5}]},{bif_body,element,[2,{tag,5}]},' +
    '{bif_body,element,[0,{tag,5}]},{bif_body,element,[-1,{tag,5}]},' +
    '{bif_body,element,[3,{tag,5}]},{bif_body,element,[1 bsl 80,{tag,5}]},' +
    '{bif_body,element,[1.0,{tag,5}]},{bif_body,element,[1,bad]},' +
    '{bif_body,length,[[]]},{bif_body,length,[[first,second]]},' +
    '{bif_body,length,[[first|tail]]},{bif_body,length,[bad]},' +
    '{bif_body,length,[Long]},{bif_body,length,[LongImproper]},' +
    '{bif_body,head_across,[[first,second]]},{bif_body,head_across,[[]]},' +
    '{calls,bif_remote,[[first,second]]},{calls,bif_remote,[[]]},' +
    '{raw_bif_body,head_y,[[first|tail]]},{raw_bif_body,head_y,[[]]},' +
    '{raw_bif_body,element_alias,[2,{tag,5}]},{raw_bif_body,element_alias,[-1,{tag,5}]},' +
    '{raw_bif_body,length_y,[[first,second]]},{raw_bif_body,length_y,[[first|tail]]},' +
    '{raw_bif_body,length_literal,[]},' +
    '{bif_body,bits,[<<>>]},{bif_body,bits,[<<1,1:1>>]},{bif_body,bits,[Bin]},' +
    '{bif_body,bits,[bad]},{bif_body,bytes,[<<>>]},{bif_body,bytes,[<<1,1:1>>]},' +
    '{bif_body,bytes,[Bin]},{bif_body,bytes,[17]},' +
    '{bif_body,part,[Bin,1,2]},{bif_body,part,[Bin,4,-2]},' +
    '{bif_body,part,[Bin,0,0]},{bif_body,part,[Bin,4,0]},' +
    '{bif_body,part,[Bin,-1,1]},{bif_body,part,[Bin,0,-1]},' +
    '{bif_body,part,[Bin,4,1]},{bif_body,part,[Bin,1 bsl 80,0]},' +
    '{bif_body,part,[Bin,1,-(1 bsl 80)]},{bif_body,part,[Bin,1.0,1]},' +
    '{bif_body,part,[<<1,1:1>>,0,1]},{bif_body,part,[bad,0,0]},' +
    '{bif_body,part2,[Bin,{1,2}]},{bif_body,part2,[Bin,{4,-2}]},' +
    '{bif_body,part2,[Bin,{4,0}]},{bif_body,part2,[Bin,{0,-1}]},' +
    '{bif_body,part2,[Bin,{1}]},{bif_body,part2,[Bin,{1,2,3}]},' +
    '{bif_body,part2,[Bin,{bad,1}]},{bif_body,part2,[Bin,bad]},' +
    '{bif_body,part2,[<<1,1:1>>,{0,0}]},' +
    '{bif_body,part_across,[Bin,1,2]},{bif_body,part_across,[Bin,5,0]},' +
    '{raw_bif_body,bits_y,[<<1,1:1>>]},{raw_bif_body,bits_y,[bad]},' +
    '{raw_bif_body,part_alias,[Bin,1,2]},{raw_bif_body,part_alias,[Bin,0,-1]},' +
    '{raw_bif_body,part2_alias,[Bin,{4,-2}]},{raw_bif_body,part2_alias,[Bin,{4,1}]},' +
    '{raw_bif_body,part_literal,[]},' +
    '{raw_bif_body,predicate_tail,[Bin]},{raw_bif_body,predicate_tail,[<<1,1:1>>]},' +
    '{raw_bif_body,predicate_last,[[first|tail]]},{raw_bif_body,predicate_last,[bad]},' +
    '{raw_bif_body,predicate_call,[yes]},{raw_bif_body,predicate_call,[1]}] ++ ' +
    '[{erlang,N,[V]} || N <- [is_integer,is_number,is_atom,is_boolean,is_float,is_list,' +
    'is_tuple,is_binary,is_bitstring], V <- [0,1.5,true,other,[],[first|tail],{},Bin,<<1,1:1>>]] ++ ' +
    '[{erlang,hd,[[first,second]]},{erlang,hd,[[first|tail]]},{erlang,hd,[[]]},{erlang,hd,[bad]},' +
    '{erlang,tl,[[first]]},{erlang,tl,[[first|tail]]},{erlang,tl,[[]]},{erlang,tl,[{}]},' +
    '{erlang,length,[[]]},{erlang,length,[[first,second]]},{erlang,length,[[first|tail]]},' +
    '{erlang,length,[bad]},{erlang,length,[Long]},{erlang,length,[LongImproper]},' +
    '{erlang,tuple_size,[{}]},{erlang,tuple_size,[{tag,5}]},{erlang,tuple_size,[[]]},' +
    '{erlang,element,[1,{tag,5}]},{erlang,element,[2,{tag,5}]},{erlang,element,[0,{tag,5}]},' +
    '{erlang,element,[-1,{tag,5}]},{erlang,element,[3,{tag,5}]},{erlang,element,[1 bsl 80,{tag,5}]},' +
    '{erlang,element,[1.0,{tag,5}]},{erlang,element,[1,bad]},' +
    '{raw_bif_body,head_call_tail,[[first|tail]]},{raw_bif_body,head_call_tail,[[]]},' +
    '{raw_bif_body,element_call_last,[2,{tag,5}]},{raw_bif_body,element_call_last,[0,{tag,5}]},' +
    '{raw_bif_body,length_call,[[first,second]]},{raw_bif_body,length_call,[[first|tail]]},' +
    '{calls,callable_bif_remote,[[first,second]]},{calls,callable_bif_remote,[[first|tail]]},' +
    '{erlang,bit_size,[<<>>]},{erlang,bit_size,[<<1,1:1>>]},{erlang,bit_size,[Bin]},{erlang,bit_size,[bad]},' +
    '{erlang,byte_size,[<<>>]},{erlang,byte_size,[<<1,1:1>>]},{erlang,byte_size,[Bin]},{erlang,byte_size,[17]},' +
    '{erlang,binary_part,[Bin,1,2]},{erlang,binary_part,[Bin,4,-2]},' +
    '{erlang,binary_part,[Bin,0,0]},{erlang,binary_part,[Bin,4,0]},' +
    '{erlang,binary_part,[Bin,-1,1]},{erlang,binary_part,[Bin,0,-1]},' +
    '{erlang,binary_part,[Bin,4,1]},{erlang,binary_part,[Bin,1 bsl 80,0]},' +
    '{erlang,binary_part,[Bin,1,-(1 bsl 80)]},{erlang,binary_part,[Bin,1.0,1]},' +
    '{erlang,binary_part,[<<1,1:1>>,0,1]},{erlang,binary_part,[bad,0,0]},' +
    '{erlang,binary_part,[Bin,{1,2}]},{erlang,binary_part,[Bin,{4,-2}]},' +
    '{erlang,binary_part,[Bin,{4,0}]},{erlang,binary_part,[Bin,{0,-1}]},' +
    '{erlang,binary_part,[Bin,{1}]},{erlang,binary_part,[Bin,{1,2,3}]},' +
    '{erlang,binary_part,[Bin,{bad,1}]},{erlang,binary_part,[Bin,bad]},' +
    '{erlang,binary_part,[<<1,1:1>>,{0,0}]},' +
    '{raw_bif_body,bits_call_tail,[<<1,1:1>>]},{raw_bif_body,bits_call_tail,[bad]},' +
    '{raw_bif_body,part2_call_last,[Bin,{4,-2}]},{raw_bif_body,part2_call_last,[Bin,{0,-1}]},' +
    '{raw_bif_body,part3_call,[Bin,1,2]},{raw_bif_body,part3_call,[Bin,4,1]},' +
    '{calls,binary_bif_remote,[Bin,4,-2]},{calls,binary_bif_remote,[Bin,0,-1]}], ' +
    'lists:foreach(fun({M,F,A}) -> Result=try apply(M,F,A) of V->{ok,V} ' +
    'catch C:R->{C,R} end, io:format("~w~n",[Result]) end,Cases),halt().',
  ]).trimEnd().split('\n');
  const arithmeticOracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    'Huge=1 bsl 1024, MaxIntegerFloat=Huge-(1 bsl 971), FloatOverflowTie=Huge-(1 bsl 970), ' +
    'Max=1.7976931348623157e308, Tiny=5.0e-324, ' +
    'Cases=[{arithmetic_body,add,[2,3]},{arithmetic_body,add,[Huge,1]},' +
    '{arithmetic_body,add,[1.5,2]},{arithmetic_body,add,[9007199254740993,1.0]},' +
    '{arithmetic_body,add,[Huge,0.0]},{arithmetic_body,add,[bad,1]},' +
    '{arithmetic_body,subtract,[7,9]},{arithmetic_body,subtract,[-0.0,0.0]},' +
    '{arithmetic_body,subtract,[1,bad]},{arithmetic_body,multiply,[-7,3]},' +
    '{arithmetic_body,multiply,[Tiny,0.5]},{arithmetic_body,multiply,[Max,2.0]},' +
    '{arithmetic_body,divide,[5,2]},{arithmetic_body,divide,[-0.0,2.0]},' +
    '{arithmetic_body,divide,[0.0,-2.0]},{arithmetic_body,divide,[Tiny,2.0]},' +
    '{arithmetic_body,divide,[9007199254740993,2]},{arithmetic_body,divide,[MaxIntegerFloat,2]},' +
    '{arithmetic_body,divide,[1,0]},{arithmetic_body,divide,[1.0,-0.0]},' +
    '{arithmetic_body,divide,[Max,0.5]},{arithmetic_body,divide,[Huge,Huge]},' +
    '{arithmetic_body,divide,[bad,2]},{arithmetic_body,divide,[2,bad]},' +
    '{arithmetic_body,divide_across,[5,2]},{arithmetic_body,divide_across,[5,0]},' +
    '{arithmetic_body,ratio_add,[3,2,7,2]},{arithmetic_body,ratio_add,[-0.0,1,-0.0,1]},' +
    '{arithmetic_body,ratio_add,[Max,1,Max,1]},{arithmetic_body,ratio_add,[1,1,bad,1]},' +
    '{arithmetic_body,ratio_subtract,[1,2,3,2]},{arithmetic_body,ratio_subtract,[-0.0,1,0.0,1]},' +
    '{arithmetic_body,ratio_subtract,[Max,1,-Max,1]},' +
    '{arithmetic_body,ratio_multiply,[3,2,-4,2]},{arithmetic_body,ratio_multiply,[-0.0,1,2,1]},' +
    '{arithmetic_body,ratio_multiply,[Tiny,1,0.5,1]},{arithmetic_body,ratio_multiply,[Max,1,2,1]},' +
    '{arithmetic_body,ratio_negate,[0.0,1]},{arithmetic_body,ratio_negate,[-0.0,1]},' +
    '{arithmetic_body,ratio_negate,[1,0]},' +
    '{arithmetic_body,quotient,[-7,3]},{arithmetic_body,quotient,[-7,-3]},' +
    '{arithmetic_body,quotient,[Huge,3]},{arithmetic_body,quotient,[1,0]},' +
    '{arithmetic_body,quotient,[1,2.0]},{arithmetic_body,quotient,[bad,2]},' +
    '{arithmetic_body,remainder,[-7,3]},{arithmetic_body,remainder,[7,-3]},' +
    '{arithmetic_body,remainder,[Huge,-7]},{arithmetic_body,remainder,[1,0]},' +
    '{arithmetic_body,remainder,[1.0,2]},' +
    '{arithmetic_body,bit_and,[-5,3]},{arithmetic_body,bit_and,[Huge,-1]},' +
    '{arithmetic_body,bit_and,[1.0,1]},{arithmetic_body,bit_or,[-5,2]},' +
    '{arithmetic_body,bit_or,[Huge,5]},{arithmetic_body,bit_or,[1,bad]},' +
    '{arithmetic_body,bit_xor,[-5,3]},{arithmetic_body,bit_xor,[Huge,-1]},' +
    '{arithmetic_body,bit_xor,[bad,1]},{arithmetic_body,bit_not,[0]},' +
    '{arithmetic_body,bit_not,[-5]},{arithmetic_body,bit_not,[Huge]},' +
    '{arithmetic_body,bit_not,[1.0]},{arithmetic_body,quotient_across,[7,3]},' +
    '{arithmetic_body,quotient_across,[7,0]},' +
    '{arithmetic_body,absolute,[-Huge]},{arithmetic_body,absolute,[-0.0]},' +
    '{arithmetic_body,absolute,[-Tiny]},{arithmetic_body,absolute,[bad]},' +
    '{arithmetic_body,truncate,[-1.9]},{arithmetic_body,truncate,[1.9]},' +
    '{arithmetic_body,truncate,[Huge]},{arithmetic_body,truncate,[Max]},' +
    '{arithmetic_body,truncate,[-0.0]},' +
    '{arithmetic_body,truncate,[bad]},{arithmetic_body,round_value,[-1.5]},' +
    '{arithmetic_body,round_value,[1.5]},{arithmetic_body,round_value,[-0.5]},' +
    '{arithmetic_body,round_value,[0.49999999999999994]},{arithmetic_body,round_value,[-Max]},' +
    '{arithmetic_body,round_value,[bad]},' +
    '{arithmetic_body,floor_value,[-1.9]},{arithmetic_body,floor_value,[-Tiny]},' +
    '{arithmetic_body,floor_value,[Huge]},{arithmetic_body,floor_value,[bad]},' +
    '{arithmetic_body,ceil_value,[1.9]},{arithmetic_body,ceil_value,[Tiny]},' +
    '{arithmetic_body,ceil_value,[-1.9]},{arithmetic_body,ceil_value,[bad]},' +
    '{arithmetic_body,convert_float,[0]},{arithmetic_body,convert_float,[9007199254740993]},' +
    '{arithmetic_body,convert_float,[MaxIntegerFloat]},{arithmetic_body,convert_float,[FloatOverflowTie-1]},' +
    '{arithmetic_body,convert_float,[FloatOverflowTie]},{arithmetic_body,convert_float,[-FloatOverflowTie+1]},' +
    '{arithmetic_body,convert_float,[-FloatOverflowTie]},{arithmetic_body,convert_float,[Huge]},' +
    '{arithmetic_body,convert_float,[-0.0]},{arithmetic_body,convert_float,[bad]},' +
    '{arithmetic_body,absolute_across,[-7]},{arithmetic_body,absolute_across,[bad]},' +
    '{raw_arithmetic_body,absolute_y,[-0.0]},{raw_arithmetic_body,absolute_y,[bad]},' +
    '{raw_arithmetic_body,round_alias,[-1.5]},{raw_arithmetic_body,round_alias,[bad]},' +
    '{raw_arithmetic_body,ceil_literal,[]},{raw_arithmetic_body,float_y,[9007199254740993]},' +
    '{raw_arithmetic_body,float_y,[Huge]},' +
    '{raw_arithmetic_body,quotient_alias,[-7,3]},{raw_arithmetic_body,quotient_alias,[1,0]},' +
    '{raw_arithmetic_body,quotient_alias,[1,bad]},{raw_arithmetic_body,remainder_literal,[-7]},' +
    '{raw_arithmetic_body,remainder_literal,[bad]},{raw_arithmetic_body,band_y,[-5,3]},' +
    '{raw_arithmetic_body,band_y,[bad,3]},{raw_arithmetic_body,bnot_alias,[Huge]},' +
    '{raw_arithmetic_body,bnot_alias,[bad]},' +
    '{raw_float_registers,add_alias,[3,4]},{raw_float_registers,add_alias,[-0.0,-0.0]},' +
    '{raw_float_registers,add_alias,[Max,Max]},{raw_float_registers,subtract_alias,[3,9]},' +
    '{raw_float_registers,subtract_alias,[Max,-Max]},{raw_float_registers,multiply_alias,[2.5]},' +
    '{raw_float_registers,multiply_alias,[-0.0]},{raw_float_registers,multiply_alias,[Max]},' +
    '{raw_float_registers,negate_distinct,[0.0]},{raw_float_registers,negate_distinct,[-0.0]},' +
    '{raw_float_registers,divide_alias,[7,2]},{raw_float_registers,divide_alias,[-0.0,-2.0]},' +
    '{raw_float_registers,divide_alias,[7,0]},{raw_float_registers,move_float,[-0.0]},' +
    '{raw_float_registers,move_float,[3]},{raw_float_registers,convert_y,[9007199254740993]},' +
    '{raw_float_registers,convert_y,[-0.0]},{raw_float_registers,convert_y,[Huge]},' +
    '{raw_float_registers,convert_y,[bad]},{raw_float_registers,literals,[]},' +
    '{raw_arithmetic_body,divide,[5,2]},{raw_arithmetic_body,divide,[-0.0,2.0]},' +
    '{raw_arithmetic_body,divide,[0.0,-2.0]},{raw_arithmetic_body,divide,[1,0]},' +
    '{raw_arithmetic_body,divide,[1.0,-0.0]},{raw_arithmetic_body,divide,[Max,0.5]},' +
    '{raw_arithmetic_body,divide,[Huge,Huge]},{arithmetic_body,negate,[5]},' +
    '{arithmetic_body,negate,[-0.0]},{arithmetic_body,negate,[bad]},' +
    '{arithmetic_body,across,[2,3]},{arithmetic_body,across,[bad,3]},' +
    '{raw_arithmetic_body,add_alias,[3,4]},{raw_arithmetic_body,add_alias,[3,bad]},' +
    '{raw_arithmetic_body,divide_literal,[5]},{raw_arithmetic_body,divide_literal,[bad]},' +
    '{raw_arithmetic_body,add_y,[7,8]},{raw_arithmetic_body,add_y,[bad,8]},' +
    '{raw_arithmetic_body,negate,[0.0]},{raw_arithmetic_body,negate,[bad]}], ' +
    'Format=fun F(V) when is_integer(V) -> integer_to_list(V); ' +
    'F(V) when is_float(V) -> <<Bits:64>> = <<V:64/float>>, io_lib:format("float:~16.16.0b",[Bits]); ' +
    'F(V) when is_atom(V) -> atom_to_list(V); ' +
    'F(V) when is_tuple(V) -> ["{",lists:join(",",[F(X) || X <- tuple_to_list(V)]),"}"] end, ' +
    'lists:foreach(fun({M,N,A}) -> Result=try apply(M,N,A) of V->["ok:",Format(V)] ' +
    'catch C:R->[atom_to_list(C),":",atom_to_list(R)] end, io:format("~ts~n",[Result]) end,Cases),halt().',
  ]).trimEnd().split('\n');

  for (const [file, raw, match, rawFail, arithmetic, rawArithmetic, rawFloat, bifBody, rawBifBody] of [
    ['calls.mjs', 'raw_stack.mjs', 'match_failures.mjs', 'raw_failures.mjs',
      'arithmetic_body.mjs', 'raw_arithmetic_body.mjs', 'raw_float_registers.mjs',
      'bif_body.mjs', 'raw_bif_body.mjs'],
    ['calls-stripped.mjs', 'raw_stack-stripped.mjs', 'match_failures-stripped.mjs', 'raw_failures-stripped.mjs',
      'arithmetic_body-stripped.mjs', 'raw_arithmetic_body-stripped.mjs', 'raw_float_registers-stripped.mjs',
      'bif_body-stripped.mjs', 'raw_bif_body-stripped.mjs'],
  ]) {
    const rt = new Runtime();
    (await import(pathToFileURL(join(dir, file)))).register(rt);
    (await import(pathToFileURL(join(dir, raw)))).register(rt);
    (await import(pathToFileURL(join(dir, match)))).register(rt);
    (await import(pathToFileURL(join(dir, rawFail)))).register(rt);
    (await import(pathToFileURL(join(dir, arithmetic)))).register(rt);
    (await import(pathToFileURL(join(dir, rawArithmetic)))).register(rt);
    (await import(pathToFileURL(join(dir, rawFloat)))).register(rt);
    (await import(pathToFileURL(join(dir, bifBody)))).register(rt);
    (await import(pathToFileURL(join(dir, rawBifBody)))).register(rt);
    (await import(pathToFileURL(join(dir, 'slice_helper.mjs')))).register(rt);
    assert.deepEqual(callResults(rt), oracle);
    assert.deepEqual(matchResults(rt), matchOracle);
    assert.deepEqual(arithmeticResults(rt), arithmeticOracle);
    const handle = rt.hostHandle({});
    assert.throws(() => rt.invoke('match_failures', 'case_value', [handle]),
      error => error instanceof ErlangError && error.erlangClass === 'error' &&
        rt.tupleElement(error.reason, 1) === rt.atom('case_clause') &&
        rt.tupleElement(error.reason, 2) === handle);
    assert.throws(() => rt.invoke('calls', 'depth', [1n]), /function_clause/);
  }

  const missingDependency = new Runtime();
  (await import(pathToFileURL(join(dir, 'calls.mjs')))).register(missingDependency);
  assert.throws(() => missingDependency.invoke('calls', 'remote', [1n]),
    /undefined or unsupported function: slice_helper:id\/1/);
  const nestedHostError = new Error('nested host failure');
  missingDependency.registerModule(19, 'slice_helper', [{
    name: 'id', arity: 1, exported: true,
    run: () => { throw nestedHostError; },
  }]);
  assert.throws(() => missingDependency.invoke('calls', 'remote', [1n]),
    error => error === nestedHostError && !(error instanceof ErlangError));

  const bifRuntime = new Runtime();
  bifRuntime.registerModule(19, 'erlang', [
    {name: 'is_atom', arity: 1, exported: true, run: () => ({type: 'return', value: bifRuntime.atom('shadow')})},
    {name: 'hd', arity: 1, exported: true, run: () => ({type: 'return', value: bifRuntime.atom('shadow')})},
    {name: 'hd', arity: 2, exported: true, run: (_, [value]) => ({type: 'return', value})},
    {name: 'binary_part', arity: 2, exported: true, run: () => ({type: 'return', value: bifRuntime.atom('shadow')})},
    {name: 'other', arity: 1, exported: true, run: (_, [value]) => ({type: 'return', value})},
  ]);
  assert.equal(bifRuntime.invoke('erlang', 'is_atom', [bifRuntime.atom('ok')]), bifRuntime.atom('true'));
  assert.equal(bifRuntime.invoke('erlang', 'is_atom', [bifRuntime.hostHandle({})]), bifRuntime.atom('false'));
  const bifHandle = bifRuntime.hostHandle({});
  assert.equal(bifRuntime.invoke('erlang', 'hd', [bifRuntime.cons(bifHandle, bifRuntime.nil())]), bifHandle);
  assert.equal(bifRuntime.invoke('erlang', 'hd', [1n, 2n]), 1n);
  assert.throws(() => bifRuntime.invoke('erlang', 'hd', [bifRuntime.nil()]),
    error => error instanceof ErlangError && error.erlangClass === 'error' && error.reason === bifRuntime.atom('badarg'));
  assert.throws(() => bifRuntime.invoke('erlang', 'element', [1n]), /undefined or unsupported/);
  const mutableBytes = [1, 2, 3];
  const sourceBytes = bifRuntime.bitstring(mutableBytes, 24);
  const part = bifRuntime.invoke('erlang', 'binary_part', [sourceBytes, bifRuntime.tuple([1n, 2n])]);
  mutableBytes[1] = 9;
  const exportedBytes = bifRuntime.bitstringBytes(part);
  exportedBytes[0] = 9;
  assert.deepEqual(Array.from(bifRuntime.bitstringBytes(part)), [2, 3]);
  assert.throws(() => bifRuntime.invoke('erlang', 'binary_part', [sourceBytes]), /undefined or unsupported/);
  assert.throws(() => bifRuntime.invoke('erlang', 'binary_part', [sourceBytes, 0n, -1n]),
    error => error instanceof ErlangError && error.erlangClass === 'error' && error.reason === bifRuntime.atom('badarg'));
  assert.equal(bifRuntime.invoke('erlang', 'other', [1n]), 1n);
  assert.throws(() => bifRuntime.invoke('erlang', 'is_atom', []), /undefined or unsupported/);
  assert.throws(() => bifRuntime.invoke('erlang', 'is_map', [1n]), /undefined or unsupported/);

  const rt = new Runtime();
  const object = {};
  const handle = rt.hostHandle(object);
  const another = rt.hostHandle({});
  assert.equal(rt.hostHandle(object), handle);
  assert.equal(rt.hostValue(handle), object);
  assert.ok(rt.equalExact(handle, rt.hostHandle(object)));
  assert.ok(!rt.equalExact(handle, another));
  assert.ok(rt.compare(handle, another) < 0);
  assert.equal(rt.compare(rt.tuple([handle]), rt.tuple([handle])), 0);
  assert.ok(rt.equalExact(rt.tuple([handle]), rt.tuple([rt.hostHandle(object)])));
  assert.ok(!rt.isType('is_tuple', handle));
  assert.throws(() => rt.hostHandle(null), /object or function/);
  assert.throws(() => rt.hostValue({}), /host handle/);
  assert.throws(() => new Runtime().hostValue(handle), /host handle/);
  assert.throws(() => rt.invoke('missing', 'f', [{}]), /supported Erlang terms/);
  rt.registerModule(19, 'bad_host', [{
    name: 'invalid', arity: 0, exported: true,
    run: () => ({type: 'return', value: {}}),
  }]);
  assert.throws(() => rt.invoke('bad_host', 'invalid', []), /return value/);
  const hostError = new Error('host failure');
  rt.registerModule(19, 'throwing_host', [{
    name: 'fail', arity: 0, exported: true,
    run: () => { throw hostError; },
  }]);
  assert.throws(() => rt.invoke('throwing_host', 'fail', []),
    error => error === hostError && !(error instanceof ErlangError));
  assert.throws(() => rt.raiseError({}), /supported Erlang term/);
  const stack = rt.allocate(null, 3);
  rt.writeY(stack, 0, 1n);
  rt.writeY(stack, 2, 3n);
  rt.initYregs(stack, [0]);
  assert.equal(rt.readY(stack, 0), rt.nil());
  const shifted = rt.trim(stack, 1, 2);
  assert.throws(() => rt.readY(shifted, 0), /uninitialized/);
  assert.equal(rt.readY(shifted, 1), 3n);
  assert.throws(() => rt.initYregs(stack, [2, 1]), /invalid y register initialization/);
  rt.writeY(stack, 0, 9n);
  assert.throws(() => rt.initYregs(stack, [0, 3]), /invalid y register initialization/);
  assert.equal(rt.readY(stack, 0), 9n);
  assert.equal(rt.readY(stack, 2), 3n);
  assert.throws(() => rt.initYregs(null, [0]), /invalid y register initialization/);
  assert.throws(() => rt.trim(null, 0, 0), /invalid stack trim/);
  assert.throws(() => rt.trim(stack, 2, 2), /invalid stack trim/);

  run('erl', ['-noshell', '-eval',
    '[Dir]=init:get_plain_arguments(), ' +
    'Build=fun(Name,Op) -> Is=[{label,1},{func_info,{atom,Name},{atom,check},0},' +
    '{label,2},Op,return], {ok,B}=beam_asm:module({Name,[{check,0}],[],#{},' +
    '[{function,check,0,2,Is}],3},[],[],[]), ' +
    'ok=file:write_file(filename:join(Dir,atom_to_list(Name)++".beam"),B) end, ' +
    'Build(init_empty,{init_yregs,{list,[]}}), ' +
    'Build(init_duplicate,{init_yregs,{list,[{y,0},{y,0}]}}), ' +
    'Build(init_unsorted,{init_yregs,{list,[{y,1},{y,0}]}}), ' +
    'Build(init_limit,{init_yregs,{list,[{y,1024}]}}), ' +
    'Build(trim_limit,{trim,1025,0}), ' +
    'Build(fconv_limit,{fconv,{integer,1},{fr,1023}}), ' +
    'Build(fdiv_branch,{bif,fdiv,{f,2},[{fr,0},{fr,1}],{fr,0}}), ' +
    'Build(fadd_branch,{bif,fadd,{f,2},[{fr,0},{fr,1}],{fr,0}}), ' +
    'Build(fnegate_branch,{bif,fnegate,{f,2},[{fr,0}],{fr,0}}), ' +
    'Build(fnegate_limit,{bif,fnegate,{f,0},[{fr,1023}],{fr,0}}), ' +
    'Build(heap_duplicate,{test_heap,{alloc,[{floats,1},{floats,1}]},0}), ' +
    'Build(fread_uninitialized,{fmove,{fr,0},{x,0}}), ' +
    'Build(fnegate_uninitialized,{bif,fnegate,{f,0},[{fr,0}],{fr,1}}), halt().', '-extra', dir]);
  const preserved = join(dir, 'preserved.mjs');
  for (const [file, message] of [
    ['init_empty', /unsupported instruction \{init_yregs/],
    ['init_duplicate', /invalid y register initialization order/],
    ['init_unsorted', /invalid y register initialization order/],
    ['init_limit', /invalid y register initialization/],
    ['trim_limit', /unsupported instruction \{trim/],
    ['fconv_limit', /unsupported instruction \{fconv/],
    ['fdiv_branch', /unsupported instruction \{bif,fdiv/],
    ['fadd_branch', /unsupported instruction \{bif,fadd/],
    ['fnegate_branch', /unsupported instruction \{bif,fnegate/],
    ['fnegate_limit', /unsupported instruction \{bif,fnegate/],
    ['heap_duplicate', /invalid heap allocation list/],
  ]) {
    writeFileSync(preserved, 'existing output');
    const invalid = spawnSync(compiler, [join(dir, `${file}.beam`), preserved],
      {encoding: 'utf8', timeout: 30000});
    assert.notEqual(invalid.status, 0, file);
    assert.match(invalid.stderr, message, file);
    assert.equal(readFileSync(preserved, 'utf8'), 'existing output');
  }
  for (const name of ['fread_uninitialized', 'fnegate_uninitialized']) {
    const uninitialized = join(dir, `${name}.mjs`);
    run(compiler, [join(dir, `${name}.beam`), uninitialized]);
    const invalidFloatRuntime = new Runtime();
    (await import(pathToFileURL(uninitialized))).register(invalidFloatRuntime);
    assert.throws(() => invalidFloatRuntime.invoke(name, 'check', []),
      /uninitialized floating-point register 0/);
  }

  const element = {value: '', append(value) { this.value += value; }};
  registerDom(rt, {getElementById: id => id === 'message' ? element : null});
  const binary = value => {
    const bytes = new TextEncoder().encode(value);
    return rt.bitstring(bytes, bytes.length * 8);
  };
  const elementHandle = rt.invoke('dom', 'element_by_id', [binary('message')]);
  assert.equal(elementHandle, rt.invoke('dom', 'element_by_id', [binary('message')]));
  assert.equal(rt.invoke('dom', 'append_text', [elementHandle, binary('héllo')]), rt.atom('ok'));
  assert.equal(element.value, 'héllo');
  assert.throws(() => rt.invoke('dom', 'element_by_id', [binary('absent')]), /not found/);
  assert.throws(() => rt.invoke('dom', 'append_text', [handle, binary('x')]), /not obtained/);
  assert.throws(() => rt.invoke('dom', 'append_text', [elementHandle, rt.bitstring([128], 1)]), /UTF-8 binary/);
  assert.throws(() => rt.invoke('dom', 'element_by_id', [rt.bitstring([255], 8)]), TypeError);
  const brokenElement = {append() { throw new Error('DOM append failed'); }};
  const brokenRuntime = new Runtime();
  registerDom(brokenRuntime, {getElementById: () => brokenElement});
  const brokenHandle = brokenRuntime.invoke('dom', 'element_by_id', [binary('message')]);
  assert.throws(() => brokenRuntime.invoke('dom', 'append_text', [brokenHandle, binary('x')]),
    /DOM append failed/);
  (await import(pathToFileURL(join(dir, 'browser_demo.mjs')))).register(rt);
  assert.equal(rt.invoke('browser_demo', 'run', []), rt.atom('ok'));
  assert.equal(element.value, 'hélloHello from Erlang!');

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const resources = new Map([
      ['/examples/browser/', ['text/html', source('examples/browser/index.html')]],
      ['/examples/browser/main.mjs', ['text/javascript', source('examples/browser/main.mjs')]],
      ['/examples/browser/dom.mjs', ['text/javascript', source('examples/browser/dom.mjs')]],
      ['/examples/browser/browser_demo.mjs', ['text/javascript', readFileSync(join(dir, 'browser_demo.mjs'), 'utf8')]],
      ['/runtime/beam2js.mjs', ['text/javascript', source('runtime/beam2js.mjs')]],
      ['/test/call-cases.mjs', ['text/javascript', source('test/call-cases.mjs')]],
      ['/test/match-cases.mjs', ['text/javascript', source('test/match-cases.mjs')]],
      ['/test/arithmetic-cases.mjs', ['text/javascript', source('test/arithmetic-cases.mjs')]],
      ...['calls.mjs', 'calls-stripped.mjs', 'raw_stack.mjs', 'raw_stack-stripped.mjs',
        'match_failures.mjs', 'match_failures-stripped.mjs', 'raw_failures.mjs',
        'raw_failures-stripped.mjs', 'arithmetic_body.mjs', 'arithmetic_body-stripped.mjs',
        'raw_arithmetic_body.mjs', 'raw_arithmetic_body-stripped.mjs',
        'raw_float_registers.mjs', 'raw_float_registers-stripped.mjs',
        'bif_body.mjs', 'bif_body-stripped.mjs', 'raw_bif_body.mjs', 'raw_bif_body-stripped.mjs',
        'slice_helper.mjs'].map(file =>
        [`/${file}`, ['text/javascript', readFileSync(join(dir, file), 'utf8')]]),
    ]);
    await page.route('http://beam2js.test/**', async route => {
      const resource = resources.get(new URL(route.request().url()).pathname);
      if (!resource) return route.abort();
      await route.fulfill({contentType: resource[0], body: resource[1]});
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://beam2js.test/examples/browser/', {timeout: 30000});
    await page.waitForFunction(() => document.getElementById('message').textContent === 'Hello from Erlang!',
      null, {timeout: 30000});
    assert.deepEqual(errors, []);
    let timer;
    const browserResults = await Promise.race([page.evaluate(async () => {
      const {Runtime} = await import('/runtime/beam2js.mjs');
      const {registerDom} = await import('/examples/browser/dom.mjs');
      const {callResults} = await import('/test/call-cases.mjs');
      const {matchResults} = await import('/test/match-cases.mjs');
      const {arithmeticResults} = await import('/test/arithmetic-cases.mjs');
      const results = [];
      const matches = [];
      const arithmetic = [];
      for (const [file, raw, match, rawFail, body, rawBody, rawFloat, bifBody, rawBifBody] of [
        ['/calls.mjs', '/raw_stack.mjs', '/match_failures.mjs', '/raw_failures.mjs',
          '/arithmetic_body.mjs', '/raw_arithmetic_body.mjs', '/raw_float_registers.mjs',
          '/bif_body.mjs', '/raw_bif_body.mjs'],
        ['/calls-stripped.mjs', '/raw_stack-stripped.mjs', '/match_failures-stripped.mjs', '/raw_failures-stripped.mjs',
          '/arithmetic_body-stripped.mjs', '/raw_arithmetic_body-stripped.mjs', '/raw_float_registers-stripped.mjs',
          '/bif_body-stripped.mjs', '/raw_bif_body-stripped.mjs']
      ]) {
        const runtime = new Runtime();
        (await import(file)).register(runtime);
        (await import(raw)).register(runtime);
        (await import(match)).register(runtime);
        (await import(rawFail)).register(runtime);
        (await import(body)).register(runtime);
        (await import(rawBody)).register(runtime);
        (await import(rawFloat)).register(runtime);
        (await import(bifBody)).register(runtime);
        (await import(rawBifBody)).register(runtime);
        (await import('/slice_helper.mjs')).register(runtime);
        results.push(callResults(runtime));
        matches.push(matchResults(runtime));
        arithmetic.push(arithmeticResults(runtime));
      }
      const runtime = new Runtime();
      registerDom(runtime, document);
      const binary = value => {
        const bytes = new TextEncoder().encode(value);
        return runtime.bitstring(bytes, bytes.length * 8);
      };
      const handle = runtime.invoke('dom', 'element_by_id', [binary('message')]);
      const sameHandle = handle === runtime.invoke('dom', 'element_by_id', [binary('message')]);
      runtime.invoke('dom', 'append_text', [handle, binary(' <b>å</b>')]);
      const element = document.getElementById('message');
      return {results, matches, arithmetic, sameHandle, text: element.textContent, children: element.children.length};
    }), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('browser call tests timed out')), 30000);
    })]).finally(() => clearTimeout(timer));
    assert.deepEqual(browserResults, {
      results: [oracle, oracle], matches: [matchOracle, matchOracle],
      arithmetic: [arithmeticOracle, arithmeticOracle], sameHandle: true,
      text: 'Hello from Erlang! <b>å</b>', children: 0,
    });
  } finally {
    await browser.close();
  }
  console.log('Browser interop and call tests passed in Node and Chromium');
} finally {
  rmSync(dir, {recursive: true, force: true});
}
