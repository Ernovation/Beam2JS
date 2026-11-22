import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const inventory = readFileSync(new URL('../docs/bifs-otp-29.1.2.md', import.meta.url), 'utf8');
const rows = [...inventory.matchAll(/^\| `([^`]+)` \| `([^`]+)\/(\d+)` \| (bif|ubif|hbif|runtime) \| (yes|no) \| ([^|]+) \| (BIF|operator|no) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| (not implemented|instruction-and-callable|callable-only|guard-instruction-only|body-and-guard-instruction-only|arithmetic-instruction-only) \|$/gm)];
assert.equal(rows.length, 556);
const byKey = new Map(rows.map(row => [`${row[1]}:${row[2]}/${row[3]}`, row]));
assert.equal(byKey.size, rows.length, 'duplicate BIF identity');

const row = key => {
  const result = byKey.get(key);
  assert.ok(result, `missing ${key}`);
  return result;
};
assert.equal(row('erlang:apply/2')[4], 'runtime');
assert.equal(row('erlang:yield/0')[4], 'runtime');
assert.equal(row('erlang:is_atom/1')[7], 'BIF');
for (const name of ['is_integer', 'is_number', 'is_atom', 'is_boolean', 'is_float', 'is_list',
  'is_tuple', 'is_binary', 'is_bitstring', 'is_pid', 'is_reference']) {
  assert.equal(row(`erlang:${name}/1`)[11], 'instruction-and-callable');
}
for (const name of ['hd/1', 'tl/1', 'length/1', 'tuple_size/1', 'element/2',
  'bit_size/1', 'byte_size/1', 'binary_part/2', 'binary_part/3',
  'abs/1', 'trunc/1', 'round/1', 'floor/1', 'ceil/1', 'float/1', 'self/0']) {
  assert.equal(row(`erlang:${name}`)[11], 'instruction-and-callable');
}
assert.equal(row('erlang:!/2')[11], 'instruction-and-callable');
assert.equal(rows.filter(entry => entry[11] === 'instruction-and-callable').length, 28);
assert.equal(row('erlang:is_process_alive/1')[11], 'callable-only');
assert.equal(row('erlang:spawn/3')[11], 'callable-only');
assert.equal(row('erlang:send/2')[11], 'callable-only');
assert.equal(row('erlang:make_ref/0')[11], 'callable-only');
assert.equal(row('erlang:monotonic_time/0')[11], 'callable-only');
assert.equal(row('erlang:monotonic_time/1')[11], 'callable-only');
for (const name of ['send_after/3', 'send_after/4', 'start_timer/3', 'start_timer/4',
  'read_timer/1', 'read_timer/2',
  'cancel_timer/1', 'cancel_timer/2']) {
  assert.equal(row(`erlang:${name}`)[11], 'callable-only');
}
for (const name of ['register/2', 'unregister/1', 'whereis/1', 'registered/0']) {
  assert.equal(row(`erlang:${name}`)[11], 'callable-only');
}
assert.equal(rows.filter(entry => entry[11] === 'guard-instruction-only').length, 0);
assert.equal(rows.filter(entry => entry[11] === 'body-and-guard-instruction-only').length, 0);
for (const name of ['+/2', '-/1', '-/2', '*/2', '//2',
  'band/2', 'bor/2', 'bxor/2', 'bnot/1', 'div/2', 'rem/2']) {
  assert.equal(row(`erlang:${name}`)[11], 'arithmetic-instruction-only');
}
assert.equal(rows.filter(entry => entry[11] === 'arithmetic-instruction-only').length, 11);
assert.equal(row('erlang:is_map/1')[11], 'not implemented');
assert.equal(row('erlang:+/2')[7], 'operator');
assert.equal(row('erlang:list_to_atom/1')[7], 'no');
assert.match(row('erlang:list_to_atom/1')[8], /global atom table/);
assert.match(row('erlang:map_get/2')[9], /badkey.*badmap/);
assert.match(row('erlang:is_map_key/2')[9], /badmap/);
assert.match(row('erlang:map_size/1')[9], /badmap/);
assert.match(row('erlang:tuple_size/1')[9], /badarg/);
assert.match(row('maps:get/2')[9], /badkey.*badmap/);
assert.match(row('maps:is_key/2')[9], /badmap/);
assert.equal(row('erlang:map_get/2')[7], 'BIF');
assert.equal(row('erlang:is_map_key/2')[7], 'BIF');
assert.equal(row('erlang:map_size/1')[7], 'BIF');
assert.equal(row('erlang:tuple_size/1')[7], 'BIF');
assert.equal(row('maps:get/2')[7], 'no');
assert.equal(row('maps:is_key/2')[7], 'no');
assert.match(row('erlang:hd/1')[9], /non-cons/);
assert.match(row('erlang:tl/1')[9], /non-cons/);
assert.match(row('erlang:length/1')[9], /improper/);
assert.match(row('erlang:bit_size/1')[9], /non-bitstring/);
assert.match(row('erlang:byte_size/1')[9], /non-bitstring/);
assert.match(row('erlang:-/1')[9], /badarith/);
assert.match(row('erlang:abs/1')[9], /badarg.*non-number/);
for (const name of ['trunc', 'round', 'floor', 'ceil']) {
  assert.match(row(`erlang:${name}/1`)[9], /badarg.*non-number/);
}
assert.match(row('erlang:float/1')[9], /badarg.*non-number.*overflow/);
assert.match(row('erlang://2')[9], /badarith.*zero divisor.*overflow/);
assert.match(row('erlang:binary_part/3')[9], /badarg.*out-of-bounds/);
assert.match(row('erlang:binary_part/2')[9], /badarg.*out-of-bounds/);
assert.match(row('erlang:self/0')[8], /calling process identity/);
assert.equal(row('erlang:self/0')[10], 'process runtime');
assert.match(row('erlang:is_process_alive/1')[9], /badarg.*non-local PID/);
assert.match(row('erlang:spawn/3')[9], /badarg.*improper/);
assert.equal(row('erlang:spawn/3')[10], 'process runtime');
assert.match(row('erlang:send/2')[9], /badarg.*invalid destination/);
assert.equal(row('erlang:!/2')[10], 'process runtime');
assert.match(row('erlang:make_ref/0')[8], /unique local reference/);
assert.match(row('erlang:monotonic_time/1')[9], /badarg.*invalid time unit/);
assert.match(row('erlang:send_after/3')[8], /local PID/);
assert.match(row('erlang:send_after/4')[9], /badarg.*invalid.*options/);
assert.match(row('erlang:cancel_timer/1')[9], /badarg.*non-reference/);
assert.match(row('erlang:read_timer/2')[9], /badarg.*invalid options/);
assert.match(row('erlang:cancel_timer/2')[8], /asynchronously/);
assert.match(row('erlang:register/2')[9], /badarg.*already registered/);
assert.match(row('erlang:whereis/1')[9], /badarg.*non-atom/);
assert.match(row('os:getenv/1')[10], /OS \/ host/);
assert.ok(byKey.has('lists:member/2'));
assert.ok(!byKey.has('lists:map/2'));
assert.ok(!byKey.has('erlang:spawn/1'));
assert.ok(!byKey.has('maps:get/3'));

