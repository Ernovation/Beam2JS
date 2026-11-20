# Generic opcode ledger: OTP 29.1.2

Source: [OTP 29.1.2 genop.tab](https://github.com/erlang/otp/blob/OTP-29.1.2/lib/compiler/src/genop.tab),
BEAM format 0, SHA-256 `70ae56774acabc7becbdc13b7c146bbbb8767f25e1495ea47656c0d2dd44311f`. Numbers, names,
arities, deprecated markers and any operand names below are extracted from that
file, independently of `beam_disasm`. Operand names are illustrative, not
validated types or an exhaustive list of forms. "Not specified" means the
table has no matching `@spec`, not that the instruction has no operands.
Known discrepancies in upstream spec annotations are not used to determine
arity. Active means not marked deprecated in this table; it does not establish
loader acceptance or compiler emission.

## Status key

Each entry has five status columns: decoding (D), validation (V), lowering
(L), runtime semantics (R), and tests (T). Their initial values are:

- **?**: raw opcode/operand mapping not independently verified. OTP's internal
  disassembler is used, but can normalize or consume instructions.
- **N**: not implemented or not independently tested for this raw opcode.
- **P**: partial support or tests for a similarly named *normalized* form;
  raw mapping, all variants, and full Erlang semantics remain unverified.

All entries currently have D = ? and V = N: there is no raw opcode decoder or
complete validation. Entries with P in L/R/T refer only to the narrow normalized
forms described in their notes; all others are N. N for lowering does not mean
that the disassembler necessarily exposes that raw opcode unchanged. N for
tests means no raw-opcode-specific differential coverage; it does not imply
that an instruction never appears in a fixture. Tests marked P are the existing
Node integration tests, not browser tests or comprehensive differential
coverage. `func_info` raises a host error, not an Erlang exception. `line`
is ignored and its effect on executable/debug metadata is not established.

The operand column preserves names from available upstream specifications.
Notes identify selected known variants and the current normalized slice; all
other operand types, failure edges and control-flow variants remain to be
investigated. This is an initial inventory, not a compatibility claim.

Regenerate or verify using the exact upstream file:

```sh
curl -fsSL https://raw.githubusercontent.com/erlang/otp/OTP-29.1.2/lib/compiler/src/genop.tab -o /tmp/beam2js-genop.tab
node tools/opcode-ledger.mjs /tmp/beam2js-genop.tab > docs/opcodes-otp-29.1.2.md
node tools/opcode-ledger.mjs --check /tmp/beam2js-genop.tab
```

| Opcode | Instruction | Lifecycle | Operand names | D | V | L | R | T | Forms / control-flow notes |
| ---: | --- | --- | --- | :-: | :-: | :-: | :-: | :-: | --- |
| 1 | `label/1` | active | Lbl | ? | N | P | P | P | Label; next instruction. |
| 2 | `func_info/3` | active | M F A | ? | N | P | P | P | Matching module/function/arity; function-clause host error. |
| 3 | `int_code_end/0` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 4 | `call/2` | active | Arity Label | ? | N | N | N | N | Not yet inventoried. |
| 5 | `call_last/3` | active | Arity Label Deallocate | ? | N | N | N | N | Not yet inventoried. |
| 6 | `call_only/2` | active | Arity Label | ? | N | P | P | P | Known local target, arity 0..255; tail transfer. |
| 7 | `call_ext/2` | active | Arity Destination | ? | N | N | N | N | Not yet inventoried. |
| 8 | `call_ext_last/3` | active | Arity Destination Deallocate | ? | N | N | N | N | Not yet inventoried. |
| 9 | `bif0/2` | active | Bif Reg | ? | N | N | N | N | Not yet inventoried. |
| 10 | `bif1/4` | active | Lbl Bif Arg Reg | ? | N | N | N | N | Not yet inventoried. |
| 11 | `bif2/5` | active | Lbl Bif Arg1 Arg2 Reg | ? | N | N | N | N | Not yet inventoried. |
| 12 | `allocate/2` | active | StackNeed Live | ? | N | N | N | N | Not yet inventoried. |
| 13 | `allocate_heap/3` | active | StackNeed HeapNeed Live | ? | N | N | N | N | Not yet inventoried. |
| 14 | `allocate_zero/2` | deprecated | StackNeed Live | ? | N | N | N | N | Not yet inventoried. |
| 15 | `allocate_heap_zero/3` | deprecated | StackNeed HeapNeed Live | ? | N | N | N | N | Not yet inventoried. |
| 16 | `test_heap/2` | active | HeapNeed Live | ? | N | N | N | N | Not yet inventoried. |
| 17 | `init/1` | deprecated | N | ? | N | N | N | N | Not yet inventoried. |
| 18 | `deallocate/1` | active | N | ? | N | N | N | N | Not yet inventoried. |
| 19 | `return/0` | active | (none) | ? | N | P | P | P | Return x0 to caller. |
| 20 | `send/0` | active | (none) | ? | N | N | N | N | Not yet inventoried. |
| 21 | `remove_message/0` | active | (none) | ? | N | N | N | N | Not yet inventoried. |
| 22 | `timeout/0` | active | (none) | ? | N | N | N | N | Not yet inventoried. |
| 23 | `loop_rec/2` | active | Label Source | ? | N | N | N | N | Not yet inventoried. |
| 24 | `loop_rec_end/1` | active | Label | ? | N | N | N | N | Not yet inventoried. |
| 25 | `wait/1` | active | Label | ? | N | N | N | N | Not yet inventoried. |
| 26 | `wait_timeout/2` | active | Label Time | ? | N | N | N | N | Not yet inventoried. |
| 27 | `m_plus/4` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 28 | `m_minus/4` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 29 | `m_times/4` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 30 | `m_div/4` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 31 | `int_div/4` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 32 | `int_rem/4` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 33 | `int_band/4` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 34 | `int_bor/4` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 35 | `int_bxor/4` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 36 | `int_bsl/4` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 37 | `int_bsr/4` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 38 | `int_bnot/3` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 39 | `is_lt/3` | active | Lbl Arg1 Arg2 | ? | N | N | N | N | Not yet inventoried. |
| 40 | `is_ge/3` | active | Lbl Arg1 Arg2 | ? | N | N | N | N | Not yet inventoried. |
| 41 | `is_eq/3` | active | Lbl Arg1 Arg2 | ? | N | N | N | N | Not yet inventoried. |
| 42 | `is_ne/3` | active | Lbl Arg1 Arg2 | ? | N | N | N | N | Not yet inventoried. |
| 43 | `is_eq_exact/3` | active | Lbl Arg1 Arg2 | ? | N | P | P | P | x register, integer or atom operands; fallthrough or nonzero label. |
| 44 | `is_ne_exact/3` | active | Lbl Arg1 Arg2 | ? | N | N | N | N | Not yet inventoried. |
| 45 | `is_integer/2` | active | Lbl Arg1 | ? | N | N | N | N | Not yet inventoried. |
| 46 | `is_float/2` | active | Lbl Arg1 | ? | N | N | N | N | Not yet inventoried. |
| 47 | `is_number/2` | active | Lbl Arg1 | ? | N | N | N | N | Not yet inventoried. |
| 48 | `is_atom/2` | active | Lbl Arg1 | ? | N | N | N | N | Not yet inventoried. |
| 49 | `is_pid/2` | active | Lbl Arg1 | ? | N | N | N | N | Not yet inventoried. |
| 50 | `is_reference/2` | active | Lbl Arg1 | ? | N | N | N | N | Not yet inventoried. |
| 51 | `is_port/2` | active | Lbl Arg1 | ? | N | N | N | N | Not yet inventoried. |
| 52 | `is_nil/2` | active | Lbl Arg1 | ? | N | N | N | N | Not yet inventoried. |
| 53 | `is_binary/2` | active | Lbl Arg1 | ? | N | N | N | N | Not yet inventoried. |
| 54 | `is_constant/2` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 55 | `is_list/2` | active | Lbl Arg1 | ? | N | N | N | N | Not yet inventoried. |
| 56 | `is_nonempty_list/2` | active | Lbl Arg1 | ? | N | N | N | N | Not yet inventoried. |
| 57 | `is_tuple/2` | active | Lbl Arg1 | ? | N | N | N | N | Not yet inventoried. |
| 58 | `test_arity/3` | active | Lbl Arg1 Arity | ? | N | N | N | N | Not yet inventoried. |
| 59 | `select_val/3` | active | Arg FailLabel Destinations | ? | N | N | N | N | Not yet inventoried. |
| 60 | `select_tuple_arity/3` | active | Tuple FailLabel Destinations | ? | N | N | N | N | Not yet inventoried. |
| 61 | `jump/1` | active | Label | ? | N | P | P | P | Nonzero local label; unconditional branch. |
| 62 | `catch/2` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 63 | `catch_end/1` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 64 | `move/2` | active | Source Destination | ? | N | P | P | P | x register, integer or atom to x register; fallthrough. |
| 65 | `get_list/3` | active | Source Head Tail | ? | N | N | N | N | Not yet inventoried. |
| 66 | `get_tuple_element/3` | active | Source Element Destination | ? | N | N | N | N | Not yet inventoried. |
| 67 | `set_tuple_element/3` | active | NewElement Tuple Position | ? | N | N | N | N | Not yet inventoried. |
| 68 | `put_string/3` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 69 | `put_list/3` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 70 | `put_tuple/2` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 71 | `put/1` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 72 | `badmatch/1` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 73 | `if_end/0` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 74 | `case_end/1` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 75 | `call_fun/1` | active | Arity | ? | N | N | N | N | Not yet inventoried. |
| 76 | `make_fun/3` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 77 | `is_function/2` | active | Lbl Arg1 | ? | N | N | N | N | Not yet inventoried. |
| 78 | `call_ext_only/2` | active | Arity Label | ? | N | P | P | P | External target, arity 0..255; tail transfer. |
| 79 | `bs_start_match/2` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 80 | `bs_get_integer/5` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 81 | `bs_get_float/5` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 82 | `bs_get_binary/5` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 83 | `bs_skip_bits/4` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 84 | `bs_test_tail/2` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 85 | `bs_save/1` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 86 | `bs_restore/1` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 87 | `bs_init/2` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 88 | `bs_final/2` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 89 | `bs_put_integer/5` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 90 | `bs_put_binary/5` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 91 | `bs_put_float/5` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 92 | `bs_put_string/2` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 93 | `bs_need_buf/1` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 94 | `fclearerror/0` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 95 | `fcheckerror/1` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 96 | `fmove/2` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 97 | `fconv/2` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 98 | `fadd/4` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 99 | `fsub/4` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 100 | `fmul/4` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 101 | `fdiv/4` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 102 | `fnegate/3` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 103 | `make_fun2/1` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 104 | `try/2` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 105 | `try_end/1` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 106 | `try_case/1` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 107 | `try_case_end/1` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 108 | `raise/2` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 109 | `bs_init2/6` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 110 | `bs_bits_to_bytes/3` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 111 | `bs_add/5` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 112 | `apply/1` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 113 | `apply_last/2` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 114 | `is_boolean/2` | active | Lbl Arg1 | ? | N | N | N | N | Not yet inventoried. |
| 115 | `is_function2/3` | active | Lbl Arg1 Arity | ? | N | N | N | N | Not yet inventoried. |
| 116 | `bs_start_match2/5` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 117 | `bs_get_integer2/7` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 118 | `bs_get_float2/7` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 119 | `bs_get_binary2/7` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 120 | `bs_skip_bits2/5` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 121 | `bs_test_tail2/3` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 122 | `bs_save2/2` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 123 | `bs_restore2/2` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 124 | `gc_bif1/5` | active | Lbl Live Bif Arg Reg | ? | N | N | N | N | Not yet inventoried. |
| 125 | `gc_bif2/6` | active | Lbl Live Bif Arg1 Arg2 Reg | ? | N | N | N | N | Not yet inventoried. |
| 126 | `bs_final2/2` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 127 | `bs_bits_to_bytes2/2` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 128 | `put_literal/2` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 129 | `is_bitstr/2` | active | Lbl Arg1 | ? | N | N | N | N | Not yet inventoried. |
| 130 | `bs_context_to_binary/1` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 131 | `bs_test_unit/3` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 132 | `bs_match_string/4` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 133 | `bs_init_writable/0` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 134 | `bs_append/8` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 135 | `bs_private_append/6` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 136 | `trim/2` | active | N Remaining | ? | N | N | N | N | Not yet inventoried. |
| 137 | `bs_init_bits/6` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 138 | `bs_get_utf8/5` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 139 | `bs_skip_utf8/4` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 140 | `bs_get_utf16/5` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 141 | `bs_skip_utf16/4` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 142 | `bs_get_utf32/5` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 143 | `bs_skip_utf32/4` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 144 | `bs_utf8_size/3` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 145 | `bs_put_utf8/3` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 146 | `bs_utf16_size/3` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 147 | `bs_put_utf16/3` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 148 | `bs_put_utf32/3` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 149 | `on_load/0` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 150 | `recv_mark/1` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 151 | `recv_set/1` | deprecated | not specified | ? | N | N | N | N | Not yet inventoried. |
| 152 | `gc_bif3/7` | active | Lbl Live Bif Arg1 Arg2 Arg3 Reg | ? | N | N | N | N | Not yet inventoried. |
| 153 | `line/1` | active | not specified | ? | N | P | P | P | Line metadata; ignored. |
| 154 | `put_map_assoc/5` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 155 | `put_map_exact/5` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 156 | `is_map/2` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 157 | `has_map_fields/3` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 158 | `get_map_elements/3` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 159 | `is_tagged_tuple/4` | active | Lbl Reg N Atom | ? | N | N | N | N | Not yet inventoried. |
| 160 | `build_stacktrace/0` | active | (none) | ? | N | N | N | N | Not yet inventoried. |
| 161 | `raw_raise/0` | active | (none) | ? | N | N | N | N | Not yet inventoried. |
| 162 | `get_hd/2` | active | Source Head | ? | N | N | N | N | Not yet inventoried. |
| 163 | `get_tl/2` | active | Source Tail | ? | N | N | N | N | Not yet inventoried. |
| 164 | `put_tuple2/2` | active | Destination Elements | ? | N | N | N | N | Not yet inventoried. |
| 165 | `bs_get_tail/3` | active | Ctx Dst Live | ? | N | N | N | N | Not yet inventoried. |
| 166 | `bs_start_match3/4` | active | Fail Bin Live Dst | ? | N | N | N | N | Not yet inventoried. |
| 167 | `bs_get_position/3` | active | Ctx Dst Live | ? | N | N | N | N | Not yet inventoried. |
| 168 | `bs_set_position/2` | active | not specified | ? | N | N | N | N | Not yet inventoried. |
| 169 | `swap/2` | active | Register1 Register2 | ? | N | N | N | N | Not yet inventoried. |
| 170 | `bs_start_match4/4` | active | Fail Bin Live Dst | ? | N | N | N | N | Failure label, no_fail or resume. |
| 171 | `make_fun3/3` | active | OldIndex Dst EnvTerms | ? | N | N | N | N | Not yet inventoried. |
| 172 | `init_yregs/1` | active | ListOfYRegs | ? | N | N | N | N | Not yet inventoried. |
| 173 | `recv_marker_bind/2` | active | Marker Reference | ? | N | N | N | N | Not yet inventoried. |
| 174 | `recv_marker_clear/1` | active | Reference | ? | N | N | N | N | Not yet inventoried. |
| 175 | `recv_marker_reserve/1` | active | Marker | ? | N | N | N | N | Not yet inventoried. |
| 176 | `recv_marker_use/1` | active | Reference | ? | N | N | N | N | Not yet inventoried. |
| 177 | `bs_create_bin/6` | active | Fail Alloc Live Unit Dst OpList | ? | N | N | N | N | Not yet inventoried. |
| 178 | `call_fun2/3` | active | Tag Arity Func | ? | N | N | N | N | Local fun index, safe or unsafe tag. |
| 179 | `nif_start/0` | active | (none) | ? | N | N | N | N | Not yet inventoried. |
| 180 | `badrecord/1` | active | Value | ? | N | N | N | N | Not yet inventoried. |
| 181 | `update_record/5` | active | Hint Size Src Dst Updates=[Index, Value] | ? | N | N | N | N | Copy or reuse hint; update list. |
| 182 | `bs_match/3` | active | Fail Ctx {commands,Commands} | ? | N | N | N | N | Command list; command and operand variants not yet inventoried. |
| 183 | `executable_line/2` | active | Location Index | ? | N | N | N | N | Not yet inventoried. |
| 184 | `debug_line/4` | active | Kind Location Index Live | ? | N | N | N | N | Entry or line kind. |
| 185 | `bif3/6` | active | Lbl Bif Arg1 Arg2 Arg3 Reg | ? | N | N | N | N | Not yet inventoried. |
| 186 | `is_any_native_record/2` | active | Lbl Term | ? | N | N | N | N | Not yet inventoried. |
| 187 | `is_native_record/4` | active | Lbl Rec Module Name | ? | N | N | N | N | Not yet inventoried. |
| 188 | `get_record_elements/3` | active | Lbl Rec Elements=[FieldName, Register] | ? | N | N | N | N | Not yet inventoried. |
| 189 | `put_record/6` | active | Lbl Id Src Dst Live Updates | ? | N | N | N | N | Create or update; failure label or exception when label is zero. |
| 190 | `is_record_accessible/3` | active | Lbl Rec Scope | ? | N | N | N | N | External or auto_local scope; failure branch. |
| 191 | `get_record_field/5` | active | Lbl Rec Id Field Dst | ? | N | N | N | N | Failure label or exception when label is zero. |
