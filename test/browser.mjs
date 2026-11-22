import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {ErlangError, Runtime} from '../runtime/beam2js.mjs';
import {registerDom} from '../examples/browser/dom.mjs';
import {callResults, stackYieldChecks} from './call-cases.mjs';
import {matchResults} from './match-cases.mjs';
import {arithmeticResults} from './arithmetic-cases.mjs';
import {schedulerChecks} from './scheduler-cases.mjs';
import {identityChecks} from './identity-cases.mjs';
import {spawnChecks} from './spawn-cases.mjs';
import {sendChecks} from './send-cases.mjs';
import {receiveChecks} from './receive-cases.mjs';
import {timeoutChecks} from './timeout-cases.mjs';
import {referenceChecks} from './reference-cases.mjs';
import {dictionaryChecks} from './dictionary-cases.mjs';
import {processInfoChecks} from './process-info-cases.mjs';
import {timerBifChecks} from './timer-bif-cases.mjs';
import {timerOptionChecks} from './timer-option-cases.mjs';
import {registryChecks} from './registry-cases.mjs';

const dir = mkdtempSync(join(tmpdir(), 'beam2js-browser-'));
const compiler = resolve('_build/default/bin/beam2js');
const run = (command, args) => execFileSync(command, args, {encoding: 'utf8', timeout: 30000});
const source = path => readFileSync(resolve(path), 'utf8');