const oracle = execFileSync('erl', ['-noshell', '-eval',
  '{ok,V}=file:read_file(filename:join([code:root_dir(),"releases",' +
  'erlang:system_info(otp_release),"OTP_VERSION"])), ' +
  'io:format("OTP ~s~n",[string:trim(binary_to_list(V))]), ' +
  'io:format("~p ~p ~p ~p~n",[erl_internal:bif(spawn,1),' +
  'erlang:is_builtin(erlang,spawn,1),erlang:is_builtin(lists,map,2),' +
  'erlang:is_builtin(lists,member,2)]), ' +
  'Guard=fun(X) when hd(X) =:= a -> pass; (_) -> fail end, ' +
  'io:format("guard ~w ~w~n",[Guard([a]),Guard([])]), ' +
  'PartGuard=fun(X,S,L) when binary_part(X,S,L) =:= <<"bc">> -> pass; (_,_,_) -> fail end, ' +
  'io:format("part_guard ~w ~w~n",[PartGuard(<<"abc">>,3,-2),PartGuard(<<"abc">>,0,-1)]), ' +
  'Parent=self(), {Child,Ref}=spawn_monitor(fun() -> Parent ! {child_self,self()} end), ' +
  'receive {child_self,Child} -> ok after 5000 -> erlang:error(child_timeout) end, ' +
  "receive {'DOWN',Ref,process,Child,normal} -> ok after 5000 -> erlang:error(down_timeout) end, " +
  'io:format("self ~w ~w~n",[Parent=:=erlang:self(),Parent=/=Child]), ' +
  'io:format("maps_builtin ~w ~w ~w~n",[erlang:is_builtin(maps,get,2),' +
  'erlang:is_builtin(maps,is_key,2),erlang:is_builtin(maps,get,3)]), ' +
  '{ok,bif_map_guards,B}=compile:file("fixtures/bif_map_guards.erl",[binary,return_errors]), ' +
  '{module,bif_map_guards}=code:load_binary(bif_map_guards,"bif_map_guards",B), ' +
  'MapGuards=fun() -> [bif_map_guards:get(a,#{a=>found}),bif_map_guards:get(a,#{}),' +
  'bif_map_guards:get(a,no),bif_map_guards:key(a,#{a=>found}),bif_map_guards:key(a,#{}),' +
  'bif_map_guards:key(a,no),bif_map_guards:size(#{a=>found}),bif_map_guards:size(#{}),' +
  'bif_map_guards:size(no),bif_map_guards:tuple({a,b}),bif_map_guards:tuple({a}),' +
  'bif_map_guards:tuple(no),bif_map_guards:map_type(#{}),bif_map_guards:map_type({}),' +
  'bif_map_guards:tuple_type({}),bif_map_guards:tuple_type(#{})] end, ' +
  'ExpectedGuards=[yes,no,no,yes,no,no,yes,no,no,yes,no,no,yes,no,yes,no], ExpectedGuards=MapGuards(), ' +
  '{ok,{bif_map_guards,Stripped}}=beam_lib:strip(B), ' +
  '{module,bif_map_guards}=code:load_binary(bif_map_guards,"bif_map_guards-stripped",Stripped), ' +
  'ExpectedGuards=MapGuards(), io:format("map_guards pass~n"), ' +
  'Map=#{1=>integer,1.0=>float,0.0=>positive,-0.0=>negative,{tag,[a,b]}=>compound}, ' +
  'NestedKey={tag,[a|lists:reverse([b])]}, ' +
  'Tests=[{hd,fun()->erlang:hd([]) end},' +
  '{hd_improper,fun()->erlang:hd([a|b]) end},' +
  '{tl_improper,fun()->erlang:tl([a|b]) end},' +
  '{tl_empty,fun()->erlang:tl([]) end},' +
  '{length_empty,fun()->erlang:length([]) end},' +
  '{length_improper,fun()->erlang:length([a|b]) end},' +
  '{bit_size_partial,fun()->erlang:bit_size(<<5:9>>) end},' +
  '{byte_size_partial,fun()->erlang:byte_size(<<5:9>>) end},' +
  '{bit_size_bad,fun()->erlang:bit_size(no) end},' +
  '{byte_size_bad,fun()->erlang:byte_size(no) end},' +
  '{element,fun()->erlang:element(2,{a}) end},' +
  '{element_first,fun()->erlang:element(1,{a,b}) end},' +
  '{element_zero,fun()->erlang:element(0,{a}) end},' +
  "{div_zero,fun()->erlang:'div'(1,0) end}," +
  "{rem_zero,fun()->erlang:'rem'(1,0) end}," +
  "{rem_bad,fun()->erlang:'rem'(1.0,2) end}," +
  "{float_divide,fun()->erlang:'/'(5,2) end}," +
  "{float_divide_zero,fun()->erlang:'/'(1,-0.0) end}," +
  "{float_divide_bad,fun()->erlang:'/'(no,1) end}," +
  "{float_divide_conversion,fun()->erlang:'/'(1 bsl 1024,1 bsl 1024) end}," +
  "{float_divide_overflow,fun()->erlang:'/'(1.0e308,0.5) end}," +
  "{plus,fun()->erlang:'+'(x,1) end}," +
  "{plus_mixed,fun()->erlang:'+'(1,0.5) end}," +
  "{plus_big,fun()->erlang:'+'(1 bsl 80,1) end}," +
  "{add_overflow,fun()->erlang:'+'(1.0e308,1.0e308) end}," +
  "{subtract_bad,fun()->erlang:'-'(1,no) end}," +
  "{multiply_overflow,fun()->erlang:'*'(1.0e308,2.0) end}," +
  "{mixed_overflow,fun()->erlang:'*'(1 bsl 1024,0.0) end}," +
  "{neg,fun()->erlang:'-'(5) end}," +
  "{neg_bad,fun()->erlang:'-'(no) end}," +
  "{abs_big,fun()->erlang:abs(-(1 bsl 80)) end}," +
  "{abs_bad,fun()->erlang:abs(no) end}," +
  "{trunc_negative,fun()->erlang:trunc(-1.9) end}," +
  "{round_negative,fun()->erlang:round(-1.5) end}," +
  "{floor_negative,fun()->erlang:floor(-1.9) end}," +
  "{ceil_negative,fun()->erlang:ceil(-1.9) end}," +
  "{trunc_bad,fun()->erlang:trunc(no) end}," +
  "{round_bad,fun()->erlang:round(no) end}," +
  "{floor_bad,fun()->erlang:floor(no) end}," +
  "{ceil_bad,fun()->erlang:ceil(no) end}," +
  "{float_integer,fun()->erlang:float(5) end}," +
  "{float_bad,fun()->erlang:float(no) end}," +
  "{float_overflow,fun()->erlang:float(1 bsl 1024) end}," +
  "{band_bad,fun()->erlang:'band'(1,no) end}," +
  "{bor_bad,fun()->erlang:'bor'(no,1) end}," +
  "{bxor_bad,fun()->erlang:'bxor'(1,1.0) end}," +
  "{bnot_bad,fun()->erlang:'bnot'(no) end}," +
  '{part_negative,fun()->erlang:binary_part(<<"abc">>,3,-2) end},' +
  '{part_empty,fun()->erlang:binary_part(<<"abc">>,3,0) end},' +
  '{part_bounds,fun()->erlang:binary_part(<<"abc">>,0,-1) end},' +
  '{part_bits,fun()->erlang:binary_part(<<1:1>>,0,0) end},' +
  '{part_badtype,fun()->erlang:binary_part(no,0,1) end},' +
  '{part2_negative,fun()->erlang:binary_part(<<"abc">>,{3,-2}) end},' +
  '{part2_empty,fun()->erlang:binary_part(<<"abc">>,{3,0}) end},' +
  '{part2_bounds,fun()->erlang:binary_part(<<"abc">>,{0,-1}) end},' +
  '{part2_bits,fun()->erlang:binary_part(<<1:1>>,{0,0}) end},' +
  '{part2_tuple,fun()->erlang:binary_part(<<"abc">>,{0}) end},' +
  '{part2_type,fun()->erlang:binary_part(<<"abc">>,{0,no}) end},' +
  '{map_missing,fun()->erlang:map_get(a,#{}) end},' +
  '{map_bad,fun()->erlang:map_get(a,x) end},' +
  '{map_size,fun()->erlang:map_size(Map) end},' +
  '{map_int,fun()->erlang:map_get(1,Map) end},' +
  '{map_float,fun()->erlang:map_get(1.0,Map) end},' +
  '{map_positive_zero,fun()->erlang:map_get(0.0,Map) end},' +
  '{map_negative_zero,fun()->erlang:map_get(-0.0,Map) end},' +
  '{map_nested,fun()->erlang:map_get(NestedKey,Map) end},' +
  '{map_numeric_missing,fun()->erlang:map_get(1,#{1.0=>value}) end},' +
  '{map_key_present,fun()->erlang:is_map_key(NestedKey,Map) end},' +
  '{map_key_absent,fun()->erlang:is_map_key(missing,Map) end},' +
  '{map_key_bad,fun()->erlang:is_map_key(a,no) end},' +
  '{map_size_bad,fun()->erlang:map_size(no) end},' +
  '{tuple_size_empty,fun()->erlang:tuple_size({}) end},' +
  '{tuple_size_bad,fun()->erlang:tuple_size(no) end},' +
  '{maps_get,fun()->maps:get(0.0,Map) end},' +
  '{maps_get_missing,fun()->maps:get(a,#{}) end},' +
  '{maps_get_bad,fun()->maps:get(a,no) end},' +
  '{maps_key_present,fun()->maps:is_key(-0.0,Map) end},' +
  '{maps_key_absent,fun()->maps:is_key(a,#{}) end},' +
  '{maps_key_bad,fun()->maps:is_key(a,no) end},' +
  '{maps_get_default_present,fun()->maps:get(1,Map,fallback) end},' +
  '{maps_get_default,fun()->maps:get(a,#{},fallback) end},' +
  '{maps_get_default_bad,fun()->maps:get(a,no,fallback) end}], ' +
  'lists:foreach(fun({Name,F}) -> try F() of R -> io:format("~w ~w~n",[Name,R]) ' +
  'catch Class:Reason -> io:format("~w ~w:~w~n",[Name,Class,Reason]) end end,Tests), halt().'],
{encoding: 'utf8', timeout: 30000});
assert.equal(oracle, 'OTP 29.1.2\ntrue false false true\nguard pass fail\npart_guard pass fail\nself true true\n' +
  'maps_builtin true true false\nmap_guards pass\n' +
  'hd error:badarg\nhd_improper a\ntl_improper b\ntl_empty error:badarg\n' +
  'length_empty 0\nlength_improper error:badarg\n' +
  'bit_size_partial 9\nbyte_size_partial 2\nbit_size_bad error:badarg\nbyte_size_bad error:badarg\n' +
  'element error:badarg\nelement_first a\n' +
  'element_zero error:badarg\ndiv_zero error:badarith\nrem_zero error:badarith\nrem_bad error:badarith\n' +
  'float_divide 2.5\nfloat_divide_zero error:badarith\nfloat_divide_bad error:badarith\n' +
  'float_divide_conversion error:badarith\nfloat_divide_overflow error:badarith\n' +
  'plus error:badarith\nplus_mixed 1.5\n' +
  'plus_big 1208925819614629174706177\nadd_overflow error:badarith\n' +
  'subtract_bad error:badarith\nmultiply_overflow error:badarith\nmixed_overflow error:badarith\n' +
  'neg -5\nneg_bad error:badarith\n' +
  'abs_big 1208925819614629174706176\nabs_bad error:badarg\n' +
  'trunc_negative -1\nround_negative -2\nfloor_negative -2\nceil_negative -1\n' +
  'trunc_bad error:badarg\nround_bad error:badarg\nfloor_bad error:badarg\nceil_bad error:badarg\n' +
  'float_integer 5.0\nfloat_bad error:badarg\nfloat_overflow error:badarg\n' +
  'band_bad error:badarith\nbor_bad error:badarith\nbxor_bad error:badarith\nbnot_bad error:badarith\n' +
  'part_negative <<98,99>>\npart_empty <<>>\npart_bounds error:badarg\npart_bits error:badarg\n' +
  'part_badtype error:badarg\npart2_negative <<98,99>>\npart2_empty <<>>\n' +
  'part2_bounds error:badarg\npart2_bits error:badarg\npart2_tuple error:badarg\npart2_type error:badarg\n' +
  'map_missing error:{badkey,a}\nmap_bad error:{badmap,x}\n' +
  'map_size 5\nmap_int integer\nmap_float float\nmap_positive_zero positive\nmap_negative_zero negative\n' +
  'map_nested compound\nmap_numeric_missing error:{badkey,1}\nmap_key_present true\nmap_key_absent false\n' +
  'map_key_bad error:{badmap,no}\nmap_size_bad error:{badmap,no}\ntuple_size_empty 0\n' +
  'tuple_size_bad error:badarg\nmaps_get positive\nmaps_get_missing error:{badkey,a}\n' +
  'maps_get_bad error:{badmap,no}\nmaps_key_present true\nmaps_key_absent false\n' +
  'maps_key_bad error:{badmap,no}\nmaps_get_default_present integer\nmaps_get_default fallback\n' +
  'maps_get_default_bad error:{badmap,no}\n');

const wrongSource = spawnSync(process.execPath, [
  fileURLToPath(new URL('../tools/bif-inventory.mjs', import.meta.url)),
  '--check', fileURLToPath(new URL('../package.json', import.meta.url)),
], {encoding: 'utf8', timeout: 30000});
assert.notEqual(wrongSource.status, 0);
assert.match(wrongSource.stderr, /does not match the pinned OTP 29\.1\.2 source/);
console.log(`Verified ${rows.length} BIF entries and representative OTP behavior`);
