# Browser events as Erlang messages

## Status and decision

The browser adapter now implements element lookup, text/value/attribute reads,
text updates and Erlang-owned DOM subscriptions. The browser demo uses
`dom:listen/3`, receives immutable event snapshots, and unsubscribes through
`dom:unlisten/1` or process cleanup.

**Treat browser events as external signals delivered to an Erlang process
mailbox.** A small JavaScript adapter owns browser listeners and translates
events into immutable Erlang terms. An Erlang process owns application state
and handles those terms with ordinary selective `receive`.

Do not compile an Erlang callback into a JavaScript event handler, call
`runtime.invoke` from every event, or spawn a new process for every event.
Those approaches lose the persistent receiver's state and ordering, and
synchronous invocation can block the browser or cannot wait for messages.
The adapter is conceptually a port-like boundary, not an Erlang port
implementation.

## What works today

The [DOM adapter](../examples/browser/dom.mjs) registers JavaScript-backed
Erlang functions through `runtime.registerModule`. The
[browser bootstrap](../examples/browser/main.mjs) starts a scheduled Erlang
process with `runtime.spawnProcess`, sends `{dom_event, click}` on a DOM click,
and removes its listeners when the process stops or fails.

The [runtime](../runtime/beam2js.mjs) already supports:

- `spawnProcess(Module, Function, Args)` with a PID and a result promise;
- `processHandle(Pid)` for scheduled processes, including Erlang-spawned ones;
- `sendMessage(Handle, Term)`, which enqueues a term and wakes a waiting process;
- local PIDs, references, immutable tuples, lists and binaries;
- selective `receive`, suspension, timeouts and cooperative scheduling.

The [receive fixture](../fixtures/process_receive.erl) demonstrates the
required consumer behavior. Its `wanted/0` can receive a browser-originated
`{wanted, Value}` just as it receives a message from another Erlang process.
For example, after registering the translated fixture in a browser:

```js
const worker = runtime.spawnProcess('process_receive', 'wanted', []);
const onClick = () => {
  // A scheduled process can finish before its promise handlers run.
  if (!runtime.isProcessAlive(worker.pid)) {
    button.removeEventListener('click', onClick);
    return;
  }
  runtime.sendMessage(worker, runtime.tuple([
    runtime.atom('wanted'), 42n,
  ]));
};
button.addEventListener('click', onClick);
void worker.result.then(
  value => {
    button.removeEventListener('click', onClick);
    console.log('Received in Erlang:', value);
  },
  error => {
    button.removeEventListener('click', onClick);
    console.error('Erlang event receiver failed:', error);
  },
);
```

Here `button` is a browser element and `runtime` has the generated module
registered. This is a one-shot feasibility example, not the proposed reusable
API: rapid clicks can enqueue additional messages before the process finishes.
No compiler changes or new receive instructions are needed for event delivery.

## Architecture

```text
Browser EventTarget
    |
    | synchronous browser callback
    v
DOM adapter
    - validate subscription/capabilities
    - perform declared synchronous browser actions
    - snapshot selected event fields into Erlang terms
    - enqueue; never execute Erlang here
    |
    v
Runtime mailbox -> cooperative scheduler -> UI process receive loop
                                               |
                                               | synchronous dom calls
                                               v
                                            DOM adapter
```

Keep the core runtime independent of `window`, `document`, DOM classes and
event schemas. Extend the existing capability-scoped `dom` adapter rather
than exposing arbitrary JavaScript property access or callbacks.

Use one process per independently stateful UI component, not per DOM element.
That process owns its subscriptions and state, serializes UI updates, and can
send domain messages such as `{submit, FormData}` to other Erlang processes.
Long computations belong in separate scheduled processes, not inside the
listener callback. A separate event-broker process is unnecessary for direct
delivery; add one only when routing or fan-out is actually needed.

Scheduler slots currently share one browser thread. A separate Erlang process
does not make expensive host calls or runtime operations parallel, and
cooperative instruction limits are not a hard UI-latency guarantee.

