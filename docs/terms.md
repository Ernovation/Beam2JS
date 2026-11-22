# Erlang term representation design

This document describes the **planned** runtime representation and boundary
for OTP 29.1.2 terms. It is not a compatibility claim. Today the runtime accepts
JavaScript `bigint` integers, atoms made with `runtime.atom()` (currently using
`Symbol.for`) and finite floats made with `runtime.float()`. The compiler
also accepts immutable proper and improper lists made with `runtime.nil()` and
`runtime.cons()`, tuples made with `runtime.tuple()`, and bitstrings made with
`runtime.bitstring()`, plus opaque local process PIDs. The supported
comparison, type-test, list and tuple instruction
slice is described in the [README](../README.md); the other types and
operations below are not implemented.

The design is a target for [phases 3 and 6](plan.md), with identity-bearing
types also depending on later process, module-loading and host-integration
work. The precise API and limits must be finalized and tested before use.

## Shared representation rules

- Treat Erlang terms as immutable values. Runtime-internal tagged values have
  private storage and validated constructors; callers cannot mutate their
  contents. Sharing an immutable term between processes is allowed. Updates
  produce a new value or use a provably unobservable internal optimization.
- Use a distinct tag for each Erlang type, except that integers can remain
  JavaScript `bigint`s. Do not infer a term type from the shape of an arbitrary
  host object. The types below describe semantic representations, not a
  promise of a particular public JavaScript class or object layout.
- Term equality, numeric comparison, ordering, hashing, type tests and term
  construction are runtime operations shared by instructions and BIFs.
  JavaScript `===`, object identity, stringification, object-property keys
  and `Map` key equality are not general Erlang term operations.
- Term graphs may share immutable subterms. Reject cyclic host inputs: Erlang
  compound values are finite terms, not arbitrary cyclic JavaScript graphs.
  Traversals, hashing and conversion must handle deep terms without relying on
  unbounded JavaScript recursion, and must have explicit resource limits and
  scheduler checkpoints where appropriate.
- The new representations and conversion API use a versioned runtime ABI.
  The compiler and runtime currently use ABI 23 only; regenerate modules when
  the ABI changes during development.

## Term types

### Integers

Represent every Erlang integer as a JavaScript `bigint`, including zero,
negative values and integers outside JavaScript's safe-number range. Do not
convert through `Number` to compare, hash, serialize or perform integer
arithmetic. Implement Erlang division, remainder, bitwise operations and their
failure behavior explicitly rather than assuming every JavaScript operator
matches OTP. Enforce documented resource limits and report exhaustion rather
than silently truncating.

### Floats

Use an immutable, branded float value containing a finite IEEE 754 binary64
JavaScript `number`. The tag distinguishes `1.0` from integer `1n`. Preserve
the sign bit of zero: OTP 29 treats `+0.0` and `-0.0` as numerically equal but
not exactly equivalent. `Object.is` can distinguish them; JavaScript `===` and
`Map` cannot.

The current runtime implements this representation with private storage and
explicit `float(number)` / `floatValue(term)` boundary methods. It supports
float literals, moves, comparisons, selected type tests and arithmetic
instruction forms. Numeric comparison does not round large
integers through `Number`.

Reject NaN and infinities at the term boundary. Arithmetic that would produce
a non-finite result must follow OTP's `badarith` behavior rather than
returning a JavaScript infinity or NaN. Implement conversion, overflow,
underflow, rounding and integer/float comparisons against OTP, including large
integers; a blanket `Number(bigint)` conversion loses information. Preserve
the binary64 representation through serialization and host conversion.

### Atoms and booleans

Use a runtime-owned atom table that interns validated Unicode names into
immutable, branded atom values. Equality is by atom name, not by a JavaScript
object address; interning is an optimization, not the semantic definition.
Compare names by Unicode code point, not JavaScript UTF-16 code-unit order.
Enforce OTP's atom-name constraints and explicit atom-table limits, and make
atom creation observable where OTP does. Do not use the process-global
`Symbol.for` registry as the long-term storage policy.

