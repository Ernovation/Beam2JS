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
import {schedulerChecks} from './scheduler-cases.mjs';
import {identityChecks} from './identity-cases.mjs';
import {spawnChecks} from './spawn-cases.mjs';
import {sendChecks} from './send-cases.mjs';
import {receiveChecks} from './receive-cases.mjs';

const dir = mkdtempSync(join(tmpdir(), 'beam2js-browser-'));
const compiler = resolve('_build/default/bin/beam2js');
const run = (command, args) => execFileSync(command, args, {encoding: 'utf8', timeout: 30000});
const source = path => readFileSync(resolve(path), 'utf8');

try {
  run('erlc', ['-o', dir, 'examples/browser/browser_demo.erl', 'fixtures/calls.erl',
    'fixtures/slice_helper.erl', 'fixtures/match_failures.erl', 'fixtures/arithmetic_body.erl',
    'fixtures/bif_body.erl', 'fixtures/scheduler_fixture.erl', 'fixtures/scheduler_probe.erl',
    'fixtures/process_identity.erl', 'fixtures/process_spawn.erl', 'fixtures/spawn_probe.erl',
    'fixtures/process_send.erl', 'fixtures/process_receive.erl']);
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
    '{beam_file,process_send,_,_,_,SendFs}=beam_disasm:file(filename:join(Dir,"process_send.beam")), ' +
    '{function,send,2,_,SendCode}=lists:keyfind(send,2,SendFs), ' +
    'true=lists:member(send,SendCode), ' +
    '{beam_file,process_receive,_,_,_,ReceiveFs}=beam_disasm:file(filename:join(Dir,"process_receive.beam")), ' +
    '{function,wanted,0,_,ReceiveCode}=lists:keyfind(wanted,2,ReceiveFs), ' +
    'true=lists:any(fun({loop_rec,_,_})->true;(_)->false end,ReceiveCode), ' +
    'true=lists:any(fun({loop_rec_end,_})->true;(_)->false end,ReceiveCode), ' +
    'true=lists:member(remove_message,ReceiveCode), ' +
    'true=lists:any(fun({wait,_})->true;(_)->false end,ReceiveCode), ' +
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
    '{bits_call_tail,call_ext_only},{part2_call_last,call_ext_last},{part3_call,call_ext},' +
    '{abs_call_tail,call_ext_only},{round_call_last,call_ext_last},{float_call,call_ext}]), ' +
    'lists:foreach(fun(Name) -> Input=filename:join(Dir,Name++".beam"), ' +
    '{ok,B}=file:read_file(Input), {ok,{_,S}}=beam_lib:strip(B), ' +
    'ok=file:write_file(filename:join(Dir,Name++"-stripped.beam"),S) end, ' +
    '["calls","raw_stack","match_failures","raw_failures","arithmetic_body","raw_arithmetic_body","raw_float_registers","bif_body","raw_bif_body","scheduler_fixture","raw_scheduler","process_identity","raw_identity","raw_bifs","process_spawn","raw_spawn","process_send","raw_send","spawn_probe","process_receive"]), halt().', '-extra', dir]);
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
    [join(dir, 'raw_bifs.beam'), 'raw_bifs.mjs'],
    [join(dir, 'raw_bifs-stripped.beam'), 'raw_bifs-stripped.mjs'],
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
    '{calls,numeric_bif_remote,[-0.0]},{calls,numeric_bif_remote,[bad]}], ' +
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
      `scheduler_fixture${suffix}.mjs`, `raw_scheduler${suffix}.mjs`,
      `raw_float_registers${suffix}.mjs`, `calls${suffix}.mjs`, `arithmetic_body${suffix}.mjs`,
      'slice_helper.mjs',
    ].map(file => import(pathToFileURL(join(dir, file)))));
    assert.deepEqual(await schedulerChecks(Runtime, ErlangError, rt => {
      for (const module of modules) module.register(rt);
    }), schedulerOracle);
    const identityModules = await Promise.all([
      `process_identity${suffix}.mjs`, `raw_identity${suffix}.mjs`, `raw_bifs${suffix}.mjs`,
    ].map(file => import(pathToFileURL(join(dir, file)))));
    assert.equal(await identityChecks(Runtime, rt => {
      for (const module of identityModules) module.register(rt);
    }), identityOracle);
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
  }

  const missingDependency = new Runtime();
  (await import(pathToFileURL(join(dir, 'calls.mjs')))).register(missingDependency);
  assert.throws(() => missingDependency.invoke('calls', 'remote', [1n]),
    /undefined or unsupported function: slice_helper:id\/1/);
  const nestedHostError = new Error('nested host failure');
  missingDependency.registerModule(23, 'slice_helper', [{
    name: 'id', arity: 1, exported: true,
    run: () => { throw nestedHostError; },
  }]);
  assert.throws(() => missingDependency.invoke('calls', 'remote', [1n]),
    error => error === nestedHostError && !(error instanceof ErlangError));

  const bifRuntime = new Runtime();
  bifRuntime.registerModule(23, 'erlang', [
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
  rt.registerModule(23, 'bad_host', [{
    name: 'invalid', arity: 0, exported: true,
    run: () => ({type: 'return', value: {}}),
  }]);
  assert.throws(() => rt.invoke('bad_host', 'invalid', []), /return value/);
  const hostError = new Error('host failure');
  rt.registerModule(23, 'throwing_host', [{
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
      const {callResults} = await import('/test/call-cases.mjs');
      const {matchResults} = await import('/test/match-cases.mjs');
      const {arithmeticResults} = await import('/test/arithmetic-cases.mjs');
      const {schedulerChecks} = await import('/test/scheduler-cases.mjs');
      const {identityChecks} = await import('/test/identity-cases.mjs');
      const {spawnChecks} = await import('/test/spawn-cases.mjs');
      const {sendChecks} = await import('/test/send-cases.mjs');
      const {receiveChecks} = await import('/test/receive-cases.mjs');
      const results = [];
      const matches = [];
      const arithmetic = [];
      const scheduled = [];
      const identity = [];
      const spawned = [];
      const sent = [];
      const received = [];
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
          `/scheduler_fixture${suffix}.mjs`, `/raw_scheduler${suffix}.mjs`,
          `/raw_float_registers${suffix}.mjs`, `/calls${suffix}.mjs`, `/arithmetic_body${suffix}.mjs`,
          '/slice_helper.mjs',
        ].map(file => import(file)));
        scheduled.push(await schedulerChecks(Runtime, ErlangError, rt => {
          for (const module of modules) module.register(rt);
        }));
        const identityModules = await Promise.all([
          `/process_identity${suffix}.mjs`, `/raw_identity${suffix}.mjs`, `/raw_bifs${suffix}.mjs`,
        ].map(file => import(file)));
        identity.push(await identityChecks(Runtime, rt => {
          for (const module of identityModules) module.register(rt);
        }));
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
      return {results, matches, arithmetic, scheduled, identity, spawned, sent, received, sameHandle, text: element.textContent, children: element.children.length};
    }), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('browser call tests timed out')), 30000);
    })]).finally(() => clearTimeout(timer));
    assert.deepEqual(browserResults, {
      results: [oracle, oracle], matches: [matchOracle, matchOracle],
      arithmetic: [arithmeticOracle, arithmeticOracle], scheduled: [schedulerOracle, schedulerOracle],
      identity: [identityOracle, identityOracle], spawned: [spawnOracle, spawnOracle],
      sent: [sendOracle, sendOracle], received: [receiveOracle, receiveOracle], sameHandle: true,
      text: 'Hello from Erlang! <b>å</b>', children: 0,
    });
  } finally {
    await browser.close();
  }
  console.log('Browser interop and call tests passed in Node and Chromium');
} finally {
  rmSync(dir, {recursive: true, force: true});
}