## Proposed Erlang API

```erlang
dom:listen(Element, EventType, Options) -> {ok, SubscriptionRef} | {error, Reason}.
dom:unlisten(SubscriptionRef) -> ok | {error, Reason}.
```

- The calling process is both receiver and owner. It must be a live scheduled
  process; subscribing from synchronous `invoke` returns
  `{error, scheduled_process_required}`.
- `Element` must be a handle obtained from this adapter. Retain the existing
  document/element capability checks; never accept arbitrary host objects.
- `EventType` is an allowlisted atom, initially `click`, `input`, `keydown`
  and `submit`. Unsupported types return `{error, unsupported_event}`.
- `Options` is a proper list of unique supported options. Initially:
  `{capture, Boolean}`, `{prevent_default, Boolean}` and
  `{stop_propagation, Boolean}`, all defaulting to `false`. Unknown or duplicate
  options and invalid values raise `badarg`.
- A successful subscription returns a fresh Erlang reference, not a DOM
  handle. Multiple subscriptions on an element are independent.
- `unlisten` is synchronous and owner-only. Repeating it with a genuine
  subscription reference issued to that owner returns `ok`; a reference from
  another owner/adapter, or an arbitrary `make_ref()` value, raises `badarg`.
  Keep issuance/ownership metadata weakly keyed by reference so idempotency
  does not retain detached elements.

Messages have a single envelope:

```erlang
{dom_event, SubscriptionRef, EventType, Data}
```

Use immutable Erlang maps for `Data`. Map keys are fixed atoms, so field access
is independent of property insertion or iteration order. Define fixed schemas, rather than recursively converting
arbitrary browser objects:

| Event | Snapshot fields |
| --- | --- |
| `click` | `button` integer; `client_x`, `client_y` floats; `alt_key`, `ctrl_key`, `meta_key`, `shift_key` boolean atoms |
| `mousemove` | `client_x`, `client_y`, `offset_x`, `offset_y` floats |
| `input` | `value` UTF-8 binary; `is_composing` boolean atom |
| `keydown` | `key`, `code` UTF-8 binaries; `repeat` and modifier boolean atoms |
| `submit` | empty map initially; form-value extraction is a separate explicit API |

`maps:filter/2`, `filtermap/2`, `fold/3`, `foreach/2`, `map/2`,
`merge_with/3`, `intersect_with/3`, `update_with/3/4`, and
`groups_from_list/2/3` require Erlang fun/closure support and currently raise
`badfun`. Pure map construction, conversion and transformation functions are
available.

The `input` schema initially requires a supported value-bearing input/textarea
element; other targets return `{error, unsupported_target}` on subscription.
Do not pretend this schema implements contenteditable editing.
Bound text snapshots with an adapter limit; reject an oversized snapshot
explicitly rather than truncating it. Continuous events such as `pointermove`,
`scroll` and `wheel` are deferred until bounded stream delivery exists.

Do not pass a live `Event`, mutable DOM object, JavaScript array or object as
the payload. The subscription reference identifies the source. Browser
strings, including key names and user text, become binaries, never dynamically
created atoms. Coordinate numbers use `runtime.float`; integer fields use
`bigint`, and booleans use `true`/`false` atoms.

## Erlang consumer

This example uses the proposed API and supported term shapes; it will not run
against the current adapter until that API is implemented.

```erlang
-module(click_ui).
-export([run/0]).

run() ->
    Button = dom:element_by_id(<<"button">>),
    Output = dom:element_by_id(<<"message">>),
    case dom:listen(Button, click, []) of
        {ok, Ref} ->
            loop(Ref, Output);
        {error, Reason} ->
            {error, Reason}
    end.

loop(Ref, Output) ->
    receive
        {dom_event, Ref, click, _Data} ->
            dom:append_text(Output, <<"Clicked! ">>),
            loop(Ref, Output);
        stop ->
            dom:unlisten(Ref)
    end.
```