`true` and `false` are the corresponding atoms, not a separate Erlang Boolean
type. Other atoms, including `undefined`, are not JavaScript sentinels. An atom
and a host string with the same spelling are distinct values.

### Empty list, cons cells and strings

Use a singleton tagged `nil` for `[]` and immutable cons cells with `head` and
`tail` term fields. A tail can be any term: `[a|b]` must not be forced into a
JavaScript array or rejected as a term. Proper lists end in `nil`; operations
that require a proper list must detect an improper tail and apply their
specified failure behavior. In OTP, `is_list([a|b])` is true even though
`length([a|b])` fails.

The current runtime implements nil and immutable cons cells with private
storage and validated constructors. `listHead` and `listTail` inspect cons
cells. Equality and ordering walk nested lists and tuples iteratively; operation limits
and scheduler checkpoints are not yet implemented. `is_list` accepts improper
cons cells, while `length/1` and other list BIFs remain unsupported. Literal
lists are supported when all nested values are supported terms.

An Erlang string is a list of integer code points, not a separate term type.
Text conversions must specify encoding and error handling; a JavaScript
string does not automatically mean an atom, a list, or a binary.

### Tuples and traditional records

Represent a tuple as a tagged immutable sequence of terms, including the empty
tuple. Defensively copy host-provided arrays and do not expose mutable
backing storage. Erlang tuple operations use one-based indices at the language
boundary; instruction operands may use different conventions and must be
translated explicitly.

The current runtime implements private immutable tuples with a defensive copy
of constructor inputs. `tupleSize` returns a host integer and `tupleElement`
uses a one-based host index; these methods are not Erlang BIF dispatch.
Compiler support includes dynamic construction, tuple tests, arity matching,
element extraction and tuple literals containing supported terms. Tuple BIFs
remain unsupported; literals containing unsupported values reject compilation.

Traditional `-record(name, ...)` records compile to tuples. Do not invent a
separate runtime type for them: their tag atom and fields follow normal tuple
semantics.

### Maps

Represent a map as an immutable collection of associations backed by a
term-aware index, such as a persistent hash trie or a sorted structure. Map
keys use **exact** term equivalence recursively. Consequently `1`, `1.0`,
`+0.0`, and `-0.0` are distinct keys as applicable; compound keys with equal
contents must find the same association even when independently constructed.
Hashing must agree with exact key equivalence, including nested terms, and
resolve collisions using exact comparison.

Do not use a plain JavaScript object or a JavaScript `Map` directly as the
semantic map: their keys and equality rules differ. Map update operations must
distinguish inserting/replacing a key from updating an existing key and
preserve OTP failure behavior. Map iteration order must follow the particular
OTP API's contract; a hash table's incidental order is not a substitute.

### Bitstrings and binaries

Represent a bitstring by private immutable bytes, a starting bit offset and a
bit length. A binary is a bitstring whose length is divisible by eight; the
underlying offset need not be byte-aligned. Copy externally supplied mutable
buffers on entry, and never expose writable internal storage. Slices can share
private immutable storage.

The current runtime implements copied, zero-offset bitstrings with explicit
bit lengths. `bitstring(bytes, bitLength)` accepts an array or `Uint8Array`,
requires exactly enough bytes, and clears unused low bits in the last byte.
`bitstringSize` returns a host number of bits and `bitstringBytes` returns a
copy with zeroed padding. Compiler-generated binary and partial-byte bitstring
literals, including nested literals, support equality and ordering. These
traversals are synchronous without resource limits or scheduler checkpoints.
The `is_binary` and `is_bitstr` test instructions and non-failing
`is_binary/1` and `is_bitstring/1` BIF instruction forms are supported for the
implemented terms. Binary membership depends on bit length, not offset.
Nonzero-label `bit_size/1` and `byte_size/1` guard instructions accept any
bitstring; `byte_size/1` rounds up partial bytes. Their exception forms are unsupported.
The nonzero-label `binary_part/2` and `binary_part/3` guards slice binaries,
including negative lengths; they copy selected bytes synchronously without scheduler
checkpoints. Their exception forms, callable BIF dispatch, dynamic
construction and general matching/slicing instructions remain unsupported.