try {
  run('erlc', ['-o', dir, 'examples/browser/browser_demo.erl', 'fixtures/calls.erl',
    'fixtures/slice_helper.erl', 'fixtures/match_failures.erl', 'fixtures/arithmetic_body.erl',
    'fixtures/bif_body.erl', 'fixtures/scheduler_fixture.erl', 'fixtures/scheduler_probe.erl',
    'fixtures/process_identity.erl', 'fixtures/process_spawn.erl', 'fixtures/spawn_probe.erl',
    'fixtures/process_send.erl', 'fixtures/process_receive.erl', 'fixtures/receive_timeout.erl',
    'fixtures/receive_probe.erl', 'fixtures/process_reference.erl', 'fixtures/process_timer.erl',
    'fixtures/process_registry.erl', 'fixtures/process_dictionary.erl', 'fixtures/process_info_fixture.erl']);
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
    '{ok,raw_scheduler}=compile:file("fixtures/raw_scheduler.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{ok,raw_bifs}=compile:file("fixtures/raw_bifs.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{ok,raw_identity}=compile:file("fixtures/raw_identity.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{ok,raw_spawn}=compile:file("fixtures/raw_spawn.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{ok,raw_send}=compile:file("fixtures/raw_send.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{ok,raw_reference}=compile:file("fixtures/raw_reference.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{ok,raw_dictionary}=compile:file("fixtures/raw_dictionary.S",' +
    '[from_asm,no_postopt,{outdir,Dir},report_errors]), ' +
    '{beam_file,process_reference,_,_,_,RefFs}=beam_disasm:file(filename:join(Dir,"process_reference.beam")), ' +
    '{function,ref_guard,1,_,RefGuard}=lists:keyfind(ref_guard,2,RefFs), ' +
    'true=lists:any(fun({test,is_reference,_,_})->true;(_)->false end,RefGuard), ' +
    '{function,ref_body,1,_,RefBody}=lists:keyfind(ref_body,2,RefFs), ' +
    'true=lists:any(fun({bif,is_reference,{f,0},_,_})->true;(_)->false end,RefBody), ' +
    '{function,new,0,_,RefNew}=lists:keyfind(new,2,RefFs), ' +
    'true=lists:member({call_ext_only,0,{extfunc,erlang,make_ref,0}},RefNew), ' +
    '{beam_file,process_timer,_,_,_,TimerFs}=beam_disasm:file(filename:join(Dir,"process_timer.beam")), ' +
    '{function,send_later,3,_,TimerTail}=lists:keyfind(send_later,2,TimerFs), ' +
    'true=lists:member({call_ext_only,3,{extfunc,erlang,send_after,3}},TimerTail), ' +
    '{function,wrapped,3,_,TimerCall}=lists:keyfind(wrapped,2,TimerFs), ' +
    'true=lists:member({call_ext,3,{extfunc,erlang,start_timer,3}},TimerCall), ' +
    '{function,send_opts,4,_,TimerOptionsTail}=lists:keyfind(send_opts,2,TimerFs), ' +
    'true=lists:member({call_ext_only,4,{extfunc,erlang,send_after,4}},TimerOptionsTail), ' +
    '{function,wrapped_opts,4,_,TimerOptionsCall}=lists:keyfind(wrapped_opts,2,TimerFs), ' +
    'true=lists:member({call_ext,4,{extfunc,erlang,start_timer,4}},TimerOptionsCall), ' +
    '{function,read_opts,2,_,ReadOptions}=lists:keyfind(read_opts,2,TimerFs), ' +
    'true=lists:member({call_ext_only,2,{extfunc,erlang,read_timer,2}},ReadOptions), ' +
    '{function,cancel_opts,2,_,CancelOptions}=lists:keyfind(cancel_opts,2,TimerFs), ' +
    'true=lists:member({call_ext_only,2,{extfunc,erlang,cancel_timer,2}},CancelOptions), ' +
    '{function,now_in,1,_,NowCode}=lists:keyfind(now_in,2,TimerFs), ' +
    'true=lists:member({call_ext_only,1,{extfunc,erlang,monotonic_time,1}},NowCode), ' +
    '{function,native_now,0,_,NativeNowCode}=lists:keyfind(native_now,2,TimerFs), ' +
    'true=lists:member({call_ext_only,0,{extfunc,erlang,monotonic_time,0}},NativeNowCode), ' +
    '{beam_file,process_info_fixture,_,_,_,InfoFs}=beam_disasm:file(filename:join(Dir,"process_info_fixture.beam")), ' +
    '{function,query,2,_,InfoTail}=lists:keyfind(query,2,InfoFs), ' +
    'true=lists:member({call_ext_only,2,{extfunc,erlang,process_info,2}},InfoTail), ' +
    '{function,wrapped,2,_,InfoCall}=lists:keyfind(wrapped,2,InfoFs), ' +
    'true=lists:member({call_ext,2,{extfunc,erlang,process_info,2}},InfoCall), ' +
    '{beam_file,process_dictionary,_,_,_,DictionaryFs}=beam_disasm:file(filename:join(Dir,"process_dictionary.beam")), ' +
    '{function,exercise,6,_,DictionaryCode}=lists:keyfind(exercise,2,DictionaryFs), ' +
    'true=lists:any(fun({bif,get,{f,0},_,{y,_}})->true;(_)->false end,DictionaryCode), ' +
    '{function,read,1,_,DictionaryRead}=lists:keyfind(read,2,DictionaryFs), ' +
    'true=lists:any(fun({bif,get,{f,0},_,{x,_}})->true;(_)->false end,DictionaryRead), ' +
    '{beam_file,raw_dictionary,_,_,_,RawDictionaryFs}=beam_disasm:file(filename:join(Dir,"raw_dictionary.beam")), ' +
    'lists:foreach(fun({Name,Kind}) -> {function,Name,1,_,Code}=lists:keyfind(Name,2,RawDictionaryFs), ' +
    'true=lists:any(fun(I)->element(1,I)=:=Kind end,Code) end, ' +
    '[{read_tail,call_ext_only},{read_last,call_ext_last},{read_call,call_ext}]), ' +
    '{beam_file,process_registry,_,_,_,RegistryFs}=beam_disasm:file(filename:join(Dir,"process_registry.beam")), ' +
    '{function,bind,2,_,RegistryTail}=lists:keyfind(bind,2,RegistryFs), ' +
    'true=lists:member({call_ext_only,2,{extfunc,erlang,register,2}},RegistryTail), ' +
    '{function,wrapped,2,_,RegistryCall}=lists:keyfind(wrapped,2,RegistryFs), ' +
    'true=lists:member({call_ext,2,{extfunc,erlang,register,2}},RegistryCall), ' +
    '{beam_file,raw_reference,_,_,_,RawRefFs}=beam_disasm:file(filename:join(Dir,"raw_reference.beam")), ' +
    'lists:foreach(fun({Name,Kind}) -> {function,Name,_,_,Code}=lists:keyfind(Name,2,RawRefFs), ' +
    'true=lists:any(fun(I)->element(1,I)=:=Kind end,Code) end, ' +
    '[{ref_tail,call_ext_only},{ref_last,call_ext_last},{ref_call,call_ext},' +
    '{test_tail,call_ext_only},{test_last,call_ext_last},{test_call,call_ext}]), ' +
    '{beam_file,process_send,_,_,_,SendFs}=beam_disasm:file(filename:join(Dir,"process_send.beam")), ' +
    '{function,send,2,_,SendCode}=lists:keyfind(send,2,SendFs), ' +
    'true=lists:member(send,SendCode), ' +
    '{beam_file,process_receive,_,_,_,ReceiveFs}=beam_disasm:file(filename:join(Dir,"process_receive.beam")), ' +
    '{function,wanted,0,_,ReceiveCode}=lists:keyfind(wanted,2,ReceiveFs), ' +
    'true=lists:any(fun({loop_rec,_,_})->true;(_)->false end,ReceiveCode), ' +
    'true=lists:any(fun({loop_rec_end,_})->true;(_)->false end,ReceiveCode), ' +
    'true=lists:member(remove_message,ReceiveCode), ' +
    'true=lists:any(fun({wait,_})->true;(_)->false end,ReceiveCode), ' +
    '{beam_file,receive_timeout,_,_,_,TimeoutFs}=beam_disasm:file(filename:join(Dir,"receive_timeout.beam")), ' +
    '{function,timed,1,_,TimedCode}=lists:keyfind(timed,2,TimeoutFs), ' +
    'true=lists:any(fun({wait_timeout,_,{y,_}})->true;(_)->false end,TimedCode), ' +
    'true=lists:member(timeout,TimedCode), ' +
    '{function,sleep,1,_,SleepCode}=lists:keyfind(sleep,2,TimeoutFs), ' +
    'true=lists:any(fun({wait_timeout,_,{x,_}})->true;(_)->false end,SleepCode), ' +
    '{function,literal,0,_,LiteralTimeoutCode}=lists:keyfind(literal,2,TimeoutFs), ' +
    'true=lists:any(fun({wait_timeout,_,{integer,10}})->true;(_)->false end,LiteralTimeoutCode), ' +
    '{beam_file,raw_send,_,_,_,RawSendFs}=beam_disasm:file(filename:join(Dir,"raw_send.beam")), ' +
    'lists:foreach(fun({Name,Kind}) -> {function,Name,2,_,Code}=lists:keyfind(Name,2,RawSendFs), ' +
    'true=lists:any(fun(I)->element(1,I)=:=Kind end,Code) end, ' +
    '[{tail,call_ext_only},{last,call_ext_last},{call,call_ext},{operator,call_ext_only}]), ' +
    '{beam_file,raw_spawn,_,_,_,SpawnFs}=beam_disasm:file(filename:join(Dir,"raw_spawn.beam")), ' +
    'lists:foreach(fun({Name,Kind}) -> {function,Name,3,_,Code}=lists:keyfind(Name,2,SpawnFs), ' +
    'true=lists:any(fun(I)->element(1,I)=:=Kind end,Code) end, ' +
    '[{tail,call_ext_only},{last,call_ext_last},{call,call_ext}]), ' +
    '{beam_file,process_identity,_,_,_,PFs}=beam_disasm:file(filename:join(Dir,"process_identity.beam")), ' +
    '{function,self_pair,0,_,PIs}=lists:keyfind(self_pair,2,PFs), ' +
    'true=lists:any(fun({bif,self,nofail,[],{y,_}})->true;(_)->false end,PIs), ' +
    '{function,pid_guard,1,_,GIs}=lists:keyfind(pid_guard,2,PFs), ' +
    'true=lists:any(fun({test,is_pid,_,_})->true;(_)->false end,GIs), ' +
    '{function,pid_body,1,_,PBIs}=lists:keyfind(pid_body,2,PFs), ' +
    'true=lists:any(fun({bif,is_pid,{f,0},_,_})->true;(_)->false end,PBIs), ' +
    '{function,alive,1,_,LIs}=lists:keyfind(alive,2,PFs), ' +
    'true=lists:any(fun({call_ext_only,1,{extfunc,erlang,is_process_alive,1}})->true;(_)->false end,LIs), ' +
    '{beam_file,raw_identity,_,_,_,RIFs}=beam_disasm:file(filename:join(Dir,"raw_identity.beam")), ' +
    'lists:foreach(fun({Name,Kind}) -> {function,Name,_,_,Code}=lists:keyfind(Name,2,RIFs), ' +
    'true=lists:any(fun(I)->element(1,I)=:=Kind end,Code) end, ' +
    '[{self_tail,call_ext_only},{self_last,call_ext_last},{self_call,call_ext},' +
    '{alive_tail,call_ext_only},{alive_last,call_ext_last},{alive_call,call_ext}]), ' +
    '{beam_file,calls,_,_,_,Fs}=beam_disasm:file(filename:join(Dir,"calls.beam")), ' +
    '{function,stack_tuple,2,_,TupleStack}=lists:keyfind(stack_tuple,2,Fs), ' +
    'true=lists:any(fun({put_tuple2,{y,_},{list,_}})->true;(_)->false end,TupleStack), ' +
    '{function,stack_element,1,_,ElementStack}=lists:keyfind(stack_element,2,Fs), ' +
    'true=lists:any(fun({get_tuple_element,_,_,{y,_}})->true;(_)->false end,ElementStack), ' +
    '{function,stack_list_head,1,_,ListHeadStack}=lists:keyfind(stack_list_head,2,Fs), ' +
    'true=lists:any(fun({get_list,_,{y,_},{x,_}})->true;(_)->false end,ListHeadStack), ' +
    '{function,stack_list_tail,1,_,ListTailStack}=lists:keyfind(stack_list_tail,2,Fs), ' +
    'true=lists:any(fun({get_list,_,{x,_},{y,_}})->true;(_)->false end,ListTailStack), ' +
    '{function,stack_list,2,_,ListPutStack}=lists:keyfind(stack_list,2,Fs), ' +
    'true=lists:any(fun({put_list,_,_,{y,_}})->true;(_)->false end,ListPutStack), ' +
    '{function,stack_hd,2,_,HdStack}=lists:keyfind(stack_hd,2,Fs), ' +
    'true=lists:any(fun({get_hd,_,{y,_}})->true;(_)->false end,HdStack), ' +
    '{function,stack_tl,2,_,TlStack}=lists:keyfind(stack_tl,2,Fs), ' +
    'true=lists:any(fun({get_tl,_,{y,_}})->true;(_)->false end,TlStack), ' +
    '{beam_file,raw_stack,_,_,_,RawStackFs}=beam_disasm:file(filename:join(Dir,"raw_stack.beam")), ' +
    '{function,tuple_y,2,_,RawTupleY}=lists:keyfind(tuple_y,2,RawStackFs), ' +
    'true=lists:member({put_tuple2,{y,0},{list,[{y,0},{y,1},{x,0},{atom,tag}]}},RawTupleY), ' +
    '{function,empty_y,0,_,RawEmptyY}=lists:keyfind(empty_y,2,RawStackFs), ' +
    'true=lists:member({put_tuple2,{y,0},{list,[]}},RawEmptyY), ' +
    '{function,element_y,1,_,RawElementY}=lists:keyfind(element_y,2,RawStackFs), ' +
    'true=lists:member({get_tuple_element,{y,0},0,{y,0}},RawElementY), ' +
    '{function,list_head_y,1,_,RawListHeadY}=lists:keyfind(list_head_y,2,RawStackFs), ' +
    'true=lists:member({get_list,{y,0},{y,0},{y,1}},RawListHeadY), ' +
    '{function,list_tail_y,1,_,RawListTailY}=lists:keyfind(list_tail_y,2,RawStackFs), ' +
    'true=lists:member({get_list,{y,0},{y,1},{y,0}},RawListTailY), ' +
    '{function,list_put_y,2,_,RawListPutY}=lists:keyfind(list_put_y,2,RawStackFs), ' +
    'true=lists:member({put_list,{y,2},{y,1},{y,2}},RawListPutY), ' +
    'true=lists:member({put_list,{y,0},{y,3},{y,3}},RawListPutY), ' +
    'true=lists:member({put_list,{y,4},{y,4},{y,4}},RawListPutY), ' +
    '{function,list_parts_y,1,_,RawListPartsY}=lists:keyfind(list_parts_y,2,RawStackFs), ' +
    'true=lists:member({get_hd,{y,0},{y,0}},RawListPartsY), ' +
    'true=lists:member({get_tl,{y,1},{y,1}},RawListPartsY), ' +
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
    'lists:foreach(fun({Name,Arity,Op}) -> {function,Name,Arity,_,Code}=lists:keyfind(Name,2,AFs), ' +
    'true=lists:any(fun({gc_bif,Actual,{f,0},_,Args,{y,N}}) when Actual=:=Op -> ' +
    'lists:member({y,N},Args);(_)->false end,Code), ' +
    'case Arity of 3->true=lists:any(fun({trim,_,_})->true;(_)->false end,Code);_->ok end end, ' +
    '[{stack_and,3,\'band\'},{stack_or,3,\'bor\'},{stack_xor,3,\'bxor\'},{stack_not,2,\'bnot\'},' +
    '{stack_div,3,\'div\'},{stack_rem,3,\'rem\'},' +
    '{stack_add,3,\'+\'},{stack_subtract,3,\'-\'},{stack_multiply,3,\'*\'},' +
    '{stack_negate,2,\'-\'},{stack_absolute,2,abs},' +
    '{stack_trunc,2,trunc},{stack_round,2,round},{stack_floor,2,floor},' +
    '{stack_ceil,2,ceil},{stack_float,2,float}]), ' +
    '{function,stack_divide,3,_,StackDivide}=lists:keyfind(stack_divide,2,AFs), ' +
    'true=lists:any(fun({fmove,{fr,_},{y,_}})->true;(_)->false end,StackDivide), ' +
    '{beam_file,raw_arithmetic_body,_,_,_,RawArithmeticFs}=beam_disasm:file(filename:join(Dir,"raw_arithmetic_body.beam")), ' +
    'lists:foreach(fun({Name,Arity,Op,Slot}) -> {function,Name,Arity,_,Code}=lists:keyfind(Name,2,RawArithmeticFs), ' +
    'true=lists:any(fun({gc_bif,Actual,{f,Fail},0,Args,{y,N}}) ' +
    'when Actual=:=Op,Fail=/=0,N=:=Slot -> lists:member({y,N},Args);(_)->false end,Code) end, ' +
    '[{band_stack_left,2,\'band\',0},{bor_stack_right,2,\'bor\',1},' +
    '{bxor_stack_both,1,\'bxor\',0},{bnot_stack,1,\'bnot\',0}]), ' +
    'lists:foreach(fun({Name,Arity,Op,Args,Slot}) -> ' +
    '{function,Name,Arity,_,Code}=lists:keyfind(Name,2,RawArithmeticFs), ' +
    'true=lists:any(fun({gc_bif,Actual,{f,Fail},0,ActualArgs,{y,N}}) -> ' +
    'Actual=:=Op andalso Fail=/=0 andalso ActualArgs=:=Args andalso N=:=Slot;(_)->false end,Code) end, ' +
    '[{div_stack_left,2,\'div\',[{y,0},{y,1}],0},{rem_stack_right,2,\'rem\',[{y,0},{y,1}],1},' +
    '{div_stack_both,1,\'div\',[{y,0},{y,0}],0},{rem_stack_both,1,\'rem\',[{y,0},{y,0}],0},' +
    '{add_stack_left,2,\'+\',[{y,0},{y,1}],0},{subtract_stack_right,2,\'-\',[{y,0},{y,1}],1},' +
    '{multiply_stack_both,1,\'*\',[{y,0},{y,0}],0},{divide_stack_right,2,\'/\',[{y,0},{y,1}],1},' +
    '{negate_stack_guard,1,\'-\',[{y,0}],0},{abs_stack_guard,1,abs,[{y,0}],0},' +
    '{abs_stack_distinct,2,abs,[{y,0}],1},' +
    '{trunc_stack_guard,1,trunc,[{y,0}],0},{round_stack_guard,1,round,[{y,0}],0},' +
    '{floor_stack_guard,1,floor,[{y,0}],0},{ceil_stack_guard,1,ceil,[{y,0}],0},' +
    '{float_stack_guard,1,float,[{y,0}],0},{float_stack_distinct,2,float,[{y,0}],1}]), ' +
    '{function,divide_stack_body,2,_,DivideBody}=lists:keyfind(divide_stack_body,2,RawArithmeticFs), ' +
    'true=lists:member({gc_bif,\'/\',{f,0},0,[{y,0},{y,1}],{y,0}},DivideBody), ' +
    '{beam_file,bif_body,_,_,_,BFs}=beam_disasm:file(filename:join(Dir,"bif_body.beam")), ' +
    'lists:foreach(fun({Name,Op}) -> {function,Name,_,_,Code}=lists:keyfind(Name,2,BFs), ' +
    'true=lists:any(fun({bif,Actual,{f,0},_,_}) when Actual=:=Op -> true;(_)->false end,Code) end, ' +
    '[{head,hd},{tail,tl},{size,tuple_size},{element,element}]), ' +
    '{function,stack_predicates,2,_,PredicateStack}=lists:keyfind(stack_predicates,2,BFs), ' +
    'Predicates=[is_integer,is_number,is_atom,is_boolean,is_float,is_list,is_tuple,is_binary,' +
    'is_bitstring,is_pid,is_reference], ' +
    'lists:foreach(fun(Op)->true=lists:any(fun({bif,Actual,{f,0},_,{y,_}}) ' +
    'when Actual=:=Op -> true;(_)->false end,PredicateStack) end,Predicates), ' +
    'lists:foreach(fun({Name,Op}) -> {function,Name,2,_,Code}=lists:keyfind(Name,2,BFs), ' +
    'true=lists:any(fun({bif,Actual,{f,0},_,{y,_}}) when Actual=:=Op -> true;(_)->false end,Code) end, ' +
    '[{stack_head,hd},{stack_tail,tl},{stack_size,tuple_size},{stack_element,element}]), ' +
    '{function,length,1,_,LenCode}=lists:keyfind(length,2,BFs), ' +
    'true=lists:any(fun({gc_bif,length,{f,0},_,_,_})->true;(_)->false end,LenCode), ' +
    '{function,stack_length,2,_,StackLenCode}=lists:keyfind(stack_length,2,BFs), ' +
    'true=lists:any(fun({gc_bif,length,{f,0},_,[{y,N}],{y,N}})->true;(_)->false end,StackLenCode), ' +
    'lists:foreach(fun({Name,Op}) -> {function,Name,2,_,Code}=lists:keyfind(Name,2,BFs), ' +
    'true=lists:any(fun({gc_bif,Actual,{f,0},_,[{y,N}],{y,N}}) ' +
    'when Actual=:=Op -> true;(_)->false end,Code) end, [{stack_bits,bit_size},{stack_bytes,byte_size}]), ' +
    'lists:foreach(fun({Name,Arity,Operands}) -> {function,Name,Arity,_,Code}=lists:keyfind(Name,2,BFs), ' +
    'true=lists:any(fun({gc_bif,binary_part,{f,0},_,[{y,N}|Rest],{y,N}}) ' +
    'when length(Rest)=:=Operands-1 -> true;(_)->false end,Code), ' +
    'true=lists:any(fun({trim,_,_})->true;(_)->false end,Code) end, ' +
    '[{stack_part,4,3},{stack_part2,3,2}]), ' +
    'lists:foreach(fun({Name,Op}) -> {function,Name,_,_,Code}=lists:keyfind(Name,2,BFs), ' +
    'true=lists:any(fun({gc_bif,Actual,{f,0},_,_,_}) when Actual=:=Op -> true;(_)->false end,Code) end, ' +
    '[{bits,bit_size},{bytes,byte_size},{part,binary_part},{part2,binary_part}]), ' +
    'lists:foreach(fun({Name,Bif}) -> {function,Name,1,_,Code}=lists:keyfind(Name,2,BFs), ' +
    'true=lists:any(fun({call_ext_only,1,{extfunc,erlang,Actual,1}}) when Actual=:=Bif -> true; ' +
    '(_)->false end,Code) end,[{from_list,list_to_tuple},{to_list,tuple_to_list}]), ' +
    '{function,tuple_roundtrip,1,_,Roundtrip}=lists:keyfind(tuple_roundtrip,2,BFs), ' +
    'lists:foreach(fun(Bif)->true=lists:any(fun({call_ext,1,{extfunc,erlang,Actual,1}}) ' +
    'when Actual=:=Bif -> true;(_)->false end,Roundtrip) end,[list_to_tuple,tuple_to_list]), ' +
    'lists:foreach(fun({Name,Bif,Arity}) -> {function,Name,Arity,_,Code}=lists:keyfind(Name,2,BFs), ' +
    'true=lists:any(fun({call_ext_only,N,{extfunc,erlang,Actual,N}}) ' +
    'when Actual=:=Bif, N=:=Arity -> true;(_)->false end,Code) end, ' +
    '[{integer_chars,integer_to_list,1},{integer_chars_base,integer_to_list,2},' +
    '{integer_binary,integer_to_binary,1},{integer_binary_base,integer_to_binary,2}]), ' +
    '{function,integer_text_pair,2,_,TextPair}=lists:keyfind(integer_text_pair,2,BFs), ' +
    'lists:foreach(fun(Bif)->true=lists:any(fun({call_ext,2,{extfunc,erlang,Actual,2}}) ' +
    'when Actual=:=Bif -> true;(_)->false end,TextPair) end,[integer_to_list,integer_to_binary]), ' +
    'lists:foreach(fun({Name,Bif}) -> {function,Name,_,_,Code}=lists:keyfind(Name,2,BFs), ' +
    'true=lists:any(fun({bif,Actual,{f,0},_,_}) when Actual=:=Bif -> true;(_)->false end,Code) end, ' +
    '[{bool_not,\'not\'},{bool_and,\'and\'},{bool_or,\'or\'},{bool_xor,\'xor\'}]), ' +
    '{beam_file,raw_bif_body,_,_,_,RFs}=beam_disasm:file(filename:join(Dir,"raw_bif_body.beam")), ' +
    'lists:foreach(fun({Name,Op,Slot,Failing}) -> {function,Name,_,_,Code}=lists:keyfind(Name,2,RFs), ' +
    'true=lists:any(fun({bif,Actual,{f,Fail},Args,{y,Dest}}) ' +
    'when Actual=:=Op, Dest=:=Slot -> (Fail=/=0)=:=Failing andalso lists:member({y,Slot},Args); ' +
    '(_)->false end,Code) end, ' +
    '[{bool_not_y,\'not\',0,false},{bool_and_y,\'and\',0,false},' +
    '{bool_or_y,\'or\',1,false},{bool_xor_y,\'xor\',1,false},' +
    '{bool_not_guard,\'not\',0,true},{bool_and_guard,\'and\',0,true},' +
    '{bool_or_guard,\'or\',1,true},{bool_xor_guard,\'xor\',1,true}]), ' +
    '{function,bool_xor_same,1,_,XorSame}=lists:keyfind(bool_xor_same,2,RFs), ' +
    'true=lists:any(fun({bif,\'xor\',{f,0},[{y,0},{y,0}],{y,0}})->true;(_)->false end,XorSame), ' +
    '{function,predicates_stack,1,_,RawPredicateStack}=lists:keyfind(predicates_stack,2,RFs), ' +
    'lists:foreach(fun(Op)->true=lists:any(fun({bif,Actual,{f,0},[{y,N}],{y,N}}) ' +
    'when Actual=:=Op -> true;(_)->false end,RawPredicateStack) end,Predicates), ' +
    '{function,predicate_x_stack,1,_,RawPredicateXStack}=lists:keyfind(predicate_x_stack,2,RFs), ' +
    'true=lists:any(fun({bif,is_integer,{f,0},[{tr,{x,0},_}],{y,0}})->true;(_)->false end,RawPredicateXStack), ' +
    'lists:foreach(fun({Name,Op,Dest}) -> {function,Name,_,_,Code}=lists:keyfind(Name,2,RFs), ' +
    'true=lists:any(fun({bif,Actual,{f,Fail},_,{y,Slot}}) ' +
    'when Actual=:=Op, Fail=/=0, Slot=:=Dest -> true;(_)->false end,Code) end, ' +
    '[{head_guard_stack,hd,0},{tail_guard_stack,tl,0},{size_guard_stack,tuple_size,0},' +
    '{element_guard_stack,element,1},{element_guard_index_stack,element,0}]), ' +
    '{function,length_guard_stack,1,_,LengthGuardStack}=lists:keyfind(length_guard_stack,2,RFs), ' +
    'true=lists:any(fun({gc_bif,length,{f,Fail},0,[{y,0}],{y,0}}) when Fail=/=0 -> true; ' +
    '(_)->false end,LengthGuardStack), ' +
    '{function,bits_guard_stack,1,_,BitsGuardStack}=lists:keyfind(bits_guard_stack,2,RFs), ' +
    'true=lists:any(fun({gc_bif,bit_size,{f,Fail},1,[{x,0}],{y,0}}) when Fail=/=0 -> true; ' +
    '(_)->false end,BitsGuardStack), ' +
    '{function,bytes_guard_stack,1,_,BytesGuardStack}=lists:keyfind(bytes_guard_stack,2,RFs), ' +
    'true=lists:any(fun({gc_bif,byte_size,{f,Fail},0,[{y,0}],{y,0}}) when Fail=/=0 -> true; ' +
    '(_)->false end,BytesGuardStack), ' +
    'lists:foreach(fun({Name,Arity,Slot}) -> {function,Name,Arity,_,Code}=lists:keyfind(Name,2,RFs), ' +
    'true=lists:any(fun({gc_bif,binary_part,{f,Fail},0,Args,{y,Dest}}) ' +
    'when Fail=/=0, Dest=:=Slot, length(Args)=:=Arity -> lists:nth(Slot+1,Args)=:={y,Slot}; ' +
    '(_)->false end,Code) end, ' +
    '[{part2_guard_source,2,0},{part2_guard_range,2,1},{part3_guard_source,3,0},' +
    '{part3_guard_position,3,1},{part3_guard_length,3,2}]), ' +
    '{function,part2_guard_x,2,_,Part2GuardX}=lists:keyfind(part2_guard_x,2,RFs), ' +
    'true=lists:any(fun({gc_bif,binary_part,{f,Fail},2,[{x,0},{x,1}],{y,0}}) ' +
    'when Fail=/=0 -> true;(_)->false end,Part2GuardX), ' +
    'lists:foreach(fun({Name,Kind}) -> {function,Name,_,_,Code}=lists:keyfind(Name,2,RFs), ' +
    'true=lists:any(fun(I)->element(1,I)=:=Kind end,Code) end, ' +
    '[{predicate_tail,call_ext_only},{predicate_last,call_ext_last},{predicate_call,call_ext},' +
    '{head_call_tail,call_ext_only},{element_call_last,call_ext_last},{length_call,call_ext},' +
    '{bits_call_tail,call_ext_only},{part2_call_last,call_ext_last},{part3_call,call_ext},' +
    '{abs_call_tail,call_ext_only},{round_call_last,call_ext_last},{float_call,call_ext},' +
    '{add_call_tail,call_ext_only},{subtract_call_last,call_ext_last},{multiply_call,call_ext},' +
    '{divide_call_tail,call_ext_only},{negate_call,call_ext},' +
    '{exact_call_tail,call_ext_only},{exact_call_last,call_ext_last},{exact_call,call_ext},' +
    '{band_call_tail,call_ext_only},{bor_call_last,call_ext_last},{bxor_call,call_ext},' +
    '{bnot_call_tail,call_ext_only},{div_call_last,call_ext_last},{rem_call,call_ext},' +
    '{eq_call_tail,call_ext_only},{ne_call_last,call_ext_last},{exact_ne_call,call_ext},' +
    '{lt_call_tail,call_ext_only},{le_call_last,call_ext_last},{gt_call,call_ext},' +
    '{ge_call_tail,call_ext_only},{list_to_tuple_last,call_ext_last},' +
    '{tuple_to_list_last,call_ext_last},{bool_not_call,call_ext_only},' +
    '{bool_and_call,call_ext_last},{bool_or_call,call_ext},{bool_xor_call,call_ext_only},' +
    '{integer_chars_last,call_ext_last},{integer_binary_last,call_ext_last}]), ' +
    'lists:foreach(fun(Name) -> Input=filename:join(Dir,Name++".beam"), ' +
    '{ok,B}=file:read_file(Input), {ok,{_,S}}=beam_lib:strip(B), ' +
    'ok=file:write_file(filename:join(Dir,Name++"-stripped.beam"),S) end, ' +
    '["calls","raw_stack","match_failures","raw_failures","arithmetic_body","raw_arithmetic_body","raw_float_registers","bif_body","raw_bif_body","scheduler_fixture","raw_scheduler","process_identity","raw_identity","raw_bifs","process_spawn","raw_spawn","process_send","raw_send","spawn_probe","process_receive","receive_timeout","process_reference","raw_reference","process_timer","process_registry","process_dictionary","raw_dictionary","process_info_fixture"]), halt().', '-extra', dir]);
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
    [join(dir, 'scheduler_fixture.beam'), 'scheduler_fixture.mjs'],
    [join(dir, 'scheduler_fixture-stripped.beam'), 'scheduler_fixture-stripped.mjs'],
    [join(dir, 'raw_scheduler.beam'), 'raw_scheduler.mjs'],
    [join(dir, 'raw_scheduler-stripped.beam'), 'raw_scheduler-stripped.mjs'],
    [join(dir, 'process_identity.beam'), 'process_identity.mjs'],
    [join(dir, 'process_identity-stripped.beam'), 'process_identity-stripped.mjs'],
    [join(dir, 'raw_identity.beam'), 'raw_identity.mjs'],
    [join(dir, 'raw_identity-stripped.beam'), 'raw_identity-stripped.mjs'],
    [join(dir, 'process_spawn.beam'), 'process_spawn.mjs'],
    [join(dir, 'process_spawn-stripped.beam'), 'process_spawn-stripped.mjs'],
    [join(dir, 'raw_spawn.beam'), 'raw_spawn.mjs'],
    [join(dir, 'raw_spawn-stripped.beam'), 'raw_spawn-stripped.mjs'],
    [join(dir, 'process_send.beam'), 'process_send.mjs'],
    [join(dir, 'process_send-stripped.beam'), 'process_send-stripped.mjs'],
    [join(dir, 'raw_send.beam'), 'raw_send.mjs'],
    [join(dir, 'raw_send-stripped.beam'), 'raw_send-stripped.mjs'],
    [join(dir, 'spawn_probe.beam'), 'spawn_probe.mjs'],
    [join(dir, 'spawn_probe-stripped.beam'), 'spawn_probe-stripped.mjs'],
    [join(dir, 'process_receive.beam'), 'process_receive.mjs'],
    [join(dir, 'process_receive-stripped.beam'), 'process_receive-stripped.mjs'],
    [join(dir, 'receive_timeout.beam'), 'receive_timeout.mjs'],
    [join(dir, 'receive_timeout-stripped.beam'), 'receive_timeout-stripped.mjs'],
    [join(dir, 'process_reference.beam'), 'process_reference.mjs'],
    [join(dir, 'process_reference-stripped.beam'), 'process_reference-stripped.mjs'],
    [join(dir, 'raw_reference.beam'), 'raw_reference.mjs'],
    [join(dir, 'raw_reference-stripped.beam'), 'raw_reference-stripped.mjs'],
    [join(dir, 'process_timer.beam'), 'process_timer.mjs'],
    [join(dir, 'process_timer-stripped.beam'), 'process_timer-stripped.mjs'],
    [join(dir, 'process_registry.beam'), 'process_registry.mjs'],
    [join(dir, 'process_registry-stripped.beam'), 'process_registry-stripped.mjs'],
    [join(dir, 'process_dictionary.beam'), 'process_dictionary.mjs'],
    [join(dir, 'process_dictionary-stripped.beam'), 'process_dictionary-stripped.mjs'],
    [join(dir, 'raw_dictionary.beam'), 'raw_dictionary.mjs'],
    [join(dir, 'raw_dictionary-stripped.beam'), 'raw_dictionary-stripped.mjs'],
    [join(dir, 'process_info_fixture.beam'), 'process_info_fixture.mjs'],
    [join(dir, 'process_info_fixture-stripped.beam'), 'process_info_fixture-stripped.mjs'],
    [join(dir, 'raw_bifs.beam'), 'raw_bifs.mjs'],
    [join(dir, 'raw_bifs-stripped.beam'), 'raw_bifs-stripped.mjs'],
    [join(dir, 'slice_helper.beam'), 'slice_helper.mjs'],
    [join(dir, 'browser_demo.beam'), 'browser_demo.mjs'],
  ]) {
    run(compiler, [input, join(dir, output)]);
  }
  const oracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    'Values=[{{1,[]},[2|tail]},{-0.0,<<5:3>>},{make_ref(),self()}], ' +
    'Rich=lists:all(fun({A,B})->calls:stack_tuple(A,B)=:={{A,B},A} andalso ' +
    'raw_stack:tuple_y(A,B)=:={A,B,A,tag} andalso ' +
    'calls:stack_element({A,B})=:={A,B} andalso raw_stack:element_y({A,B})=:=A end,Values), ' +
    'Invalid=lists:all(fun(V)->' +
    'Rejected=try calls:stack_element(V),false catch error:function_clause->true end, ' +
    'Rejected andalso raw_stack:element_y(V)=:=not_pair end,[[],{},{1,2,3}]), ' +
    'ListRich=lists:all(fun({A,B})->L=[A|B], Expected={A,B}, ' +
    'calls:stack_list_head(L)=:=Expected andalso calls:stack_list_tail(L)=:=Expected andalso ' +
    'raw_stack:list_head_y(L)=:=Expected andalso raw_stack:list_tail_y(L)=:=Expected andalso ' +
    'calls:stack_hd(L,B)=:=Expected andalso calls:stack_tl(L,A)=:={B,A} andalso ' +
    'raw_stack:list_parts_y(L)=:=Expected andalso ' +
    'calls:stack_list(A,B)=:={L,A} andalso raw_stack:list_put_y(A,B)=:={L,L,[A|A]} end, ' +
    'Values++[{1,[]},{2,[3]}]), ' +
    'ListInvalid=lists:all(fun(V)->' +
    'Rejected=lists:all(fun({F,Args})->try apply(calls,F,Args),false catch error:function_clause->true end end, ' +
    '[{stack_list_head,[V]},{stack_list_tail,[V]},{stack_hd,[V,1]},{stack_tl,[V,1]}]), ' +
    'Rejected andalso raw_stack:list_head_y(V)=:=not_list andalso ' +
    'raw_stack:list_tail_y(V)=:=not_list andalso raw_stack:list_parts_y(V)=:=not_list end,[[],not_list,{}]), ' +
    'io:format("~w~n~w~n~w~n~w~n~w~n~w~n~w~n~w~n~w~n~w~n~w~n~w~n~w~n~w~n~w~n~w~n",' +
    '[calls:local(42),calls:remote(42),calls:nested(42,99),calls:wrapped(23),' +
    'calls:heap(23,99),calls:stack(11,22,33,44),raw_stack:shift(11,22,33),' +
    'raw_stack:empty(42),calls:stack_tuple(11,22),raw_stack:tuple_y(11,22),' +
    'raw_stack:empty_y()=:={},Rich,Invalid,ListRich,ListInvalid,calls:depth(lists:seq(1,20000))]),halt().'
  ]).trimEnd().split('\n');
  const stackYieldOracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    'io:format("~w~n",[[calls:stack_tuple(1,2)=:={{1,2},1},' +
    'raw_stack:tuple_y(3,4)=:={3,4,3,tag},' +
    'calls:stack_element({5,6})=:={5,6},raw_stack:element_y({7,8})=:=7,' +
    'calls:stack_list_head([9|tail])=:={9,tail},calls:stack_list_tail([9|tail])=:={9,tail},' +
    'raw_stack:list_head_y([9|tail])=:={9,tail},raw_stack:list_tail_y([9|tail])=:={9,tail},' +
    'calls:stack_list(9,tail)=:={[9|tail],9},' +
    'raw_stack:list_put_y(9,tail)=:={[9|tail],[9|tail],[9|9]},' +
    'calls:stack_hd([9|tail],7)=:={9,7},calls:stack_tl([9|tail],7)=:={tail,7},' +
    'raw_stack:list_parts_y([9|tail])=:={9,tail},' +
    'bif_body:stack_head([9|tail],7)=:={9,7},bif_body:stack_tail([9|tail],7)=:={tail,7},' +
    'bif_body:stack_size({5,6},7)=:={2,7},bif_body:stack_element({5,6},7)=:={5,7},' +
    'raw_bif_body:head_guard_stack([])=:={failed,[]},raw_bif_body:tail_guard_stack([9|tail])=:=tail,' +
    'raw_bif_body:size_guard_stack(bad)=:={failed,bad},' +
    'raw_bif_body:element_guard_stack(0,{5,6})=:={failed,{5,6}},' +
    'raw_bif_body:element_guard_index_stack(0,{5,6})=:={failed,0},' +
    'bif_body:stack_length([9],7)=:={1,7},' +
    'raw_bif_body:length_guard_stack([9|tail])=:={failed,[9|tail]},' +
    'raw_bif_body:length_guard_stack([])=:=0,' +
    'bif_body:stack_bits(<<1,1:1>>,7)=:={9,7},bif_body:stack_bytes(<<1,1:1>>,7)=:={2,7},' +
    'raw_bif_body:bits_guard_stack(bad)=:={failed,bad},' +
    'raw_bif_body:bytes_guard_stack(<<1:1>>)=:=1,' +
    'bif_body:stack_part(<<1,2,3>>,3,-2,7)=:={<<2,3>>,7},' +
    'bif_body:stack_part2(<<1,2,3>>,{3,-2},7)=:={<<2,3>>,7},' +
    'raw_bif_body:part2_guard_range(<<1,2,3>>,{0,-1})=:={failed,{0,-1}},' +
    'raw_bif_body:part3_guard_length(<<1,2,3>>,0,-1)=:={failed,-1},' +
    'bif_body:stack_predicates(<<1:1>>,ok)=:=' +
    '{false,false,false,false,false,false,false,false,true,false,false,ok},' +
    'raw_bif_body:predicates_stack(<<1:1>>)=:=' +
    '{false,false,false,false,false,false,false,false,true,false,false},' +
    'arithmetic_body:stack_and(-5,3,7)=:={3,7},arithmetic_body:stack_not(0,7)=:={-1,7},' +
    'raw_arithmetic_body:band_stack_left(1,bad)=:={failed,1},' +
    'raw_arithmetic_body:bor_stack_right(bad,5)=:={failed,5},' +
    'arithmetic_body:stack_or(-5,2,7)=:={-5,7},arithmetic_body:stack_xor(-5,3,7)=:={-8,7},' +
    'raw_arithmetic_body:bxor_stack_both(bad)=:={failed,bad},' +
    'raw_arithmetic_body:bnot_stack(bad)=:={failed,bad},' +
    'arithmetic_body:stack_div(-7,3,7)=:={-2,7},arithmetic_body:stack_rem(-7,3,7)=:={-1,7},' +
    'raw_arithmetic_body:div_stack_left(7,0)=:={failed,7},' +
    'raw_arithmetic_body:rem_stack_right(bad,3)=:={failed,3},' +
    'raw_arithmetic_body:div_stack_both(0)=:={failed,0},' +
    'raw_arithmetic_body:rem_stack_both(0)=:={failed,0},' +
    'arithmetic_body:stack_add(3,4,7)=:={7,7},' +
    'arithmetic_body:stack_subtract(3,4,7)=:={-1,7},' +
    'arithmetic_body:stack_multiply(3,4,7)=:={12,7},' +
    'raw_arithmetic_body:divide_stack_body(5,2)=:=2.5,' +
    'raw_arithmetic_body:add_stack_left(9,bad)=:={failed,9},' +
    'raw_arithmetic_body:subtract_stack_right(bad,9)=:={failed,9},' +
    'raw_arithmetic_body:multiply_stack_both(bad)=:={failed,bad},' +
    'raw_arithmetic_body:divide_stack_right(5,0)=:={failed,0},' +
    'arithmetic_body:stack_negate(-3,7)=:={3,7},' +
    'arithmetic_body:stack_absolute(-3,7)=:={3,7},' +
    'raw_arithmetic_body:negate_stack_guard(bad)=:={failed,bad},' +
    'raw_arithmetic_body:abs_stack_guard(bad)=:={failed,bad},' +
    'raw_arithmetic_body:abs_stack_distinct(bad,7)=:={failed,7},' +
    'arithmetic_body:stack_trunc(-1.9,7)=:={-1,7},' +
    'arithmetic_body:stack_round(-1.5,7)=:={-2,7},' +
    'arithmetic_body:stack_floor(-1.9,7)=:={-2,7},' +
    'arithmetic_body:stack_ceil(1.9,7)=:={2,7},' +
    'arithmetic_body:stack_float(3,7)=:={3.0,7},' +
    'raw_arithmetic_body:trunc_stack_guard(bad)=:={failed,bad},' +
    'raw_arithmetic_body:round_stack_guard(bad)=:={failed,bad},' +
    'raw_arithmetic_body:floor_stack_guard(bad)=:={failed,bad},' +
    'raw_arithmetic_body:ceil_stack_guard(bad)=:={failed,bad},' +
    'raw_arithmetic_body:float_stack_guard(bad)=:={failed,bad},' +
    'raw_arithmetic_body:float_stack_distinct(1 bsl 1024,7)=:={failed,7},' +
    'erlang:\'+\'(2,3)=:=5,raw_bif_body:subtract_call_last(7,3)=:=4,' +
    'raw_bif_body:divide_call_tail(5,2)=:=2.5,' +
    'calls:arithmetic_bif_remote(6,7)=:={ok,{result,42}},' +
    'erlang:\'=:=\'(1,1)=:=true,raw_bif_body:exact_call_tail(1,1.0)=:=false,' +
    'raw_bif_body:exact_call_last(<<5:3>>,<<5:3>>)=:=true,' +
    'calls:exact_bif_remote(1,1.0)=:={ok,{result,false}},' +
    'erlang:\'band\'(-7,3)=:=1,raw_bif_body:bor_call_last(-7,3)=:=-5,' +
    'raw_bif_body:bxor_call(-7,3)=:={result,-6},raw_bif_body:bnot_call_tail(0)=:=-1,' +
    'raw_bif_body:div_call_last(-7,3)=:=-2,calls:integer_bif_remote(-7,3)=:={ok,{result,-1}},' +
    'erlang:\'==\'(1,1.0)=:=true,raw_bif_body:ne_call_last(1,1.0)=:=false,' +
    'raw_bif_body:exact_ne_call(1,1.0)=:={result,true},raw_bif_body:lt_call_tail(1,2)=:=true,' +
    'raw_bif_body:le_call_last(1,1.0)=:=true,calls:comparison_bif_remote(2,1)=:={ok,{result,true}},' +
    'raw_bif_body:ge_call_tail(1,2)=:=false,' +
    'erlang:list_to_tuple([9])=:={9},bif_body:from_list([9])=:={9},' +
    'raw_bif_body:tuple_to_list_last({5,6})=:=[5,6],' +
    'bif_body:tuple_roundtrip([9])=:={ok,[9]},' +
    'erlang:\'not\'(false)=:=true,bif_body:bool_and(true,false)=:=false,' +
    'bif_body:guard_or(true,bad)=:=no,raw_bif_body:bool_not_guard(bad)=:={failed,bad},' +
    'raw_bif_body:bool_xor_guard(true,false)=:=true,raw_bif_body:bool_or_call(true,false)=:={result,true},' +
    'erlang:integer_to_list(255)=:="255",raw_bif_body:integer_chars_last(255,16)=:="FF",' +
    'bif_body:integer_binary_base(-255,16)=:= <<"-FF">>,' +
    'bif_body:integer_text_pair(35,36)=:={"Z",<<"Z">>},' +
    '(try raw_bif_body:div_call_last(1,0),false catch error:badarith->true end),' +
    '(try raw_bif_body:list_to_tuple_last([9|tail]),false catch error:badarg->true end),' +
    '(try bif_body:to_list([]),false catch error:badarg->true end),' +
    '(try raw_bif_body:bool_and_y(false,bad),false catch error:badarg->true end),' +
    '(try erlang:\'or\'(true,bad),false catch error:badarg->true end),' +
    '(try bif_body:integer_chars_base(1,1),false catch error:badarg->true end),' +
    '(try erlang:integer_to_binary(1,16.0),false catch error:badarg->true end)]]),halt().',
  ]).trim();
  const schedulerOracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    'io:format("~w~n~w~n",[scheduler_fixture:count(11,8),scheduler_fixture:count(22,8)]),halt().',
  ]).trimEnd().split('\n');
  const identityOracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    '{P,Q}=process_identity:self_pair(), Other=spawn(fun()->ok end), ' +
    '{Live,Monitor}=spawn_monitor(fun()->receive stop->ok end end), ' +
    'WasAlive=erlang:is_process_alive(Live), Live!stop, ' +
    'receive {\'DOWN\',Monitor,process,Live,_}->ok end, ' +
    'Remote=binary_to_term(<<131,88,100,0,9,"fake@host",0:32,0:32,1:32>>), ' +
    'Bad=fun(Value)->try erlang:is_process_alive(Value), false catch error:badarg->true end end, ' +
    'Results=[is_pid(P),P=:=Q,P=:=self(),process_identity:pid_guard(P)=:=yes,' +
    'process_identity:pid_guard(1)=:=no,process_identity:pid_body(P),' +
    'not process_identity:pid_body(1),process_identity:compare_self()=:=same,' +
    'process_identity:compare(Other)=:=different,atom<P,P<{},' +
    'process_identity:pid_order(P)=:=yes,process_identity:pid_order(atom)=:=no,' +
    'WasAlive,process_identity:alive_self(),not process_identity:alive(Live),' +
    'not erlang:is_process_alive(Live),not erlang:is_process_alive(Live),Bad(bad),Bad(Remote)], ' +
    'io:format("~w~n",[Results]),halt().',
  ]).trim();
  const referenceOracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    '{R,S}=process_reference:pair(), Direct=process_reference:new(), ' +
    'Tail=raw_reference:ref_tail(), Last=raw_reference:ref_last(), {Call}=raw_reference:ref_call(), ' +
    'Self=self(), Self!{wanted,R}, Preserved=process_receive:wanted()=:=R, ' +
    '{TrueCall}=raw_reference:test_call(R), {FalseCall}=raw_reference:test_call(1), ' +
    'Results=[is_reference(R),R=/=S,process_reference:compare(R,R)=:=same,' +
    'process_reference:compare(R,S)=:=different,process_reference:ref_guard(R)=:=yes,' +
    'process_reference:ref_guard(1)=:=no,process_reference:ref_body(R),' +
    'not process_reference:ref_body(1),atom<R andalso R<Self,' +
    'process_reference:ref_order(R)=:=yes,process_reference:ref_order(atom)=:=no,' +
    '{[R]}=:={[R]},{[R]}=/={[S]},Preserved,is_reference(Tail),is_reference(Last),is_reference(Call),' +
    'raw_reference:test_tail(R) andalso not raw_reference:test_tail(1),' +
    'raw_reference:test_last(R) andalso not raw_reference:test_last(1),TrueCall andalso not FalseCall,' +
    'length(lists:usort([R,S,Direct,Tail,Last,Call]))=:=6], ' +
    'io:format("~w~n",[Results]),halt().',
  ]).trim();
  const dictionaryOracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    'Self=self(), Key={key,[1]}, Other={key,[1.0]}, Value={value,<<5:3>>}, ' +
    'Set=fun(L,E)->length(L)=:=length(E) andalso lists:all(fun(X)->lists:member(X,L) end,E) end, ' +
    'R=process_dictionary:exercise(Key,Key,Other,Value,Value,1.0), ' +
    'Absent=lists:all(fun(I)->element(I,R)=:=undefined end,[1,2,5,15]), ' +
    'Previous=element(3,R)=:=Value andalso element(4,R)=:=Value andalso element(10,R)=:=Value, ' +
    'Keys=Set(element(6,R),[Key,Other]) andalso Set(element(7,R),[Key]) andalso Set(element(8,R),[Other]), ' +
    'Pairs=Set(element(9,R),[{Key,Value},{Other,1.0}]) andalso ' +
    'Set(element(11,R),[{Other,1.0}]) andalso Set(element(12,R),[{Other,1.0}]), ' +
    'Cleared=element(13,R)=:=[] andalso element(14,R)=:=[], ' +
    'U=process_dictionary:undefined_value(Key), ' +
    'StoredUndefined=U=:={undefined,[Key],undefined,42,undefined,[]}, ' +
    'ExactValues=process_dictionary:value_keys()=:={[integer],[float],[],[negative_zero]}, erase(), ' +
    'Equal={undefined,found,found,undefined}, Unequal={undefined,undefined,undefined,found}, ' +
    'Ref=make_ref(), OtherRef=make_ref(), ' +
    'KeyEquality=process_dictionary:roundtrip(Key,Key)=:=Equal andalso ' +
    'process_dictionary:roundtrip(<<5:3>>,<<5:3>>)=:=Equal andalso ' +
    'process_dictionary:roundtrip(Ref,Ref)=:=Equal andalso ' +
    'process_dictionary:roundtrip(Ref,OtherRef)=:=Unequal, erase(), ' +
    'KeyEquality2=process_dictionary:roundtrip(0.0,-0.0)=:=Unequal, erase(), ' +
    'KeyEquality3=process_dictionary:roundtrip(1,1.0)=:=Unequal, erase(), ' +
    'OtherPid=spawn(fun()->ok end), ' +
    'KeyEquality4=process_dictionary:roundtrip(Self,Self)=:=Equal andalso ' +
    'process_dictionary:roundtrip(Self,OtherPid)=:=Unequal, erase(), ' +
    'spawn(fun()->Self!{direct,put(direct,1)} end), ' +
    'Direct=receive {direct,undefined}->get(direct)=:=undefined andalso erase()=:=[] after 5000->false end, ' +
    'spawn(fun()->Self!{store,process_dictionary:store(isolation,1)} end), ' +
    'Store=receive {store,undefined}->true after 5000->false end, ' +
    'spawn(fun()->Self!{read,process_dictionary:read(isolation)} end), ' +
    'Invocations=Store andalso receive {read,undefined}->true after 5000->false end, ' +
    'Raw=process_dictionary:raw(raw)=:={stored,stored,{stored}}, erase(), ' +
    'P=spawn(fun()->Self!{worker_result,self(),process_dictionary:worker(Self,shared,1)} end), ' +
    'Q=spawn(fun()->Self!{worker_result,self(),process_dictionary:worker(Self,shared,2)} end), ' +
    'receive {ready,P}->ok after 5000->erlang:error(timeout) end, ' +
    'receive {ready,Q}->ok after 5000->erlang:error(timeout) end, P!go,Q!go, ' +
    'PR=receive {worker_result,P,R1}->R1 after 5000->timeout end, ' +
    'QR=receive {worker_result,Q,R2}->R2 after 5000->timeout end, ' +
    'Workers=PR=:={undefined,1,1,undefined} andalso QR=:={undefined,2,2,undefined}, ' +
    'Child=process_dictionary:parent(inherited,parent)=:={undefined,parent}, ' +
    'io:format("~w~n",[[Absent,Previous,Keys,Pairs,Cleared,StoredUndefined,ExactValues,' +
    'KeyEquality andalso KeyEquality2 andalso KeyEquality3 andalso KeyEquality4,' +
    'Direct,Invocations,Raw,Workers,Child]]),halt().',
  ]).trim();
  const processInfoOracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    'Self=self(), Key={key,[1]}, Name=beam2js_process_info, ' +
    'Items=[{dictionary,[{local,value}]},{{dictionary,local},value},{{dictionary,missing},undefined},' +
    '{messages,[first,{second,2}]},{message_queue_len,2},{registered_name,[]},{status,running}], ' +
    'SelfInfo=process_info_fixture:self_report()=:=Items, ' +
    'receive first->ok after 5000->erlang:error(timeout) end, ' +
    'receive {second,2}->ok after 5000->erlang:error(timeout) end, erase(), ' +
    '{P,M}=spawn_monitor(process_info_fixture,target,[Self,Key]), ' +
    'receive {ready,P}->ok after 5000->erlang:error(timeout) end, ' +
    'Wait=fun F(0)->false; F(N)->case process_info(P,status) of ' +
    '{status,waiting}->true; _->timer:sleep(1),F(N-1) end end, Waiting=Wait(1000), ' +
    'Unregistered=process_info_fixture:query(P,registered_name)=:=[] andalso ' +
    'process_info(P,[registered_name])=:=[{registered_name,[]}], ' +
    'Set=fun(L,E)->length(L)=:=length(E) andalso lists:all(fun(X)->lists:member(X,L) end,E) end, ' +
    '{dictionary,D}=process_info(P,dictionary), Dictionary=Set(D,[{Key,value},{undefined_key,undefined}]), ' +
    'Lookup=process_info(P,{dictionary,Key})=:={{dictionary,Key},value} andalso ' +
    'process_info(P,{dictionary,missing})=:={{dictionary,missing},undefined} andalso ' +
    'process_info(P,{dictionary,undefined_key})=:={{dictionary,undefined_key},undefined} andalso ' +
    'process_info(P,[{dictionary,Key},{dictionary,Key}])=:=' +
    '[{{dictionary,Key},value},{{dictionary,Key},value}], ' +
    'P!first,P!{second,2}, Saved=process_info(P,messages), ' +
    'Queue=Saved=:={messages,[first,{second,2}]} andalso process_info(P,message_queue_len)=:={message_queue_len,2}, ' +
    'Duplicated=process_info(P,[message_queue_len,registered_name,message_queue_len,messages])=:=' +
    '[{message_queue_len,2},{registered_name,[]},{message_queue_len,2},{messages,[first,{second,2}]}] ' +
    'andalso process_info(P,[])=:=[], ' +
    'true=register(Name,P), Named=process_info(P,registered_name)=:={registered_name,Name} andalso ' +
    'process_info(P,[registered_name])=:=[{registered_name,Name}] andalso ' +
    'process_info_fixture:wrapped(P,message_queue_len)=:={result,{message_queue_len,2}} andalso ' +
    'erlang:process_info(P,message_queue_len)=:={message_queue_len,2}, ' +
    'Bad=fun(Pid,Item)->try process_info_fixture:query(Pid,Item),false catch error:badarg->true end end, ' +
    'Remote=binary_to_term(<<131,88,100,0,9,"fake@host",0:32,0:32,1:32>>), ' +
    'Invalid=lists:all(fun({Pid,Item})->Bad(Pid,Item) end,' +
    '[{1,messages},{bad,messages},{P,bad},{P,1},{P,[messages,bad]},' +
    '{P,[messages|tail]},{P,{dictionary}},{P,{bad,key}},{P,[memory,bad]},{Remote,messages}]), ' +
    'P!finish, receive {\'DOWN\',M,process,P,_}->ok after 5000->erlang:error(timeout) end, ' +
    'Snapshot=Saved=:={messages,[first,{second,2}]}, ' +
    'Dead=lists:all(fun(I)->process_info(P,I)=:=undefined end,[messages,memory,[],{dictionary,Key}]) ' +
    'andalso Bad(P,bad) andalso Bad(P,[memory,bad]), ' +
    'io:format("~w~n",[[SelfInfo,Unregistered,Waiting,Dictionary,Lookup,Queue,' +
    'Duplicated,Named,Invalid,Snapshot,Dead]]),halt().',
  ]).trim();
  const spawnOracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    'logger:set_primary_config(level,none), ' +
    'Args=[self(),3,4], Child=process_spawn:start(spawn_probe,record,Args), ' +
    'Recorded=receive {child,Child,3,4}->true after 30000->false end, ' +
    '{Parent,Nested}=process_spawn:parent_child(), ' +
    '{started,Wrapped}=process_spawn:across(spawn_probe,record,Args), ' +
    'Tail=raw_spawn:tail(spawn_probe,record,Args), Last=raw_spawn:last(spawn_probe,record,Args), ' +
    '{Call}=raw_spawn:call(spawn_probe,record,Args), ' +
    'Bad=fun(M,F,A)->try process_spawn:start(M,F,A),false catch error:badarg->true end end, ' +
    'Missing=process_spawn:start(missing,function,[]), ' +
    'Large=process_spawn:start(spawn_probe,record,lists:duplicate(256,0)), ' +
    'Results=[is_pid(Child),Recorded,Parent=/=Nested,is_pid(Wrapped),' +
    'is_pid(Tail),is_pid(Last),is_pid(Call),Bad(1,record,[]),Bad(spawn_probe,1,[]),' +
    'Bad(spawn_probe,record,bad),Bad(spawn_probe,record,[1|bad]),is_pid(Missing),is_pid(Large)], ' +
    'io:format("~w~n",[Results]),halt().',
  ]).trim();
  const sendOracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    'Self=self(), Message={payload,9}, Direct=process_send:send(Self,Message), ' +
    'Wrapped=process_send:wrapped(Self,wrapped), Callable=process_send:callable(Self,callable), ' +
    'Tail=raw_send:tail(Self,tail), Last=raw_send:last(Self,last), {Call}=raw_send:call(Self,call), ' +
    'Operator=raw_send:operator(Self,operator), ' +
    'Received=[receive V->V after 5000->timeout end || _<-lists:seq(1,7)], ' +
    'spawn(fun()->process_send:send_two(Self,{one,1},{one,2}) end), ' +
    'spawn(fun()->process_send:send_two(Self,{two,1},{two,2}) end), ' +
    'Concurrent=[receive V->V after 5000->timeout end || _<-lists:seq(1,4)], ' +
    'Ordered=lists:filter(fun({one,_})->true;(_)->false end,Concurrent)=:=[{one,1},{one,2}] andalso ' +
    'lists:filter(fun({two,_})->true;(_)->false end,Concurrent)=:=[{two,1},{two,2}], ' +
    'Bad=fun(D)->try process_send:send(D,invalid),false catch error:badarg->true end end, ' +
    '{P,Ref}=spawn_monitor(fun()->ok end), receive {\'DOWN\',Ref,process,P,_}->ok end, ' +
    'Dead=process_send:send(P,dead)=:=dead andalso erlang:send(P,Message)=:=Message, ' +
    'Results=[Direct=:=Message andalso Received=:=[Message,wrapped,callable,tail,last,call,operator], ' +
    'Wrapped=:={sent,wrapped},Callable=:=callable,Tail=:=tail,Last=:=last,Call=:=call,' +
    'Operator=:=operator,Ordered,Bad(unregistered),Bad(1),Bad([]),Bad({name,1}),Dead], ' +
    'io:format("~w~n",[Results]),halt().',
  ]).trim();
  const receiveOracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    'Self=self(), Self!ignored, Self!{wanted,1}, Self!{wanted,2}, ' +
    'Selected=process_receive:wanted()=:=1 andalso process_receive:wanted()=:=2 andalso ' +
    '(receive ignored->true after 5000->false end), ' +
    'Self!{second,2}, Self!{first,1}, Reset=process_receive:two()=:={1,2}, ' +
    'Self!{number,bad}, Self!{number,-1}, Self!{number,7}, ' +
    'Guards=process_receive:guarded()=:=7 andalso ' +
    '(receive {number,bad}->true after 5000->false end) andalso ' +
    '(receive {number,-1}->true after 5000->false end), ' +
    'Sync=process_receive:self_select()=:=42 andalso (receive ignored->true after 5000->false end), ' +
    'P=spawn(fun()->Self!{ready,self()}, V=process_receive:wanted(), ' +
    '{messages,Ms}=process_info(self(),messages), Self!{done,self(),V,Ms} end), ' +
    'receive {ready,P}->ok after 5000->erlang:error(timeout) end, P!ignored, P!{wanted,42}, ' +
    'Wake=receive {done,P,42,[ignored]}->true after 5000->false end, ' +
    'Q=spawn(fun()->Self!{ready,self()}, V2=process_receive:wanted(), Self!{done,self(),V2} end), ' +
    'receive {ready,Q}->ok after 5000->erlang:error(timeout) end, ' +
    'spawn(process_send,send,[Q,{wanted,77}]), ' +
    'Exchanged=receive {done,Q,77}->true after 5000->false end, ' +
    'Self!{second,20}, Self!{first,10}, Phases=process_receive:two()=:={10,20}, ' +
    'Self!raced, Race=receive raced->true after 5000->false end, ' +
    'io:format("~w~n",[[Selected,Reset,Guards,Sync,Wake,Exchanged,Phases,Race]]),halt().',
  ]).trim();
  const timeoutOracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    'Self=self(), Poll=receive_timeout:poll()=:=timeout, Zero=receive_timeout:timed(0)=:=timeout, ' +
    'Self!ignored, Self!{wanted,1}, ZeroMatch=receive_timeout:timed(0)=:={message,1} andalso ' +
    '(receive ignored->true after 5000->false end), ' +
    'Bad=fun(T)->try receive_timeout:timed(T),false catch error:timeout_value->true end end, ' +
    'Invalid=[Bad(-1),Bad(4294967296),Bad(1 bsl 80),Bad(1.0),Bad(bad)], ' +
    'Matched=receive_timeout:self_timed(-1)=:={message,found}, ' +
    'Reset=receive_timeout:reset_after()=:={timeout,123}, ' +
    'Self!ignored, Timeout=receive_timeout:timed(5)=:=timeout andalso ' +
    '(receive ignored->true after 5000->false end), ' +
    'P=spawn(fun()->Self!{ready,self()}, V=receive_timeout:timed(infinity), Self!{done,self(),V} end), ' +
    'receive {ready,P}->ok after 5000->erlang:error(timeout) end, P!{wanted,5}, ' +
    'Infinity=receive {done,P,{message,5}}->true after 5000->false end, ' +
    'Self!{first,10}, Cancelled=receive_timeout:two_announced(5)=:={10,second_timeout}, ' +
    'Self!untouched, Sleep=receive_timeout:sleep(5)=:=done andalso ' +
    '(receive untouched->true after 5000->false end), ' +
    'Q=spawn(fun()->Self!{ready,self()}, V=receive_timeout:timed(4294967295), Self!{done,self(),V} end), ' +
    'receive {ready,Q}->ok after 5000->erlang:error(timeout) end, timer:sleep(10), Q!{wanted,77}, ' +
    'Max=receive {done,Q,{message,77}}->true after 5000->false end, ' +
    'io:format("~w~n",[[Poll,Zero,ZeroMatch]++Invalid++[Matched,Reset,Timeout,Infinity,Cancelled,Sleep,Max]]),halt().',
  ]).trim();
  const timerBifOracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    'Self=self(), R=process_timer:send_later(10000,Self,ignored), ' +
    'Initial=process_timer:read(R), Remaining=process_timer:cancel(R), ' +
    'Absent=process_timer:read(R)=:=false andalso process_timer:cancel(R)=:=false, ' +
    'M={payload,9}, D=process_timer:send_later(10,Self,M), ' +
    'Delivered=(receive M->true after 5000->false end) andalso process_timer:read(D)=:=false, ' +
    '{started,T}=process_timer:wrapped(10,Self,tick), ' +
    'Wrapped=receive {timeout,T,tick}->true after 5000->false end, ' +
    'NotTimer=process_timer:read(make_ref())=:=false, ' +
    'Bad=fun(F)->try F(),false catch error:badarg->true end end, ' +
    'BadCases=[Bad(fun()->process_timer:send_later(-1,Self,x) end),' +
    'Bad(fun()->process_timer:start(infinity,Self,x) end),' +
    'Bad(fun()->process_timer:send_later(1.0,Self,x) end),' +
    'Bad(fun()->process_timer:start(1,123,x) end),' +
    'Bad(fun()->process_timer:read(bad) end),Bad(fun()->process_timer:cancel(1) end)], ' +
    '{P,Monitor}=spawn_monitor(fun()->receive go->ok end end), ' +
    'ExitRef=process_timer:start(10000,P,exit), P!go, ' +
    'receive {\'DOWN\',Monitor,process,P,_}->ok after 5000->erlang:error(timeout) end, ' +
    'DeadRef=process_timer:send_later(20,P,dead), ' +
    'Dead=process_timer:read(DeadRef)=:=false, Exit=process_timer:cancel(ExitRef)=:=false, ' +
    'io:format("~w~n",[[is_reference(R),is_integer(Initial) andalso Initial>0 andalso Initial=<10000,' +
    'is_integer(Remaining) andalso Remaining>0 andalso Remaining=<10000,Absent,Delivered,Wrapped,NotTimer]' +
    '++BadCases++[Dead,Exit]]),halt().',
  ]).trim();
  const timerOptionOracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    'Self=self(), Bad=fun(F)->try F(),false catch error:badarg->true end end, ' +
    'DefaultRef=process_timer:send_opts(5,Self,default,[]), ' +
    'CreatedDefault=is_reference(DefaultRef) andalso receive default->true after 5000->false end, ' +
    'Name=beam2js_timer_options, true=register(Name,Self), ' +
    'NamedRef=process_timer:start_opts(5,Name,named,[{abs,false}]), ' +
    'ConfiguredRelative=receive {timeout,NamedRef,named}->true after 5000->false end, ' +
    'true=unregister(Name), {started,WrapperRef}=process_timer:wrapped_opts(100000,Self,wrapped,[{abs,true},{abs,false}]), ' +
    'DuplicateRelative=is_integer(erlang:cancel_timer(WrapperRef)), ' +
    'InvalidCreation=lists:all(fun(X)->X end,[Bad(fun()->process_timer:send_opts(1,Self,bad,[{abs,yes}]) end),' +
    'Bad(fun()->process_timer:start_opts(1,Self,bad,[{async,false}]) end),' +
    'Bad(fun()->process_timer:send_opts(1,Self,bad,[bad]) end),' +
    'Bad(fun()->process_timer:send_opts(1,Self,bad,[{abs,false}|tail]) end),' +
    'Bad(fun()->process_timer:start_opts(1,Self,bad,bad) end),' +
    'Bad(fun()->process_timer:send_opts(1,Self,bad,[{abs}]) end),' +
    'Bad(fun()->process_timer:start_opts(-1,Self,bad,[{abs,false}]) end),' +
    'Bad(fun()->process_timer:send_opts(bad,Self,bad,[{abs,true}]) end),' +
    'Bad(fun()->process_timer:start_opts(1,123,bad,[{abs,true}]) end),' +
    'Bad(fun()->process_timer:send_opts(1,Self,bad,[{abs,true},{info,true}]) end)]), ' +
    'AbsRef=process_timer:send_opts(process_timer:now()+10,Self,absolute,[{abs,true}]), ' +
    'AbsolutePid=is_reference(AbsRef) andalso receive absolute->true after 5000->false end, ' +
    'true=register(Name,Self), ' +
    'AbsNamedRef=process_timer:start_opts(process_timer:now()+10,Name,named_absolute,[{abs,true}]), ' +
    'AbsoluteNamed=receive {timeout,AbsNamedRef,named_absolute}->true after 5000->false end, ' +
    'true=unregister(Name), ' +
    'PastRef=process_timer:send_opts(process_timer:now()-100,Self,past,[{abs,false},{abs,true}]), ' +
    'AbsolutePast=is_reference(PastRef) andalso receive past->true after 5000->false end, ' +
    'Units=[second,seconds,millisecond,milli_seconds,microsecond,micro_seconds,nanosecond,' +
    'nano_seconds,native,perf_counter,3,1000,1 bsl 80], ' +
    'MonotonicValid=lists:all(fun(U)->Before=erlang:monotonic_time(U), Value=process_timer:now_in(U), ' +
    'After=erlang:monotonic_time(U), Before=<Value andalso Value=<After end,Units) andalso ' +
    'begin BeforeNative=erlang:monotonic_time(), Native=process_timer:native_now(), ' +
    'AfterNative=erlang:monotonic_time(), BeforeNative=<Native andalso Native=<AfterNative end, ' +
    'MonotonicInvalid=lists:all(fun(U)->Bad(fun()->process_timer:now_in(U) end) end,[0,-1,bad,1.0]), ' +
    'New=fun()->erlang:send_after(100000,Self,timer) end, R=New(), ' +
    'Valid=fun(V)->is_integer(V) andalso V>0 andalso V=<100000 end, ' +
    'Defaults=Valid(process_timer:read_opts(R,[])) andalso ' +
    'Valid(erlang:read_timer(R,[{async,false}])), ' +
    'DuplicateSync=Valid(process_timer:read_opts(R,[{async,true},{async,false}])), ' +
    '{ok,{read_timer,R,Read}}=process_timer:read_reply(R,[{async,true}]), AsyncRead=Valid(Read), ' +
    '{ok,{read_timer,R,Dup}}=process_timer:read_reply(R,[{async,false},{async,true}]), DuplicateAsync=Valid(Dup), ' +
    'Missing=make_ref(), AsyncMissing=process_timer:read_reply(Missing,[{async,true}])=:={ok,{read_timer,Missing,false}}, ' +
    'C=New(), {ok,{cancel_timer,C,CVal}}=process_timer:cancel_reply(C,[{async,true},{info,true}]), ' +
    'AsyncCancel=Valid(CVal) andalso erlang:read_timer(C)=:=false, ' +
    'N=New(), NoInfo=process_timer:cancel_no_reply(N,[{async,true},{info,false}])=:={ok,no_reply} ' +
    'andalso erlang:read_timer(N)=:=false, ' +
    'S=New(), SyncSilent=process_timer:cancel_opts(S,[{info,true},{info,false}])=:=ok ' +
    'andalso erlang:read_timer(S)=:=false, ' +
    'I=New(), SyncInfo=Valid(process_timer:cancel_opts(I,[{info,false},{info,true}])), ' +
    'Invalid=lists:all(fun(X)->X end,[Bad(fun()->process_timer:read_opts(R,[{info,false}]) end),' +
    'Bad(fun()->process_timer:cancel_opts(R,[{async,yes}]) end),' +
    'Bad(fun()->process_timer:cancel_opts(R,[{unknown,true}]) end),' +
    'Bad(fun()->process_timer:read_opts(R,[bad]) end),' +
    'Bad(fun()->process_timer:cancel_opts(R,[{async,true}|tail]) end),' +
    'Bad(fun()->process_timer:read_opts(R,bad) end),' +
    'Bad(fun()->process_timer:cancel_opts(bad,[{async,true},{info,false}]) end),' +
    'Bad(fun()->process_timer:read_opts(R,[{async}]) end)]) andalso Valid(erlang:read_timer(R)), ' +
    'erlang:cancel_timer(R), Expired=erlang:send_after(1,Self,expired), ' +
    'receive expired->ok after 5000->erlang:error(timeout) end, ' +
    'AsyncExpired=process_timer:cancel_reply(Expired,[{async,true}])=:={ok,{cancel_timer,Expired,false}}, ' +
    'io:format("~w~n",[[CreatedDefault,ConfiguredRelative,DuplicateRelative,InvalidCreation,' +
    'AbsolutePid,AbsoluteNamed,AbsolutePast,MonotonicValid,MonotonicInvalid,' +
    'Defaults,DuplicateSync,AsyncRead,DuplicateAsync,AsyncMissing,AsyncCancel,' +
    'NoInfo,SyncSilent,SyncInfo,Invalid,AsyncExpired]]),halt().',
  ]).trim();
  const registryOracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    'logger:set_primary_config(level,none), Self=self(), Name=beam2js_registry_test, Other=beam2js_registry_other, ' +
    'Empty=process_registry:lookup(Name)=:=undefined andalso not lists:member(Name,process_registry:names()), ' +
    '{P,PM}=spawn_monitor(fun()->A=receive V1->V1 end,B=receive V2->V2 end,Self!{pair,A,B} end), ' +
    '{Sp,SM}=spawn_monitor(fun()->receive V3->Self!{spare,V3} end end), ' +
    '{bound,true}=process_registry:wrapped(Name,P), ' +
    'Bound=process_registry:lookup(Name)=:=P andalso lists:member(Name,process_registry:names()), ' +
    'Bad=fun(F)->try F(),false catch error:badarg->true end end, ' +
    'Invalid=lists:all(fun(X)->X end,[Bad(fun()->process_registry:bind(Name,P) end),' +
    'Bad(fun()->process_registry:bind(Name,Sp) end),Bad(fun()->process_registry:bind(Other,P) end),' +
    'Bad(fun()->process_registry:bind(undefined,Sp) end),Bad(fun()->process_registry:bind(1,Sp) end),' +
    'Bad(fun()->process_registry:bind(Other,1) end),Bad(fun()->process_registry:lookup(1) end),' +
    'Bad(fun()->process_registry:unbind(Other) end),Bad(fun()->process_registry:unbind(1) end)]), ' +
    'Sent=process_send:send(Name,one)=:=one andalso erlang:send(Name,two)=:=two, ' +
    'Delivered=Sent andalso receive {pair,one,two}->true after 5000->false end, ' +
    'receive {\'DOWN\',PM,process,P,_}->ok after 5000->erlang:error(timeout) end, ' +
    'Removed=process_registry:lookup(Name)=:=undefined andalso not lists:member(Name,process_registry:names()) ' +
    'andalso Bad(fun()->process_registry:bind(Other,P) end), ' +
    '{Former,FM}=spawn_monitor(fun()->receive finish->ok end end), ' +
    'true=process_registry:bind(Name,Former), true=process_registry:unbind(Name), ' +
    'true=process_registry:bind(Name,Sp), Former!finish, ' +
    'receive {\'DOWN\',FM,process,Former,_}->ok after 5000->erlang:error(timeout) end, ' +
    'Reused=process_registry:lookup(Name)=:=Sp andalso (Name!reused)=:=reused ' +
    'andalso receive {spare,reused}->true after 5000->false end, ' +
    'receive {\'DOWN\',SM,process,Sp,_}->ok after 5000->erlang:error(timeout) end, ' +
    '{SelfChild,SCM}=spawn_monitor(fun()->{SP,SQ}=process_registry:self_bind(Name),Self!{self_result,SP=:=SQ} end), ' +
    'SelfResult=receive {self_result,true}->true after 5000->false end, ' +
    'receive {\'DOWN\',SCM,process,SelfChild,_}->ok after 5000->erlang:error(timeout) end, ' +
    'SelfOK=SelfResult andalso process_registry:lookup(Name)=:=undefined, ' +
    '{Fail,FailM}=spawn_monitor(fun()->receive go->erlang:error(registry_failure) end end), ' +
    'true=process_registry:bind(Name,Fail), Fail!go, ' +
    'receive {\'DOWN\',FailM,process,Fail,_}->ok after 5000->erlang:error(timeout) end, ' +
    'FailureCleanup=process_registry:lookup(Name)=:=undefined, ' +
    'Later=erlang:send_after(100,Name,late), ' +
    '{Late,LM}=spawn_monitor(fun()->receive late->Self!late_delivered end end), ' +
    'true=process_registry:bind(Name,Late), ' +
    'LateBound=(receive late_delivered->true after 5000->false end) andalso erlang:read_timer(Later)=:=false, ' +
    'receive {\'DOWN\',LM,process,Late,_}->ok after 5000->erlang:error(timeout) end, ' +
    '{Old,OM}=spawn_monitor(fun()->receive stop->ok end end), true=process_registry:bind(Name,Old), ' +
    'Timer=erlang:start_timer(200,Name,tick), Old!stop, ' +
    'receive {\'DOWN\',OM,process,Old,_}->ok after 5000->erlang:error(timeout) end, ' +
    'StillTimer=is_integer(erlang:read_timer(Timer)), ' +
    '{Replacement,RM}=spawn_monitor(fun()->receive {timeout,Timer,tick}->Self!timer_delivered end end), ' +
    'true=process_registry:bind(Name,Replacement), ' +
    'Reregistered=StillTimer andalso receive timer_delivered->true after 5000->false end, ' +
    'receive {\'DOWN\',RM,process,Replacement,_}->ok after 5000->erlang:error(timeout) end, ' +
    'Lost=erlang:send_after(5,Name,lost), receive after 50->ok end, ' +
    'Disappeared=erlang:read_timer(Lost)=:=false andalso process_registry:lookup(Name)=:=undefined, ' +
    'io:format("~w~n",[[Empty,Bound,Invalid,Delivered,Removed,Reused,SelfOK,FailureCleanup,LateBound,Reregistered,Disappeared]]),halt().',
  ]).trim();
  const matchOracle = run('erl', ['-pa', dir, '-noshell', '-eval',
    'Huge=1 bsl 512, Long=lists:seq(1,10000), LongImproper=lists:foldl(fun(X,Acc)->[X|Acc] end,tail,Long), ' +
    'Bin=(fun(<<_:3,B:32/bitstring,_/bitstring>>)->B end)(<<0:3,0,1,2,255,0:1013>>), ' +
    'Ref=make_ref(), Pid=self(), OtherPid=spawn(fun()->ok end), ' +
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
    '{bif_body,stack_head,[[first|tail],7]},{bif_body,stack_head,[[],7]},' +
    '{bif_body,stack_tail,[[first|tail],7]},{bif_body,stack_tail,[[],7]},' +
    '{bif_body,stack_size,[{tag,5},7]},{bif_body,stack_size,[[],7]},' +
    '{bif_body,stack_element,[{tag,5},7]},{bif_body,stack_element,[{},7]},' +
    '{bif_body,stack_length,[[],7]},{bif_body,stack_length,[[first,second],7]},' +
    '{bif_body,stack_length,[[first|tail],7]},{bif_body,stack_length,[bad,7]},' +
    '{bif_body,stack_length,[Long,7]},{bif_body,stack_length,[LongImproper,7]},' +
    '{raw_bif_body,length_guard_stack,[[]]},{raw_bif_body,length_guard_stack,[[first,second]]},' +
    '{raw_bif_body,length_guard_stack,[[first|tail]]},{raw_bif_body,length_guard_stack,[bad]},' +
    '{raw_bif_body,length_guard_stack,[Long]},' +
    '{bif_body,stack_bits,[<<>>,7]},{bif_body,stack_bits,[<<1:1>>,7]},' +
    '{bif_body,stack_bits,[<<1,1:1>>,7]},{bif_body,stack_bits,[Bin,7]},{bif_body,stack_bits,[bad,7]},' +
    '{bif_body,stack_bytes,[<<>>,7]},{bif_body,stack_bytes,[<<1:1>>,7]},' +
    '{bif_body,stack_bytes,[<<1,1:1>>,7]},{bif_body,stack_bytes,[Bin,7]},{bif_body,stack_bytes,[bad,7]},' +
    '{raw_bif_body,bits_guard_stack,[<<>>]},{raw_bif_body,bits_guard_stack,[<<1,1:1>>]},' +
    '{raw_bif_body,bits_guard_stack,[bad]},{raw_bif_body,bytes_guard_stack,[<<>>]},' +
    '{raw_bif_body,bytes_guard_stack,[<<1:1>>]},{raw_bif_body,bytes_guard_stack,[<<1,1:1>>]},' +
    '{raw_bif_body,bytes_guard_stack,[bad]},' +
    '{bif_body,stack_part,[Bin,1,2,7]},{bif_body,stack_part,[Bin,4,-2,7]},' +
    '{bif_body,stack_part,[Bin,4,0,7]},{bif_body,stack_part,[Bin,0,-1,7]},' +
    '{bif_body,stack_part,[<<1,1:1>>,0,1,7]},{bif_body,stack_part,[Bin,1.0,1,7]},' +
    '{bif_body,stack_part2,[Bin,{1,2},7]},{bif_body,stack_part2,[Bin,{4,-2},7]},' +
    '{bif_body,stack_part2,[Bin,{4,0},7]},{bif_body,stack_part2,[Bin,{0,-1},7]},' +
    '{bif_body,stack_part2,[Bin,{1},7]},{bif_body,stack_part2,[<<1,1:1>>,{0,0},7]},' +
    '{raw_bif_body,part2_guard_source,[Bin,{4,-2}]},{raw_bif_body,part2_guard_source,[Bin,{0,-1}]},' +
    '{raw_bif_body,part2_guard_range,[Bin,{4,-2}]},{raw_bif_body,part2_guard_range,[Bin,{0,-1}]},' +
    '{raw_bif_body,part2_guard_range,[Bin,{1}]},' +
    '{raw_bif_body,part2_guard_x,[Bin,{4,-2}]},{raw_bif_body,part2_guard_x,[Bin,{0,-1}]},' +
    '{raw_bif_body,part3_guard_source,[Bin,4,-2]},{raw_bif_body,part3_guard_source,[<<1,1:1>>,0,1]},' +
    '{raw_bif_body,part3_guard_position,[Bin,1,2]},{raw_bif_body,part3_guard_position,[Bin,-1,1]},' +
    '{raw_bif_body,part3_guard_length,[Bin,1,2]},{raw_bif_body,part3_guard_length,[Bin,0,-1]},' +
    '{raw_bif_body,part3_guard_length,[Bin,1,1 bsl 80]},' +
    '{raw_bif_body,head_guard_stack,[[first|tail]]},{raw_bif_body,head_guard_stack,[[]]},' +
    '{raw_bif_body,tail_guard_stack,[[first|tail]]},{raw_bif_body,tail_guard_stack,[bad]},' +
    '{raw_bif_body,size_guard_stack,[{tag,5}]},{raw_bif_body,size_guard_stack,[bad]},' +
    '{raw_bif_body,element_guard_stack,[2,{tag,5}]},{raw_bif_body,element_guard_stack,[0,{tag,5}]},' +
    '{raw_bif_body,element_guard_stack,[3,{tag,5}]},{raw_bif_body,element_guard_stack,[1.0,{tag,5}]},' +
    '{raw_bif_body,element_guard_stack,[1,bad]},' +
    '{raw_bif_body,element_guard_index_stack,[2,{tag,5}]},' +
    '{raw_bif_body,element_guard_index_stack,[0,{tag,5}]},' +
    '{raw_bif_body,element_guard_index_stack,[1 bsl 80,{tag,5}]},' +
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
    'lists:append([[{bif_body,stack_predicates,[V,ok]},{raw_bif_body,predicates_stack,[V]}] || ' +
    'V <- [0,1.5,true,other,[],[first|tail],{tag,5},<<>>,Bin,<<1,1:1>>,self(),make_ref()]]) ++ ' +
    '[{raw_bif_body,predicate_x_stack,[0]},{raw_bif_body,predicate_x_stack,[bad]}] ++ ' +
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
    '{calls,binary_bif_remote,[Bin,4,-2]},{calls,binary_bif_remote,[Bin,0,-1]},' +
    '{erlang,\'=:=\',[1,1]},{erlang,\'=:=\',[1,1.0]},{erlang,\'=:=\',[0.0,-0.0]},' +
    '{erlang,\'=:=\',[1 bsl 100,1 bsl 100]},' +
    '{erlang,\'=:=\',[{[first,second],<<1,1:1>>},{[first,second],<<1,1:1>>}]},' +
    '{erlang,\'=:=\',[{[first|tail]},{[first|other]}]},' +
    '{erlang,\'=:=\',[Bin,<<1,1:1>>]},{erlang,\'=:=\',[[],nil]},' +
    '{erlang,\'=:=\',[Ref,Ref]},{erlang,\'=:=\',[Ref,make_ref()]},' +
    '{erlang,\'=:=\',[Pid,Pid]},{erlang,\'=:=\',[Pid,OtherPid]},' +
    '{erlang,\'=:=\',[Pid,Ref]},{erlang,\'=:=\',[Long,lists:map(fun(X)->X end,Long)]},' +
    '{raw_bif_body,exact_call_tail,[1,1]},{raw_bif_body,exact_call_tail,[1,1.0]},' +
    '{raw_bif_body,exact_call_last,[<<1,1:1>>,<<1,1:1>>]},' +
    '{raw_bif_body,exact_call_last,[<<1,1:1>>,Bin]},' +
    '{raw_bif_body,exact_call,[[first|tail],[first|tail]]},' +
    '{raw_bif_body,exact_call,[[first|tail],[first,second]]},' +
    '{calls,exact_bif_remote,[1,1]},{calls,exact_bif_remote,[1,1.0]}] ++ ' +
    '[{erlang,Op,[L,R]} || Op <- [\'==\',\'/=\',\'=/=\',\'<\',\'=<\',\'>\',\'>=\'], ' +
    '{L,R} <- [{1,1},{1,1.0},{0.0,-0.0},{9007199254740993,9007199254740992.0},' +
    '{-(1 bsl 100),1 bsl 100},{a,b},{1,a},{{1,[first,second]},{1.0,[first,second]}},' +
    '{[first,second],[first|tail]},{[first|tail],[first,second]},' +
    '{Bin,<<1,1:1>>},{<<1,1:1>>,<<1,1:1>>},{[],[]},' +
    '{Ref,Ref},{Pid,Pid},{Ref,Pid},{Long,lists:map(fun(X)->X end,Long)}]] ++ ' +
    '[{raw_bif_body,eq_call_tail,[1,1.0]},{raw_bif_body,eq_call_tail,[1,2]},' +
    '{raw_bif_body,ne_call_last,[1,1.0]},{raw_bif_body,ne_call_last,[1,2]},' +
    '{raw_bif_body,exact_ne_call,[1,1.0]},{raw_bif_body,exact_ne_call,[1,1]},' +
    '{raw_bif_body,lt_call_tail,[1,2]},{raw_bif_body,lt_call_tail,[2,1]},' +
    '{raw_bif_body,le_call_last,[1,1.0]},{raw_bif_body,le_call_last,[2,1]},' +
    '{raw_bif_body,gt_call,[2,1]},{raw_bif_body,gt_call,[1,2]},' +
    '{raw_bif_body,ge_call_tail,[2,1]},{raw_bif_body,ge_call_tail,[1,2]},' +
    '{calls,comparison_bif_remote,[2,1]},{calls,comparison_bif_remote,[1,2]}] ++ ' +
    '[{erlang,list_to_tuple,[[]]},{erlang,list_to_tuple,[[first,second]]},' +
    '{erlang,list_to_tuple,[[{tag,5},<<1,1:1>>]]},' +
    '{erlang,list_to_tuple,[[first|tail]]},{erlang,list_to_tuple,[LongImproper]},' +
    '{erlang,list_to_tuple,[bad]},{erlang,list_to_tuple,[{}]},' +
    '{erlang,tuple_to_list,[{}]},{erlang,tuple_to_list,[{tag,5}]},' +
    '{erlang,tuple_to_list,[{{tag,5},<<1,1:1>>}]},' +
    '{erlang,tuple_to_list,[[]]},{erlang,tuple_to_list,[[first,second]]},' +
    '{erlang,tuple_to_list,[bad]},' +
    '{bif_body,from_list,[[first,second]]},{bif_body,from_list,[[first|tail]]},' +
    '{bif_body,to_list,[{tag,5}]},{bif_body,to_list,[[]]},' +
    '{bif_body,tuple_roundtrip,[[{tag,5},<<1,1:1>>]]},' +
    '{bif_body,tuple_roundtrip,[[first|tail]]},' +
    '{raw_bif_body,list_to_tuple_last,[[first,second]]},' +
    '{raw_bif_body,list_to_tuple_last,[[first|tail]]},' +
    '{raw_bif_body,tuple_to_list_last,[{tag,5}]},{raw_bif_body,tuple_to_list_last,[[]]}] ++ ' +
    '[{M,F,[V]} || {M,F} <- [{erlang,\'not\'},{bif_body,bool_not},{bif_body,guard_not},' +
    '{raw_bif_body,bool_not_y},{raw_bif_body,bool_not_guard},{raw_bif_body,bool_not_call}], ' +
    'V <- [true,false,bad,0,[]]] ++ ' +
    'lists:append([[{M,F,[L,R]} || {M,F} <- [{erlang,Op},{bif_body,Body},{bif_body,Guard},' +
    '{raw_bif_body,Y},{raw_bif_body,RawGuard},{raw_bif_body,Call}], ' +
    'L <- [true,false,bad,0,[]], R <- [true,false,bad,0,[]]] || ' +
    '{Op,Body,Guard,Y,RawGuard,Call} <- ' +
    '[{\'and\',bool_and,guard_and,bool_and_y,bool_and_guard,bool_and_call},' +
    '{\'or\',bool_or,guard_or,bool_or_y,bool_or_guard,bool_or_call},' +
    '{\'xor\',bool_xor,guard_xor,bool_xor_y,bool_xor_guard,bool_xor_call}]]) ++ ' +
    '[{raw_bif_body,bool_xor_same,[V]} || V <- [true,false,bad,0,[]]] ++ ' +
    'lists:append([[{erlang,Name,[V]} || V <- [0,-123,Huge,-Huge,1.0,bad,{}]] ++ ' +
    '[{erlang,Name,[V,Base]} || Base <- lists:seq(2,36), V <- [0,Huge+123,-Huge-123]] ++ ' +
    '[{erlang,Name,[V,Base]} || {V,Base} <- [{42,0},{42,1},{42,37},{42,1 bsl 1024},' +
    '{42,10.0},{42,bad},{1.0,10},{bad,10},{[],10}]] || ' +
    'Name <- [integer_to_list,integer_to_binary]]) ++ ' +
    '[{bif_body,integer_chars,[-123]},{bif_body,integer_chars,[bad]},' +
    '{bif_body,integer_chars_base,[-255,16]},{bif_body,integer_chars_base,[1,1]},' +
    '{bif_body,integer_binary,[-123]},{bif_body,integer_binary,[1.0]},' +
    '{bif_body,integer_binary_base,[35,36]},{bif_body,integer_binary_base,[1,37]},' +
    '{bif_body,integer_text_pair,[-255,16]},{bif_body,integer_text_pair,[1,1]},' +
    '{raw_bif_body,integer_chars_last,[255,16]},{raw_bif_body,integer_chars_last,[1,1]},' +
    '{raw_bif_body,integer_binary_last,[-255,16]},{raw_bif_body,integer_binary_last,[[],10]}], ' +
    'lists:foreach(fun({M,F,A}) -> Result=try apply(M,F,A) of V->{ok,V} ' +
    'catch C:R->{C,R} end, io:format("~w~n",[Result]) end,Cases), ' +
    'LongTuple=list_to_tuple(Long), LongRoundtrip=tuple_size(LongTuple)=:=10000 andalso ' +
    'element(1,LongTuple)=:=1 andalso element(10000,LongTuple)=:=10000 andalso ' +
    'tuple_to_list(LongTuple)=:=Long, io:format("~w~n",[{ok,LongRoundtrip}]),halt().',
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
    '{arithmetic_body,stack_add,[Huge,1,7]},{arithmetic_body,stack_add,[-0.0,-0.0,7]},' +
    '{arithmetic_body,stack_add,[1.5,2,7]},{arithmetic_body,stack_add,[Max,Max,7]},' +
    '{arithmetic_body,stack_add,[bad,1,7]},{arithmetic_body,stack_subtract,[7,9,7]},' +
    '{arithmetic_body,stack_subtract,[-0.0,0.0,7]},{arithmetic_body,stack_subtract,[1,bad,7]},' +
    '{arithmetic_body,stack_subtract,[Max,-Max,7]},{arithmetic_body,stack_multiply,[-7,3,7]},' +
    '{arithmetic_body,stack_multiply,[Tiny,0.5,7]},{arithmetic_body,stack_multiply,[Max,2.0,7]},' +
    '{arithmetic_body,stack_multiply,[Huge,0.0,7]},{arithmetic_body,stack_multiply,[bad,1,7]},' +
    '{arithmetic_body,stack_divide,[5,2,7]},{arithmetic_body,stack_divide,[-0.0,2.0,7]},' +
    '{arithmetic_body,stack_divide,[1,0,7]},{arithmetic_body,stack_divide,[Max,0.5,7]},' +
    '{arithmetic_body,stack_divide,[Huge,Huge,7]},' +
    '{raw_arithmetic_body,add_stack_left,[3,4]},{raw_arithmetic_body,add_stack_left,[-0.0,-0.0]},' +
    '{raw_arithmetic_body,add_stack_left,[bad,2]},{raw_arithmetic_body,add_stack_left,[9,bad]},' +
    '{raw_arithmetic_body,add_stack_left,[Max,Max]},{raw_arithmetic_body,add_stack_left,[Huge,1.0]},' +
    '{raw_arithmetic_body,subtract_stack_right,[3,9]},' +
    '{raw_arithmetic_body,subtract_stack_right,[-0.0,0.0]},' +
    '{raw_arithmetic_body,subtract_stack_right,[bad,9]},{raw_arithmetic_body,subtract_stack_right,[9,bad]},' +
    '{raw_arithmetic_body,subtract_stack_right,[Max,-Max]},' +
    '{raw_arithmetic_body,multiply_stack_both,[-7]},{raw_arithmetic_body,multiply_stack_both,[-0.0]},' +
    '{raw_arithmetic_body,multiply_stack_both,[Max]},{raw_arithmetic_body,multiply_stack_both,[bad]},' +
    '{raw_arithmetic_body,divide_stack_right,[5,2]},{raw_arithmetic_body,divide_stack_right,[-0.0,2.0]},' +
    '{raw_arithmetic_body,divide_stack_right,[5,0]},{raw_arithmetic_body,divide_stack_right,[5,-0.0]},' +
    '{raw_arithmetic_body,divide_stack_right,[bad,2]},{raw_arithmetic_body,divide_stack_right,[5,bad]},' +
    '{raw_arithmetic_body,divide_stack_right,[Max,0.5]},{raw_arithmetic_body,divide_stack_right,[Huge,2]},' +
    '{raw_arithmetic_body,divide_stack_body,[5,2]},{raw_arithmetic_body,divide_stack_body,[-0.0,2.0]},' +
    '{raw_arithmetic_body,divide_stack_body,[5,0]},{raw_arithmetic_body,divide_stack_body,[Huge,2]},' +
    '{raw_arithmetic_body,divide_stack_body,[bad,2]},' +
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
    '{arithmetic_body,stack_div,[-7,3,7]},{arithmetic_body,stack_div,[7,-3,7]},' +
    '{arithmetic_body,stack_div,[Huge,-7,7]},{arithmetic_body,stack_div,[1,0,7]},' +
    '{arithmetic_body,stack_div,[1,bad,7]},{arithmetic_body,stack_div,[1.0,2,7]},' +
    '{arithmetic_body,stack_rem,[-7,3,7]},{arithmetic_body,stack_rem,[7,-3,7]},' +
    '{arithmetic_body,stack_rem,[Huge,-7,7]},{arithmetic_body,stack_rem,[1,0,7]},' +
    '{arithmetic_body,stack_rem,[bad,2,7]},{arithmetic_body,stack_rem,[1,2.0,7]},' +
    '{raw_arithmetic_body,div_stack_left,[-7,3]},{raw_arithmetic_body,div_stack_left,[7,0]},' +
    '{raw_arithmetic_body,div_stack_left,[bad,2]},{raw_arithmetic_body,div_stack_left,[7,2.0]},' +
    '{raw_arithmetic_body,rem_stack_right,[-7,3]},{raw_arithmetic_body,rem_stack_right,[7,0]},' +
    '{raw_arithmetic_body,rem_stack_right,[bad,2]},{raw_arithmetic_body,rem_stack_right,[7,bad]},' +
    '{raw_arithmetic_body,rem_stack_right,[1.0,2]},' +
    '{raw_arithmetic_body,div_stack_both,[-7]},{raw_arithmetic_body,div_stack_both,[0]},' +
    '{raw_arithmetic_body,div_stack_both,[bad]},{raw_arithmetic_body,div_stack_both,[2.0]},' +
    '{raw_arithmetic_body,rem_stack_both,[-7]},{raw_arithmetic_body,rem_stack_both,[0]},' +
    '{raw_arithmetic_body,rem_stack_both,[bad]},{raw_arithmetic_body,rem_stack_both,[2.0]},' +
    '{arithmetic_body,bit_and,[-5,3]},{arithmetic_body,bit_and,[Huge,-1]},' +
    '{arithmetic_body,bit_and,[1.0,1]},{arithmetic_body,bit_or,[-5,2]},' +
    '{arithmetic_body,bit_or,[Huge,5]},{arithmetic_body,bit_or,[1,bad]},' +
    '{arithmetic_body,bit_xor,[-5,3]},{arithmetic_body,bit_xor,[Huge,-1]},' +
    '{arithmetic_body,bit_xor,[bad,1]},{arithmetic_body,bit_not,[0]},' +
    '{arithmetic_body,bit_not,[-5]},{arithmetic_body,bit_not,[Huge]},' +
    '{arithmetic_body,bit_not,[1.0]},' +
    '{arithmetic_body,stack_and,[-5,3,7]},{arithmetic_body,stack_and,[Huge,-1,7]},' +
    '{arithmetic_body,stack_and,[1.0,1,7]},{arithmetic_body,stack_and,[1,bad,7]},' +
    '{arithmetic_body,stack_or,[-5,2,7]},{arithmetic_body,stack_or,[Huge,5,7]},' +
    '{arithmetic_body,stack_or,[bad,1,7]},' +
    '{arithmetic_body,stack_xor,[-5,3,7]},{arithmetic_body,stack_xor,[Huge,-1,7]},' +
    '{arithmetic_body,stack_xor,[1,bad,7]},' +
    '{arithmetic_body,stack_not,[0,7]},{arithmetic_body,stack_not,[-5,7]},' +
    '{arithmetic_body,stack_not,[Huge,7]},{arithmetic_body,stack_not,[1.0,7]},' +
    '{raw_arithmetic_body,band_stack_left,[-5,3]},{raw_arithmetic_body,band_stack_left,[bad,3]},' +
    '{raw_arithmetic_body,band_stack_left,[1,bad]},{raw_arithmetic_body,bor_stack_right,[-5,2]},' +
    '{raw_arithmetic_body,bor_stack_right,[bad,7]},{raw_arithmetic_body,bor_stack_right,[1,bad]},' +
    '{raw_arithmetic_body,bxor_stack_both,[Huge]},{raw_arithmetic_body,bxor_stack_both,[bad]},' +
    '{raw_arithmetic_body,bxor_stack_both,[1.0]},{raw_arithmetic_body,bnot_stack,[-5]},' +
    '{raw_arithmetic_body,bnot_stack,[Huge]},{raw_arithmetic_body,bnot_stack,[bad]},' +
    '{raw_arithmetic_body,bnot_stack,[1.0]},{arithmetic_body,quotient_across,[7,3]},' +
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
    '{arithmetic_body,stack_negate,[0,7]},{arithmetic_body,stack_negate,[-Huge,7]},' +
    '{arithmetic_body,stack_negate,[0.0,7]},{arithmetic_body,stack_negate,[-0.0,7]},' +
    '{arithmetic_body,stack_negate,[-Tiny,7]},{arithmetic_body,stack_negate,[bad,7]},' +
    '{arithmetic_body,stack_absolute,[-Huge,7]},{arithmetic_body,stack_absolute,[0.0,7]},' +
    '{arithmetic_body,stack_absolute,[-0.0,7]},{arithmetic_body,stack_absolute,[-Tiny,7]},' +
    '{arithmetic_body,stack_absolute,[-Max,7]},{arithmetic_body,stack_absolute,[bad,7]},' +
    '{raw_arithmetic_body,negate_stack_guard,[-Huge]},{raw_arithmetic_body,negate_stack_guard,[0.0]},' +
    '{raw_arithmetic_body,negate_stack_guard,[-0.0]},{raw_arithmetic_body,negate_stack_guard,[bad]},' +
    '{raw_arithmetic_body,abs_stack_guard,[-Huge]},{raw_arithmetic_body,abs_stack_guard,[-0.0]},' +
    '{raw_arithmetic_body,abs_stack_guard,[-Tiny]},{raw_arithmetic_body,abs_stack_guard,[bad]},' +
    '{raw_arithmetic_body,abs_stack_distinct,[-5,7]},{raw_arithmetic_body,abs_stack_distinct,[bad,7]},' +
    '{raw_arithmetic_body,abs_stack_distinct,[bad,-0.0]},' +
    '{arithmetic_body,stack_trunc,[-1.9,7]},{arithmetic_body,stack_trunc,[1.9,7]},' +
    '{arithmetic_body,stack_trunc,[Huge,7]},{arithmetic_body,stack_trunc,[-0.0,7]},' +
    '{arithmetic_body,stack_trunc,[Max,7]},{arithmetic_body,stack_trunc,[bad,7]},' +
    '{arithmetic_body,stack_round,[-1.5,7]},{arithmetic_body,stack_round,[1.5,7]},' +
    '{arithmetic_body,stack_round,[-0.5,7]},{arithmetic_body,stack_round,[0.49999999999999994,7]},' +
    '{arithmetic_body,stack_round,[bad,7]},{arithmetic_body,stack_floor,[-1.9,7]},' +
    '{arithmetic_body,stack_floor,[-Tiny,7]},{arithmetic_body,stack_floor,[Huge,7]},' +
    '{arithmetic_body,stack_floor,[bad,7]},{arithmetic_body,stack_ceil,[1.9,7]},' +
    '{arithmetic_body,stack_ceil,[Tiny,7]},{arithmetic_body,stack_ceil,[-Tiny,7]},' +
    '{arithmetic_body,stack_ceil,[Huge,7]},{arithmetic_body,stack_ceil,[bad,7]},' +
    '{arithmetic_body,stack_float,[0,7]},{arithmetic_body,stack_float,[9007199254740993,7]},' +
    '{arithmetic_body,stack_float,[MaxIntegerFloat,7]},{arithmetic_body,stack_float,[FloatOverflowTie-1,7]},' +
    '{arithmetic_body,stack_float,[FloatOverflowTie,7]},{arithmetic_body,stack_float,[-FloatOverflowTie+1,7]},' +
    '{arithmetic_body,stack_float,[-FloatOverflowTie,7]},{arithmetic_body,stack_float,[Huge,7]},' +
    '{arithmetic_body,stack_float,[-0.0,7]},{arithmetic_body,stack_float,[bad,7]},' +
    '{raw_arithmetic_body,trunc_stack_guard,[-1.9]},{raw_arithmetic_body,trunc_stack_guard,[bad]},' +
    '{raw_arithmetic_body,round_stack_guard,[-1.5]},{raw_arithmetic_body,round_stack_guard,[bad]},' +
    '{raw_arithmetic_body,floor_stack_guard,[-Tiny]},{raw_arithmetic_body,floor_stack_guard,[bad]},' +
    '{raw_arithmetic_body,ceil_stack_guard,[Tiny]},{raw_arithmetic_body,ceil_stack_guard,[bad]},' +
    '{raw_arithmetic_body,float_stack_guard,[9007199254740993]},{raw_arithmetic_body,float_stack_guard,[-0.0]},' +
    '{raw_arithmetic_body,float_stack_guard,[FloatOverflowTie]},{raw_arithmetic_body,float_stack_guard,[Huge]},' +
    '{raw_arithmetic_body,float_stack_guard,[bad]},{raw_arithmetic_body,float_stack_distinct,[3,7]},' +
    '{raw_arithmetic_body,float_stack_distinct,[Huge,7]},{raw_arithmetic_body,float_stack_distinct,[bad,-0.0]},' +
    '{arithmetic_body,across,[2,3]},{arithmetic_body,across,[bad,3]},' +
    '{raw_arithmetic_body,add_alias,[3,4]},{raw_arithmetic_body,add_alias,[3,bad]},' +
    '{raw_arithmetic_body,divide_literal,[5]},{raw_arithmetic_body,divide_literal,[bad]},' +
    '{raw_arithmetic_body,add_y,[7,8]},{raw_arithmetic_body,add_y,[bad,8]},' +
    '{raw_arithmetic_body,negate,[0.0]},{raw_arithmetic_body,negate,[bad]},' +
    '{erlang,abs,[-Huge]},{erlang,abs,[-0.0]},{erlang,abs,[bad]},' +
    '{erlang,trunc,[-1.9]},{erlang,trunc,[Huge]},{erlang,trunc,[bad]},' +
    '{erlang,round,[-1.5]},{erlang,round,[0.49999999999999994]},{erlang,round,[bad]},' +
    '{erlang,floor,[-Tiny]},{erlang,floor,[Huge]},{erlang,floor,[bad]},' +
    '{erlang,ceil,[Tiny]},{erlang,ceil,[-1.9]},{erlang,ceil,[bad]},' +
    '{erlang,float,[9007199254740993]},{erlang,float,[FloatOverflowTie-1]},' +
    '{erlang,float,[FloatOverflowTie]},{erlang,float,[-0.0]},{erlang,float,[bad]},' +
    '{raw_bif_body,abs_call_tail,[-0.0]},{raw_bif_body,abs_call_tail,[bad]},' +
    '{raw_bif_body,round_call_last,[-1.5]},{raw_bif_body,round_call_last,[bad]},' +
    '{raw_bif_body,float_call,[9007199254740993]},{raw_bif_body,float_call,[Huge]},' +
    '{calls,numeric_bif_remote,[-0.0]},{calls,numeric_bif_remote,[bad]},' +
    '{erlang,\'+\',[Huge,1]},{erlang,\'+\',[-0.0,-0.0]},{erlang,\'+\',[1.5,2]},{erlang,\'+\',[bad,1]},' +
    '{erlang,\'+\',[Max,Max]},{erlang,\'+\',[Huge,0.0]},' +
    '{erlang,\'-\',[0]},{erlang,\'-\',[-Huge]},{erlang,\'-\',[-0.0]},{erlang,\'-\',[bad]},' +
    '{erlang,\'-\',[7,9]},{erlang,\'-\',[-0.0,0.0]},{erlang,\'-\',[1,bad]},' +
    '{erlang,\'-\',[Max,-Max]},{erlang,\'*\',[-7,3]},{erlang,\'*\',[Tiny,0.5]},' +
    '{erlang,\'*\',[Max,2.0]},{erlang,\'*\',[bad,1]},' +
    '{erlang,\'/\',[5,2]},{erlang,\'/\',[-0.0,2.0]},{erlang,\'/\',[Huge,Huge]},' +
    '{erlang,\'/\',[1,0]},{erlang,\'/\',[1.0,-0.0]},{erlang,\'/\',[Max,0.5]},' +
    '{erlang,\'/\',[bad,2]},' +
    '{raw_bif_body,add_call_tail,[2,3]},{raw_bif_body,add_call_tail,[bad,3]},' +
    '{raw_bif_body,subtract_call_last,[-0.0,0.0]},{raw_bif_body,subtract_call_last,[bad,3]},' +
    '{raw_bif_body,multiply_call,[-7,3]},{raw_bif_body,multiply_call,[bad,3]},' +
    '{raw_bif_body,divide_call_tail,[5,2]},{raw_bif_body,divide_call_tail,[1,0]},' +
    '{raw_bif_body,negate_call,[-0.0]},{raw_bif_body,negate_call,[bad]},' +
    '{calls,arithmetic_bif_remote,[6,7]},{calls,arithmetic_bif_remote,[bad,7]}] ++ ' +
    '[{erlang,Op,[L,R]} || Op <- [\'band\',\'bor\',\'bxor\',\'div\',\'rem\'], ' +
    '{L,R} <- [{-7,3},{-7,-3},{7,-3},{Huge,-7},{-Huge,Huge+1},{0,0},{1,0},' +
    '{1.0,3},{3,1.0},{bad,1},{1,bad}]] ++ ' +
    '[{erlang,\'bnot\',[V]} || V <- [0,-Huge,1.0,bad]] ++ ' +
    '[{raw_bif_body,band_call_tail,[-7,3]},{raw_bif_body,band_call_tail,[bad,3]},' +
    '{raw_bif_body,bor_call_last,[-7,3]},{raw_bif_body,bor_call_last,[3,1.0]},' +
    '{raw_bif_body,bxor_call,[-7,3]},{raw_bif_body,bxor_call,[bad,3]},' +
    '{raw_bif_body,bnot_call_tail,[-Huge]},{raw_bif_body,bnot_call_tail,[bad]},' +
    '{raw_bif_body,div_call_last,[-7,3]},{raw_bif_body,div_call_last,[1,0]},' +
    '{raw_bif_body,rem_call,[-7,3]},{raw_bif_body,rem_call,[1,0]},' +
    '{calls,integer_bif_remote,[-7,3]},{calls,integer_bif_remote,[1,0]}], ' +
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

  for (const suffix of ['', '-stripped']) {
    const modules = await Promise.all([
      `scheduler_fixture${suffix}.mjs`, `raw_scheduler${suffix}.mjs`, `raw_stack${suffix}.mjs`,
      `raw_float_registers${suffix}.mjs`, `calls${suffix}.mjs`, `arithmetic_body${suffix}.mjs`,
      `raw_arithmetic_body${suffix}.mjs`,
      `bif_body${suffix}.mjs`, `raw_bif_body${suffix}.mjs`,
      'slice_helper.mjs',
    ].map(file => import(pathToFileURL(join(dir, file)))));
    assert.deepEqual(await schedulerChecks(Runtime, ErlangError, rt => {
      for (const module of modules) module.register(rt);
    }), schedulerOracle);
    assert.equal(await stackYieldChecks(Runtime, rt => {
      for (const module of modules) module.register(rt);
    }), stackYieldOracle);
    const identityModules = await Promise.all([
      `process_identity${suffix}.mjs`, `raw_identity${suffix}.mjs`, `raw_bifs${suffix}.mjs`,
    ].map(file => import(pathToFileURL(join(dir, file)))));
    assert.equal(await identityChecks(Runtime, rt => {
      for (const module of identityModules) module.register(rt);
    }), identityOracle);
    const referenceModules = await Promise.all([
      `process_reference${suffix}.mjs`, `raw_reference${suffix}.mjs`, `process_receive${suffix}.mjs`,
    ].map(file => import(pathToFileURL(join(dir, file)))));
    assert.equal(await referenceChecks(Runtime, rt => {
      for (const module of referenceModules) module.register(rt);
    }), referenceOracle);
    const dictionaryModules = await Promise.all([
      `process_dictionary${suffix}.mjs`, `raw_dictionary${suffix}.mjs`,
    ].map(file => import(pathToFileURL(join(dir, file)))));
    assert.equal(await dictionaryChecks(Runtime, rt => {
      for (const module of dictionaryModules) module.register(rt);
    }), dictionaryOracle);
    const processInfoModule = await import(pathToFileURL(join(dir, `process_info_fixture${suffix}.mjs`)));
    assert.equal(await processInfoChecks(Runtime, rt => processInfoModule.register(rt)), processInfoOracle);
    const spawnModules = await Promise.all([
      `process_spawn${suffix}.mjs`, `raw_spawn${suffix}.mjs`, `process_identity${suffix}.mjs`,
    ].map(file => import(pathToFileURL(join(dir, file)))));
    assert.equal(await spawnChecks(Runtime, rt => {
      for (const module of spawnModules) module.register(rt);
    }), spawnOracle);
    const sendModules = await Promise.all([
      `process_send${suffix}.mjs`, `raw_send${suffix}.mjs`, `process_spawn${suffix}.mjs`,
      `spawn_probe${suffix}.mjs`,
    ].map(file => import(pathToFileURL(join(dir, file)))));
    assert.equal(await sendChecks(Runtime, rt => {
      for (const module of sendModules) module.register(rt);
    }), sendOracle);
    const receiveModules = await Promise.all([
      `process_receive${suffix}.mjs`, `process_send${suffix}.mjs`,
    ].map(file => import(pathToFileURL(join(dir, file)))));
    assert.equal(await receiveChecks(Runtime, rt => {
      for (const module of receiveModules) module.register(rt);
    }), receiveOracle);
    const timeoutModule = await import(pathToFileURL(join(dir, `receive_timeout${suffix}.mjs`)));
    assert.equal(await timeoutChecks(Runtime, rt => timeoutModule.register(rt)), timeoutOracle);
    const timerModule = await import(pathToFileURL(join(dir, `process_timer${suffix}.mjs`)));
    assert.equal(await timerBifChecks(Runtime, rt => timerModule.register(rt)), timerBifOracle);
    assert.equal(await timerOptionChecks(Runtime, rt => timerModule.register(rt)), timerOptionOracle);
    const registryModules = await Promise.all([
      `process_registry${suffix}.mjs`, `process_send${suffix}.mjs`,
    ].map(file => import(pathToFileURL(join(dir, file)))));
    assert.equal(await registryChecks(Runtime, rt => {
      for (const module of registryModules) module.register(rt);
    }), registryOracle);
  }

  const missingDependency = new Runtime();
  (await import(pathToFileURL(join(dir, 'calls.mjs')))).register(missingDependency);
  assert.throws(() => missingDependency.invoke('calls', 'remote', [1n]),
    /undefined or unsupported function: slice_helper:id\/1/);
  const nestedHostError = new Error('nested host failure');
  missingDependency.registerModule(26, 'slice_helper', [{
    name: 'id', arity: 1, exported: true,
    run: () => { throw nestedHostError; },
  }]);
  assert.throws(() => missingDependency.invoke('calls', 'remote', [1n]),
    error => error === nestedHostError && !(error instanceof ErlangError));

  const bifRuntime = new Runtime();
  bifRuntime.registerModule(26, 'erlang', [
    {name: 'is_atom', arity: 1, exported: true, run: () => ({type: 'return', value: bifRuntime.atom('shadow')})},
    {name: 'hd', arity: 1, exported: true, run: () => ({type: 'return', value: bifRuntime.atom('shadow')})},
    {name: 'hd', arity: 2, exported: true, run: (_, [value]) => ({type: 'return', value})},
    {name: 'binary_part', arity: 2, exported: true, run: () => ({type: 'return', value: bifRuntime.atom('shadow')})},
    {name: 'abs', arity: 1, exported: true, run: () => ({type: 'return', value: bifRuntime.atom('shadow')})},
    {name: 'abs', arity: 2, exported: true, run: (_, [value]) => ({type: 'return', value})},
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
  assert.equal(bifRuntime.invoke('erlang', 'abs', [-3n]), 3n);
  assert.equal(bifRuntime.invoke('erlang', 'abs', [1n, 2n]), 1n);
  assert.throws(() => bifRuntime.invoke('erlang', 'round', []), /undefined or unsupported/);
  assert.throws(() => bifRuntime.invoke('erlang', 'abs', [bifRuntime.hostHandle({})]),
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
  rt.registerModule(26, 'bad_host', [{
    name: 'invalid', arity: 0, exported: true,
    run: () => ({type: 'return', value: {}}),
  }]);
  assert.throws(() => rt.invoke('bad_host', 'invalid', []), /return value/);
  const hostError = new Error('host failure');
  rt.registerModule(26, 'throwing_host', [{
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
      ['/test/scheduler-cases.mjs', ['text/javascript', source('test/scheduler-cases.mjs')]],
      ['/test/identity-cases.mjs', ['text/javascript', source('test/identity-cases.mjs')]],
      ['/test/spawn-cases.mjs', ['text/javascript', source('test/spawn-cases.mjs')]],
      ['/test/send-cases.mjs', ['text/javascript', source('test/send-cases.mjs')]],
      ['/test/receive-cases.mjs', ['text/javascript', source('test/receive-cases.mjs')]],
      ['/test/timeout-cases.mjs', ['text/javascript', source('test/timeout-cases.mjs')]],
      ['/test/timer-bif-cases.mjs', ['text/javascript', source('test/timer-bif-cases.mjs')]],
      ['/test/timer-option-cases.mjs', ['text/javascript', source('test/timer-option-cases.mjs')]],
      ['/test/registry-cases.mjs', ['text/javascript', source('test/registry-cases.mjs')]],
      ['/test/reference-cases.mjs', ['text/javascript', source('test/reference-cases.mjs')]],
      ['/test/dictionary-cases.mjs', ['text/javascript', source('test/dictionary-cases.mjs')]],
      ['/test/process-info-cases.mjs', ['text/javascript', source('test/process-info-cases.mjs')]],
      ...['calls.mjs', 'calls-stripped.mjs', 'raw_stack.mjs', 'raw_stack-stripped.mjs',
        'match_failures.mjs', 'match_failures-stripped.mjs', 'raw_failures.mjs',
        'raw_failures-stripped.mjs', 'arithmetic_body.mjs', 'arithmetic_body-stripped.mjs',
        'raw_arithmetic_body.mjs', 'raw_arithmetic_body-stripped.mjs',
        'raw_float_registers.mjs', 'raw_float_registers-stripped.mjs',
        'bif_body.mjs', 'bif_body-stripped.mjs', 'raw_bif_body.mjs', 'raw_bif_body-stripped.mjs',
        'scheduler_fixture.mjs', 'scheduler_fixture-stripped.mjs', 'raw_scheduler.mjs', 'raw_scheduler-stripped.mjs',
        'process_identity.mjs', 'process_identity-stripped.mjs', 'raw_identity.mjs', 'raw_identity-stripped.mjs',
        'process_spawn.mjs', 'process_spawn-stripped.mjs', 'raw_spawn.mjs', 'raw_spawn-stripped.mjs',
        'process_send.mjs', 'process_send-stripped.mjs', 'raw_send.mjs', 'raw_send-stripped.mjs',
        'spawn_probe.mjs', 'spawn_probe-stripped.mjs',
        'process_receive.mjs', 'process_receive-stripped.mjs',
        'receive_timeout.mjs', 'receive_timeout-stripped.mjs',
        'process_reference.mjs', 'process_reference-stripped.mjs',
        'raw_reference.mjs', 'raw_reference-stripped.mjs',
        'process_timer.mjs', 'process_timer-stripped.mjs',
        'process_registry.mjs', 'process_registry-stripped.mjs',
        'process_dictionary.mjs', 'process_dictionary-stripped.mjs',
        'raw_dictionary.mjs', 'raw_dictionary-stripped.mjs',
        'process_info_fixture.mjs', 'process_info_fixture-stripped.mjs',
        'raw_bifs.mjs', 'raw_bifs-stripped.mjs',
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
      const {Runtime, ErlangError} = await import('/runtime/beam2js.mjs');
      const {registerDom} = await import('/examples/browser/dom.mjs');
      const {callResults, stackYieldChecks} = await import('/test/call-cases.mjs');
      const {matchResults} = await import('/test/match-cases.mjs');
      const {arithmeticResults} = await import('/test/arithmetic-cases.mjs');
      const {schedulerChecks} = await import('/test/scheduler-cases.mjs');
      const {identityChecks} = await import('/test/identity-cases.mjs');
      const {spawnChecks} = await import('/test/spawn-cases.mjs');
      const {sendChecks} = await import('/test/send-cases.mjs');
      const {receiveChecks} = await import('/test/receive-cases.mjs');
      const {timeoutChecks} = await import('/test/timeout-cases.mjs');
      const {timerBifChecks} = await import('/test/timer-bif-cases.mjs');
      const {timerOptionChecks} = await import('/test/timer-option-cases.mjs');
      const {registryChecks} = await import('/test/registry-cases.mjs');
      const {referenceChecks} = await import('/test/reference-cases.mjs');
      const {dictionaryChecks} = await import('/test/dictionary-cases.mjs');
      const {processInfoChecks} = await import('/test/process-info-cases.mjs');
      const results = [];
      const matches = [];
      const arithmetic = [];
      const scheduled = [];
      const stackYields = [];
      const identity = [];
      const spawned = [];
      const sent = [];
      const received = [];
      const timeouts = [];
      const timerBifs = [];
      const timerOptions = [];
      const registries = [];
      const refs = [];
      const dictionaries = [];
      const processInfos = [];
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
      for (const suffix of ['', '-stripped']) {
        const modules = await Promise.all([
          `/scheduler_fixture${suffix}.mjs`, `/raw_scheduler${suffix}.mjs`, `/raw_stack${suffix}.mjs`,
          `/raw_float_registers${suffix}.mjs`, `/calls${suffix}.mjs`, `/arithmetic_body${suffix}.mjs`,
          `/raw_arithmetic_body${suffix}.mjs`,
          `/bif_body${suffix}.mjs`, `/raw_bif_body${suffix}.mjs`,
          '/slice_helper.mjs',
        ].map(file => import(file)));
        scheduled.push(await schedulerChecks(Runtime, ErlangError, rt => {
          for (const module of modules) module.register(rt);
        }));
        stackYields.push(await stackYieldChecks(Runtime, rt => {
          for (const module of modules) module.register(rt);
        }));
        const identityModules = await Promise.all([
          `/process_identity${suffix}.mjs`, `/raw_identity${suffix}.mjs`, `/raw_bifs${suffix}.mjs`,
        ].map(file => import(file)));
        identity.push(await identityChecks(Runtime, rt => {
          for (const module of identityModules) module.register(rt);
        }));
        const referenceModules = await Promise.all([
          `/process_reference${suffix}.mjs`, `/raw_reference${suffix}.mjs`, `/process_receive${suffix}.mjs`,
        ].map(file => import(file)));
        refs.push(await referenceChecks(Runtime, rt => {
          for (const module of referenceModules) module.register(rt);
        }));
        const dictionaryModules = await Promise.all([
          `/process_dictionary${suffix}.mjs`, `/raw_dictionary${suffix}.mjs`,
        ].map(file => import(file)));
        dictionaries.push(await dictionaryChecks(Runtime, rt => {
          for (const module of dictionaryModules) module.register(rt);
        }));
        const processInfoModule = await import(`/process_info_fixture${suffix}.mjs`);
        processInfos.push(await processInfoChecks(Runtime, rt => processInfoModule.register(rt)));
        const spawnModules = await Promise.all([
          `/process_spawn${suffix}.mjs`, `/raw_spawn${suffix}.mjs`, `/process_identity${suffix}.mjs`,
        ].map(file => import(file)));
        spawned.push(await spawnChecks(Runtime, rt => {
          for (const module of spawnModules) module.register(rt);
        }));
        const sendModules = await Promise.all([
          `/process_send${suffix}.mjs`, `/raw_send${suffix}.mjs`, `/process_spawn${suffix}.mjs`,
          `/spawn_probe${suffix}.mjs`,
        ].map(file => import(file)));
        sent.push(await sendChecks(Runtime, rt => {
          for (const module of sendModules) module.register(rt);
        }));
        const receiveModules = await Promise.all([
          `/process_receive${suffix}.mjs`, `/process_send${suffix}.mjs`,
        ].map(file => import(file)));
        received.push(await receiveChecks(Runtime, rt => {
          for (const module of receiveModules) module.register(rt);
        }));
        const timeoutModule = await import(`/receive_timeout${suffix}.mjs`);
        timeouts.push(await timeoutChecks(Runtime, rt => timeoutModule.register(rt)));
        const timerModule = await import(`/process_timer${suffix}.mjs`);
        timerBifs.push(await timerBifChecks(Runtime, rt => timerModule.register(rt)));
        timerOptions.push(await timerOptionChecks(Runtime, rt => timerModule.register(rt)));
        const registryModules = await Promise.all([
          `/process_registry${suffix}.mjs`, `/process_send${suffix}.mjs`,
        ].map(file => import(file)));
        registries.push(await registryChecks(Runtime, rt => {
          for (const module of registryModules) module.register(rt);
        }));
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
      return {results, matches, arithmetic, scheduled, stackYields, identity, refs, dictionaries, processInfos, spawned, sent, received, timeouts, timerBifs, timerOptions, registries, sameHandle, text: element.textContent, children: element.children.length};
    }), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('browser call tests timed out')), 30000);
    })]).finally(() => clearTimeout(timer));
    assert.deepEqual(browserResults, {
      results: [oracle, oracle], matches: [matchOracle, matchOracle],
      arithmetic: [arithmeticOracle, arithmeticOracle], scheduled: [schedulerOracle, schedulerOracle],
      stackYields: [stackYieldOracle, stackYieldOracle],
      identity: [identityOracle, identityOracle], refs: [referenceOracle, referenceOracle],
      dictionaries: [dictionaryOracle, dictionaryOracle],
      processInfos: [processInfoOracle, processInfoOracle],
      spawned: [spawnOracle, spawnOracle],
      sent: [sendOracle, sendOracle], received: [receiveOracle, receiveOracle],
      timeouts: [timeoutOracle, timeoutOracle], timerBifs: [timerBifOracle, timerBifOracle],
      timerOptions: [timerOptionOracle, timerOptionOracle],
      registries: [registryOracle, registryOracle], sameHandle: true,
      text: 'Hello from Erlang! <b>å</b>', children: 0,
    });
  } finally {
    await browser.close();
  }
  console.log('Browser interop and call tests passed in Node and Chromium');
} finally {
  rmSync(dir, {recursive: true, force: true});
}