Start `run/0` through `spawnProcess`, not `invoke`, and observe its result
promise. Stop it by sending `stop` to its mailbox. Plain receive loops are
appropriate for today's subset; later, the same message protocol can be
handled by `gen_server:handle_info/2` under a supervisor, once the required
OTP libraries, exception handling, links and monitors exist.

## Subscription lifecycle and required runtime support

A subscription record belongs to the adapter:

```text
Ref -> owner PID, scheduled handle, element, browser callback,
       capture flag, active state, process-cleanup detacher
```

The runtime passes the current PID as the fifth argument to a registered
function's `run` entry point. The adapter can therefore identify the caller
and obtain its scheduled handle without a new public PID-send API.

Add one small, host-only process-resource mechanism, provisionally
`runtime.onProcessExit(Pid, Cleanup) -> Detach`. This is **new work**, not an
existing method or a claim of Erlang monitor support:

1. Only a live local scheduled process can acquire a resource.
2. The runtime stores its cleanup registrations and runs them synchronously
   when the process returns or fails, before settling its result promise.
3. `Detach` unregisters the cleanup on explicit resource release.
4. Run every cleanup even if one fails, integrating failures with the
   runtime's existing process/timer cleanup error aggregation.

Registration must be transactional: validate everything first; if listener or
cleanup installation fails, undo any completed installation and propagate the
error. There is no `await` between ownership validation and listener attachment.

On `unlisten` or process exit, mark the record inactive first, remove the
browser listener with the original callback/capture flag, cancel pending
adapter work, detach cleanup, and release element/handle references.
Callbacks check activity and liveness before sending. A liveness failure is
normal teardown, not an exception to suppress.

Do not rely only on `handle.result.finally`: it runs in a later microtask and
does not cover synchronous cleanup semantics. Promise observation remains
necessary for reporting process results and errors.

Removing an element from the document does not itself terminate its owner or
unsubscribe it; detached elements can still receive programmatic events.
Component teardown must explicitly unsubscribe or stop the owner.
Page teardown should dispose the adapter's remaining subscriptions. Until
process cancellation exists, the host must also arrange cooperative stop
messages for waiting UI processes; disposing listeners alone does not stop
them.

`unlisten` guarantees **no future enqueue for that reference after it returns**,
not removal of messages already queued. Those messages remain immutable mailbox
contents. Receivers must ignore stale subscription references after a rebind.
A restarted component acquires fresh subscriptions; never resolve a registered
name on each event and accidentally deliver old UI events to a replacement
process.

## Browser timing is not Erlang timing

`preventDefault()` and propagation control must run during browser dispatch.
An Erlang receive handler runs later and cannot cancel the original event.
Apply the declared subscription options synchronously before snapshot/enqueue.
Use a non-passive listener where cancellation is requested. Requesting
cancellation does not make a non-cancelable browser event cancelable.

`stopPropagation` affects the browser event path, not already installed
listeners on the same target; do not promise `stopImmediatePropagation`.
Cancellation is independent of successful delivery: a later adapter failure
cannot undo it, which must be documented for forms and navigation.

Similarly, APIs that require transient user activation cannot generally wait
for arbitrary Erlang mailbox processing. Where necessary, add a narrow,
explicitly authorized synchronous host action; do not expose the raw event as
an attempted workaround. Browser activation rules still govern that action.

Snapshot fields during the callback, particularly input values. Reading a DOM
value later could observe a subsequent event's state. Synthetic events use the
same schema; event delivery is not proof of a trusted user gesture.

## Ordering, load and failure

Direct delivery preserves callback enqueue order per subscription. Selective
receive can intentionally process a later matching message first. Do not
promise total ordering across browser event sources, processes and timers, or
promise delivery before a paint.

The first low-rate implementation uses ordinary FIFO mailbox delivery.
This is **not bounded or backpressured**: even click/input events can overwhelm
a slow receiver. Document that limitation, cap snapshot size, and expose queue
length through existing `process_info/2`. Never change general Erlang `!`
semantics or secretly drop messages to hide overload.

Before exposing high-rate streams, add an explicit opt-in credit protocol:

- Envelope: `{dom_event, Ref, Sequence, EventType, Data}`; integer sequences
  identify acknowledgments, and `dom:ack(Ref, Sequence)` returns delivery credit.
- Allow at most one unacknowledged event per subscription, plus a bounded
  adapter queue. ACK means application processing is complete, not just that
  the mailbox was scanned. Reject invalid/duplicate ACKs.
- Discrete events queue in callback order. Overflow closes the subscription,
  releases its resources, reports a host diagnostic and queues one
  `{dom_event_error, Ref, overflow}` control message. Do not silently discard
  a click or submit.
- An explicitly selected `latest` mode replaces only the unsent snapshot for
  state-like events such as pointer position. Report how many samples were
  coalesced; never replace an event already in an Erlang mailbox. Do not use
  this mode for key transitions or transactional actions.
- Bound subscription count and total adapter buffer bytes as well as queue
  length. These bounds limit bridge-originated backlog, not the receiver's
  unrelated Erlang messages.

Animation-frame throttling alone is not backpressure: it can still enqueue
forever if Erlang consumes more slowly than frames arrive. Keep the ordinary
four-field message API distinct from this later acknowledged stream API.

Invalid Erlang argument shapes/capabilities raise `badarg`. Expected
subscription failures return explicit `{error, Reason}` values. Unexpected DOM
or host errors propagate synchronously, matching the current adapter rather
than becoming success-shaped fallbacks.

An asynchronous snapshot/delivery failure deactivates the subscription and
releases its resources, reports the original error through a host diagnostic
hook (defaulting to console reporting), and sends
`{dom_event_error, Ref, snapshot_failed}` to a still-live owner. Do not include
raw exceptions or sensitive input values in that term. Unexpected failure of
the diagnostic/delivery path must remain visible to the host, not be caught
and ignored.

## Implementation and verification sequence

1. Add and test synchronous process-resource cleanup in the runtime. Preserve
   existing send, receive and timer behavior; no compiler/opcode changes.
2. Extend the DOM adapter with owner-bound `listen/3`, `unlisten/1`, validated
   options, fixed snapshots and asynchronous error reporting.
3. Change the browser demo bootstrap to `spawnProcess` with result/error
   observation; add a button and an Erlang receive loop.
4. Add focused Node adapter tests and real Chromium tests using the existing
   [browser test runner](../test/browser.mjs), including translated normal and
   stripped modules.
5. Implement bounded acknowledged streams before adding continuous event types;
   add OTP process wrappers only when their runtime prerequisites are supported.

Acceptance tests must verify:

- A real click wakes a suspended Erlang process and changes the expected DOM
  text; the JavaScript callback does not run Erlang inline.
- Multiple events preserve enqueue order, and selective receive preserves
  unmatched messages, as in the existing receive fixture.
- Payloads are valid immutable terms; changing an input after dispatch does
  not change an already queued snapshot.
- Wrong-owner, forged and cross-runtime references/handles are rejected;
  repeated owner unsubscribe is harmless.
- Explicit unsubscribe, normal return, process failure and adapter teardown
  remove listeners; no enqueue occurs after synchronous cleanup.
- Rebinding uses fresh references and queued old messages remain distinguishable.
- Cancelable submit is canceled during dispatch when requested; without that
  option its default behavior is untouched.
- Oversized input, invalid options and adapter failures produce the specified
  errors and diagnostics, not silent loss.
- With two runnable components, both make progress under an event burst.
  Record browser responsiveness without claiming a hard scheduler guarantee.
- For the later credit API, mailbox contribution stays at one data event per
  subscription; buffer limits, overflow, ACK validation and latest-mode
  coalescing are tested against exact counts.

Worker execution is a separate future boundary: it needs term serialization,
explicit DOM capability IDs and a main-thread command bridge. Current WeakMap
terms and DOM handles cannot be posted to workers as-is. Mailbox event messages
remain the right Erlang interface, but that transport must not be implied by
this single-threaded design.