Construction and matching must handle arbitrary bit offsets, partial bytes,
units, signedness, endianness and UTF segments as required by each instruction.
Compare the meaningful bits, not unused padding. Bounds, invalid sizes and
failed matches must use the appropriate guard failure or exception path.

### Funs

Use separate branded forms for exported funs and local closures. An exported
fun records its module, function and arity; a closure records the applicable
module/code version, fun identity, arity and immutable captured terms. Resolve
and invoke them through runtime frames, not as arbitrary host JavaScript
functions.

Implement equality, ordering, arity checks, external representation and
code-version lifetime according to OTP, including captures and hot loading.
Do not assume that JavaScript function identity, matching module/name alone,
or identical closure contents is sufficient. Until those rules are implemented
and tested, reject unsupported fun operations explicitly.

### PIDs, ports and references

Use separate opaque branded values containing sufficient node/creation and
identifier components to preserve OTP identity, comparison and external-term
semantics. A PID identifies a process rather than exposing a mutable process
object; a reference is not just a JavaScript object identity or random
number; a port identifier is not a host socket or file handle. Runtime tables
map supported local identifiers to owned state.

Process termination must not mutate an existing PID term. Identifier reuse,
node incarnation and cross-node identity must follow the chosen OTP-compatible
policy; never conflate a stale identifier with a live local object. Real ports
and distribution need explicit host adapters and policies. Reject unsupported
creation, decoding or operations instead of inventing compatible-looking
values.

The current local PID slice assigns a unique opaque term to each host-created
or synchronously invoked process and retains identity after termination.
`self/0`, `is_pid/1` and local `is_process_alive/1` are supported; host process handles expose the PID but
remain separate from it. PIDs have an implementation-defined local ordering;
node components, serialization, distribution, Erlang spawning and PID-based
message delivery are not implemented.

### OTP 29 native records

Native records are distinct terms, unlike tuple-based records. Plan a branded,
immutable record carrying its defining module and record name, field
definitions and values, and the export status captured at construction.
Field access, matching and updates use the captured definition, including
across module reloads; visibility rules depend on the accessing module and the
captured export status. Updates produce a new value.

OTP 29 native records are experimental. Their exact equality, ordering,
external format, evolution and failure cases require release-specific
investigation and differential tests. Until those semantics are implemented,
reject native-record instructions and unsupported external terms rather than
coercing records to tuples or maps.

## Equality, ordering and hashing

Provide separate operations for exact equivalence (`=:=`), ordinary equality
(`==`), term ordering, and the exact key order needed by maps. Exact
equivalence distinguishes integer from float and the signs of floating zero.
Ordinary numeric equality compares integer and float values according to OTP;
it also applies recursively to appropriate compound values. Map **keys** use
exact equivalence even when maps are compared with `==`, while corresponding
map values use the requested equality mode.

For the established types, OTP's cross-type order is:

```text
number < atom < reference < fun < port < pid < tuple < map < nil < list < bitstring
```

Native-record placement and comparison are not specified by that list here and
must be checked against OTP 29. Compare tuples by arity then elements; lists
lexicographically, including improper tails; and bitstrings by their meaningful
bits, with a shorter prefix first. Compare maps by size, then keys in OTP's
exact map-key order, then values in key order. Map-key ordering distinguishes
integer and float types and signed float zero even where ordinary numeric
comparison does not. Do not use the ordinary numeric comparator alone to
order keys.

Atom, fun, PID, port and reference comparison must also follow OTP rather than
local allocation order or host identity. Hashing for map keys must satisfy
`exact_equal(a, b) => exact_hash(a) == exact_hash(b)`; collision resolution
still compares keys. Any further hash-dependent behavior must be investigated
independently rather than exposing internal hash values as OTP results.

## JavaScript boundary and serialization

The current experimental boundary additionally supports opaque host handles.
`runtime.hostHandle` wraps an object or function, preserving its identity
within that runtime; `runtime.hostValue` unwraps only a handle owned by that
runtime. A live handle retains its host value, and no explicit release is
available. Handles are immutable terms, not Erlang references; their equality
is by identity and their ordering is an implementation-defined extension.
They can be nested in existing compound terms and passed between runtimes as
terms, but another runtime cannot unwrap them. Host objects are not otherwise
automatically converted. The browser demo adapter accepts UTF-8 binaries and
offers only two synchronous DOM operations; errors propagate as JavaScript
errors rather than Erlang exceptions.

Expose explicit constructors/converters, not implicit guessing:

| Host input | Intended conversion |
| --- | --- |
| `bigint` | Integer; check configured limits. |
| finite `number` | Explicit float constructor; preserve `-0`. Never infer integer from an integral number. |
| string | Explicitly choose atom, Unicode list, or an encoded binary. Validate encoding and limits. |
| array | Explicitly choose tuple or proper list; validate and copy elements. Use an explicit cons constructor for improper lists. |
| bytes | Explicit binary/bitstring constructor; validate bit length and copy mutable input. |
| Boolean | Explicit conversion to atom `true` or `false`. |
| function, object, `null`, `undefined` | Reject unless a separately specified adapter converts it; never treat it as an Erlang term by default. |

Exporting terms back to JavaScript must be equally explicit and preserve
integer precision, float type and signed zero, atom identity, list tails,
tuple/map distinctions and binary bit length. Return copies or read-only
views that cannot mutate runtime values. Opaque identifiers and funs remain
runtime-owned handles, not raw host resources. Cross-runtime transfer requires
an explicit validated conversion or external format; do not assume runtime
brands or atom-table identities are portable.

External term format decoding/encoding is a separate capability, not a JSON
or structured-clone substitute. Support only documented tags and options,
validate lengths and references before allocation, bound nesting and
decompression, and define policies for atoms, identities and executable funs.
Unknown or unsafe forms fail explicitly. The current compiler's untrusted
input warning remains in force until the whole input path is audited.

## Verification

Before advertising a type, compare successful results, guard failures,
exception classes/reasons and relevant effects with OTP 29.1.2 in both Node.js
and a real browser, including stripped and compiler-generated BEAM input.
At minimum cover:

- large positive and negative integers, float boundaries, `+0.0` versus
  `-0.0`, non-finite rejection and integer/float comparisons around `2^53`;
- unusual and supplementary-plane atoms, atom limits and atom-creation
  effects; proper and improper lists, strings, empty and nested tuples;
- maps with independently constructed compound keys, integer/float keys,
  signed-zero keys, collision handling, map comparison and failed updates;
- zero-length and unaligned bitstrings, partial-byte slices, mutation attempts
  at the host boundary, matching failures and invalid sizes;
- closure captures, code versions, PID/reference identity, native-record
  captured definitions and unavailable host capabilities as those features
  are implemented;
- cyclic host inputs, deep terms, bounded resource failures, serialization
  round trips and malformed or unsupported external terms.

Record which operand forms and semantic paths are actually covered in the
compatibility matrix. A representation alone does not implement its BIFs,
instructions or full OTP behavior.

## Sources

- [OTP 29.1.2 data types](https://github.com/erlang/otp/blob/OTP-29.1.2/system/doc/reference_manual/data_types.md)
- [OTP 29.1.2 term comparisons](https://github.com/erlang/otp/blob/OTP-29.1.2/system/doc/reference_manual/expressions.md#term-comparisons)
- [OTP 29.1.2 native records](https://github.com/erlang/otp/blob/OTP-29.1.2/system/doc/reference_manual/ref_man_native_records.md)
- [OTP 29.1.2 external term format](https://github.com/erlang/otp/blob/OTP-29.1.2/erts/doc/guides/erl_ext_dist.md)
