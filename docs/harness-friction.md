# OpenSky harness friction register

Maintained: 2026-09-05. This is the evidence ledger for friction found while comparing OpenSky/Pi with native Computer Use. It records fixes, safety workarounds, and open gaps; it is not a parity claim.

## How to read this register

Stable IDs are never reused. Update an entry's status and append evidence rather than renumbering it.

- **Live-confirmed**: exercised through a real driver or native provider in the cited run.
- **Boundary-confirmed**: exercised against a real non-GUI boundary, but not as a completed GUI task.
- **Contract-confirmed**: source and deterministic tests cover the behavior; this is not real-driver acceptance.
- **Workaround**: behavior is safer or more truthful, but the underlying capability remains unavailable.
- **Open / proposed**: no implemented, accepted solution is claimed.
- **Historical / superseded**: the finding remains useful provenance, but current behavior differs.

Backfill scope is necessarily bounded. It covers the repository history through `d46d848`, current README/tests, comparison summaries from epochs 02–35, and selective raw/review artifacts where a summary identified a decisive issue. Epoch-36 additions distinguish implementation/fixtures, the real read-only transport probe, and a failed real Amazon model comparison. It does not assert that every raw event in every epoch was re-audited. Commit subjects were used only to locate changes; “fixed” below requires current source/tests or live evidence. Local run IDs are not promised as published GitHub artifacts.

## Library and facade


**LIB-025 — current Computer facade/output contracts:** September 5 live Computer
probes confirm omitted-URL blank tabs, first-use-only provider documentation and
silent `emit:false`/plain expressions. TypeScript now follows those behaviors,
retains explicit provider session names, and exposes `nodeRepl.write`/`emitImage`
in the strict CUA evaluator. Navigation observations are fresh and initially full
instead of reusing an unseen cached snapshot, including after ambiguous failure.
Regression tests cover bridge omission, output isolation/byte fidelity, repeated
images and overlapping navigation reads. **Contract-confirmed implementation;
reference behavior live-observed.** No new real-driver acceptance. Extra navigation
reads trade latency for freshness; CUA cells using implicit result display must
use explicit output. [Scope/evidence](computer-parity.md),
[deferred driver and host requirements](driver-followups.md).

| ID | Symptom and cause/layer | Disposition | Validation and evidence |
| --- | --- | --- | --- |
| LIB-001 | Scalar AX values and Boolean states (`value`, selected, enabled, checked, focused, expanded) were dropped, making visible control state ambiguous. | Renderer preserves scalar/state semantics and includes them in diffs. | Scalar/state output was **live-confirmed** by epoch-02 Preview and later native-app observations; coverage of the individual state branches is **contract-confirmed** in [`test/opensky.test.ts`](../test/opensky.test.ts). Implemented across [512f23d](https://github.com/tanishqkancharla/opensky/commit/512f23db327da3a01f746036ff4f09be617450ca) and follow-ups. |
| LIB-002 | Screenshots were exposed as URL text instead of model image content. | Requested screenshots are attached as image results; dimensions/scale are retained. | **Live-confirmed** in epoch-02 Preview and e35 Amazon. Source: [`src/opensky.ts`](../src/opensky.ts), [`src/image-meta.ts`](../src/image-meta.ts); origin fix [1e4c5c6](https://github.com/tanishqkancharla/opensky/commit/1e4c5c6cccf4b85edadb5bd1b6720318989daf27). |
| LIB-003 | Tiny auxiliary, stale, restored, off-Space, or closed WindowServer entries could be mistaken for the requested window. | Score ordinary windows, reject closed ghosts, avoid silent sibling rebinding, reveal a running-but-windowless app, retry delayed reveal once, and on macOS use verified catalog app ancestry as a final reveal route. | Activity Monitor epoch-17 **live-confirmed** successful ordinary-window targeting after reveal; the individual rejection, retry, ancestry, and no-rebinding branches are **contract-confirmed**. See [`README.md`](../README.md), [`test/opensky.test.ts`](../test/opensky.test.ts), [a94f101](https://github.com/tanishqkancharla/opensky/commit/a94f101310b0ac066003648a776a2e0d4cea8866), [65e4fdd](https://github.com/tanishqkancharla/opensky/commit/65e4fddd510f955e66421d7d5f77e2dcc69a41c4), [715da6f](https://github.com/tanishqkancharla/opensky/commit/715da6f92c360b9bc8be348d8c2732df43c6f670), [16a4c20](https://github.com/tanishqkancharla/opensky/commit/16a4c20e23a9863b547e6ebe725914f000cd27c3). A nominal launch receipt still is not live UI proof. |
| LIB-004 | Task-supplied files, folders, and URLs had no first-class opening operation; discovery/reused state could masquerade as task completion. | `open_target` binds a requested resource and exposes conservative requested/window/document identity. Exact opaque handles address siblings independently and stale handles fail before launch/input. | Opening/binding the requested browser and Preview targets was **live-confirmed** in epochs 02 and 05; sibling-handle and stale-handle safety is **contract-confirmed**. Finder remains a **workaround only** because its driver surface lacks an ordinary Desktop target and refuses path dispatch (epoch 14). See [`README.md`](../README.md), [af13124](https://github.com/tanishqkancharla/opensky/commit/af131246bd1d11c2c5649c077f446dba1de42899), [55e9a0e](https://github.com/tanishqkancharla/opensky/commit/55e9a0e993ce75ac1b4b8f7bcf29045decf0de78). |
| LIB-005 | A transport acknowledgement or refused action could look like a successful no-change observation; degraded AX could overwrite good state. | Refusals throw, actions say dispatched rather than completed, degraded state is explicit/retried and does not overwrite the last good tree. Unknown delivery is not replayed. | Refusal-as-error behavior is **live-confirmed** beginning epoch 02; no-replay and typed parser branches are **contract-confirmed** in [`test/driver-parse.test.ts`](../test/driver-parse.test.ts). Source: [`src/driver.ts`](../src/driver.ts), [`src/opensky.ts`](../src/opensky.ts), [c57008a](https://github.com/tanishqkancharla/opensky/commit/c57008a56de1fb27beb1abf1b995a346798d56ee), [d9685df](https://github.com/tanishqkancharla/opensky/commit/d9685df21d5a3216ee9383d278726028947c3ae2). Exact inner diagnostics can still be lost; see DRV-003. |
| LIB-006 | Foreground/focus changes followed by ambient typing could misdirect text; exact token actions were unnecessarily rejected off-Space. Modifier chords could take a single-key route. | Bind foreground input to the exact ordinary window, allow off-Space exact AX-token actions, provide targeted typing/keys, reject unsafe batch sequences, and correctly parse chords. | Targeted input/action paths were exercised live in epochs 03–10; exact-window checks, unsafe-batch rejection, off-Space token handling, and chord routing are **contract-confirmed**. See [`src/keys.ts`](../src/keys.ts), [`test/keys.test.ts`](../test/keys.test.ts), [`test/opensky.test.ts`](../test/opensky.test.ts), [fe17fb8](https://github.com/tanishqkancharla/opensky/commit/fe17fb8eb6cac30d09e1c114640fddc984e52380). User Space churn blocked some latency acceptance and is not counted as a product defect without positive evidence. |
| LIB-007 | Range controls could acknowledge AX actions without moving; misleading increment/decrement hints encouraged no-op loops. | Advertise `set_value` for supported sliders/steppers/date pickers; remove invented secondary-action aliases; expose element-targeted arrow keys and require visible verification. | Epoch-04 **live-confirmed the no-op symptom/receipt**, not a generic correction. The safer hints and action routing are a **contract-confirmed workaround**; provider-dependent no-op controls remain. Tests: [`test/opensky.test.ts`](../test/opensky.test.ts); [6018f57](https://github.com/tanishqkancharla/opensky/commit/6018f57ef0ba232a51d3415c9a17d3c039bcde56). |
| LIB-008 | `select_text(selection_type:"exact")` was rejected and the fallback sent one foreground event per character, taking about 208.6 seconds. | Accept `exact` as the `text` alias and use stale-checked element-targeted background key events. | **Contract-confirmed**; end-to-end latency replay remained contaminated by Space churn, so not live-accepted. Epoch 04; [`test/opensky.test.ts`](../test/opensky.test.ts), [216e153](https://github.com/tanishqkancharla/opensky/commit/216e153d9932fc75b961ec53bc206c3ae841faa7). |
| LIB-009 | Paste required unnecessary format detail and its clipboard save/restore sequence could overwrite a concurrent user clipboard change. | Earlier plain-text default is **superseded**. Current OpenSky fails closed before any clipboard access until the driver offers an atomic compound primitive. | **Contract-confirmed workaround**, not paste support. [`README.md`](../README.md), [`test/opensky.test.ts`](../test/opensky.test.ts), [9790847](https://github.com/tanishqkancharla/opensky/commit/97908470286af7e110d3d7a02e1681a7e9858b83). |
| LIB-010 | Every action required another observation; unrestricted batching could hide stale provenance after DOM/focus mutation. | Settled post-action state, short `perform_actions`, composed `observation_query`, and exact navigation+observation reduce round trips; a stale prefix stops once and returns fresh state without replaying completed actions. | Settled/composed action-observation paths were **live-confirmed** across epochs 06–10 and browser matrices; stale-prefix stop/no-replay behavior is **contract-confirmed**. Source/tests: [`evals/tools.ts`](../evals/tools.ts), [`test/eval-tools.test.ts`](../test/eval-tools.test.ts), [17247e3](https://github.com/tanishqkancharla/opensky/commit/17247e3103d57b79238abed23aa0bb4c914ad8da), [615f4f2](https://github.com/tanishqkancharla/opensky/commit/615f4f21721cb36d2a4a756a49e994de1bc88f33). A stopped batch still costs a recovery round trip. |
| LIB-011 | URL observations included browser chrome, restored tabs, and favorites; current-document URL/tab identity could be overclaimed when Safari AX omitted it. | Scope web observations to the primary content area; distinguish requested resource, exact native window, current AX document, unverified URL, and verified typed-browser tab. Preserve safe link destinations and cap long previews at 200 characters. | Primary-content scoping and safe destinations were **live-confirmed** in epochs 09–20; identity edge cases and the 200-character preview cap are **contract-confirmed**. Safari URL proof without a WebKit route remains a **workaround**. [`README.md`](../README.md), [3ee0d6e](https://github.com/tanishqkancharla/opensky/commit/3ee0d6efa26e2e5d4b95d3f86550bc9770e7d49b), [eb1e3f8](https://github.com/tanishqkancharla/opensky/commit/eb1e3f8409bafbaa055579dbea99408c5e2bb9f9), [d869d05](https://github.com/tanishqkancharla/opensky/commit/d869d05acdec9106f3ce0d58e6d8072d43903f7f). |
| LIB-012 | Saturated native AX trees hid later controls; full web trees and auxiliary help/action text consumed excessive context. | Preserve shallow native controls with explicit incomplete coverage, bound help text, compact passive action hints, reset at document boundaries, and separate driver completeness from renderer completeness. | Native shallow projection is **live-confirmed** by Activity Monitor epoch-17; web compaction/help bounding was exercised in browser tasks and is **contract-confirmed** in [`test/opensky.test.ts`](../test/opensky.test.ts). See [ab88cb3](https://github.com/tanishqkancharla/opensky/commit/ab88cb3148f797c91b9373287f7b30e1d94eb640), [23078a9](https://github.com/tanishqkancharla/opensky/commit/23078a993e50694c8abc43f3dff4ddc419e24fcb), [814e169](https://github.com/tanishqkancharla/opensky/commit/814e1692b94ccc7c7dacbd236555299dbffed6df). Native shallow projection and browser semantic selection are distinct limitations. |
| LIB-013 | Early browser automation could reuse/restored tabs, fall through to native input, or guess the page scroller. | Driver-owned isolated Chromium sessions, exact target/tab binding, exact navigation/input, main-document scroll disambiguation, and no native fallback. | Isolated-session navigation, observation, and semantic input were **live-confirmed** across epochs 18–35; binding, no-fallback, and scroll-disambiguation safety branches are **contract-confirmed** in [`test/typed-browser.test.ts`](../test/typed-browser.test.ts). See [88858c1](https://github.com/tanishqkancharla/opensky/commit/88858c19571362a4d193552bbe9c75b7f45cb7f3), [b9b998e](https://github.com/tanishqkancharla/opensky/commit/b9b998e1013173534fe8124329a1e4d924491c50), [4ca99ad](https://github.com/tanishqkancharla/opensky/commit/4ca99ad08905ded039e5dd782cbea86f0cb7cb3d). Coordinate-scroll delivery still has the live gap in DRV-002. |
| LIB-014 | The first native-style facade lacked current Browser-versus-Tab ergonomics and could invite invalid calls or unnecessary observations. | Bound `Browser.tabs.new/get/list/selected`, `nameSession`, exact `Tab.close`, installed-provider discovery, top-level known-URL shortcut, and pre-dispatch argument validation. Inventories are explicitly facade-owned-only; unsupported capabilities throw. | **Contract-confirmed**, with invalid-argument **boundary confirmation** against the real helper in epoch 27. See [`src/cua.ts`](../src/cua.ts), [`test/cua.test.ts`](../test/cua.test.ts), [`test/cua-repl-tool.test.ts`](../test/cua-repl-tool.test.ts), [58bc18a](https://github.com/tanishqkancharla/opensky/commit/58bc18abc0306c46e5e760173709715b4f17da31), [1d33c0c](https://github.com/tanishqkancharla/opensky/commit/1d33c0c409f224031e1ebc667e6e0ea3e5335fd1), [2a477eb](https://github.com/tanishqkancharla/opensky/commit/2a477eb7e3c3f010d5ea5e8490875086d67ebe69), [aba84df](https://github.com/tanishqkancharla/opensky/commit/aba84dfd66092ed476ab5476e5136d328372e10a). In-app browser, hidden creation, host metadata without callbacks, and user-tab discovery remain unsupported. |
| LIB-015 | Filtered semantic queries were easy to mistake for complete ordered context: returned match ancestors can omit sibling/group labels, leading-prefix coverage, and relative document order. Dense-page classification and “first” claims failed repeatedly even when recall found the queried title. | Automatic query neighborhoods, exact same-snapshot continuation and explicit semantic-evidence projection preserve source order, read-only authority and exact older action refs. Controlled real article/list/table and long nested-list probes pass on driver `be8a19a`. | **Live-improved; overall parity remains open**. Fresh e39 passes 4/4 independently grounded browser tasks, versus e38 3/4 and e37 2/4. Amazon now acquires its own Results-list prefix and sponsorship evidence, but costs 18 calls / 65.970s versus saved native 6 / 36.084s. All four clean up. This small batch does not isolate projection causality on dynamic websites. [Current results](../../e2e-epoch-39/README.md). Selection/readiness/text-fidelity gaps remain LIB-021/023/024. |
| LIB-016 | The old browser renderer flattened depth, dropped named/stateful generic containers, deduplicated repeated labels across containers, and obscured omission boundaries. | Preserve source indentation, named/stateful containers and repeated labels; use a bare `-` only for unnamed generic containers; disclose separate outline/action budgets. | **Contract-confirmed**, offline-audited, and exercised live in e35—not blanket-accepted. [d46d848](https://github.com/tanishqkancharla/opensky/commit/d46d84840fd56cd5f1f3ee2ebebbc0097b027cf6), [`test/browser-rendering.test.ts`](../test/browser-rendering.test.ts), epoch-35 [`README.md`](../../e2e-epoch-35/README.md). HN passed both arms; Amazon Pi still failed ordered-context grounding. Across 64 saved observations, outline chars rose 7.6%; meaningful rows improved in 36, stayed equal in 11, and **fell in 17**, including 177 versus 194 on e34 Amazon. The driver-selected target was already absent, so rendering could not recover it. |
| LIB-017 | A read-only control with an `AXTextField` role was described as directly editable even though it lacked settable/editable action evidence. | Emit direct-typing guidance only for controls with actual mutability evidence; hide unavailable action indices. | **Live-found** in epoch-10 System Information and **contract-confirmed** in [`test/opensky.test.ts`](../test/opensky.test.ts). This does not imply every text-like control is editable. |
| LIB-018 | Exact-browser AX reads can transiently fail with a missing frame during navigation; broad retries could hide other failures or spend the action budget. | Retry only the recognized transient frame-read condition inside a bounded observation window, preserving the same exact target and arguments. | **Live-observed** as internal recovered reads in e32/e33 and **contract-confirmed** by [`test/typed-browser.test.ts`](../test/typed-browser.test.ts), [d869d05](https://github.com/tanishqkancharla/opensky/commit/d869d05acdec9106f3ce0d58e6d8072d43903f7f). It remains tool-layer latency even when the public call succeeds. |

**LIB-019 — same-snapshot lifetime and authority:** independent source review of
the new context path found input-in-flight and persistence-failure races, missing
response-local anchor checks, and potentially unstable ordering domains. The
host now fences typed browser mutations at dispatch and completion (including
ambiguous failure), requires anchor/group/parent in the returned window, compares
exact p-ref identity/capabilities, rejects new input authority, retains per-ref
order domains, and invalidates only its own failed candidate. It never aliases
duplicate labels. Coarse frame-label checks supplement, not replace, the driver's
actual frame-identity verification. **Contract-confirmed** by deferred both-order
races, failed save, malformed/foreign/duplicate refs, read-only input refusal,
stable domain, and old-reference tests; independent follow-up found no blocker.
Future typed mutation tools must join the dispatch fence. Real integration and
cross-process state transactions are still separate requirements.

E40 integrated fault tests found that rejecting malformed **fresh query** metadata
could still leave the preceding snapshot's input/cursor authority cached. The
candidate now invalidates that failed read's preceding tree and screenshot mapping,
without clearing a newer successful tree; page identity is published only after
validation succeeds. This additional failure-path correction is contract-tested,
not acceptance from injecting faults into the user's real browser.

## Driver and transport boundary

| ID | Symptom and cause/layer | Disposition | Validation and evidence |
| --- | --- | --- | --- |
| DRV-001 | Finder's Desktop pseudo-window/file navigation is available to native Computer Use but the current real driver exposes no equivalent ordinary window and returns `LAUNCH_FAILED` for path routes. | OpenSky clears stale identity and refuses ungrounded input. Driver surface work is required. | **Open/workaround**; epoch-14 is the retained live failure. Do not describe fail-closed behavior as capability parity. |
| DRV-002 | On macOS, exact-browser coordinate scroll maps to trusted CDP input, while the platform guard refuses standalone trusted input because it would activate the browser window. The DOM-event alternative requires a semantic ref. | No automatic fallback or permission escalation. Use a proven scroll-capable ref when available or a separately verified keyboard route. | **Open**. E35 Amazon call `call_JCRl…` accepted `[1200,1200]`, mapped it from 2400×1626 pixels to CSS `(600,600)`, then exposed only outer `target=page, reason=route_unavailable`. See [`../../e2e-epoch-35/scroll-diagnosis.md`](../../e2e-epoch-35/scroll-diagnosis.md). The exact inner runtime branch is source-supported inference because the tape lost it. |
| DRV-003 | Driver/action projection and one-shot CLI transport can discard exact refusal text/structured details, leaving only generic or outer escalation diagnostics. | Existing typed refusal parsing/tape metadata is joined by opt-in persistent MCP preserving the complete `CallToolResult`. Default CLI remains unchanged; nothing reconstructs details absent from the driver result. | Full successful envelopes are **boundary-confirmed** in the e36 signed-driver read-only probe. Exact refusal/image preservation is **contract-confirmed** in [`test/mcp-driver.test.ts`](../test/mcp-driver.test.ts), not yet new GUI acceptance. See [`../../e2e-epoch-36/README.md`](../../e2e-epoch-36/README.md). E33/e35 inner causes remain unrecoverable; never retrofit them. |
| DRV-004 | Diagnostic prose mentioning session expiry could trigger unsafe revival/replay after an action whose delivery was unknown. | Both transports now share an exact structured pre-dispatch predicate; revive only the client's own named session once, after successful revival. | **Contract-confirmed** in [`test/driver-parse.test.ts`](../test/driver-parse.test.ts) and MCP tests. E36 review found an unstructured prose fallback still present after d9685df: a new regression reproduced two dispatches before removal and one afterward. The earlier ledger overstated that fix's coverage. No claim of broad failure recovery or new live replay acceptance. |
| DRV-005 | The one-shot CLI's shared transport ownership does not match durable per-proxy MCP ownership; simply replacing it could break crash cleanup and replay safety. | Implemented explicit `transport:"mcp"`, full handshake, serialized/bounded admission, argument snapshots, quarantine without replay, ordered close receipts, and transport-aware leases. CLI stays default. | **Contract-confirmed** (11 MCP protocol tests, plus lifecycle/ownership/lease coverage); normal real macOS proxy handshake/read/exit is **boundary-confirmed** in e36. [`src/mcp-driver.ts`](../src/mcp-driver.ts), [`../../e2e-epoch-36/README.md`](../../e2e-epoch-36/README.md). No `--direct` fallback. Cross-platform, actual crash reaping, and GUI/model acceptance remain open; cross-process MCP recovery stays `not_proven` without stronger receipts. |
| DRV-006 | An eligible exact phrase globally suppressed reordered all-term matches; a CSS-hidden or page-occluded phrase could also suppress visible fallback results. | Driver source `14452f2e64c114e99e4bad3c6c8cec744c5e74ee` retains eligible phrase and reordered all-term matches and ignores hidden/occluded nodes when deciding whether fallback is needed, without changing request/response fields or budgets. | Five fixtures failed before the fix and seven focused cases plus the full core suite passed afterward. The rebuilt e33 helper independently exposed the reordered Logitech title and recorded the new source SHA, providing **live confirmation of recall only**. See [`../../e2e-epoch-33/README.md`](../../e2e-epoch-33/README.md). This does not supply sibling context, page-order proof, first-item classification, or general parity (LIB-015). |

## Runtime and evaluator

E36 real Amazon run: native passed (6 public calls); Pi failed (4 calls, 3 failed)
when a real driver snapshot did not return. The timeout is a live finding, not an
MCP efficiency win. Investigation and a focused local driver repair are pending;
the original failed cleanup remains failed. Details and public timeline are in
[`../../e2e-epoch-36/README.md`](../../e2e-epoch-36/README.md).

| ID | Symptom and cause/layer | Disposition | Validation and evidence |
| --- | --- | --- | --- |
| RUN-001 | Early async REPL semantics lacked normal globals/diffs and later proxy-based VM context behavior diverged from ordinary `globalThis`/assignment behavior. Persistent declarations also needed expression parsing and useful redeclaration feedback. | Ordinary mode uses a plain VM context; Acorn identifies expressions/declarations; top-level state persists. Direct writes to prior `const` bindings warn but still run, matching the probed native behavior. | **Contract-confirmed** plus ordinary-runtime probes in epochs 27–28. [`src/async-repl.ts`](../src/async-repl.ts), [`test/async-repl.test.ts`](../test/async-repl.test.ts), [aba84df](https://github.com/tanishqkancharla/opensky/commit/aba84dfd66092ed476ab5476e5136d328372e10a), [927d3a6](https://github.com/tanishqkancharla/opensky/commit/927d3a6ebb732a70f26c672e3aa15aefcfc232a6). Warnings intentionally do not analyze deferred callbacks/branch execution. |
| RUN-002 | Strict evaluator Promise loops could evade a wall timeout when the runtime ignored VM microtask draining. Bun 1.3.4 exhibits that behavior. | Strict mode capability-checks finite microtask draining before admitting cells and points to Node; Node 22.19+ is canonical for tests/evals. Runaway probes are externally bounded and poison/revoke the failed evaluator. | **Contract-confirmed** and runtime-probed; not a claim that ordinary Bun CLI is unsupported. [`evals/CI.md`](../evals/CI.md), [`test/async-repl.test.ts`](../test/async-repl.test.ts), [927d3a6](https://github.com/tanishqkancharla/opensky/commit/927d3a6ebb732a70f26c672e3aa15aefcfc232a6). |
| RUN-003 | Close could race new/queued bridge calls, finalize sessions while work was in flight, or mix call traces/emissions between cells. Direct library calls lacked the evaluator's whole-operation barrier. | Shared lifecycle now guards all public library operations and exposed driver calls, including persistence between dispatches. Close stops admission synchronously, drains, then finalizes; timeout never schedules a late finalizer, and explicit retry does not reopen admission. | Original evaluator barrier was **boundary-confirmed** in e28. Library-wide extension is **contract-confirmed** in [`test/opensky-lifecycle.test.ts`](../test/opensky-lifecycle.test.ts); MCP held-startup tests ensure close cannot be followed by a late proxy spawn. Generic `evals/harness.ts` still has an outer non-cancelling deadline, and filesystem/finalizer hangs are not comprehensively bounded. This is not universal cancellation proof. |
| RUN-004 | Batched facade work appeared as one opaque call, hiding underlying method count and failures. | Record each bridged CUA operation with status and duration in the public tool details. | **Contract-confirmed**, used in live e30–e35 scoring. [e6b30d9](https://github.com/tanishqkancharla/opensky/commit/e6b30d94334bc3ae209a0ef02df468ae741ed494), [`test/cua-repl-tool.test.ts`](../test/cua-repl-tool.test.ts). Native has no equivalent underlying-driver instrumentation, so counts are not symmetric. |
| RUN-005 | Browser-vs-Tab confusion, invalid scroll objects, unsupported `cua.documentation`, and extra arguments caused wasted calls or wrong operations. | Tool description lists complete signatures; strict bridge validation rejects unsupported shapes before driver dispatch; persistent `let` bindings are encouraged. | **Boundary/contract-confirmed** after [aba84df](https://github.com/tanishqkancharla/opensky/commit/aba84dfd66092ed476ab5476e5136d328372e10a) and [58afe0d](https://github.com/tanishqkancharla/opensky/commit/58afe0d5305356785b9e6d5865614fcb283b0358). E30 retained eight failed public calls from the pre-fix surface; historical evidence is not rewritten. |
| RUN-006 | Host and strict-VM `Uint8Array` values failed `instanceof`, so one emitted `{state,screenshot}` and its identical expression result rendered twice, with numeric-key bytes. | Realm-safe byte detection plus exact `byteOffset`/`byteLength` serialization; distinct outputs remain. | **Live-confirmed** in e35 Amazon: one 18,542-char state, one image, one resize hint. Pre-fix e34 duplicated an 18,331-char state. [21f36ff](https://github.com/tanishqkancharla/opensky/commit/21f36ff5d711f4e06c31a8ce756550c485139fbe), [`test/cua-repl-tool.test.ts`](../test/cua-repl-tool.test.ts). Fixture bytes test serialization, not image decoding. |
| RUN-007 | A strict all-shell policy invalidated required installed-skill reads; later wrapper/quoting classification falsely rejected a bounded `SKILL.md` read and omitted its cost. | Prospective classifier v2 allows only bounded `cat`/`sed` of a real configured-root `SKILL.md`, rejects composition/expansion/traversal, records bootstrap separately, and includes it in total calls/payload. | **Contract-confirmed** in external runner tests; e35 HN live accounting was native 5 calls including one bootstrap versus Pi 4. Historical e25/e30 eligibility remains frozen. See [`../../../work/eval-scripts/instruction_bootstrap.ts`](../../../work/eval-scripts/instruction_bootstrap.ts) and [`../../../work/eval-scripts/instruction_bootstrap.test.ts`](../../../work/eval-scripts/instruction_bootstrap.test.ts). Cold-start bootstrap/docs remain real overhead and should be reported separately, not subtracted. |
| RUN-008 | Early task state leaked between serial arms (restored Calculator/Preview values, browser tabs), creating correct-looking but unattributable results. | Fresh exact targets, arm-specific files/nonces, explicit baseline/final inventories, serial cleanup gates, and correctness from each arm's own observations. | **Process workaround**, live applied in later epochs. Epochs 02–05 retain contaminated failures; later reviews do not import the other arm's answer. Browser profiles still differ (native existing extension profile versus Pi isolated profile), so dynamic-site comparisons remain confounded. |
| RUN-009 | Correct final prose and coarse judge percentages could mask absent observations, policy failure, or cleanup gaps. Raw-only matching also forced human claim values to retain wire escape backslashes. | Canonical cases, exact `call-id @ timestamp` resolution, independent review, and correctness-first gates. E36 validator accepts a literal canonical claim or exactly one JSON string-content representation in the same cited observation; no fuzzy/global decoding or other-arm evidence. | **Contract/process-confirmed**, not automated semantic judgment. Representation regression failed before and passes after; external evaluator suite 38/38. [`../../../work/eval-scripts/validate_review.ts`](../../../work/eval-scripts/validate_review.ts). Historical e35 reviews/eligibility remain frozen. |
| RUN-010 | The persistent localhost REPL originally lacked an authentication token, exposed direct Node globals, and wrote sensitive state with insufficiently explicit permissions. | Bind only loopback, require a private token, omit direct `process`/`require` in serve mode, and create home/session files as 0700/0600. The server remains for trusted local snippets, not a security boundary. | **Contract-confirmed** in [`test/cli.test.ts`](../test/cli.test.ts), [`test/async-repl.test.ts`](../test/async-repl.test.ts), and origin fix [1e4c5c6](https://github.com/tanishqkancharla/opensky/commit/1e4c5c6cccf4b85edadb5bd1b6720318989daf27). Loopback sandbox permission friction is tracked separately as SET-006. |
| RUN-011 | Unique runtime base-session injection broke exact matching of historical tapes that omitted base sessions. Standalone replay also leaked inert temporary homes on failure. | Strict replay stays default; explicitly named `v1_implicit_base_session` compatibility permits only the declared base label where the recorded call omitted it. Reports identify retrospective/non-acceptance evidence and applied indices. Exact temporary home is removed in `finally`, without invented cleanup tape events. | **Contract-confirmed**, driver-tape tests 13/13. [`evals/replay.ts`](../evals/replay.ts), [`evals/driver-tape.ts`](../evals/driver-tape.ts). Historical expected files are unchanged. Standalone frozen expected-report comparison still fails on existing `requestDispatch` projection drift (`unknown` versus `sent`); that regression remains open. Old leaked directories were not deleted without individual review. |

## Setup, permissions, and CI

**SET-009 — consumer-style SDK E2E drafts:** the existing fake-driver contract
suite does not establish successful SDK-to-desktop workflows. The new isolated
[`e2e/`](../e2e/README.md) package follows the user-provided testing skill: Vitest
fixtures, package-root SDK imports, a real local test page/native documents,
13 positive workflow bodies and one separately grouped rejection body. Fourteen
further scenarios are explicitly TODO until their real collaborators/capabilities
exist. **Draft/typecheck/collection only; no E2E execution or driver acceptance.**
No mocks or synthetic driver results. Existing unit tests remain intact. Codex
in-app browser and host retention features are explicitly outside OpenSky parity.
See [scenario contracts and remaining fixture work](../e2e/scenarios.md).

| ID | Symptom and cause/layer | Disposition | Validation and evidence |
| --- | --- | --- | --- |
| SET-001 | Helper installation, daemon startup, and Fleet MCP session handshake were fragile or manual. | `doctor` can install/start the helper; Fleet proxy handshake and VM orchestration were corrected. | **Contract/integration-confirmed**, not desktop acceptance. [cc4c088](https://github.com/tanishqkancharla/opensky/commit/cc4c08806658a0b123a5fdcb2b1a17b9733b7849), [4799e26](https://github.com/tanishqkancharla/opensky/commit/4799e2622e8be314538f85687488050e7d12ea82). Permission prompts still require provisioning. |
| SET-002 | Conflicting legacy environment variables or invalid explicit helper paths could silently select/install another binary; macOS app attribution could point at the wrong bundle. | Precedence is explicit flag, `CUA_DRIVER_BINARY`, legacy aliases; invalid explicit paths fail; bundle ancestry selects the matching app. | **Boundary-confirmed** with the real local helper and **contract-confirmed** in [`test/driver-install.test.ts`](../test/driver-install.test.ts), [aba84df](https://github.com/tanishqkancharla/opensky/commit/aba84dfd66092ed476ab5476e5136d328372e10a). |
| SET-003 | Cua Fleet's Linux image lacked the macOS/browser surface, while a macOS KubeVirt claim stayed at zero replicas and account policy rejected runtime changes. | Fail feasibility before model execution; retain claim timeout instead of substituting another platform. | **Open infrastructure**. [`evals/README.md`](../evals/README.md), [f629a91](https://github.com/tanishqkancharla/opensky/commit/f629a918ec12236ba3fcc0a516554731990ae286). Linux evidence cannot establish macOS/native parity. |
| SET-004 | First hosted macOS CI reached `permissions_pending` for Accessibility/Screen Recording; no cases ran and cleanup also hit the gate. | Workflow probes capabilities before model credentials/cases and always uploads reports. A provisioned signed helper/self-hosted runner is still required. | **Open infrastructure**, not pass or product failure. [`evals/CI.md`](../evals/CI.md), [CI run 33947371636](https://github.com/tanishqkancharla/opensky/actions/runs/33947371636), [f65ecaa](https://github.com/tanishqkancharla/opensky/commit/f65ecaa204634570e6371fb52493c122f04ab606), [105d90f](https://github.com/tanishqkancharla/opensky/commit/105d90f95c9b885e01dcf9e3b9842f3dc617496c). Push CI success with real-driver job skipped is not acceptance. |
| SET-005 | Fresh native evaluator CLI was denied app approval although the desktop session/user reported saved approval; PATH CLI and app-bundled CLI versions differed. | Preserve as a separate approval-mediation/version-skew investigation; do not change TCC, bypass with another CLI, or infer AX denial. | **Open**. e32 Activity Monitor run and [`../../e2e-epoch-32/README.md`](../../e2e-epoch-32/README.md). After unlock, the same native desktop connection successfully read Activity Monitor AX in epoch 35, proving the desktop route works; the CLI gate remains unresolved. |
| SET-006 | Local sandbox denied the REPL server's loopback `listen` and the real helper's Unix-socket inventory. | Re-run the exact checks with required sandbox access; retain the initial failure. Do not change macOS app/TCC permissions. | **Environment-specific resolution**. E36 suite initially 270/271 with `listen EPERM`, then 271/271 with loopback access. The transport probe initially stopped before either arm on socket `EPERM`, then both read-only arms passed with socket access. This is not GUI acceptance. |
| SET-007 | Cross-platform behavior and cleanup authority are uneven: typed Chromium and exact macOS native windows have proofs that Safari/WebKit, Finder, Windows, and Linux do not all share. | Fail closed per platform; do not generalize macOS/browser results. | **Open**. [`README.md`](../README.md) explicitly limits native close authority and provider support. Continuously provisioned real-driver CI and full cross-platform/native parity remain incomplete. |
| SET-008 | Ad-hoc macOS signatures change their designated requirement on every rebuild, invalidating saved Accessibility/Screen Recording identity and causing repeated approval prompts. Private-key access can also prompt when the signing keychain is locked, untrusted, or lacks the code-signing ACL. | The local installer supports a dedicated signing keychain, exact certificate fingerprint, `--require-stable-signing`, fail-closed identity selection, and reporting of certificate-backed versus ad-hoc requirements. | The strict installer workflow is **implemented and boundary-confirmed**: the e33 rebuild reused the exact existing certificate and preserved its designated requirement. It does **not** automate the first certificate trust decision, keychain unlock/partition-list authorization, or initial TCC grants. See [`../../cua-upstream/libs/cua-driver/scripts/README.md`](../../cua-upstream/libs/cua-driver/scripts/README.md) and [`../../e2e-epoch-33/README.md`](../../e2e-epoch-33/README.md). No credential material is recorded here. |

## Cleanup and ownership

| ID | Symptom and cause/layer | Disposition | Validation and evidence |
| --- | --- | --- | --- |
| CLN-001 | App-name cleanup could close/rebind a sibling or user-owned state. | Close exact handles only; browser targets are isolated owned sessions. Native macOS close authority requires a fresh request-created PID, matching identity, and exactly one independently revalidated ordinary window; no hotkey/menu/kill fallback. | Browser path **live-confirmed** repeatedly; native path **contract-confirmed**. [df2d69b](https://github.com/tanishqkancharla/opensky/commit/df2d69b0c80e8f4f47f83b305289bbda03be8528), [`test/opensky.test.ts`](../test/opensky.test.ts). Auxiliary-window ownership and non-macOS native close remain open. |
| CLN-002 | Browser ownership recorded only after launch could leak an isolated provider after a crash; concurrent runtimes/proxies could reap one another. | Reserve before dispatch. V2 leases preserve CLI versus proxy ownership; legacy v1 remains CLI. Only dead CLI owners are recoverable; a new MCP proxy never adopts a foreign lease. Revalidate disk identity before release; retain malformed/temp/tampered records. | **Contract-confirmed**, eight new [`test/browser-session-leases.test.ts`](../test/browser-session-leases.test.ts) cases plus existing typed-browser coverage. Exact proxy crash cleanup is still open (DRV-005), not proven by a missing live-session entry. |
| CLN-003 | A nominal `end_session` success or session inactivity was treated as proof of target cleanup; native window absence was overclaimed. | Require exact matching `session` plus `active:false`; distinguish `sessionCleanupVerified` from target absence; native target remains `not_proven` without exact window evidence. Retain ledger on ambiguity. | **Boundary/contract-confirmed** in epoch-28 lifecycle probe and canonical cleanup tests. [927d3a6](https://github.com/tanishqkancharla/opensky/commit/927d3a6ebb732a70f26c672e3aa15aefcfc232a6), [73afb7c](https://github.com/tanishqkancharla/opensky/commit/73afb7c768133af2d3ed61e3140248cf592f12f0), [`evals/acceptance/evidence.ts`](../evals/acceptance/evidence.ts). |
| CLN-004 | Prompt completion could race runtime close; private evidence was deleted before action drain, exact receipts, operator inventory, and target checks all passed. | Serial acceptance runner aborts/settles, drains, verifies every session and target, deletes only after the full gate, and blocks the next arm on failure. | **Process/contract-confirmed** in external tests and e30–e35 cleanup artifacts. [`../../../work/eval-scripts/run_epoch_21.ts`](../../../work/eval-scripts/run_epoch_21.ts). The repository's generic [`evals/harness.ts`](../evals/harness.ts) has a weaker runtime-close receipt and private-home removal path; do not equate it with serial acceptance cleanup. |
| CLN-005 | “No tabs” was presented as absence of all browser siblings although the facade inventories only its own tabs. | `getState()` publishes `tabInventoryScope:"facade-owned-only"`; reviews constrain claims and use provider-controlled native baseline/final identity or isolated-session ownership. | The scoped inventory label was **live-observed** in e32–e35 and is **contract-confirmed** by [`test/cua.test.ts`](../test/cua.test.ts); [159ac4b](https://github.com/tanishqkancharla/opensky/commit/159ac4b7537c2f9b97f7344e32ec6188dc520996). External sibling preservation is still not independently observed, so Pi cleanup often scores 4/5. |
| CLN-006 | Persisted targets/aliases/trees are last-writer-wins across processes even though browser-session cleanup leases are isolated. | Use separate homes when multiple runtimes need cross-process target discovery/mutation. | **Open/documented limitation** in [`README.md`](../README.md). Per-target transactional leases are not implemented. |
| CLN-007 | Injected shared clients could silently use one base session; stale persisted handles could be used under a replacement proxy. Cleanup persistence failure also risked losing the retry obligation. | Inject each library instance's unique base label on sessionless calls, keep caller-owned transports open, single-flight load, quarantine foreign-proxy/unowned legacy targets before dispatch, and retain failed persistence for retry. Report unresolved ownership rather than deleting it. | **Contract-confirmed** in [`test/opensky-transport-ownership.test.ts`](../test/opensky-transport-ownership.test.ts), lifecycle and typed-browser tests. E36 real injected-client read/close probe passed, but shared consumers/crash paths remain fixture-only. Low-level explicit-session calls remain trusted escape hatches; automatic ownership is not a security boundary. |

## Evidence, metrics, and observability

### CLN-008 — operator display labels are not exact session identities

- **Symptom/layer:** e36 retained an ending session whose operator label was
  truncated. Exact string matching incorrectly returned no matching owned IDs;
  other gates still rejected cleanup, so the run was never accepted as clean.
- **Fix:** canonical inventory parsing rejects empty/truncated identities and
  inconsistent counts. Display normalization can establish possible presence,
  never exact ownership. The external review validator uses the same helpers and
  checks raw versus derived inventories instead of maintaining an exact-match
  bypass. Retain leases and failed cleanup evidence on ambiguity.
- **Evidence:** real e36 operator inventory; deterministic regression coverage
  in [`test/acceptance-evidence.test.ts`](../test/acceptance-evidence.test.ts)
  and external `validate_review.test.ts`. Full OpenSky unit/contract suite
  **274/274**, build passed; external suite **49/49**. All 15 existing reviews
  still validate; none were rewritten. This is **contract-confirmed**, not
  successful crash cleanup.
- **Tradeoff/open:** even an unrelated truncated label blocks an absence claim.
  An unambiguous machine-readable identity surface is still needed. Restarting a
  daemon and seeing an empty new generation does not create old session receipts.

### RUN-012 — external transport finalization and source provenance

The serial evaluator now opts into CLI or MCP explicitly, closes its own MCP
transport after runtime drain/cleanup, and requires exact clean-exit provenance.
Setup errors are covered; timeout stops further cleanup retry admission and
reports whether cleanup work and the tape settled. Source worktree selection is
explicit, with an exact intended revision that must be independently matched by
real `get_config`; evaluator source hashes accompany each new run. The e36 failed
GUI run exercised quarantine/forced-close failure, not successful crash reaping.
The full external suite is **49/49**. Two pre-existing `evals/tools.ts` typing
errors were then corrected without changing runtime/public shapes: retain the
inferred batch-detail extension and acknowledge the drag schema boundary whose
exclusive coordinate/index forms are validated by the library before dispatch.
Strict TypeScript checking of the external runner and all its imports now passes;
the six relevant tool tests pass. This is compile/contract evidence, not GUI
acceptance or proof of all cleanup timeout branches.

### OBS-009 — reused run IDs could overwrite evidence

The external runner previously reused directories, allowing an explicit old run
ID to overwrite results or a Pi-only run to inherit stale provenance. It now
atomically reserves a new directory and refuses reuse for every arm mode, before
GUI/model work. Epoch/run IDs must be simple path segments. Four deterministic
tests cover preservation of old files, racing reservations and path traversal;
the full external suite is **53/53**. An actual runner invocation with the old
e36 ID refused before either arm and preserved its manifest hash. This is
**contract/boundary-confirmed**, not a new GUI result. Tradeoff: partial runs
cannot be resumed into their old directory; use a fresh ID and retain the old
attempt separately. Helper: external `fresh_run.ts`, included in provenance hashes.

| ID | Symptom and cause/layer | Disposition | Validation and evidence |
| --- | --- | --- | --- |
| OBS-001 | Early reports counted Pi errors from the wrong payload field, so real tool failures could appear successful. Permission-denial prose without an `Error:` prefix was also at risk. | Canonical failure classification reads public status/result shapes and reporting exposes total plus failed calls. | **Contract-confirmed**; epoch-04 records the original parser correction, later scoring uses [`evals/acceptance/evidence.ts`](../evals/acceptance/evidence.ts). Historical metrics are not silently rewritten. |
| OBS-002 | Serialized character counts included image base64 and were described like token efficiency; provider usage schemas were normalized without proof. | Separate arguments, full host serialization, actual model-visible text chars, image count/encoded chars, and provider-native usage categories. Missing values stay unknown, not zero. | **Contract-confirmed** in [ad73791](https://github.com/tanishqkancharla/opensky/commit/ad73791b7ab5e653ea9338507a2c79c3b79eb293), [`evals/acceptance/payload-metrics.ts`](../evals/acceptance/payload-metrics.ts), [`test/payload-metrics.test.ts`](../test/payload-metrics.test.ts). E35 HN: native 549,583 host-result chars versus 79,137 canonical visible-text chars; Pi 99,956 versus 60,978. These are characters, not tokens. |
| OBS-003 | External scoring input also JSON-serializes public `content` into a field named `serializedModelVisibleToolResultChars`, creating a second, larger “model-visible” number. | Prospective efficiency-input schema v2 adds canonical payload-character metrics with a version/unit/definition and explicitly labels the legacy serialized-content field. Provider-native usage is not normalized. | **Contract-confirmed** in external payload-metric tests; not yet a fresh scored GUI pair. E35 HN's 84,912 serialized-content versus 79,137 canonical visible-text chars stays unchanged. Source: [`../../../work/eval-scripts/run_epoch_21.ts`](../../../work/eval-scripts/run_epoch_21.ts). |
| OBS-004 | Readable timelines expanded data URLs and numeric-key/typed screenshot bytes, producing artifacts as large as 68 MB and millions of lines. | Project public events only, replace binary representations with bounded placeholders, and remove private reasoning/signatures. | **Contract-confirmed** in [c1ec63d](https://github.com/tanishqkancharla/opensky/commit/c1ec63da7e605f831f955ca354445c6c8cc9a916), [`evals/acceptance/public-transcript.ts`](../evals/acceptance/public-transcript.ts), [`test/public-transcript.test.ts`](../test/public-transcript.test.ts). Projection is deliberately lossy and never scoring evidence; inspect original artifacts for screenshots/payload metrics. |
| OBS-005 | Intended source revision, installed helper revision, browser version, and provider profile were conflated. | Record repository SHA, real `get_config`/driver tape revision when available, provider/profile, runtime, and missing browser version separately. | **Process-improved**, still incomplete. E34/e35 tapes prove helper 0.23.2/source `14452f2…`; several native arms and browser versions remain unavailable. Generic CI preflight records pin/version/permissions but does not prove compiled source SHA; the serial runner does before GUI launch. |
| OBS-006 | Bootstrap/tool documentation, cold start, cache history, browser profile, serial order, and unmatched underlying instrumentation distorted comparisons. | Report those confounds; count bootstrap in totals but separately; compare efficiency only after both arms pass correctness, grounding, policy, and cleanup. | **Process-improved** in canonical [`evals/acceptance/README.md`](../evals/acceptance/README.md) and e30–e35 independent reviews. E35 HN is a both-pass example (native 5 calls including bootstrap, Pi 4); one run is not broad parity evidence. |
| OBS-007 | Browser outline/action budgets were conflated with driver collection completeness; restored structure could be advertised as a payload win. | Publish source completeness, rendered completeness, outline/action budgets, and action-list ranking separately; measure tradeoffs offline and in live tasks. | **Contract-confirmed disclosure** and live-exercised in e35, with mixed results rather than blanket acceptance: HN passed both arms and Amazon Pi failed contextual grounding. [d46d848](https://github.com/tanishqkancharla/opensky/commit/d46d84840fd56cd5f1f3ee2ebebbc0097b027cf6), epoch-35 audit. The +7.6% chars and 17/64 fewer meaningful tail rows are retained as regressions/tradeoffs, not hidden. |
| OBS-008 | Dynamic pages and final-answer agreement could tempt cross-arm oracle leakage. | Grade each arm from its own timestamped observations; treat dynamic scores/order and differing profiles as confounds. | **Process-confirmed** in e30–e35 reviews. E35 Amazon final titles matched, but Pi failed because its own state did not prove first-organic order; e35 HN scores differed by one point yet both arms passed. |

## Current parity boundary

### Epoch-38 contextual defaults: 3/4 fresh task passes

Clean OpenSky `72df0de` and installed signed driver `17b48d8` pass the expanded
controlled real probe, including all 80 nested-list rows and 64 forward/reverse
continuation reads without recapture. An independent archive audit confirms
visible evidence, exact stored identities and cleanup. The serial Pi Terra/medium
matrix then passes Wikipedia, GitHub and HN; Amazon remains unsupported. Automatic
Contents context now supplies Wikipedia's zero-omitted prefix and first-heading
proof. No actor consumes a context cursor, so live model adoption of pagination
remains unproven despite controlled integration acceptance.

All four model runs have zero public tool errors and verified exact cleanup;
Amazon has one recovered underlying frame-read error. Calls / seconds are
Amazon 5 / 30.548, Wikipedia 6 / 24.286, GitHub 4 / 18.337, HN 4 / 17.899.
Native baselines were reused without new native inference. Do not declare a
winner: Amazon fails grounding; other baselines have recorded protocol drift.
Evidence and human-readable public timelines:
[`../../e2e-epoch-38/README.md`](../../e2e-epoch-38/README.md).

Next observation issue: one enclosing-group neighborhood can leave other
matching items without their own qualifiers or an adequately proven prefix.
Amazon's selected title remains only in filtered paths while partial contextual
blocks describe other nearby items. Test generic per-match coverage associations
and evidence-preserving sparse structure before spending another model run.
Do not add website rules or weaken ordinal grounding. The new defaults cost
additional visible text on Amazon/Wikipedia; success and payload are separate.

### Epoch-37 controlled acceptance and model-evidence gap

Historical status: real installed driver `29c27e6` and OpenSky `7ecac56` passed the
controlled article/list/table probe 03; updated probe orchestration `0449be5`
passed probe 04 with exact per-case and final cleanup. Four new serial Pi
Terra/medium runs reused pinned native baselines: Amazon and Wikipedia still
fail order grounding, while GitHub and Hacker News pass on explicit nearby
header/rank evidence. All four have zero failed public calls and verified exact
cleanup. **None called the new context option.** LIB-015 remains open at the
model/observation level, despite controlled acceptance of the primitive.
Direct trace/source audit further isolated the cause: Wikipedia's 3,351-character
query outline was fully rendered but excluded nonmatching preceding sections.
Increasing the renderer budget alone cannot fix it. The selected next contract
is automatic same-snapshot query context plus explicitly consumable context
continuations, not another warning or a weaker order criterion. See the
[proposal and falsifiers](../../e2e-epoch-37/evidence-observation-plan.md).

Full current checks: OpenSky **310/310** deterministic tests + build; external
evaluator **89/89** + strict typecheck. These counts are not GUI acceptance.
The e38 candidate adds automatic query neighborhoods and
same-snapshot directional continuation in OpenSky, its facade, evaluator tools
and packaged instructions. Driver core tests pass 643/643; implementation/source
review, release build, signed deployment and the expanded real probe are complete.
The four historical e37 outcomes above remain unchanged; e38 is separate evidence.
Timelines, original protocol differences and raw comparison metrics are in
[`../../e2e-epoch-37/README.md`](../../e2e-epoch-37/README.md). The following
implementation/review history is retained rather than replacing failed probes
with their later passing results.

The user explicitly authorized redesigning the personal Cua fork on 2026-09-05;
upstream approval is no longer a prerequisite for our local implementation.
No upstream acceptance or publication is implied. Core context selection uses
generic structural roles and stored semantic nodes, not domains, CSS selectors,
product-name heuristics, or task-specific instructions.

The OpenSky half adds one observation option, `context`, and the legacy spelling
`context_element_index`. It bypasses page recollection and settling, returns
`freshness: "stored"`, preserves exact previous refs, and distinguishes group
coverage, document collection, renderer omissions, and unknown virtualized
extent. Old helpers that ignore the option fail closed, clearing unproven local
indices instead of silently presenting a newly captured page as context.

Ordinary driver requests/responses remain unchanged when context is absent.
OpenSky's ordinary/query **rendered output intentionally changes additively**:
up to 32 read-only content anchors within 3,000 source-row characters are shown
with bounded, explicitly marked name previews. Empty nonstructural content rows
are omitted with a count; named rows and generic structural groups retain their
exact indices. An offline audit of 60 saved real snapshots across five task
families found no wire incompatibility but showed the initial indiscriminate
32-row prefix mostly spent its viewport allowance on unnamed rows. The revision
is generic, not domain-specific. This costs context and may affect model behavior; it is not yet
a measured efficiency improvement. Browser renderer omissions now also set the
internal snapshot's truncation flag (OBS-007), not merely a prose warning.

OpenSky build and **290/290 deterministic tests** passed; the initial sandboxed
attempt was 288/289 because the REPL's loopback listen was denied. The exact
permission-enabled rerun passed. External evaluator checks remain **65/65**.
The packaged skill validator passed using an existing cached PyYAML dependency;
no package or credential was installed. The controlled-page real-driver probe
is implemented and strict-typechecked; its no-opt-in refusal was tested without
opening a GUI. Driver core tests passed (632 core, 2 parity, 3 lifecycle, 10
focused context tests), then the signed helper was deployed with its existing
certificate identity. The first real controlled-page probe confirmed the exact
source `7f8daf9a` and passed article/list context, old-action preservation,
read-only refusal and post-input invalidation checks. It **failed** on a missing
table parent; all tiny groups also reported incomplete. This is a driver
collection investigation, not a reason to weaken the probe or claim acceptance.
All exact owned windows/sessions were closed, MCP exited cleanly, final inventory
was empty and only the probe-created private runtime was removed. Evidence:
[`../../e2e-epoch-37/probe-01/README.md`](../../e2e-epoch-37/probe-01/README.md).
Real serial model evaluations and any efficiency improvement remain pending.

**LIB-020 — bounded context is not complete traversal:** source review found
that a long list of structural items can dead-end: item context stays within
that item, and enclosing-list context restarts at its beginning. Unissued or
unrendered sibling refs cannot safely be guessed. Documentation and evaluator
tool guidance initially stated this limitation. The new OpenSky candidate now
accepts an exact emitted `continuation` token and validates snapshot/tab/frame/
group/order-domain identity, single use, pending input and bounded output.
Automatic query context is rendered before matching paths and ranked controls;
standalone pages are not cut again by the ordinary outline budget. Tokens and
coverage stay outside body budgets. This is **implemented, contract-tested and
controlled-real-driver confirmed in e38**, not general website/model acceptance.
The controlled probe includes an 80-row nested list with complete
actor-visible forward traversal, reverse prefix access, unchanged snapshot ID,
single-RPC reads and reused-token refusal. This gap
is generic and remains open even if the current small fixtures or model tasks
pass. Do not mistake omitted-node counts for usable continuation capabilities.

Independent malformed-response review found duplicate issued refs could silently
overwrite one another and automatic blocks accepted noncanonical snapshot IDs
or the wrong snapshot format. The candidate rejects these before issuing local
cursor capabilities, including trailing-control-character tokens. Regression
coverage is deterministic, not live acceptance. Automatic evidence costs up to
six blocks / 96 members / 24,000 UTF-8 outline bytes; a standalone page is capped
at 25 members / 12,000 bytes. No efficiency gain is claimed before fresh actors
pass grounding and cleanup. No domain-specific extraction rules were added.

**LIB-021 — node coverage is not full-text fidelity:** independent source audit
found the existing driver `clean_semantic_text` keeps at most 1,000 characters
per normalized node string without a truncation marker. Context cursors traverse
stored nodes, so they cannot recover a qualifier past that text prefix. This is
an **open, pre-existing source-level limitation**, not a demonstrated cause of
the e37 failures or a new regression from pagination. A future generic fix must
preserve explicit text-truncation metadata and an evidence retrieval path, with
long-label/qualifier tests; group completeness currently concerns materialized
nodes, not lossless source text. Do not report full-document evidence from that
flag alone.

**LIB-022 — structural wrappers consume evidence budgets:** e38's final Amazon
query used all 96 automatic context member slots, 43 of them unnamed generic
emitted refs. Only 5,461 of the available 24,000 outline bytes were used. The audit
does not prove all 43 had no underlying state/action metadata or were removable.
This identifies a budget-density issue, separate from missing logs.
The installed private driver projects only proven empty-metadata nodes out of the member budget
while retaining the original validated AX ancestor nesting. Named, valued,
stateful, actionable and destination-bearing nodes stay in the evidence sequence.
Exact anchor metadata remains available even when a blank anchor is not a member.

Every new context declares `member_projection: semantic_evidence_v1`, the
eligible stored source count and the projected-out count. Member counts, omitted ranges,
cursors and group completeness explicitly concern that projection, not all raw
AX nodes or unclipped source text. The projection is group-bound, not dependent
on which anchor was queried; continuation validation pins its totals. Older
helpers remain supported without inventing projection metadata. **Controlled-real
recovery confirmed in e39**: identical-hash article/list/table/long-list fixtures
improve 4/6 to 6/6, recovering separate trailing qualifier nodes in wrapper-heavy
list/table windows and retaining a named/stateful generic. All cases verify exact
cleanup. The fresh serial model batch independently passes 4/4, but Amazon uses
more calls/time than e38 or native; no causal website efficiency gain is claimed.
OpenSky `5e43a2a` passes 316 deterministic tests/build; Cua `be8a19a` passes 645
unit, 2 contract and 3 lifecycle tests. [Probe review](../../e2e-epoch-39/probe-review.md).
Node and byte budgets remain unchanged for this isolated experiment.
“No state” here means no retained semantic state: the existing collector keeps
only a subset of AX properties. The projection does not restore information
already removed during collection or text normalization.

**LIB-023 — first-anchor coalescing can leave later matches uncovered:** the
installed baseline emits one window at the first source match per enclosing group,
even when later matches fall outside it. E40's real baseline passes 6/9 controlled
cases: three new list/article/table cases match every intended control but omit
later local qualifiers while using only 20–22 of 96 available member slots. All
exact owned sessions close. Empty-wrapper projection alone cannot solve this.

**Candidate implemented; live validation pending.** Driver selection skips only
exact anchors covered by an actually returned member window of the same group,
after clipping. Multiple windows may retain the same group identity. Independent
review caught the host's former blanket duplicate-group rejection; the host now
accepts distinct ranges only with consistent total/projection/parent/domain/
collection metadata and exact overlapping offset-to-ref mappings. Duplicate
windows and tokens remain rejected. Overlap still spends the shared 6-block /
96-member / 24,000-byte budget; one anchor's membership does not establish full
item or qualifier coverage. No site/task labels or new waiting policy are added.
[E40 evidence](../../e2e-epoch-40/README.md). The e39 batch improvement does not
close this gap, and denser output alone cannot prove fresh model grounding.

**LIB-024 — stable stored evidence can precede useful materialization:** e39
Amazon's `p25` automatic neighborhood shows navigation, but its matching paths
already include results-count and sponsored-card evidence. The actor reads eight
continuations through all 213 projected / 298 eligible stored root members before
refreshing. The fresh unfiltered `p26` already has 2,783 ranked candidates before
scroll; later `p28` has 2,616 eligible stored root members and yields the required
Results-list proof. These two count types are not interchangeable. **Live symptom;
fix open.** Correction: the first snapshot was not entirely header-only, and growth
cannot be attributed specifically to scrolling. Stored pagination correctly
preserves its snapshot; it cannot discover new content. This does not prove the
exact loading cause, user interference or a projection regression. Two equal
selected-ref signatures can end current settling after a 150ms poll; equal
observations are not proof of readiness. Next generic experiment: expose collection/readiness and
match-coverage evidence so refresh versus stored expansion is an informed choice;
test delayed content and header-only matches without site-specific waits or query
labels. Never silently recollect while claiming the same cursor revision. Evidence:
[full public Amazon timeline](../../e2e-epoch-39/run-e39-amazon-01/timeline-readable-v2.md).

Independent probe review also found a presentation inconsistency: fresh views
suppressed the driver's stale `about:blank` title after navigation, while stored
context printed it. Both now share the same placeholder normalization, without
inventing a replacement title. A pure regression covers query/context/viewport
and genuine blank pages; probe 02 onward confirms the live consistent title. The stronger probe also
requires earlier-before-current source-outline order and proven complete group
coverage for its small static fixtures, rather than mere substring presence.

**RUN-014 — fail-fast controlled probes hid later fixture defects:** probe 02
stopped at the first article completeness assertion even though that case's
exact owned browser session closed successfully, so list and table checks never
ran. The probe now records clean assertion failures and continues serially only
after the case's `browser_prepare` sessions each have matching inactive
`end_session` receipts. Missing/failed cleanup, transport failures, ordinary
operational errors, and assertions wrapping an operational error remain
terminal before the next fixture is admitted. This policy is
**contract-confirmed**, not real-driver acceptance, in
[`test/probe-browser-context.test.ts`](../test/probe-browser-context.test.ts).
Probe 03 independently passed all article/list/table checks with exact cleanup
before this orchestration change; it validates the capability, not the new
continue-on-clean-assertion branch. Evidence:
[`../../e2e-epoch-37/probe-02/README.md`](../../e2e-epoch-37/probe-02/README.md),
[`../../e2e-epoch-37/probe-03/README.md`](../../e2e-epoch-37/probe-03/README.md).
The changed real happy path subsequently passed
[`../../e2e-epoch-37/probe-04/README.md`](../../e2e-epoch-37/probe-04/README.md);
the failure-continuation branch remains separately contract-tested.

**RUN-015 — manual coordination slowed the feedback loop:** the operator was
starting each browser model case, checking baseline/source provenance and
cleanup, then separately dispatching review. An external declarative matrix now
reuses the existing evaluator, preflights all cases, pins source revisions and
six baseline hashes, and admits the next case only after child exit plus exact
session/MCP/target cleanup evidence. Public review can overlap the next GUI case;
GUI itself stays serial. Twenty-four queue/receipt regressions and a four-case
no-model preflight pass; the e38 four-case live matrix also passes its exact
serial admission/cleanup happy path. No measured iteration-speedup or interrupted
branch acceptance is claimed. Native-app cases are deliberately refused pending their distinct
window-absence proof. No new API-key path, automatic install or retry was added.
Procedure: [`../../../work/eval-scripts/ITERATION.md`](../../../work/eval-scripts/ITERATION.md).

**RUN-016 — evidence-density diagnosis required manual reconstruction:** timeline
rendering now derives `evidence-density.json` from original public tool-result text
and driver tapes, with source/result hashes, exact unique context joins, member and
byte counts, projection accounting and actual cursor consumption. Settling captures,
private reasoning and oracle answers cannot fill actor-evidence gaps. **Implemented,
12 deterministic audit tests and e39 artifact audit confirmed**; 101 external
evaluator tests pass. The e38 Amazon query joins uniquely with 96 members / 43
unnamed generic refs / 5,461 outline bytes. E39 Amazon's two query contexts join,
but 11 standalone contexts remain uncorrelated because the host abbreviates generic
outline rows; reviewers still have and cite their original full public results.
Ambiguous/lossy joins remain explicit rather than selecting a convenient capture.
Density is diagnostic, not a grounding score or a normalized token-cost measure.
Source: [`../../../work/eval-scripts/evidence_density.ts`](../../../work/eval-scripts/evidence_density.ts).

**SET-010 — inventory can briefly spawn background work:** the local CLI's
finite-command telemetry path creates a short-lived detached process with the
same executable, confusing a strict pre-install quiescence guard. Two guards
stopped safely before installation. Source inspection identified the telemetry
worker; disabling telemetry only for the guard's inventory subprocess allowed
an exact known serve-PID/zero-session check. No unknown process was killed and
the saved telemetry preference was untouched. This is an operational workaround,
not a general process-discovery fix.

### Epoch-36 follow-up and comparison policy

- The stalled helper was stopped with the user's approval after its 100% CPU
  usage was verified. The exact old helper and test Chrome PIDs are now absent;
  retained old session receipts remain unavailable, so the original run is still
  failed. A local-only Cua repair was tested, signed with the existing identity,
  and deployed as source `131d661739e7dc4fb8dcb8fb17d1d45e768e9179`. Its post-restart
  real read-only MCP probe passed. No permission/keychain changes were made.
- `run-e36-amazon-02` then completed with 5 public calls, no tool failures,
  36.307 seconds, exact session cleanup and a clean MCP close. It still **fails
  grounding**: filtered output does not prove first-organic ordering (LIB-015).
  The saved native baseline passed in 6 calls / 36.084 seconds. Fewer OpenSky
  calls are not an efficiency win when its answer lacks required evidence.
- **OBS-010 — repeated native baselines:** earlier iterations reran both arms.
  At the user's request, later runs pin and reuse a recorded native session for
  the same task/model/reasoning, preserving its original date, version, verdict,
  timing, provider usage and six source-artifact hashes. Baseline content never
  enters the Pi prompt. A reference marker supplies the original native verdict
  without copying observations into a new run. Reviewed failed native baselines
  may be retained but cannot satisfy both-pass efficiency gates. Initial
  integration: external suite **62/62**, and e36 Amazon reuse **live-confirmed**.
- **RUN-013 — legacy metadata/preflight friction:** the first Wikipedia reuse
  attempt stopped before model/GUI work because its old oracle omitted the later
  `lifecycle.targetKind` annotation. Prompt and all other oracle fields match.
  The reserved run is retained with a setup-refusal note, not a task failure.
  A narrow compatibility rule is now **contract/live-confirmed**: omission only
  may bridge to `exact_browser_session` when every other task field matches and
  the old public trace proves the same exact browser binding was created and
  closed. Provenance records the original create/close calls, provider identity
  and final empty inventory; the resolver recomputes the proof. Explicit kind
  mismatches and other task changes still refuse. External suite **63/63**;
  `run-e36-wikipedia-02` reused the e31 baseline. No historical artifact changed.
- `run-e36-wikipedia-02`: 5 calls / 0 failures / 31.027 seconds; exact cleanup
  and MCP closure passed. The helper was at 0.2% CPU afterward and a read-only
  operator check returned zero sessions. Independent review **fails grounding**:
  the filtered article result supports its title, but a matching ancestor region
  does not prove the first section heading. This reproduces LIB-015 on a second
  task family. The final response also omitted the facade-owned-only inventory
  qualifier; user-sibling absence was not proven, though no unsafe close occurred.
- **OBS-011 — task-equivalent baselines can have different protocols:** the
  Wikipedia native baseline has 4 calls / 26.730 seconds, but combines exact
  close and final inventory. The current evaluator requires separate calls,
  imposing one extra call on the same strategy. Preserve raw metrics and mark
  efficiency confounded; do not invent adjusted calls or rerun native merely to
  erase the difference. Same prompt/model/oracle is insufficient for a strict
  efficiency comparison when required setup or cleanup work changed. The
  resolver now fingerprints the recorded cleanup-protocol version and both
  evaluator instruction envelopes, including missing-versus-present fields.
  Metrics/timelines disclose drift; the validator requires an indeterminate
  winner while preserving task verdicts and valid reuse. It does not infer call
  costs from prose. **Contract-confirmed:** full external suite **65/65**, with
  same-protocol and changed-protocol both-pass fixtures; both new e36 reviews
  validate. The Wikipedia derived report was refreshed; raw evidence is intact.

Detailed local evidence: [`../../e2e-epoch-36/README.md`](../../e2e-epoch-36/README.md).
Cross-platform certification, repeated real-driver reliability and the broader
same-snapshot context capability remain unproven.

OpenSky has live successes across native apps and browser tasks, including e35 Hacker News where both arms passed, and the e35 Amazon run confirms the screenshot dedup fix. Those results do not establish general parity. The currently blocking generic gaps are:

1. same-snapshot semantic collection context and truthful leading-order coverage (LIB-015);
2. macOS standalone trusted coordinate scrolling without unsafe activation or invented fallback (DRV-002);
3. exact refusal detail preservation across the deployed transport (DRV-003/DRV-005);
4. native CLI approval mediation and continuously provisioned real-driver CI (SET-004/SET-005);
5. Finder/WebKit and full Windows/Linux capability/cleanup parity (DRV-001/SET-007);
6. auxiliary native-window ownership and transactional cross-process target state (CLN-001/CLN-006).

The epoch-35 renderer is intentionally not described as an efficiency fix: it preserves more structure overall while increasing outline characters and sometimes losing meaningful tail rows under a fixed budget. Likewise, fail-closed behavior, exact cleanup, and truthful scope labels are safety wins even where the underlying operation remains unavailable.


**SET-011 — exclusive OpenSky Driver identity (2026-09-06):** default discovery
previously selected released `cua-driver`, while parity work required an explicit
`cua-driver-local` override. Discovery now selects `opensky-driver`; both
transports check offline version/identity before any daemon operation. Missing
or incompatible builds fail with fork build instructions, without downloading
upstream. Explicit app selection resolves the chosen executable's own bundle.
The fork uses a separate daemon namespace, MCP name, and SDK contract version.
CI requires an exact fork SHA and VM checks require a preinstalled fork.
This is a breaking helper migration: old local builds need rebuilding and the
new macOS app needs initial permission grants. Legacy class imports and env
aliases remain compatible, with identity validation enforced. Validation is
recorded in the fork's `libs/cua-driver/docs/opensky-validation.md`. No desktop
E2E acceptance or installed-app migration is claimed.

**SET-012 — remote driver validation without taking over the user's desktop
(2026-09-07):** local native-driver tests compete with the user's active GUI and
can alter focus, clipboard, and permission state. The fork now has an OpenSky
GitHub Actions workflow on branch `opensky-driver`: builds and driver/contract/core
unit tests on Linux, Windows, and macOS; opt-in canonical Linux X11 and Windows
interactive desktop lanes; exact commit provenance and retained logs/recordings.
The history lanes now resolve the renamed installed OpenSky executable. No local
GUI runner or daemon is started. The first diagnostic native run is
[34149118620](https://github.com/tanishqkancharla/cua/actions/runs/34149118620)
at `407c83ae8276e5e7df134858e9ad3b9a1506a856`; its job results are the evidence,
not this infrastructure entry. These Rust harnesses do not execute the separate
SDK consumer E2E drafts or resolve the deferred parity capabilities. The user
has no separate Mac available, so macOS GUI/TCC acceptance remains unconfigured;
the hosted macOS lane establishes compilation/unit coverage only. Remote usage
and platform limits are in the fork's `libs/cua-driver/docs/opensky-remote-testing.md`.
Remote native evidence for SET-012 is now recorded at the initial fork SHA:
Linux/X11 has 32 delivered actions and seven expected refusals; Windows has 39
delivered and four expected refusals. Both reports have zero failed/skipped
cells and passed preflight/video validation. The initial workflow's build jobs
exposed a stale contract assertion, and broader Windows core checks exposed
Unix-only/canonical-path fixtures and a startup-instruction word-budget issue.
Those are corrected in later fork commits; exact SHAs and run links are in the
fork guide. These native subsets establish remote harness viability, not full
Computer parity or SDK consumer E2E acceptance.
The final build/unit matrix
[34150504250](https://github.com/tanishqkancharla/cua/actions/runs/34150504250)
is green on all three platforms at
`637723da86b3ea42aadf9e12047258a4499d361c`, including embedded source identity.
Documentation-only commits afterward do not change the tested code. macOS GUI
and full cross-platform/standalone-browser certification remain unclaimed.


**SET-013 — test the consumer's actual experience (2026-09-07):** the SDK
scroll draft treated a trusted wheel receipt as movement even though its canvas
never redrew. Its stale-reference case observed only the removed control and
could miss input sent to a surviving control. The canvas now scrolls and redraws
actual content, and the assertion compares the visible document marker in public
SDK screenshots. The stale fixture supplies a replacement and sibling plus
visible activation counts; the test checks a fresh SDK observation after the
refusal. Context assertions no longer contain a procedural loop. Practical
runner configuration remains acceptable; it does not substitute for real public
operations and external outcomes. The SDK build, E2E typecheck, script syntax,
and collection of 14 implemented cases passed. No real-driver execution or new
parity acceptance is claimed. E2E dependencies are now locked; local legacy peer
resolution avoids npm's `edgesOut` crash for the nested `file:..` dependency.
The inherited Rust mock-based unit tests remain distinct from consumer acceptance.


**SET-014 — first isolated SDK desktop lane (2026-09-07):** native Rust harness
results did not establish that consumers could complete the same workflows
through the SDK. A new hosted Linux workflow builds the pinned OpenSky fork,
then drives SCROLL-B01 and STALE-B01 through the built public SDK in separate
real Chrome/X11 desktops. Setup selects unrestricted permissions and disables
the browser sandbox on disposable runners; these configurations do not certify
approval or sandbox behavior. Fixture-managed final screenshots/AX, recovery
state, daemon logs and recordings are retained. Diagnostics occur after the test
to avoid refreshing action mappings. Status: configuration and static checks
only until the first remote run is recorded below. macOS GUI and unsupported
paste remain outside this initial lane's acceptance claims.

The first run [34159847059](https://github.com/tanishqkancharla/opensky/actions/runs/34159847059)
completed both selected cases at SDK `a4330d5` / driver `637723da86b3ea42aadf9e12047258a4499d361c`:
SCROLL-B01 was refused by Linux's standalone trusted-input limitation; STALE-B01
incorrectly activated the detached button (`Discarded: 1` in final public AX).
The fork candidate `59bdc18e03a276fa98c556f6110ba7791e97d101` checks attachment
in the same JS turn as click dispatch and preserves unknown delivery. The SDK
workflow now pins that candidate for regression validation. No synthetic input
fallback or passing expected-refusal assertion replaces the scroll requirement.

Regression validation [34160341420](https://github.com/tanishqkancharla/opensky/actions/runs/34160341420)
at SDK `a6f9fa042a0f03c5bbd9abee8672e77e2d027431` and the exact fork candidate
passed STALE-B01 with fresh visible counts `Discarded: 0; replacement: 0;
sibling: 0; retire: 1` and exact-tab cleanup. SCROLL-B01 still failed before
trusted delivery, so the overall lane remains red. Public observations and
recordings are retained in each case artifact. The driver build/unit matrix
[34160289413](https://github.com/tanishqkancharla/cua/actions/runs/34160289413)
passed Linux, Windows and macOS; those checks do not certify native GUI parity.


**SET-015 — broaden consumer baselines and enable local macOS probes (2026-09-07):**
the user authorized implementing the remaining capabilities and using their Mac
for macOS-specific verification. The hosted SDK lane now selects all ten
implemented browser cases, each on an isolated desktop, with at most three
concurrent cases. Existing positive assertions remain unchanged, including
paste and scrolling. Native probes will use temporary documents and exact owned
targets on the explicitly authorized Mac. Status: baseline execution pending;
this entry does not claim the remaining capabilities are implemented.

Baseline [34160820624](https://github.com/tanishqkancharla/opensky/actions/runs/34160820624)
ran all ten browser cases: STALE-B01, TEXT-B01 and FRESH-B01 passed; paste,
scrolling and all three context cases failed. Investigation found that the
existing `tanishq/query-context` branch (through `335b605b2`) had never been
integrated into the renamed driver. It is now merged, preserving its original
commits, at `d3100981785e8407a7589fbd1aff989d0e72594d`. The SDK lane pins this
combined build for real validation; paste/scroll remain separate capability work.
The first local native baseline was blocked before selection by unavailable AX
window mapping, with exact cleanup also refused; recovery state is retained.
The user has since granted permission and local recovery is in progress.

The integrated context candidate passed all list/article/table cases in
[34162512013](https://github.com/tanishqkancharla/opensky/actions/runs/34162512013),
bringing the baseline to six passes and four failures (three paste, one scroll).
Browser paste now delegates through the public facade to the exact driver's
`browser_type` paste mode, after observing the current focused editable ref.
Obsolete unit assertions requiring browser paste to reject were removed; the
real paste scenarios retain their trusted-event, multiline and formatting
assertions. Build and E2E typecheck passed locally. The local Node suite reached
a sandbox loopback-listen denial; normal CI remains its validation environment.
The workflow now pins paste candidate `a92fac8a44d3574570b69f70dd8cbe432256acbe`.


**SET-016 — paste, wheel input and truthful native failures (2026-09-07):**
SDK `8f955ca` with driver `a92fac8a44d3574570b69f70dd8cbe432256acbe` passed
9/10 browser cases in [34163189757](https://github.com/tanishqkancharla/opensky/actions/runs/34163189757),
including all three real paste formats. Driver build/unit checks passed on all
three OSes in [34163145256](https://github.com/tanishqkancharla/cua/actions/runs/34163145256).
Native paste is still unimplemented.

Driver `f089f489a021c19ef84f5c75530ca589c82bc5ac` queues trusted wheel gestures
without explicit native focus activation and preserves CLI error envelopes.
SDK `65819a3` passed SCROLL-B01 with a real X11 foreground witness in
[34164047110](https://github.com/tanishqkancharla/opensky/actions/runs/34164047110);
the full workflow passed all ten browser cases. All 336 SDK checks passed locally.

The user granted the development app AX/screen permissions and moved TextEdit.
The helper reports its own `com.opensky.driver` permissions as granted, but the
retained test window still had no AXWindows entry even after a helper restart.
A native diagnostic proved AXFocusedWindow and AXMainWindow map to the exact
CGWindowID and expose controls. Driver `fefef610e` integrates these exact candidates
without selecting by title. Real native SDK selection/cleanup remains pending.
The SDK now surfaces the observed `bring_to_front_exact_window_unverified` code,
partial effect details, and a no-replay warning instead of returning success.

The updated macOS CLI was also driven through the real SDK against the existing
permissioned daemon. It preserved the original `bring_to_front` diagnostic,
`bring_to_front_exact_window_unverified` code and exact partial-effect payload.
The first AX candidate had missing FFI/import declarations; `38c05be79` corrects
those compile errors and is the next macOS build candidate.

Driver `38c05be79d0bfc7ae03d57ccb82ca6319998c736` passed the complete build/unit
matrix in [34164488643](https://github.com/tanishqkancharla/cua/actions/runs/34164488643).
The development app now contains that exact artifact. Re-signing the rebuilt
binary changed its ad-hoc identity, so macOS is waiting for renewed permission;
the user has been asked to re-enable it. Native GUI acceptance and cleanup of
the retained scratch windows are still outstanding.

**SET-017 — restored TextEdit documents blocked exact opening (2026-09-07):**
After both macOS grants were confirmed under `com.opensky.driver`, SELECT-N01
failed during `open_target`, before selection. TextEdit restored two older
`sdk-draft.txt` documents beside the requested one in its new process. All three
had the same title; a read-only native diagnostic exposed three distinct
`AXDocument` file URLs. The SDK's sole-window requirement rejected this valid
open. No input was sent and the scratch files were retained.

The driver now supports opt-in `list_windows(pid, include_document_urls: true)`.
It joins fresh AXWindow and WindowServer records by PID and CGWindowID and
returns `document_url`, or null when unavailable. The SDK canonicalizes file
paths (including macOS `/var` versus `/private/var` aliases), waits for exactly
one matching document, and independently rechecks it before retaining exact
close authority. It never uses the title to resolve restored siblings. Older
drivers without this metadata retain the existing sole-window requirement;
missing/ambiguous metadata from the new driver does not authorize a window.
Failures now include the launched PID and candidate IDs for diagnosis.

OPEN-N01 exercises the real public SDK with distinct contents in same-named
files and verifies that closing the requested target leaves its sibling
readable. Local SDK checks (336), TypeScript builds and focused macOS driver
tests passed. After refreshing the grants, OPEN-N01 passed on the user-authorized macOS
15.7.9 desktop: the requested document was read and closed while its same-named
sibling remained readable; fixture teardown also completed. Tested SDK
`5f42f0cf3350d6a30a3978c6b6277b1b8443253b` and driver runtime code from
`aa31c70eef01d60e9f1571a218bdce021b392940` (local Cargo build; subsequent
driver source differences were formatting, unit-test and documentation only).
All ten hosted browser cases also passed in
[34167084511](https://github.com/tanishqkancharla/opensky/actions/runs/34167084511),
and the driver passed all three OS build/unit jobs in
[34167061105](https://github.com/tanishqkancharla/cua/actions/runs/34167061105).
Native selection/paste and broad macOS parity remain separate acceptance work.

**SET-018 — ad-hoc development signing invalidates repeated grants:** the local
app was signed with `codesign --sign -`; its observed designated requirement
was a binary-specific cdhash. Replacing the executable therefore changed its
identity despite keeping the same bundle ID/path. Stable certificate-backed
development signing and a consistent designated requirement are needed before
further routine binary replacement. No signing certificate or Keychain item
was created in this work. See [Apple TN3127](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements).
The repeated grants were for the same Accessibility/Screen Recording rights,
not an expansion of requested access.

**SET-019 — programmatic native evaluation startup and isolation (2026-09-07):**
`codex exec` could initialize the published native Computer Use MCP service,
but its noninteractive client declined the service's app-access form. The
new `evals/parity/codex.ts` uses installed Codex 0.147.0's `app-server` protocol
and answers only recognized, currently active, already-authorized forms without
requesting persistent permissions. Both actual native `@oai/sky` Node REPL and
OpenSky's public `cua` REPL returned real Calculator accessibility state using
`gpt-5.6-terra`, medium effort. These are capability preflights, not scored tasks
or evidence of general parity. Unsupported requests stop the run.

Unrelated user MCP servers still initialized with only CLI overrides; supplying
the same disable configuration at `thread/start` removed those startups in
`evals/runs/opensky-repl-preflight-2`. Dotted override keys must be unquoted for
this CLI parser. Agent shell, filesystem tools, web search and other backends
are disabled. Tool availability/approval changes remain sensitive to CLI
versions. A persistent estimate ledger reserves $5 per run, interrupts at
$2.50 of reported conservative Terra usage, and blocks unreconciled runs and
the user's $50 checkpoint. Five real-file ledger tests pass. API-equivalent
estimates are not the subscription bill or a provider-enforced spending cap.

**SET-020 — local app processes survived test teardown (2026-09-07):**
Ending the OpenSky REPL/SDK session left Calculator PID 69925 running. Earlier
native fixtures closed exact documents but did not necessarily quit their
TextEdit processes. Fresh AXDocument checks identified only owned scratch
documents in PIDs 8841 and 20606; PID 58643 had no windows. All four processes
were normally quit and independent process inventory confirmed their exits.
No force termination, discard confirmation or additional TCC grants were used.

The Calculator preflight now uses an independent fixture with the exact
NSRunningApplication returned by Launch Services, records PID/bundle/launch
time, and verifies exit after cooperative termination on success or failure.
It refuses setup if Calculator is already in use. A process-only launch
argument suppresses restoration; user preferences are unchanged. Launching
Calculator's executable directly exited before desktop registration, so that
attempt failed setup and its process exit was verified. Normal Launch Services
teardown passed in `evals/runs/cleanup-normal-2`; an intentionally failing
callback preserved its error and verified cleanup in `cleanup-action-failure`.
The real Terra run `opensky-repl-cleanup-preflight` was interrupted before tool
dispatch because a literal allowlist omitted the semicolon-free equivalent;
its independent cleanup also passed. Both approved spellings are now listed.
`opensky-repl-cleanup-preflight-2` then passed with actual Calculator AX state
through Terra/OpenSky; fixture-owned PID 20983 exited and `cleanup.json` passed.
This is still transport/lifecycle validation, not an OSWorld task score.
Cleanup errors prevent preflight success/ramp-up. Native
SDK document fixtures still need equivalent process teardown before another
local run; exact-window close alone is not sufficient cleanup. The Codex
runner now gives MCP processes time to shut down before fallback signals.

**SET-021 — native API instructions and scoped REPL programs (2026-09-07):**
Standalone MCP setup does not load the native plugin skill. The first heading
attempt invented `target: {index: 5}` instead of `element_index`; another hit an
overly narrow program guard on `Object.keys(sky)`. Both interrupted attempts
remain infrastructure failures, with audited usage and verified cleanup.
The runner now supplies the installed native API guide and allows API inspection
and the documented screenshot-file recipe, restricted to returned screenshot
URLs. The original native service still executes all admitted calls. Five
program-policy tests pass; these are harness checks, not native task success.

**SET-022 — LibreOffice fixture startup and discovery (2026-09-07):**
Workspace LibreOffice 26.8.0.3 initially stalled writing embedded Python cache
files. A per-process `PYTHONDONTWRITEBYTECODE=1` setting allowed normal startup;
no persistent application preferences were changed. A fresh disposable profile
and document are created for each arm. Setup readiness now comes from independent
Launch Services/WindowServer observations, rather than the SDK being evaluated.
`osworld-setup-heading-3` verified a visible document and normal app exit.

In `libreoffice-startup-diagnostic`, OpenSky Driver `list_apps` omitted the real
running LibreOffice PID 85798 while `list_windows` and an independent native
observer found its visible `heading.docx` window. The SDK with auto-launch
disabled therefore said the app was not running. Its default launch recovery
allowed subsequent task runs. Stale NSWorkspace enumeration in the long-lived
driver is a hypothesis; no driver fix or cause confirmation is claimed.

**SET-023 — save confirmation invisible to OpenSky observation (2026-09-07):**
In `osworld-smoke-heading-opensky-1`, the agent selected the heading, observed
Center enabled, clicked Save and received `No accessibility changes.` It then
claimed completion, but the saved DOCX remained unchanged (upstream score 0).
`libreoffice-save-dialog-diagnostic` independently reproduced the gap: the
public SDK reported no changes while fresh native AXFocusedWindow state exposed
the `Non-standard file format` dialog and `Use Word 2010–365 Document Format`
button. Native observation in the paired run also exposed that dialog.

The SDK retains the original exact window while it exists; the driver scopes
each AX walk to that requested CGWindowID. A separate top-level dialog is
therefore omitted. Correlating and exposing auxiliary windows is pending;
blindly adopting another same-process window could break exact-target isolation.
No corrected driver or SDK GUI acceptance is claimed. This is a reproducible
observation failure in addition to the scored agent attempt.
The three-line public-SDK Vitest case `DIALOG-N01` reproduced it in 26.75s:
`libreoffice-dialog-eKkHnu/external-final.json` contains the actual format dialog
while `sdk-final.txt` contains the document window instead. Its owned PID 93612
exited via the disposable-profile fallback and scratch files were removed.

**SET-024 — unsaved task edits blocked cooperative cleanup (2026-09-07):**
The first OpenSky heading run failed normal teardown because the unsaved
document opened a Save prompt. Its original cleanup failure remains recorded;
manual recovery and independently verified process exit are separate evidence.
Fixtures now permit SIGTERM only for an explicitly disposable profile after
normal quit fails, rechecking the exact PID, bundle ID and launch time. Saved
files are scored before teardown, so cleanup cannot complete the agent's task.
`libreoffice-unsaved-cleanup` and `libreoffice-save-dialog-diagnostic` verified
this path, app exit, and removal of their scratch documents/profiles. Existing
user instances are refused at setup and are not eligible for termination.
`run-status.json` now records cleanup, scratch removal, infrastructure errors
and evaluation validity separately from the saved-file task score. The prior
failed cleanup is not retroactively changed into a valid paired baseline.

**SET-025 — app observations were incorrectly pinned to one window (2026-09-07):**
The native reference follows an app's active surface; `cua.getApp()` instead
returned a permanent window binding. App-scoped observations now use fresh
driver stacking order within the bound PID, including untitled dialogs, and
return a new exact handle when the observed window changes. Actions remain
bound to the latest successful observation. Existing document handles and
close authority are not transferred to the dialog. Foreign PIDs, off-Space and
tiny proxy windows are excluded; missing/ambiguous stacking evidence is refused.
This TypeScript fix uses the existing permissioned driver and needs no new grant.

Real DIALOG-N01 now passes (`libreoffice-dialog-vnbjdP`, repeated in `PbsZVb`).
DIALOG-N02 verifies actual DOCX text, successful format confirmation and return
to the document (`libreoffice-dialog-vDlf5p`, 20.93s); DIALOG-N03 verifies the
original document handle alongside the app dialog (`libreoffice-dialog-Fzt90Q`,
21.66s). All owned processes exited and scratch files were removed. N02's first
attempt inspected before the dialog appeared; its setup now waits for the same
public state as N01 instead of assuming immediate readiness. That setup failure
is retained in `libreoffice-dialog-zxyMhV`. No driver binary was replaced.

The Terra heading rerun (`osworld-smoke-heading-opensky-2`) passed both upstream
alignment and exact content preservation, saved its DOCX, and quit normally:
6 REPL calls, 106.57s. The lowercase rerun completed and saved, but still failed
the task grader (11 calls, 148.03s); this remains a task failure, not an omitted
dialog. Both `run-status.json` files verify cleanup and scratch removal.
Raw per-run code/asset/driver fingerprints are now recorded; native runs also
fingerprint their installed Node REPL, `@oai/sky` client and service executable.
Builds, 336 existing unit tests and the focused window-choice checks pass.
These results establish the specific save-flow fix, not overall native parity.

**SET-026 — gated campaigns and additional document outcomes (2026-09-07):**
The controller now freezes the two-task smoke plan, runs both interfaces in
counterbalanced order, and permits the five-task stage only after all preceding
arms have valid setup, scoring and cleanup. Actual task failures remain scored;
missing evidence, cleanup failures and environment drift stop the campaign.
The added OSWorld font, subscript and strikethrough tasks retain pinned original
assets and upstream metrics. Additional saved-document guards reject partial
changes that the upstream metric accepts. All 24 budget, policy and real-DOCX
grading checks pass, alongside TypeScript validation. The new controller and
three added tasks have not yet completed an agent campaign. The 20-task stage
refuses to start until a full task set is frozen.

**SET-027 — screensaver/locked desktop can invalidate local GUI runs (2026-09-07):**
The independent macOS lifecycle helper now checks console/login state, the
WindowServer lock indication, a running ScreenSaver Engine and a frontmost
login window before launching a test app and after the task. A failed or
unavailable preflight stops dispatch and records that no app was launched, so
fresh scratch files can still be removed. A failed final check invalidates the
attempt while preserving its saved-file score and performing owned-app cleanup.
No permissioned driver was rebuilt and no permission prompt was requested.

The helper compiled and observed the current unlocked console as ready. In the
sandbox, unavailable session information was correctly refused. Locked and
screensaver states have not been deliberately exercised on the user's desktop.
The lock key is undocumented and may be absent while unlocked; this is a
best-effort guard, not proof of continuous desktop availability. A lock/unlock
entirely between the two checks, display sleep, or an unrecognized screensaver
can still escape it. Background code and remote CI do not require this guard;
local execution still needs the host to stay awake.

**SET-028 — unit retry budget was shorter than CI process startup (2026-09-07):**
CI run 34176450992 failed the existing transient-AX recovery unit check: its
50 ms harness retry budget expired before a spawned fixture could provide its
second snapshot. The check now uses the production 4 s budget; the short budget
remains for persistent-degradation checks. No production timing or real GUI
acceptance claim changes. Both transient-recovery and persistent-degradation
checks pass with the adjusted fixture configuration.

**SET-029 — first frozen smoke campaign stopped on the call limit (2026-09-07):**
`campaign-smoke-1` recorded a clean native heading pass and an OpenSky heading
failure with preserved original text. OpenSky selected the heading and enabled
Center, then clicked the observed toolbar Save control and received no AX
changes. The saved file remained unchanged. The keyboard-save regressions from
SET-025 still stand; toolbar dispatch/readiness needs separate real-SDK
reproduction before its cause can be assigned to the driver or facade.

The OpenSky lowercase arm attempted a 21st REPL call and was interrupted before
the campaign reached the native lowercase arm. Its saved file failed grading;
owned-app exit and scratch removal passed. The controller correctly stopped
under its current policy, but treating an ordinary evaluation budget limit as
infrastructure failure would bias a completed-task comparison. Classification
and transport-level call admission need review before a new frozen campaign.
The original artifacts are retained unchanged; only one complete matched pair
exists and no overall parity percentage or five-task completion is claimed.
The interrupted attempt retains its $5 reservation pending usage audit.

**SET-030 — enforce and score task allowances at desktop dispatch (2026-09-07):**
Both native and OpenSky MCP transports now record admission and refuse a call
beyond the declared count or deadline before forwarding it. The controller
waits for the denial instead of racing cancellation against an extra action.
A proven task-limit stop becomes a scored failure; the actual saved-file grade
is retained separately and cannot override an exhausted allowance. Missing
receipts, unknown permissions and other infrastructure failures still stop the
campaign. Startup is separately bounded, and both agents see the same stated
call/time allowance. Five admission/classification checks and all 24 existing
grader/policy/spending checks pass, as do TypeScript checks. Real paired runs
with this admission path remain to be completed.

The prior interrupted lowercase usage was independently audited against its
terminal turn, final tool completion and later token event, with no active calls
and verified cleanup. `usage-audit.json` records the evidence hash. Its original
task classification is unchanged. The budget now totals $2.7702724 with no
unsettled reservations. Equivalent fully drained task-limit interruptions can
settle automatically; incomplete usage still retains its reservation.

**SET-031 — document visibility and unexpected app exit are fixture outcomes (2026-09-07):**
The new public-SDK toolbar Save case DIALOG-N04 initially failed before test
dispatch (`libreoffice-dialog-vHTLF3`, 36.64s). Retained readiness evidence in
the next attempt (`libreoffice-dialog-WFM5qw`, 35.35s) showed a fully launched
LibreOffice process with `save-dialog.docx` off-screen while Aside was foreground.
Both processes quit normally and their disposable profiles were removed. The
fixture now retains readiness state and may request activation once for its
exact owned PID/bundle/launch receipt, without changing desktop preferences.

DIALOG-N04 passed in `libreoffice-dialog-cQdhv1` (24.02s): the observed Save
toolbar action exposed format confirmation. This attempt was already visible,
so it does not verify the activation fallback. Cleanup verified process exit
through the disposable-profile fallback and removed scratch files. This result
narrows the agent's Save failure to a nonpersistent issue; timing/visibility is
a hypothesis, not a confirmed cause or additional production fix.

The user also reported LibreOffice sometimes quitting. Fixtures now record
owned-process liveness before teardown so an unexpected exit is not confused
with the deliberate normal quit/fallback. An unexpected replacement instance
prevents claiming cleanup and preserves scratch files for recovery. Desktop
readiness is recorded after unsuccessful task callbacks too. These new liveness
paths still need real-run validation; no crash is claimed from the off-screen
observations above.

**SET-032 — inline screenshot imports were falsely rejected (2026-09-07):**
The first five-task campaign completed two valid pairs, then interrupted the
native font arm at a legitimate screenshot cell. It used inline imports of
`node:fs/promises` and `node:url` around the screenshot URL returned by
`get_app_state`; the guard only recognized named imports. Both equivalent forms
are now admitted, while literal paths and fabricated screenshot objects remain
refused. The interrupted attempt and original campaign stay invalid and are
retained. Its owned LibreOffice PID 29879 quit normally and scratch removal
passed. All 11 policy/admission checks pass. The terminal-turn usage audit
settled the interrupted reservation; the cumulative estimate is $5.1207228
with no outstanding reservations. A new frozen campaign remains to be completed.

**SET-033 — invented app methods should receive normal SDK errors (2026-09-07):**
The second five-task campaign completed its heading pair (both pass), then
interrupted before dispatching OpenSky's initial lowercase cell because it
called nonexistent `app.getAccessibilitySnapshot()`. The guard now permits
ordinary method names on the already-bound app object; the real SDK handles
unsupported methods and the agent may recover. Prototype access and calls
through internal facade members remain refused. This changes no SDK API and
does not add an alias for the invented method. The failed campaign is retained;
owned PID 56609 quit normally and scratch removal passed. All 12 policy and
admission checks pass. Its terminal usage was audited and settled; cumulative
estimate is $5.3738212 with no unsettled reservations. A new campaign is pending.

**SET-034 — fingerprint grader/runtime dependencies, not only SDK files (2026-09-07):**
The code fingerprint now includes the top-level evaluation adapters imported
by the real OpenSky REPL. Each run also records the actual Codex binary/version,
Python executable/version and installed distribution versions; the controller
checks these for drift. This closes gaps in the earlier src/dist/parity-only
fingerprint. No previous result is relabeled with the broader fingerprint.

Scratch preparation for the proposed broader task set exposed a native pandas
crash while reading date cells under Python 3.14. The same pinned dependencies
completed the original/reference scorer probe under Python 3.12. This does not
change the running Writer grader environment. The 15 candidate tasks and 33
downloaded input/reference files remain scratch preparation, not a frozen or
validated 20-task suite; decimal display export and an image-position positive
case still need validation.

**SET-035 — reusing an observation variable was falsely rejected (2026-09-07):**
The third five-task campaign passed both heading arms and OpenSky lowercase,
then interrupted native lowercase before its second cell. The legitimate cell
clicked the observed Find & Replace control and reassigned `state` to a fresh
`get_app_state` result. The policy admitted declarations but no reassignment.
It now accepts simple reassignment of existing data bindings on both backends,
retaining app/import bindings and rejecting object-property mutation. Screenshot
read authority is renewed only for a fresh native observation and removed when
that variable receives other data. All 15 policy/admission checks pass, including
fabricated screenshot and app-binding replacement cases. This is harness
validation; a new frozen GUI campaign is still required.

LibreOffice was alive before teardown in all four attempts; all quit normally
and scratch removal passed. No unexpected application exit was observed.
Native's interrupted usage was audited and settled against the terminal turn,
completed tools and subsequent token event. Cumulative API-equivalent estimate
is $5.8728044 with no unsettled reservations. The failed campaign and its invalid
native arm remain intact and excluded from a complete five-task comparison.

**SET-036 — native screenshot namespace imports and stale authority (2026-09-07):**
`campaign-five-4` completed four valid pairs, then the native strikethrough arm
was interrupted at a legitimate `url.fileURLToPath` screenshot recipe. The
policy now tracks supported import namespaces and aliases by provenance rather
than fixed variable names, including saved screenshot paths. Reads still require
an actual native screenshot source; overwriting a path revokes that authority.
A failed REPL assignment can leave an older value behind, so execution errors
clear observation/path authority. The native proxy serializes analysis and
forwarding after the preceding cell's result; it still executes admitted code
in the installed native REPL. All 18 policy/admission checks and TypeScript
validation pass. An audit admits all 101 recorded cells from the eight valid
attempts, including normal API errors and the refused over-budget call. This is
static compatibility evidence, not another GUI execution.

All nine owned LibreOffice instances were alive before cleanup, and all exited
with temporary files removed. No unexpected app exit was observed. Native's
interrupted strikethrough usage was audited and settled; the cumulative estimate
is $8.7971288. The original interrupted attempt remains invalid. The remaining
pair will be run separately; any five-task readiness checkpoint assembled from
these records must disclose both evaluator revisions and cannot be labeled a
single frozen campaign. The full 20-task baseline must still use one revision.

**SET-037 — ordinary app-binding aliases must reach the real SDK (2026-09-07):**
The separate native strikethrough arm passed (9 calls, 106.43s, normal cleanup).
OpenSky's first arm instead timed out during a long `selectText` operation and
then received a poisoned-REPL error. Its attempted recovery bound the same
LibreOffice app as `app2`; the guard only recognized the literal name `app`,
so it incorrectly interrupted the attempt. The policy now tracks fresh app
bindings and aliases by provenance. Other applications remain refused, and old
data cannot be promoted into app authority by a failed assignment. All 20
policy/admission checks and TypeScript validation pass. The 101 earlier valid
cells remain compatible. The invalid attempt is preserved; the completed
native arm remains measured evidence. A verified checkpoint will disclose all
participating evaluator revisions rather than claim one frozen five-task run.

This also exposed fresh evidence for unresolved LIB-007/008: the TypeScript
selection fallback sends one targeted key request per character. Selecting the
long final paragraph exceeded the REPL's 60-second allowance. The subsequent
REPL could not recover, despite error text suggesting bindings could be reused.
The bridge trace labels the unfinished operation completed with duration zero;
that trace must not be treated as successful action evidence. These selection,
timeout recovery and trace-reporting issues are pending production work. All
owned processes exited and scratch removal passed; no app crash was observed.

**SET-038 — validate the broader task set before freezing it (2026-09-07):**
The verified five-task readiness checkpoint retains every valid outcome from
its source attempts, including failures: native 2/5, OpenSky 1/5. Source paths,
hashes and compatibility checks disclose three evaluator revisions. This clears
the readiness ramp but is not a frozen performance baseline. The cumulative
API-equivalent estimate is $9.2695744, with no unsettled reservations.

The full manifest now freezes five Writer, eight Calc, five Impress and two
VS Code tasks from the pinned OSWorld revision. Original task JSON and grader
source provenance are retained. The original scorers run on the agent's saved
file, with separate content guards and a clustered/stacked chart guard. All 72
spending, policy, admission and real-file grader checks pass under Python 3.12;
TypeScript validation passes. These checks validate the evaluator, not desktop
agent success. Slide content checks do not certify every unrelated visual detail.
The decimal-display candidate needed an unported display export and was replaced;
the transpose candidate explicitly needed clipboard use, excluded by this local
profile, and was replaced with split fields. Both decisions preceded expanded
agent outcomes; the deferred candidates remain in scratch provenance.

All 40 task assets pass their SHA-256 pins. The downloader restored one deliberately
missing asset from its original URL, verified it, and removed its temporary file;
large new assets are fetched in CI instead of committed. Linux CI now uses the
combined Python 3.12 grader dependencies. The earlier Python 3.14 pandas crash
is not evidence of an SDK failure.

All 15 new task files passed actual isolated app setup and teardown. Every owned
process was alive immediately before normal quit, and every scratch profile was
removed. Results and hashes are in `evals/runs/expanded-setup-validation.json`.
VS Code uses a separately downloaded, SHA-verified and signature-verified stable
app, preserving the user's Insiders installation. Its initial fingerprint probe
incorrectly assumed an executable named Electron and failed before app launch;
reading CFBundleExecutable fixed it. The later Calc, Impress and VS Code setups
passed. No driver binary or permission identity changed. A paired 20-task agent
campaign remains pending on one frozen revision.

**SET-039 — retain the intermittent Linux browser-open failure (2026-09-07):**
SDK CI run 34181998282 failed TEXT-B01 while opening Google Chrome, before the
Unicode assertion. The wrapper reported no inner driver error, and the retained
trace contained no opened target. Driver X/DBus disconnect messages occur after
the test failure and do not establish the cause. Local video extraction could
not decode the retained recording; its temporary compiler cache was removed.
The subsequent unchanged-SDK run 34182947879 passed, as did its accompanying
parity-harness and computer-use checks. This is unresolved intermittent setup
failure evidence, not a demonstrated fix or a macOS parity result.

**SET-040 — rebind an existing app variable during recovery (2026-09-07):**
The first frozen 20-task campaign passed both heading arms, then stopped on
OpenSky lowercase: 7 admitted calls, 75.02s, invalid evaluator interruption.
The agent refreshed its authorized LibreOffice app with `app = await
cua.getApp(...)`. The earlier alias fix allowed a new binding but the assignment
branch still prohibited all app reassignments. It now permits an existing app
binding to receive only an authorized getApp result or another scoped app alias.
Old data bindings still cannot acquire app authority, and unrelated apps/internal
objects remain refused. All 21 focused policy/admission checks and TypeScript
validation pass. Static replay admits all 20 cells from the three attempts,
including the previously rejected one; it does not rerun the desktop.

All three owned LibreOffice processes stayed alive until normal cleanup, quit
normally and had scratch files removed. The interrupted usage was audited and
settled against terminal events; the cumulative estimate is $9.7611836, with no
outstanding reservation. The original invalid arm remains invalid. The full
campaign will restart at a new revision and in a new directory; no partial
campaign is presented as a complete frozen score.

The invalid lowercase arm also retains two real driver refusals of a freshly
observed Format menu index: the addressed element could not be proven to belong
to the document window. A fresh observation did not repair that action. This is
pending SDK/driver diagnosis, separate from the evaluator rebinding fix.

**SET-041 — let screenshot URL mistakes reach native runtime errors (2026-09-07):**
`campaign-full-2` completed seven paired tasks (both interfaces passed heading
alignment and failed the other six), plus OpenSky freeze-headers (failure).
Native freeze-headers was interrupted after 4 admitted calls/44.74s because it
passed the real returned screenshot URL directly to `fs.readFile`. The policy
required fileURLToPath; it should have allowed the native filesystem's ordinary
URL-string error and subsequent agent recovery. It now tracks direct returned
URLs, converted paths, URL objects and their aliases as the same screenshot
source. An optional encoding is supported, while write-capable file flags,
arbitrary paths, fabricated state and stale authority after errors remain refused.
All 23 policy/admission checks and TypeScript validation pass. Static replay
admits all 176 recorded cells from the 16 attempts, including the rejected read;
this is compatibility evidence, not a fresh GUI run. Earlier native screenshot
reads with namespace/named aliases executed successfully in the Calc formulas
arm, preserving actual reference-backend evidence beyond policy-only checks.

All 16 LibreOffice processes were alive before teardown. Every process exited
and every temporary profile was removed; some unsaved attempts required the
verified disposable-process SIGTERM fallback. No unexpected app exit occurred.
Native's interrupted usage was audited and settled; the cumulative estimate is
$14.469488, with no reservations outstanding. The failed campaign remains intact
and incomplete. Its original native freeze-headers arm stays invalid.

The next campaign retains all 20 frozen task IDs and rotates their order by
eight places to exercise previously unreached Calc, Impress and VS Code tasks
first. The even rotation preserves which backend runs first for each task. No
task, saved-file requirement or prior failure is removed. Only a complete new
campaign at one revision can become the frozen 20-task baseline. The repeated
menu-target refusals, slow/timeout-prone text selection and app-query errors
remain production follow-ups; this policy change does not fix them.

**SET-042 — continue frozen work after pre-model accounting stops (2026-09-08):**
The e73a1a8 full campaign stopped when a timed-out OpenSky call lacked a final
completion receipt. Operator continuations retained prior scored arms by hashed
reference, preserved the blocked pre-model attempt, and checked identical
code/assets/driver/app/native/model runtime fingerprints before every new arm.
The unchanged campaign reached 20 scored LibreOffice arms (10 pairs, neither
interface passed), then hit separate VS Code setup/policy problems. This remains
an incomplete baseline, not 20-task parity. All owned apps were alive before
cleanup, exited, and had scratch removed; no unexpected LibreOffice quit was
observed. Unsaved work sometimes required the exact disposable-PID SIGTERM
fallback. Original campaign summaries and all failed outcomes remain intact.

Four interrupted runs whose final accounting could not be certified were
reconciled by counting their entire $5 reservation, with observed tokens retained
and explicitly marked uncertified. No token counts were invented. The current
conservative checkpoint total is $42.8433996, not a subscription bill; no held
reservation remains. Per-run `usage-audit.json` records the evidence. The operator
continuations live under `evals/runs/campaign-full-3-continuation-{1,2,3}`.

**SET-043 — validate reference discovery, not only app launch (2026-09-08):**
Native VS Code discovery rejected the bundle identifier because six installed
copies shared it. The runner classified that first attempt as a valid task
failure, but audit identifies a fixture limitation: the prompt only supplied the
ambiguous selector. Do not include it in scored parity pairs. A no-agent call
through the original native REPL successfully observed the owned installation
using its absolute app path. Both agents now receive that exact selector and the
scope/consent maps authorize only the known owned installation and its aliases.
OpenSky's corresponding live path probe failed because driver app inventory
omitted the running bundle path and `launch_app` rejected `launch_path`. This is
a production driver/SDK gap, not proof the harness path change is sufficient.
Evidence: `evals/runs/vscode-path-readiness-1`; both processes exited normally and
scratch was removed. Fixed-driver public-SDK acceptance remains pending.

The OpenSky editor arm also stopped on an invented
`app.getElementByIndex(8).press()` chain. The scope parser now admits straight-line
call chains rooted in the bound public app so they reach real runtime errors.
Arbitrary property traversal, other apps, code generation and callbacks remain
refused. All 19 focused policy checks and TypeScript validation passed; actual
REPL error/recovery acceptance is pending the driver path fix. The original
interrupted arm remains invalid. No new agent campaign has started after these
changes.

**SET-044 — retain slow-call and unconfirmed-write experience (2026-09-08):**
The live name-splitting OpenSky arm timed out a batch of setValue calls at the
60-second cell limit. Subsequent observations returned a poisoned-evaluator
error while the appended message still claimed bindings were usable. Driver
set_value can return an unverified receipt that the SDK currently discards.
Fresh menu actions repeatedly failed exact-window ancestry checks, and some
XLSX saves did not dismiss format confirmation. These are pending production
follow-ups, separate from the scope parser. The matching native arms also had
input/selection failures and sometimes incorrect shortcut choices. Failure of
both interfaces is low task success, not proof of useful parity.

**SET-045 — arbitrary task cutoffs obscured feasibility (2026-09-08):**
The current full campaign's 20 valid attempts include 9 call-cap cutoffs,
5 four-minute timeouts, and 6 failures that ended before those limits. Native
was 6/1/3 and OpenSky 3/4/3 respectively. Earlier smoke passed 1/2 for each;
five-task readiness passed native 2/5 and OpenSky 1/5 across revisions. The
partial full campaign is not evidence that either interface fails every task,
nor that their useful task performance is equal.

At the user's request, new evaluations default to `native-compaction-v1`:
no whole-task deadline, no tool-call cap, and the real Codex app-server's native
context compaction. The harness leaves compaction configuration unchanged and
records completed `contextCompaction` events. It does not summarize context or
restart the agent. Profiles are written into run/campaign artifacts; old
`fixed-v1` results and cutoffs are preserved, not rescored as unlimited runs.
Startup/teardown timeouts and backend-local tool behavior are distinct from
whole-task duration. The existing dollar reservations, estimate safety threshold
and $50 review checkpoints still apply. Explicit dispatch arming now distinguishes
an uncapped active run from startup awaiting its spending reservation.
Focused admission/policy/budget checks and TypeScript validation pass; a live
uncapped completion and actual compaction event remain to be observed.

Stable candidate signing also progressed: the existing Developer ID key returned
`errSecInternalComponent`, but the existing driver-specific local certificate
signed the staged candidate successfully. Verification against the real macOS
trust store passes and its designated requirement uses the certificate leaf
rather than the executable hash. Sandboxed verification misleadingly reported
an untrusted certificate. No key, certificate, trust setting or TCC grant was
created or changed. The installed ad-hoc driver remains untouched. Default-socket
permission queries still describe that older daemon; they do not prove the new
candidate's permissions or live behavior. Candidate validation must use an
isolated socket and confirm the returned executable identity.

The first live `native-compaction-v1` attempt is
`evals/runs/uncapped-validation-native-1`: native Calc validation continued for
50 admitted calls and 500.906 seconds, proving it crossed both historical task
cutoffs. The saved-file grader did not pass. The existing $2.50 per-run estimate
guard interrupted it, so it is excluded from completed task scores. No context
compaction occurred; the reported context remained below the model's window.
Its final usage follows all completed items with no active items and a matching
terminal turn. `usage-audit.json` records that evidence and the $2.5443032
estimate; the ledger was settled to $45.3877028 with no reservation remaining.
The owned LibreOffice process exited and scratch was removed. Calls 36/37/49
show native `AXError.notImplemented`, an invalid element ID after a failed
action, and unsupported `PageUp` respectively. More task time alone did not
establish reliable dialog interaction. Direct non-agent diagnosis is next.

The staged candidate's temporary `OpenSkyDriverCandidate.app` name failed the
driver's literal bundle-path recognition and triggered an unnecessary
responsibility re-exec. Moving it to a separate directory as `OpenSkyDriver.app`
restored daemon attribution. An explicit-socket `check_permissions` call then
confirmed that the signed candidate itself has neither TCC grant. The convenience
`permissions status` command ignores its socket argument and kept reporting the
older default daemon; that diagnostic bug remains pending. Both temporary daemon
launches were stopped and their exact process exits verified. No permission
change was requested. The original permissioned driver remains running.

**SET-046 — native dialog receipts need observable verification (2026-09-08):**
The non-agent `evals/runs/native-validation-dialog-probe-1` diagnostic drove a
real disposable Calc workbook through the native public API in 20 REPL cells.
Fresh Error Alert tab clicks returned success without switching tabs; a
screenshot-grounded coordinate click returned `AXError.notImplemented`.
Independent fixture inspection confirmed LibreOffice was foreground. An Allow
popup click also made no visible change, but keyboard Down then `l` selected
List. `set_value` on the Entries field returned success while a subsequent
screenshot showed it blank. `type_text` inserted the three entries visibly.
Clicking OK, pressing Command-S and choosing Excel format saved the workbook.
Independent openpyxl inspection verified A1 list validation with formula
`"Pass,Fail,Held"`; `saved-outcome.json` and `saved-diagnostic.xlsx` retain proof.
This is a successful native interaction primitive, not completion of the
OSWorld task requiring the D-column range. No model ran or spend was added.
LibreOffice quit cooperatively, its exact process exit was verified, and the
temporary document/profile were removed. No native service fix is claimed.

**SET-047 — configured binary was not proof of the connected daemon (2026-09-08):**
The evaluator fingerprinted `OPENSKY_DRIVER_BINARY`, but did not forward an
explicit socket into its agent MCP configuration. The driver's convenience
`permissions status` also ignored its socket option. A newly configured CLI
could therefore operate the old daemon while reports named the new binary.
The macOS evaluator and app-installation SDK fixture now call read-only
`check_permissions` through the selected socket before app setup, require the
daemon's own executable path to match the configured binary, and require both
TCC grants. The MCP adapter repeats the check at startup. Receipts are retained
as `driver-runtime.json`; no automatic start, grant or fallback is allowed.
The older capability-preflight entry point now also uses the uncapped profile.

`evals/runs/driver-runtime-identity-probe-1` exercised real daemons: the matching
permissioned old daemon passed, new CLI/default old daemon was rejected for
identity mismatch, and exact isolated candidate was rejected for missing grants.
Three cases completed in 348 ms with no model calls or GUI actions. Candidate
PID 5521 exited after explicit-socket stop; original PID 94446 remained running.
E2E and evaluator TypeScript checks passed. This proves selection gating, not
the candidate's app-path fix. Verification compares paths and is macOS-specific;
it cannot identify old bytes already loaded after an in-place binary update.

**SET-048 — driver PR ordinary CI is not green (2026-09-08):**
Read-only inspection of driver PR #2 at `05624b9bc` found failed contract,
generated-binding, release-metadata and documentation jobs. Logs are retained
locally under `work/driver-*-ci-failures.log`. Contract fixtures still expect
the upstream `cua-driver` CLI/MCP name, and the exact MCP tool roster omits
`browser_key` and `close_window`. Python UniFFI generated files are stale.
Release validation cannot parse the fork's rewritten Windows installer.
The documentation job fails to link duplicate `CoreMediaBridge` Swift symbols
from apple_cf and screencapturekit. These checks/fixtures and installer were
unchanged by the current three-file app-path PR. They remain fork maintenance
and release blockers; successful local focused checks do not override them.

Driver repair commit `33283a34c` explicitly adapts the two fork identity fields,
adds the missing tools and output-schema counts, and updates ScreenCaptureKit
to the published 8.0.1 Swift module-namespace fix. Local build succeeded in
20.84 seconds without duplicate Swift symbols. Four protocol checks passed in
0.86 seconds using the signed 05624b9bc candidate for daemon fixtures; the
installed candidate was not replaced. Exact metadata matched 58 tools / 34
output schemas. Two unbundled startup attempts failed before a socket appeared;
the canonical signed path worked. All test daemons exited, original driver
preserved, no model spend. `evals/runs/driver-ci-repair-1` records evidence and
these scope limits. Release/docs/contract CI is running on the new commit;
generated bindings, installer release checks and real GUI acceptance remain
pending. Do not treat the older signed candidate's protocol result as capture
or recording acceptance for the upgraded dependency.

The 33283a34c CI run completed with all Linux/macOS/Windows portable protocol
jobs and pinned-client MCP discovery passing. The macOS release link passed in
6m 10s, then reference documentation drift failed its job. Generated UniFFI
bindings remained stale. Follow-up e288372f7 regenerates CLI/MCP reference docs,
lets explicit prebuilt binaries avoid an unrelated docs rebuild, and explicitly
selects source-build metadata validation while retaining historical baked-release
checks as a separate mode. Fourteen version/stamping tests (including source
package-drift rejection), five generator tests and the real-binary docs drift
check passed locally. CI retains generated binding candidates and checkout
commit provenance while still failing on any generated-file drift. Artifact
review/application and remaining legacy installer-wiring tests are pending.
No model or GUI evaluation ran; no task-success score is inferred from these
protocol/build checks. The signed candidate and original driver are unchanged.

**SET-049 — timeout recovery advice contradicted the evaluator state (2026-09-08):**
A strict REPL timeout permanently prevents further cells in that evaluator, but
the tool response said earlier bindings remained available and encouraged retries.
AsyncReplError now exposes evaluatorUsable; the tool reports that a timed-out
session cannot accept more cells. This does not reset, recover, or cancel the
underlying driver operation. In-flight bridge traces now remain pending with no
invented duration until dispatch finishes, and returned traces are snapshots.
Native Codex context compaction and uncapped task duration/call count are unchanged.

Two real evaluator Vitest scenarios passed: ordinary errors preserve bindings;
timeouts reject subsequent cells. SDK build and E2E type checking passed.
The default 60-second public tool-wrapper diagnostic in
`evals/runs/repl-timeout-experience-1` passed its timeout-message and next-cell
assertions after 60,004 ms, with no model, GUI apps, or driver actions. Its teardown
failed trying to close an owned session against an unavailable desktop helper;
the process exited and the parent removed the temporary directory. This is a
partial diagnostic success with a recorded teardown failure, not a clean GUI run.
Delayed real-driver trace acceptance and long-action recovery remain pending.

**SET-050 — generated SDK close-window bindings lagged the driver (2026-09-08):**

CI on e288372f7 passed generated documentation, source release metadata, all
three portable protocol jobs, and pinned-client discovery. Generated bindings
were still stale. Reviewed artifact 10046235837 from run 34201382166, verified
archive SHA-256 b1914915ecb4ed08dd9c25f72bfc003e878506580a2fc6a58f19d5819c5a3bc5,
and confirmed checkout 6fb5f2625505a9c8ec74ab5d9013f32eccd650be has the same
source tree as e288372f7 (80f1188cc865395b9d496efc77101a998bb6e711). Applied only
owned generated files: Python and TypeScript close_window bindings/checksums.
Handwritten node-runtime.ts was not copied. Python syntax passed; regeneration,
TypeScript/native SDK execution and freshness acceptance await the next CI run.

Four installer guidance checks now assert OpenSky's actual identity, home, SDK
link and doctor command; all four pass. The Linux missing-daemon test now expects
the OpenSky name while retaining the failure requirement. A real compiled CLI
probe against an absent private socket returned the required failure and exact
message; its process exited and temporary directory was removed. No GUI apps
opened and no model calls occurred. Remaining installer/channel/telemetry wiring
failures and Windows history-uninstall validation are unresolved; do not remove
meaningful lifecycle or privacy checks simply because a wrapper changed.

Evidence: `evals/runs/driver-ci-repair-1/uniffi-artifact-review.json` and
`missing-daemon-probe.json`. These are build/protocol checks, not task parity
or native window-closing acceptance.

**SET-051 — Windows source uninstall discarded encrypted history (2026-09-08):**
The Windows source uninstaller deleted its whole runtime directory, including
Computer History, while the retained upstream purge contract was tested against
the new delegating wrapper. The implementation now preserves history by default
and forwards explicit -Purge to the exact installed native helper before runtime
removal. Missing/failed helpers abort; shell cleanup never recursively removes
the history subtree. Windows CI will check parsing, ordering/refusal behavior
and public ValidateOnly preserve/purge modes. Full lifecycle acceptance remains
pending; no uninstaller was run on the user's Mac.

Seven legacy download-specific checks were explicitly retargeted to the retained
upstream downloader; their substantive assertions remain. Both affected Python
modules passed 55 tests in 0.16 s. These are historical wiring checks, not source
installation acceptance. Public Unix installer help passed without installation.
A broader local run initially stopped at collection because isolated test Python
lacked jsonschema; this is an environment error, not a product failure.

A prompt:false permission recheck at the exact signed candidate path returned
Accessibility=false and Screen Recording=false. Candidate PID 96454 exited after
explicit-socket stop, its socket was removed, and no GUI test app opened. No
permissions were requested and no model spend was added. Evidence is retained in
`evals/runs/candidate-permission-recheck-1`. The candidate GUI gate is still closed.

After installing the CI-declared jsonschema/toml dependencies in the isolated
driver test environment, the full script suite passed 248 tests and 21 subtests
in 3.96 s. Workflow YAML parsed. Windows PowerShell execution remains assigned
to CI; these local results do not prove Windows uninstall behavior.

**SET-052 — fake Python daemons rejected the real SDK contract (2026-09-08):**
CI cc1140127 passed generated binding freshness, Rust SDK/contract tests,
packaging helpers and external C ABI validation. The Python loader ran four
tests in 0.440 s with two errors: fake daemons advertised contract 0.7.0, which
the actual SDK correctly rejected against 0.7.0-opensky.1. Their unfinished
fixture thread/child prevented process exit until the 15-minute job limit
canceled the run; the runner reaped an orphan Python process. It is not an
accepted SDK run, and increasing time alone would not repair those failures.

Replaced the two fabricated socket/process backends with the real built driver.
Fixture-owned EmbeddedCuaDriverHost startup/cleanup now supports actual metadata,
tool discovery, typed session start/state/end and host/client shutdown scenarios.
The existing in-process runtime scenario also registers cleanup before assertions.
No captured internal request assertions or fabricated action results remain in
this loader file. Python exports now include all three close-window contract
types. CI explicitly builds the real executable and allows 30 minutes for the
combined native build/test job; this is independent of uncapped agent runs.
Python syntax and workflow YAML passed. Real loader execution on this candidate
is pending CI, as are TypeScript native SDK tests and Windows uninstall execution.


**SET-053 — native document fixture ownership and stale app discovery (2026-09-08):**
The first Unicode selection retry prelaunched TextEdit and then called SDK
open_target, which intentionally creates another macOS app instance. This was
fixture composition error. Neither the failed editor lookup nor its cleanup
failure is selection acceptance. After bounded ownership verification, both
owned processes exited and the unchanged temporary document was removed.
Native reference inspection during recovery returned after roughly five hours;
the cause of that delay is unknown. Recovery used the bounded lifecycle helper.
Evidence: native-selection-unicode-1, including recovery-cleanup.json.

The fixture now opens its document in one Launch Services operation and attaches
the SDK without auto-launch. Retry 2 was blocked by a locked desktop before any
app launch; scratch cleanup passed. Retry 3 opened visible TextEdit PID 48904,
but the public SDK selected PID 58643. After cleanup, the original daemon still
listed 58643 as running while ps confirmed it absent. Both driver permissions
were true. Selection was never attempted. Owned app exit and file removal passed.
Evidence: native-selection-unicode-2 and native-selection-unicode-3, including
sdk-initial.txt, fixture-readiness.json and driver-textedit-after-cleanup.json.

The no-overlay daemon joined its server thread instead of running AppKit's main
loop; NSWorkspace application properties stopped refreshing. A bare CFRunLoop
repair failed the live launch probe (native-app-discovery-1); no UI/process/file
was left behind. Sharing the existing accessory NSApplication loop with the
no-overlay mode passed real public-SDK discovery after launch and after quit
(native-app-discovery-2). This creates no overlay or Dock icon. It is a macOS
repair; no new Windows/Linux behavior is claimed.

Permanent Vitest APP-N01/02 then passed (16.29 s) against a temporary signed
build of driver fa11d162c plus the main-loop diff. The same daemon served all
observations. Fixtures launch/quit a real TextEdit document; assertions use only
public SDK isRunning outcomes. Inventory does not need AX/screen grants; this
fixture verifies exact daemon identity without requesting or requiring those
grants. Input/capture evaluation gates still require both by default. The
explicit requiredPermissions field distinguishes these evidence scopes.
All owned apps, scratch documents, private daemon/socket and temporary bundle
were cleaned up. Evidence: native-app-discovery-e2e-1. SDK E2E typecheck passed.
The final save diagnostic now preserves refusal evidence without masking the
original test error; independent process-exit proof still controls file removal.
Unicode selection and final candidate GUI acceptance remain pending. No model
calls or model spending occurred in these attempts.

**SET-054 — real SDK CI completed; Hermes rename fixture repaired (2026-09-08):**
Driver fa11d162c CI 34205193943 passed all portable contract jobs, pinned MCP
discovery, generated binding freshness, Rust SDK, external C ABI, real Python
loader, TypeScript native SDK and packaging checks. Windows unit CI 34205193777
passed, including uninstall parsing/order and public ValidateOnly preserve/purge
checks. These supersede the pending execution statements in SET-051/052, but do
not establish GUI parity or complete Windows uninstall/reinstall acceptance.

Linux 34205193892 and Nix 34205193824 failed because the Hermes CLI fixture
still staged and expected skills/cua-driver after the public skill became
opensky-driver. Corrected those two fixture paths; preserved CUA_DRIVER_RS_HOME,
which the implementation still uses. The real CLI test passed locally (one test,
0.72 s after compilation). No desktop apps or model calls were involved.
The next CI candidate must verify the full Linux/Nix jobs.


**SET-055 — Unicode selection overshot the requested text (2026-09-08):**
To isolate SDK behavior without another permission grant, started a private
instance of the unchanged, already-authorized aa31c70ee driver with its default
AppKit event loop/overlay enabled. The original daemon remained untouched.
Retry 4 observed the correct TextEdit AXTextArea, but nativeEditorIndex rejected
the SDK's leading bullet. Accept both current bullet and legacy plain index
lines. This was a fixture parser error, not a selection failure.

Retry 5 then executed selection and saved `two nechosen` instead of
`two chosen.` followed by the original newline. The SDK converted UTF-16 offsets
directly into Right-arrow presses, overshooting by two positions after two
emoji. On macOS, translate the match boundaries into composed-character steps
using Intl.Segmenter. Refuse a match splitting a grapheme before sending input.
Windows/Linux cursor logic remains unchanged; no native behavior there is
inferred from this macOS result.

Retry 6 passed the exact real saved-file assertion in 47.58 s. The same original
driver and document input were used before/after the SDK change. All test app,
file, private daemon and socket cleanup passed. Evidence:
`evals/runs/native-selection-unicode-4`, `-5`, and `-6`. This proves this emoji
selection example; it does not certify every macOS control or the latest driver
candidate, whose signing identity still lacks TCC grants. Atomic native range
selection and its latency are still open: this correct short edit remains slow.
The first broad SDK regression attempt was blocked by sandbox EPERM binding the
existing local REPL test server; the authorized rerun is recorded separately.
No model calls or spending occurred.

**SET-056 — historical campaign failures obscured the stop reasons (2026-09-08):**
The status canvas kept showing generic Failed labels for the old bounded profile.
The audited partial campaign contains ten valid task pairs: 14 of their 20 arms
hit the old deadline/call budget; six finished but failed saved-file checks.
Nine tasks were not run and one pair is excluded for setup/policy problems.
The canvas now labels old-limit cutoffs distinctly and calls the table historical
and partial. Original scores remain unchanged: a cutoff with a failed saved-file
check still failed under that old profile. No uncapped campaign or new agent
success is inferred from today’s SDK/driver regressions. This is presentation
clarification backed by the summary and audit, not a score reclassification.


SET-055 validation completion: cursor-before and cursor-after each passed their
real saved-file assertion (40.00 s and 47.24 s; 87.48 s suite total). Evidence:
`evals/runs/native-selection-cursor-1`. Both exact owned TextEdit processes quit
cooperatively, scratch files were removed, and the private daemon/socket exited.
The authorized broad SDK suite passed 339/339 tests in 10.20 s; these existing
unit/contract checks are separate from the three real saved-file cases.
SDK build passed. No agent evaluation was dispatched and the spending limit
remains $50: the user's status question did not approve an increase.

SET-054 CI follow-up: ac1352062 passed Linux unit (34236425365), Windows unit
(34236425453), full contract/native SDK (34236425419), scripts, docs, formatting
and release metadata jobs. Nix 34236425382 was still running at this update.
The draft PR remains unready pending the canonical desktop matrix and other
explicit native acceptance gaps.


**SET-057 — Impress raw-reference grading rejects neutral LibreOffice exports (2026-09-08):**
A closer audit of the six historical attempts without a recorded task-level
cutoff found four agent-reported blockers and two claimed completions. Thus
SET-056's "six completed-but-incorrect" wording was too broad. One of those four
stopped at exactly 20 calls citing the limit, although no denied call was logged;
another OpenSky evaluator became unusable after a per-cell timeout. The raw
summary records are unchanged. Reports alone are not proof of tool root causes.

Both claimed Impress completions first failed upstream slides.py line 294,
where a raw background representation difference returns zero. The saved image
was moved from x=628560 to x=6028560, above the task's x=4320000 threshold, and
slide text was unchanged. The duplicated-slide artifact independently had the
wrong text on slide 25, so it remains a task failure regardless of background.
Read-only evidence: `evals/runs/historical-failure-audit-1`.

A production LibreOffice 26.8.0.3 headless no-edit export scored zero under the
neutral comparison while the source compared with itself scored one. No task
input or GUI action was used. This establishes export sensitivity, not proof
that every detected representation change is visually irrelevant. The raw image
attempt also differed in inherited alignment representation; simply disabling
background checks still failed and was not adopted.

Added `audit_impress_export.py` to reproduce this before future campaigns.
It verifies pinned sources, exports only reference/input copies with disposable
profiles, records the exporter identity and file hashes, and applies the same
original grader options to both raw and exported references. The agent artifact
is read-only and hash-checked. `score_extended` accepts an explicit alternate
reference root for this diagnostic; normal campaign scoring still uses original
references. Neither historical scores nor the primary campaign metric changed.

The image audit rejects an unchanged image under both reference forms. The
saved moved image passes against the exported reference with all task checks
retained, while its raw upstream score remains zero. The slide-order audit still
rejects the incorrectly duplicated presentation and the unchanged input. Every
headless exporter exited, and temporary profiles were removed. Evidence:
`impress-reference-port-image-1` and `impress-reference-port-slides-1`.
These diagnostics are not a fresh agent campaign or full reference-port
certification. Before adopting exported references, validate every affected task
and preservation guard, pin the generated reference set plus exporter identity
in the campaign plan/fingerprint, and report raw and adapted outcomes separately.
No GUI apps were opened and no model spend occurred.

SET-057 validation: the unchanged primary scorer passed all 47 existing Writer
and expanded saved-file regressions in 22.96 s. These fixture-artifact checks are
separate from the real LibreOffice export diagnostics. Driver Nix 34236425382
completed successfully on ac1352062; all ordinary PR CI gates now pass. This
does not replace the canonical native desktop matrix or close the grading port.

**SET-058 — Exported references alone reject a task-preserving slide duplication (2026-09-08):**
Added real saved-file grader acceptance controls for all five Impress tasks:
completed examples independently built from the pinned inputs, unchanged inputs,
incorrect edits, unrelated text damage and unrelated background-color damage.
Every specimen is exported by production LibreOffice using a disposable profile.
These are grader tests, not GUI or agent acceptance evidence.

The first run passed table-heading and font-size controls. Two fixtures assumed
slide 1 contained text and failed during setup; they now locate existing text
across the deck. Their corrected green-background and image-placement controls
passed. Duplicate-slide completion reached grading but failed because the gold
deck introduces extra empty text shapes on slides 5 and 7 and removes a newline
on slide 21. The independently constructed completion preserves the input there.
Thus normalizing both references and outputs through the same exporter does not
make this gold reference consistent with the requested task.

The explicit diagnostic policy `task-preserving-export-v1` derives only this
task's reference from the original pinned input plus copies of its final two
slides, in A,B order. It retains all upstream comparison options. Its reference
builder uses presentation parts; the independent completion fixture copies ZIP
package parts and relationships. The remaining four tasks use exported upstream
references. Audit receipts name the policy and record input, derived reference,
exported file and exporter hashes. Default audit policy and campaign scoring
continue to use upstream references; historical results are not rewritten.

Evidence: `evals/runs/impress-export-controls-1` (initial failures),
`impress-export-controls-2` (corrected two fixtures),
`impress-export-controls-3` (duplicate reference adaptation), and
`impress-export-controls-4` (combined controls and existing grader regression run).
See `docs/impress-grading-validation.md` for invocation and scope. Admission still
requires a frozen reference set and explicit campaign profile integration. The
upstream exact-green requirement and incomplete visual-preservation coverage
remain limitations; no benchmark success or model spending is claimed here.

SET-058 validation: the combined run passed 52/52 tests in 83.09 seconds: five
real-export acceptance cases and all 47 existing saved-file regressions. Each
Impress case accepted its independently constructed completion and rejected all
four negative controls (unchanged, incorrect, text damage, formatting damage).
All 32 exporter receipts verify process-group exit and temporary-profile removal.
E2E TypeScript checks and diff whitespace checks passed. No GUI windows or agent
model calls were used. Campaign profile integration remains pending.

**SET-059 — Campaign admission did not bind validated grading references (2026-09-08):**
The SET-058 controls demonstrated success/failure discrimination, but the
controller still dispatched using raw references and had no explicit scoring
identity across arms or ramp stages. Added profile preparation that regrades
all 25 control files, checks their source/export hashes and cleanup receipts,
verifies original asset pins, and freezes the seven Impress reference files,
grader sources, task definitions and production LibreOffice identity.

New campaigns require `OPENSKY_EVAL_SCORING_PROFILE`. They retain their own
reference copies, write policy/profile/reference hashes into the plan and
environment records, reverify before each arm, and pass the admitted digest to
the runner. The runner checks before app setup or model dispatch; the read-only
scorer checks again after completion. Reference/exporter/source changes refuse
admission or invalidate scoring instead of becoming task failures. Prior ramp
stages must use the same scoring and task-limit profiles. Original and adapted
arm outcomes and aggregate raw counts are separately retained. Scoring without
a profile and historical result files are unchanged.

Validation: `scoring-profile-2/profile.json` froze all 25 controls with profile
digest `916e5d6bf07648a43a6d5cb2f3db29c3ab284caeda79a3918a924c649d95663c`.
Twelve real saved-file/profile/controller acceptance cases plus 47 existing
grader and nine admission checks passed, 68/68 in 30.79 seconds. Refusal cases
cover changed/missing/incomplete references, mismatched source pins/exporter,
and post-admission profile changes. The controller refused before creating a
campaign; retained campaign copies survived preparation-file changes. The
read-only scorer reported raw image failure and adapted success without changing
the specimen, and preserved Writer scoring. E2E and explicit controller/runner
TypeScript checks passed. Evidence logs accompany the frozen profile directory.

No model dispatch or GUI launch occurred, and test scratch directories were
removed. This closes the grading configuration gap, not native GUI acceptance
or the new smoke baseline. Pending candidate driver acceptance and the next
spending authorization remain separate requirements.

**SET-060 — Exact candidate staged; macOS permission and spending gates remain (2026-09-08):**
With frozen scoring profile 916e5d6b, the first smoke task's real LibreOffice
setup passed. The expected document became visible, before/after desktop checks
passed, the owned app quit cooperatively and all fixture scratch files were
removed. `validEvaluation:false` is intentional for the setup-only backend; no
model was dispatched or task score produced. Evidence:
`evals/runs/frozen-scoring-setup-1`.

The previously staged candidate and cached debug binary reported `source:null`.
Built the clean driver commit ac13520622d2cb346a0f03c53b73a87980fe6661 with its
source SHA embedded, then staged it at the existing `outputs/OpenSkyDriver.app`
workspace path. The first build was refused by the filesystem sandbox at Swift's
normal compiler cache; the authorized retry completed in 17.54 seconds. No source
change was required. Stable certificate leaf DA664D710A80BF1B995AA4575B7163C9A73C23CB
and the entire designated requirement match the previous staged bundle exactly.
Strict signature verification passed. Binary SHA-256 is
`00e9b7d11b2701c1f6c73af92b3abc95cce5fdab3853dabed49ba80de2963ba4`.
Staging copies were removed and the original permissioned driver was unchanged.
Evidence: `evals/runs/driver-candidate-ac135-staged-1`.

Both public SDK launch/quit discovery tests passed against this exact stamped
candidate in 16.18 seconds. Owned TextEdit fixtures, private daemon and socket
were cleaned up. This verifies inventory freshness, not Accessibility input or
screen capture. A no-prompt permission query attributed to the candidate daemon
still returned Accessibility false and Screen Recording false. No permission
prompt or TCC modification was performed. Evidence:
`evals/runs/native-app-discovery-e2e-2`.

The spending ledger remains at $45.3877028 conservative accounting, zero reserved,
and $50 approved. No new agent run can reserve its required $5. Resuming matched
Terra smoke runs requires the next spending approval and GUI permissions for
the stable-signed candidate. These are user gates, not failed benchmark tasks.

**SET-061 — Fresh macOS results and remote Linux priority (2026-09-08):**
The user approved the next cumulative spending checkpoint at $100 and granted
the exact signed ac1352062 candidate both GUI permissions. Frozen smoke profile
916e5d6b completed two valid pairs: native 2/2 and OpenSky 1/2. The heading failure
left a Word-format confirmation visible; the saved DOCX lacked the requested
alignment despite the agent claiming completion. This is an actual saved-file
failure, not a repaired or inferred pass. Modal observation/input correlation
requires investigation. Evidence: `evals/runs/campaign-frozen-smoke-1`.

The five-task stage completed three valid pairs (native 2/3; OpenSky 1/3): both
passed lowercase, native alone passed heading alignment, and both failed the
third formatting task. Task four stopped before model dispatch because the
private driver was no longer running. Its missing environment fingerprint is
an infrastructure exclusion, not task failure. All six owned app fixtures and
documents were cleaned up. The private daemon had exited but left a stale socket;
a recovery check verified connection refusal and removed only that socket.
Evidence: `evals/runs/campaign-frozen-five-1` and its `-owner` cleanup receipts.

The user now prioritizes Linux on remote machines. GitHub SDK experience tests
pin the current driver ac1352062 and default to two existing real workflows:
Unicode observation and clicking through to a late page result. Explicit five
and full experience stages remain available; these are SDK behavior checks,
not the 20-task agent campaign. No model key is exposed to these jobs. A separate
job inspects the official Linux desktop distribution for the genuine native
runtime and attempts public screenshot capture if present. Its output is an
availability check, never a parity score. Native runtime availability, Linux
OSWorld setup/reset/scoring, and matched Terra runs remain unverified. The
download is hashed for provenance; matched campaigns must pin the artifact
before use. No Linux acceptance is claimed until CI evidence is reviewed.

**SET-062 — First remote Linux smoke isolates startup and probe issues (2026-09-08):**
GitHub run 34268803939 built the stamped ac1352062 Linux driver. FRESH-B01
passed in 11.91 seconds, with a real Chrome click and first post-completion
observation. TEXT-B01 failed during browser creation in 21.95 seconds, before
the Unicode assertion; it is not evidence of corrupt text. The typed browser
route failure was being swallowed and followed by an unrelated native launch,
ending in `Failed to open target`. Preserve `browser_route_unavailable` errors
after exact-session cleanup instead of attempting that fallback. The underlying
startup cause still needs a real rerun. Evidence: `evals/runs/linux-sdk-smoke-1`.

The official Linux package (26.901.51231, SHA-256
62580188d87c3d3a9369dab7c73b42a8a32518d4df8a2d5bae6466ddeac5c05e)
does ship `@oai/sky` and its Linux binary. The availability probe incorrectly
counted CLI aliases and the adjacent CUA package as independent candidates;
select the binary owned by the discovered `@oai/sky` package. Public screenshot
capture remains pending. Evidence: `evals/runs/linux-native-availability-1`.

Companion harness CI exposed inconsistent inferred success/error metadata in
the REPL adapter: successful results omitted `evaluatorUsable`, narrowing the
generic result type. Success now explicitly reports that the evaluator remains
usable. Local E2E and harness TypeScript checks and six existing REPL tests
passed. These corrections do not award any new GUI or agent success. No model
spend occurred; the experience ramp remains at two cases.

**SET-063 — Native Linux capture and two SDK workflows pass; document gate added (2026-09-08):**
GitHub run 34269423873 passed native screenshot capture using the official
package's `@oai/sky` 0.6.26 Linux runtime, both SDK smoke cases (TEXT-B01 and
FRESH-B01), and its driver build. Companion harness CI 34269423896 passed.
This verifies remote availability and two SDK experiences, not agent parity.
The first browser-startup failure remains recorded; a passing rerun does not
prove its underlying cause is repaired. Only error propagation was changed.

Added a paired deterministic LibreOffice heading/save check using the existing
OSWorld document and read-only saved-file grader. Both interfaces receive the
same public keyboard actions and observations, with no mock or output repair.
The fixture requires a disposable GitHub Linux desktop, verifies the visible
window belongs to its newly created process group, and retains screenshots,
saved output and cleanup receipts. Local typecheck and shell syntax validation
pass; real document acceptance is pending remote execution. Linux-first scope
is recorded in `docs/linux-parity-plan.md`; macOS GUI work is deferred by user
direction. Model spending remains unchanged.

**SET-064 — Native Linux document input passes; OpenSky discovery blocks the same task (2026-09-08):**
Run 34270522761 completed the native heading/save check in 4.29 seconds. The
saved DOCX passed the independent existing scorer. OpenSky failed before editing
with `Application "LibreOffice" is not running`, although setup had verified a
visible document window owned by its fresh process group. Both fixtures verified
process exit and removed their temporary files. Evidence:
`evals/runs/linux-office-smoke-1`. This is deterministic input/scoring evidence,
not an agent parity score. FRESH-B01 passed; TEXT-B01 remained in CI dependency
installation when this entry was written.

Linux driver discovery currently joins desktop launchers and running processes
by executable basename; SDK resolution prefers an exact installed app name even
if that entry is not running. The actual LibreOffice inventory is needed to
distinguish these layers. The fixture now retains public `list_apps()` output,
owned-window identity, process command and installed launcher metadata before
binding. It makes no fallback selection or output repair. Remote diagnostic
execution is pending; local E2E TypeScript and shell syntax checks passed.

The real native Linux API uses full-desktop screenshots and coordinate/key
input, unlike its macOS app-scoped interface. Added an explicitly isolated Linux
policy and API guide for the pending agent runner. The existing 19 policy checks
and three Linux policy checks pass. Ordinary app scopes retain their previous
restrictions. The new scope is not yet wired to an agent dispatch: disposable
desktop verification, runtime fingerprinting, remote spending reservations and
matched Terra runs remain required. The official-package probe now records its
Codex/Node REPL executable paths to support that work without guessing paths.

**SET-065 — Verified Linux launcher/process mismatch and exact-runtime preflight (2026-09-08):**
Runs 34270522761 and 34271818879 both finished with two passing browser SDK
smokes, a passing native document check and an OpenSky discovery failure.
The latter run captured `libreoffice-startcenter` and `libreoffice-writer`
as not running, while the visible owned window belonged to `soffice.bin` and
reported WM_CLASS `libreoffice`, `libreoffice-writer`. The installed Writer
launcher declares `StartupWMClass=libreoffice-writer` and `Exec=libreoffice --writer`.
Evidence: `evals/runs/linux-office-smoke-2`; both app groups exited and temporary
files were removed. These results remain deterministic, not agent parity.

Driver c2705becf associates window classes/app IDs with installed launchers
before executable-basename fallback. A bare suite launcher with the exact same
launcher executable also maps to the component's process; other components and
different installation paths are not inferred as running. No fixture selector
or document outcome was changed. The Linux adapter supplies X11 WM_CLASS and
Wayland app IDs through its existing dispatch; Wayland runtime verification is
still outstanding. Focused matching/parser checks and the same public document
test will run remotely against the pinned candidate; only formatting has been
validated locally for this Linux-only Rust code.

The official Linux probe confirmed both `resources/codex` and
`resources/cua_node/bin/node_repl`. Environment recording now supports Linux OS,
LibreOffice binary, configurable Codex executable and native Linux binary hashes.
Linux daemon verification binds the private listening socket inode to the owned
process, checks its executable/start time, compares its reported source revision,
and requires X11 plus a working accessibility bus. The office CI fixture now runs
these actual preflights before input. Local E2E/harness TypeScript and shell
checks pass; remote acceptance is pending. Linux editor fingerprints explicitly
remain unsupported. No agent dispatch or new model spend occurred.

**SET-066 — Linux discovery repair passes saved-file task; native smoke raced UI readiness (2026-09-08):**
Run 34272626520 compiled driver c2705becf and passed its two focused window
association checks plus the desktop parser check. Both browser SDK smokes passed.
OpenSky now lists LibreOffice and Writer as running and completed the unchanged
heading/save test in 31.86 seconds. The independently scored saved document
passed and cleanup verified process exit and temporary removal. Exact Linux
daemon identity/permissions and environment recording also passed for both arms:
Ubuntu 24.04.4, LibreOffice 24.2.7.2, packaged Codex CLI 0.153.4. Evidence:
`evals/runs/linux-office-smoke-3`. This verifies the discovery fix on X11;
Wayland and full canonical desktop certification remain pending.

Native input failed this run after passing the same deterministic task twice.
The first screenshot lacked the editor menu/toolbar; the screenshot after the
save shortcut was identical, and after Return the format dialog was still only
partly painted. The saved result failed. The fixture's visible-window check did
not establish editor readiness, and the test pressed Return without checking
that the format confirmation was usable. Both fixture groups were cleaned.
No agent scores are inferred from these deterministic attempts.

The fixture now waits for editor menu text in screenshots from the assigned
public interface. After save, the test explicitly waits for the visible
`Use Word 2007 Format` control before Return. Tesseract supplies only assertions
over those same pixels; it does not inspect or modify the document or issue
actions. Local OCR of retained screenshots accepts the ready OpenSky editor and
dialog and rejects the native partial frames; this is assertion validation,
not a fresh desktop pass. Both real arms must rerun with this readiness change.

Added a no-model native MCP transport probe: initialize the official Node REPL,
import its trusted Sky service, and verify a screenshot reaches the tool result.
The configured trusted service follows the installed package's actual Sky
proxy, which requires `nodeRepl.rpc`. This is separate from direct module
capture and cannot be reported as an agent task. TypeScript validation passes;
real Linux transport acceptance is pending. Model spending is unchanged.

**SET-067 — Agent transport needs the virtual display's existing authentication (2026-09-08):**
Run 34273607129 passed both browser smokes and the native direct-capture probe.
Both office jobs stopped before launching a document because the actual native
Node REPL's screenshot call could not connect to X11. Its returned error
identified `DISPLAY=:100` and `XAUTHORITY not set`. REPL initialization, tool
discovery and Sky import succeeded, but the environment allowlist omitted the
Xvfb cookie-file path. The explicit native configuration now forwards XAUTHORITY
alongside DISPLAY and the session bus. No new user permission or alternate
backend is involved. Evidence: `evals/runs/linux-office-smoke-4`. Real transport
and readiness acceptance still require the next run; these are not task failures.

Remote API dispatch preparation now requires an existing controller reservation
and a disposable CI run, while retaining subscription authentication by default.
A worker can claim a reservation once without increasing available spending.
Seven real budget-ledger checks pass, including unknown/settled/reused claim
rejection; E2E/harness TypeScript checks pass. No API worker has been dispatched.
The remote envelope replay guard, controller reconciliation and agent task
runner must be completed before using this authentication mode.

**SET-068 — Linux document and native agent transport gates pass; remote agent worker added (2026-09-08):**
Run 34274308972 passed both heading/save checks with screenshot readiness:
native 11.46 seconds, OpenSky 36.03 seconds. Both retained passing saved-file
results and verified app exit and temporary removal. The actual native Node
REPL returned a JPEG through its Sky service on both jobs; both browser smokes
also passed. Evidence: `evals/runs/linux-office-smoke-5`. This completes the
initial deterministic gate, not the paired agent metric.

Added a Linux office agent worker using matched Terra/medium Codex runs and
the real native/OpenSky REPL transports. It launches an owned process group,
checks visible editor controls, scores only the agent-saved file and records
cleanup. The workflow defaults to a no-model setup check. Agent mode requires
an existing cumulative reservation bound to its source SHA; concurrency and
GitHub run history reject repeated dispatches, and rerun attempts are rejected.
Authentication lives only in the disposable runtime directory. The native
package digest and the exact driver artifact from the passing gate are pinned.
Local TypeScript and shell checks pass; the new worker's setup/cleanup must
pass remotely before model dispatch. Linux editor support and the later full
suite remain unfinished; no scope has been removed from the goal.

**SET-069 — Native agent stopped at the CLI's outer tool approval (2026-09-08):**
The first paid Linux arm, run 34276032479 at c5f3182, completed its worker and
cleanup but could not execute its first screenshot. The CLI requested
`Allow the desktop MCP server to run tool "js"?` with the exact active,
policy-admitted screenshot program. The handler recognized the equivalent
OpenSky `cua_repl` prompt and native app-level prompts, but omitted this outer
native tool prompt. It now applies the same active-call/code/scope checks to
both selected REPL tools. One-request approval is retained; unrelated programs
are not admitted. This is an evaluator failure, excluded from task scores.
Evidence: `evals/runs/campaign-linux-smoke-1/01-heading-native/linux-office`.
No final post-interruption usage update arrived, so the terminal run consumes
its full $5 reservation conservatively. The budget API records that explicitly
without fabricating token usage. Validation: all eight focused ledger tests and E2E typecheck
pass; a new real native run is next. No paired agent score exists yet.

**SET-070 — Rendering waits were incorrectly rejected after a correct save (2026-09-08):**
Native retry 34276690212 centered and saved the heading; the read-only scorer
passed heading alignment, preserved text and file format. The next agent cell
included `await new Promise(resolve => setTimeout(resolve, 700))`. The policy
rejected all Promise construction and interrupted the turn, so this attempt
remains not scored. Cleanup passed. Evidence:
`evals/runs/campaign-linux-smoke-1/02-heading-native/linux-office`.
Both backends now admit an inert timer callback with a literal delay up to one
minute. Callback code execution and shadowing timer/Promise globals remain
rejected. This is a per-wait syntax allowance, not a whole-task deadline or
call budget. All 23 policy checks and E2E typecheck pass. Real native retry validation
is next; the interrupted attempt is conservatively charged its full $5 reservation.

**EVAL-L01 — First valid paired Linux task and measured latency gap (2026-09-08):**
At c26ec3aa680486c60147aa53d79b9e068750aa0d, the heading task passed for
native (run 34277243178, 14.705 s, 4 tool calls) and OpenSky (34277549530,
92.365 s, 7 calls). Both saved files passed the upstream outcome plus preserved
text/format checks; both app groups exited and temporary files were removed.
The SDK/assets, driver, native reference, Codex, LibreOffice, OS and architecture
fingerprints match. Evidence: `evals/runs/campaign-linux-smoke-1/heading-pair.json`
and the corresponding `03-heading-native` / `04-heading-opensky` directories.
The lowercase pair also passed: native (34278070435, 40.834 s, 10 calls) and
OpenSky (34278688124, 240.536 s, 18 calls). That pair differs in Ubuntu
point-release labels (24.04.4 / 24.04.5), with matching kernel, application and
evaluation runtime fingerprints; see `lowercase-pair.json`. This proves two
paired tasks, not general parity. The five-task ramp is underway.

OpenSky spent 69.750 s inside its seven MCP calls versus native's 1.361 s in
four calls. Most long calls include app-state and screenshot retrieval; one
save-dialog element click returned a stale-token error and the agent recovered.
The SDK's screenshot-only facade currently takes the same state observation
route. These are diagnostic leads, not yet attributed driver fixes. Retain the
baseline while completing the five-task campaign, then benchmark the
observation path and reproduce token invalidation before changing behavior.

**EVAL-L02 — Native font task completed but changed only one word (2026-09-08):**
Native run 34279810215 completed normally at c26ec3a (43.853 s, 9 calls,
$0.3193536 estimated usage); cleanup and preserved text passed. The saved
DOCX fails both upstream font checking and the all-text guard. Inspection of
its XML confirms only "popularity" has an explicit Times New Roman font;
other text inherits different fonts. Screenshots show the agent dismissed
the document selection before applying the character dialog to that word.
This is an observed task failure, not an interrupted harness attempt. The
dialog also reports Times New Roman is not installed on the hosted image,
so font rendering is substituted; both paired arms use that same environment.
Evidence: `evals/runs/campaign-linux-smoke-1/07-font-native/linux-office`.
OpenSky run 34280504883 was interrupted by the evaluator (SET-071). No scorer
or task prompt was changed in response to this result.

**SET-071 — Extra getApp options interrupted recovery (2026-09-08):**
OpenSky font run 34280504883 stopped after 104.670 s / 11 calls because
`app = await cua.getApp("LibreOffice", {delivery_mode:"foreground"})` was
rejected by the evaluator's one-argument-only getApp rule. Rebinding itself
was already supported. Allow one ordinary object argument after the exact
authorized literal selector; the real SDK decides how to handle it. Executable
options, prototype keys and other app selectors remain rejected. This changes
only evaluator admission, not SDK delivery behavior or scoring. The run is
excluded and its full $5 reservation is charged conservatively because the
interrupted turn has no complete usage receipt. Cleanup passed. Evidence:
`evals/runs/campaign-linux-smoke-1/08-font-opensky/linux-office`.

The trace separately exposes a product gap: OpenSky's public `typeText` on the
font field reaches the driver's background-only default, which rejects XTest
input and suggests `delivery_mode:"foreground"`. The facade exposes no such
option, so following that suggestion cannot recover. This needs a public-SDK
input fix and real Linux verification; do not count the policy change as that
fix. Keep the SDK/driver candidate unchanged for the remaining baseline arms.

SET-071 validation: all 24 focused policy checks and E2E TypeScript checks pass.
The corrected evaluator still needs a completed real paired font run.

**SET-072 — Policy rejection must not terminate the agent (2026-09-08):**
OpenSky font retry 34281141351 ran 199.600 s / 15 calls, then the controller
interrupted an ordinary finite key loop rejected by the straight-line policy.
The turn has incomplete usage and is excluded, with the full $5 allowance
conservatively charged; cleanup passed. Existing native and OpenSky MCP guards
already reject such code before execution and return an ordinary scope error.
The controller now lets those guards return that error so the agent can recover
and finish normally. This is permitted only for the exact repository guard
entrypoint, Node/tsx invocation and matching serialized fixture scope. Other
transports retain fail-closed interruption; unrelated server/app permissions
remain rejected. The policy still refuses filesystem/network access and loops.
No new code execution capability was added. Local typecheck passes; real agent
recovery remains unverified. Further paid font retries are paused until the
separate SDK typing regression passes. Conservative cumulative accounting is
$69.6348276 with no active reservation at this point.

**SDK-L01 — Public typing cannot recover from Linux background refusal (2026-09-08):**
The font agent encountered the typed `background_unavailable` refusal in
`typeText`, while the driver suggested a delivery option absent from the
public facade. The SDK now retries only that explicit pre-input refusal with
foreground delivery to the same resolved window, preserving the background
path when supported. Other typing errors are never automatically replayed.
This matches existing public click/key behavior without agent-only settings.
A real Linux Vitest fixture exposes the public App and saved DOCX as external
state. TYPE-L01 selects all text, types Unicode, saves through Writer's format
prompt and asserts the saved text exactly once. Owned app exit and temporary
removal are recorded. The isolated CI workflow reuses the pinned tested driver,
uses no model credentials, and retains screenshots/files. Local build and E2E
typecheck pass; real Linux execution is pending. This branch is separate from
the active unchanged SDK baseline candidate.

SDK-L01 first CI run 34281622514 failed setup before typing: the readiness
poll inspected default diff output, eventually receiving "No accessibility
changes." The fixture now uses the established screenshot/OCR editor-control
readiness check and records screenshots even on setup failure. The save-dialog
poll explicitly requests full accessibility state. App cleanup passed. No
agent spending or typing acceptance evidence came from this attempt.

SDK-L01 second CI run 34282042224 reached typing, saved successfully, and
verified app cleanup. The exact saved-text assertion failed because the Linux
input route dropped "é" and "—": the file contained "A caf near Dublin Zoo  typed
through OpenSky." This is a real driver Unicode defect exposed after the SDK
routing fix. Preserve the Unicode assertion; do not weaken it to ASCII-only.
Paid agent retries remain paused pending correction and real saved-file proof.

The driver correction is c9d9a66be5fd46f0e80b9a30cc3bdbac05c2c306 on the
existing driver PR branch. Linux XTest and XSendEvent typing now borrow an
unused keycode for unmapped characters rather than silently skipping them;
Latin-1 and Unicode keysyms follow X11 appendix A. The existing restoration
guard lives through delivery. The Linux typing workflow now builds that exact
driver, checks its Unicode mapping unit test and identity, then runs the same
public-SDK saved-document regression. Build and native behavior are pending.

SDK-L01/Unicode verification: run 34282740613 built c9d9a66be and passed the
unchanged real saved-text assertion in 26.441 s. Its DOCX contains exactly
"A café near Dublin Zoo — typed through OpenSky." and the owned app exited.
Driver SHA-256: 9db8474b7a100a15ea6ac62855bcc6f663fa63f72d49939f63cca19485f99fb4.
The next fixture adds CJK, emoji and an independent xmodmap before/after check
for keyboard restoration. It reuses this exact successful binary to avoid
another build. This is supporting SDK evidence, not canonical driver desktop
certification or an agent task score. The full platform matrix remains pending.

SDK-L01 expanded verification: run 34283447522 passed TYPE-L01 against SDK
d2d1a176197c3e594d5a975f705118182d0b9257 and driver c9d9a66be. The saved
DOCX contains exactly "A café near Dublin Zoo — 中文 😀."; independent xmodmap
before/after files match and owned-app exit is verified. Evidence is retained
in `evals/runs/linux-typing-4/artifacts/linux-office`. The input corrections
and SET-072 evaluator recovery are now integrated for the next matched font
pair. This changes the SDK/driver candidate from the original two-task baseline;
compare both new font arms on the same new revision. Agent outcome improvement
and actual policy-error recovery are still unverified.

**DRV-L02 — Alt accelerator becomes plain text (2026-09-08):**
Matched font pair on SDK ed4fe66 / driver c9d9a66be completed with native success
(34284872524: 49.585 s, 10 calls) and OpenSky failure (34284070786: 371.080 s,
21 calls). Runtime fingerprints match. OpenSky saved every text run as
"Times New Romano": public ALT+O becomes option+o, but the Linux hotkey parser
did not recognize option and discarded it as an extra non-modifier. The
corrected driver canonicalizes public modifier aliases before both X11 and
Wayland hotkey delivery, for desktop and window scopes. Real KEY-L01 uses
public menu input followed by save and asserts that no plain o appeared in the
document. Its current-driver regression and corrected-driver build are pending.
No change has been applied to the five-task agent baseline candidate.

The same font trace records fresh save-dialog tokens refused as stale, and
coordinate attempts that did not activate the intended controls. Those remain
separate unresolved gaps; modifier correction alone does not establish parity.

Subscript native run 34285169072 passed upstream but failed the full formatting
check. Independent DOCX XML inspection confirms only the title's 2 is subscript;
the gold document marks eight occurrences. The additional check is detecting
incomplete work, not run splitting or a serialization-only difference.

DRV-L02 baseline regression 34285323345 stopped before KEY-L01: TYPE-L01
intermittently lost the accented e, saving "A caf near Dublin Zoo — 中文 😀."
with the previously passing c9d9a66be binary. Cleanup passed. Unicode delivery
is therefore not yet reliable; retain earlier passes as individual evidence,
not proof of a resolved timing issue. The two independent checks now keep
separate artifacts and run without bail so Unicode failure cannot hide the
shortcut outcome. The suspected remapping/event-delivery timing needs a
reproducible correction; no timing patch has been implemented yet.

Unicode timing candidate 0524101f8 adds an X11 reply barrier after each remapped
character and before restoring its keymap. The prior text paths only flushed
requests and later performed a final round-trip after individual guards had
already dropped. This is a suspected delivery-order race, not yet confirmed
resolved. The same ordering precaution is documented in xdotool's
`xdo_send_keysequence_window_list_do` (https://github.com/jordansissel/xdotool/blob/master/xdo.c).
The candidate is tested across three fresh Linux desktops; each independently
runs Unicode saved-text and menu-accelerator checks, keeps its own screenshots,
DOCX, keyboard mappings and cleanup receipt, and does not consume model budget.

DRV-L02 real acceptance: run 34286117530, SDK af6d86d and driver 183cc3f1c,
passed KEY-L01. The saved file contains exactly "Keep this text." after public
ALT+O, Escape and save; no o was inserted. TYPE-L01 also passed on this attempt.
Both independent fixtures recorded unchanged keyboard maps and verified owned
app exit. Earlier accented-text failures remain reproducible evidence of
intermittence, so this pass does not resolve the separate Unicode timing gap.
The three-desktop timing candidate is run 34286325216 (SDK 7d20c7a, driver
0524101f8); its result is still pending.

**SDK-L03 — Fresh save-dialog button tokens are stale (2026-09-08):**
Font OpenSky run 34284070786 refused the freshly observed Use Word 2007 Format
button twice, including a full observation immediately followed by its indexed
click in the same cell. The agent eventually saved through keyboard traversal.
CLICK-L01 now observes the real save prompt and clicks its observed index, then
checks the actual saved text. It uses the latest built driver; no token or
projection fix is bundled with this reproduction. Investigation has found that
the SDK performs an additional shallow snapshot whenever the Linux driver says
completeness is unproven; that snapshot can invalidate the full observation.
This is a hypothesis pending the isolated regression, not a confirmed repair.

The delivery-barrier experiment 34286325216 did not solve Unicode input:
TYPE-L01 dropped only é on all three fresh desktops; KEY-L01 passed on all
three, with verified cleanup. Key maps were restored exactly. The next
candidate additionally leaves a temporary mapping installed for 50 ms before
injecting its first key, allowing clients to process MappingNotify. This is
still an unverified timing hypothesis, and costs 50 ms only for remapped keys.
The same three-desktop matrix now also exercises CLICK-L01; a save-token
failure must remain distinct from text or shortcut outcomes.

SDK-L03 reproduced in run 34286718903: CLICK-L01 failed with the identical
stale-token error; cleanup passed. The SDK now projects only when reported
total elements exceed returned elements, keeping conservative completeness
metadata separate from evidence of an actually truncated walk. This preserves
the current snapshot instead of discarding it for an unnecessary shallow walk.
Build and E2E typecheck pass. Three fresh remote desktops test the exact public
button action alongside Unicode and shortcut behavior with driver e04e1e08e.
Real acceptance is pending; explicit truncated-tree projection is retained.

SDK-L03 follow-up evidence: run 34287213096 with the SDK projection correction
removed the stale-token failure, exposing the driver's separate range bug:
"element_index 1195 out of range (snapshot had 3 elements)". The Linux walker
keeps application-wide indices when emitting one window. The token registry
now accepts an explicit set of observed indices; dense-platform registration
still uses 0..count. Sparse holes and index zero in an empty snapshot are
refused, and refreshing a window still invalidates its older tokens. Linux
registers its actual emitted indices. Common token tests and CLICK-L01 on three
fresh desktops are pending for this candidate.

The 50 ms map-notification candidate passed TYPE-L01 on the three old-SDK
desktops in 34286955716, but a faster-SDK run again dropped é. Unicode remains
intermittent; neither the delay nor a small set of passing attempts proves
that gap resolved. Keep the immutable five-task baseline and its spending
ledger separate from these free deterministic experiments.

SDK-L03 metadata handling is scoped to Linux, whose driver explicitly always
reports unproven completeness. The historical macOS projection reconstruction
otherwise stopped consuming its documented shallow observation. Its behavior
is retained during this Linux-only work; no macOS acceptance is inferred.

**SET-073 — One-off remote debug desktop (2026-09-08):**
The user-provided exe.dev VM has Docker but no Node runtime. The public Linux
fixture now also admits an explicitly opted-in Docker desktop, verified by
Linux platform plus /.dockerenv, without pretending it is GitHub Actions.
A task-owned container can run the same public SDK fixtures and save artifacts
without registering a persistent runner or spending model budget. Container
setup and first real execution are pending. Non-CI macOS/local desktops remain
refused by the fixture guard.

SDK-L03 combined acceptance: run 34287727041, SDK cab1da1 and driver
00e3b936e, passed TYPE-L01, KEY-L01 and CLICK-L01 on all three fresh desktops
(nine checks). Each saved file met its assertion; all nine app cleanups and
keyboard-map restorations passed. The driver build and common token tests
also passed. Subsequent SDK diff scopes unknown-completeness handling to Linux
and admits explicit Docker fixtures; the existing GitHub path is unchanged.
All 339 SDK checks pass after this scope correction. This is current-candidate
regression evidence, not an improved agent score or a universal reliability
claim. The agent workflow now pins this exact tested binary for the font retry.

SET-073 acceptance: the first exe.dev container failed before actions because
its C locale could not represent the Writer window title. With LANG/LC_ALL
set to C.UTF-8, the same container image passed TYPE-L01, KEY-L01 and CLICK-L01
in 80.54 seconds. All owned apps exited, keyboard mappings were restored, and
the --rm container disappeared. Artifacts: linux-exe-input-02 (SDK 0ee7c90,
driver 00e3b936e). This is deterministic public-SDK evidence, not an agent score.

**DRV-L04 — Dialog pixel clicks hit sibling windows (2026-09-08):**
The matched font retry on SDK 16e62c1 and driver 00e3b936e still failed with
OpenSky (427.893 s, 24 calls, run 34288468049) while native passed (87.823 s,
18 calls, run 34289296019). All runtime fingerprints matched, both turns
completed and cleanup passed. The agent's final explanation about missing
Times New Roman is insufficient: native saved that font in the same environment.
OpenSky's trace shows a dialog-coordinate click affecting the document behind
it. Linux's AT-SPI pixel shortcut searched all process windows using each
window's local coordinates, ignoring the explicit window ID. The candidate
passes the ID into that lookup and accepts only nodes under its proven
accessible top-level. The Wayland screen-point path now applies the same
window scope before hit-testing. Unresolved scope falls through without
actuating a sibling. X11 and Wayland acceptance remain pending.

COORD-L01 drives the real Character dialog, clicks its screenshot's Family
field, types an installed font and verifies the resulting field text. The
one-off remote reproduction on driver 00e3b936e failed: final screenshot
still showed Georgia, and the observation included both document/dialog nodes.
Keep possible focus-routing and accessibility-window association defects
separate from the confirmed unscoped hit-test. Evidence:
linux-exe-coordinate-before; this test is separate from saved-document scores.

DRV-L04 first-candidate result: cf83a6692 built and passed the focused Rust
checks. One-off remote COORD-L01 still failed: the first click closed the
Character dialog, before typing. The final screenshot confirms the document
window, and cleanup passed (linux-exe-coordinate-scoped). A text entry's
AT-SPI activation submits the dialog; it is not equivalent to placing a caret.
The next candidate returns a typed pre-input background-unavailable response
for an editable pixel target. The SDK's existing foreground fallback then
performs the actual pointer click in the exact window. It does not replay an
already-dispatched action. Both X11 and Wayland pixel paths share that result;
real candidate acceptance remains pending. These fixes have not changed the
measured agent score.

DRV-L04 follow-up on 8d9fcd05a: the driver now returns the intended typed
pre-input refusal, but the SDK's click fallback matched only older message
patterns. The existing typed-code fallback was in type_text, not click; the
previous statement that clicking already handled it was incorrect. The SDK
now accepts background_unavailable for the same click payload/window only.
Other errors retain their previous handling. One-off remote COORD-L01 is
running with this SDK change; the unchanged test is not weakened.

The completed cf83a6692 matrix (34289751231) passed all three KEY-L01 and
CLICK-L01 cases, failed all three dialog cases, and failed two Unicode cases:
one saved "A caf near Dublin Zoo — 中文 😀.", another saved
"A caf— near Dublin Zoo — 中文 😀.". All twelve cleanups passed. The substitution
is consistent with the shared spare keycode being rebound before the client
translated the earlier key event. The next candidate retains each remapping
for 200 ms after server delivery, before restoring/reusing it. This is a bounded
client-processing allowance, not an acknowledgement or proof of reliability;
it adds 200 ms per otherwise unmapped character. Repeat real saved-text checks
must establish whether it resolves the observed loss and substitution.

**DRV-L05 — Typing appends instead of replacing selected text (2026-09-08):**
With the SDK click fallback, COORD-L01 now focuses the Family field and retains
the dialog, but after CTRL+A and typeText("Liberation Serif") the final field
is "GeorgiaLiberation Serif". Screenshot and AX evidence agree; cleanup passed
(linux-exe-coordinate-sdk-fallback, driver 8d9fcd05a). The AT-SPI insertion path
used the caret offset without checking the selection. The candidate inspects
Text.GetNSelections before mutation. A selected range (or unreadable selection
state) requests native keys, preserving the application's replacement and undo
semantics instead of deleting and retrying a partial write. Background requests
receive a typed pre-input refusal; existing SDK typing escalation handles it.
The exact addressed window/element is retained. Native Wayland uses its real
keyboard path; private nested-compositor input keeps its existing targeted path.

The unchanged field-content assertion remains the acceptance gate. This longer
dialog workflow receives a 120-second deterministic test timeout because its
real observations and foreground retries can exceed the default minute;
whole-agent deadlines and tool-call caps remain absent. Build, E2E typecheck and
339 existing SDK checks passed for the SDK click change. New driver and real
combined acceptance remain pending.

DRV-L04/05 combined one-off acceptance: COORD-L01 passed on driver 7f9e72fcf
with the SDK click fallback (51.641 s of test time). The actual Family field
became exactly "Liberation Serif" after a screenshot click and CTRL+A/typeText;
the dialog remained open. Screenshot, AX assertion, exact keyboard restoration
and app cleanup receipts are retained in linux-exe-coordinate-pass. The
three-desktop exact-source matrix is 34291452142 (SDK b5f2526); additional
Unicode repetitions run in fresh exe.dev containers. Both remain pending.

SET-073 full-set preparation: a separate task-owned Docker image now installs
Writer, Calc and Impress at 24.2.7-0ubuntu0.24.04.6 (image
sha256:a50f77b673f34f483191fe3cc7acb273aa8f0e2d8d0672f31b40f52a83086186).
Only package/version checks have run for Calc and Impress: real setup/reset and
outcome controls, VS Code installation/fixture, and the frozen 20-task campaign
remain unfinished. No persistent GitHub runner or local Mac GUI was started.

DRV-L04/05 exact-source CI acceptance: SDK b5f2526 and driver 7f9e72fcf passed
TYPE-L01, KEY-L01, CLICK-L01 and COORD-L01 on all three fresh GitHub desktops
(run 34291452142). All twelve saved-text/field assertions, process cleanups and
keyboard-map restorations passed. Artifacts: linux-dialog-selection-verified.
The agent workflow now pins that exact built binary by artifact run and SHA256;
no improved agent outcome is inferred until the matched font task is rerun.


SET-073 Linux desktop setup evidence (2026-09-08): the first remote run stopped
before app launch because ignored benchmark assets were absent from the Docker
source archive. Original input files are now mounted read-only in the one-off
desktop; a failed copy also cleans its temporary directory. The second run
(linux-office-setup/office-setup-02) passed SETUP-L03: the public SDK read
"VIRTUAL QUIZ" from the opened Impress slide (25.250 s). SETUP-L02 failed after
130.641 s: Calc opened the correct visible income statement, but the public
SDK returned x11_property_fallback_partial instead of its cell contents. Both
owned process groups exited. These are setup/observation checks, not paid agent
successes. A diagnostic retry shows a GetChildren timeout after 1,614 AT-SPI
nodes, followed by an unresponsive app accessibility tree. The precise failing
node and a safe traversal fix remain to be established; the failure is retained.

VS Code setup is being checked in an expanded one-off image containing the
official 1.136.2 package (commit 88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f,
package SHA256 2493226f723f66c8e83b9d806e3fbe83dcc43f381ece51eaa03d88889542b0c0).
It uses an empty profile/extensions directory and disables updates, telemetry,
extensions and welcome pages. A root-only --no-sandbox flag is limited to the
disposable Docker setup; hosted agent runs should use their normal non-root
user. No editor agent support, full-set scorer acceptance or frozen 20-task
result is inferred from installing this package.

SET-073 editor readiness correction: code-setup-01 opened the benchmark text,
but OCR returned menu words out of visual order and the default Linux Electron
renderer exposed only a frame. Readiness now checks the required menu words
without assuming OCR ordering. The empty editor profile enables standard
editor.accessibilitySupport and --force-renderer-accessibility for both future
backend arms. This is the documented VS Code Linux accessibility option, not a
mock; it changes the editor's accessibility mode and must be recorded in the
matched environment. code-setup-02 passed SETUP-L04 in 14.946 s: the public
getAXState included the real benchmark text. Both editor runs cleaned up their
owned process group. This validates setup, not either editor task's outcome.
Reference: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/electron-browser/desktop.contribution.ts

**DRV-L06 — Calc virtual table enumeration stalls accessibility:**
A read-only D-Bus diagnostic on a fresh copy of the same income statement
(calc-tree-01; see linux-office-setup artifacts) reports ChildCount=2147483647
for the table named "Sheet Sheet1". It visits 1,874 surrounding nodes without
GetChildren or expanding that virtual table. The normal driver requests
Accessible.GetChildren on every visited node, including this table; its
diagnostic retry repeats the failure. Replace unbounded enumeration with
visible/bounded virtual-container traversal, preserving actionable references
and truthful partial-tree reporting. The original SETUP-L02 assertion remains
the acceptance gate. No driver fix is implemented or accepted yet.

DRV-L06 bounded visible-range feasibility: calc-table-03 reads screen bounds
[33,153,1174,662] from the virtual table. Component.GetAccessibleAtPoint at its
inset corners returns cells whose Table.GetRowAtIndex/GetColumnAtIndex values
span rows 0–36 and columns 0–11. This establishes a 444-cell visible range
without asking for the full child list. The diagnostic exits normally and its
disposable container is removed. This is feasibility evidence only; bounded
driver traversal, clipping/partial-cell behavior, action index stability and
real SETUP-L02 acceptance still need implementation and verification.

DRV-L06 candidate a251619ec2716a9d9d501e40d3889d303beb83b9: child-count checks now prevent full virtual-table
enumeration, and table corner queries delimit a bounded visible range clipped
to the frame. Partial child lists are labeled in the returned tree. Compilation
and unchanged Calc acceptance are pending. The Linux typing workflow now has
a build_only dispatch option for focused remote iteration; its default still
runs the three-desktop regression matrix. No agent workflow driver pin changes
until the candidate is accepted.

DRV-L06 first candidate result: a251619ec compiled and passed focused unit
checks in CI 34294757380. Calc stayed responsive, returning 2,316-node walks;
SETUP-L02 finished in 35.929 s with cleanup passed, but text headers appeared
as coordinate names with numeric value zero. The driver collected Text but
only surfaced it when Name was empty. Candidate cc2cf0d7440b6d36055af9afda2309960950cd1a preserves cell
coordinates as names and observed displayed text as values. The original
Net Sales assertion remains unchanged; no Calc acceptance is claimed yet.

DRV-L06 cell-text acceptance: cc2cf0d74 passed SETUP-L02 in 34.755 s after
CI 34306147428. CALC-L01 then failed its saved-file assertion: the formula
B2-C2 and cached value 75000 were written to previously active G17, not the
freshly observed E2 click target. Both owned process groups exited. Candidate
bb6fac1c856d4eed03cbb8748deab78ebaf3dcc9 returns a typed pre-input background refusal for table-cell clicks,
including coordinate hits. The existing SDK retry retains the target and uses
real foreground input. The saved E2 assertion is not weakened. Build and
acceptance are pending; paid agent runs still use the earlier accepted driver.

SET-073 shared launch setup: SDK checks and linux-smoke now use the same
prepareLinuxBenchmarkApp helper for Writer/Calc/Impress/VS Code profiles,
arguments, app names and menu readiness. shared-setup-01 passed Impress
(21.444 s) and VS Code (15.553 s) with the accepted 7f9e72fcf driver; both
process groups exited. The public saved-document fixture supports CALC-L01's
formula/value assertion. The Linux runner and E2E TypeScript checks pass.

Linux VS Code fingerprints now include actual package version/commit and
SHA256 values for its executable, launcher, package/product metadata and
main.js. The reader ran against the real remote 1.136.2 installation and
produced editor-fingerprint.json. Editor agent admission requires that
fingerprint and an explicit installation path. Hosted workflow installation,
matched editor agent runs and full-set scoring validation remain pending;
setup passes are not agent parity evidence.

SET-073 grader validation: a separate remote image installs the exact pinned
Python scorer requirements alongside the same LibreOffice exporter. The
original benchmark assets are mounted read-only, verified against their pins,
and original/correct/damaged file controls run without an agent. Real Impress
export controls are included. grader-controls-01 is active; no scoring profile
or agent result has been promoted from its pending outcome.

DRV-L06 candidate build 34306855419 failed compilation because browser setup
and consent callers retained the prior two-argument perform_action API. The
wrapper is preserved and a click-specific entry point receives the new policy
flag; no existing caller is silently assigned different parameters. Corrected
candidate: 978fe0adf32f424599486d4dc7896967e56f4c57. No desktop test was dispatched from the failed build.

SET-073 Linux grader acceptance: grader-controls-01 passed all 52 tests
(108.54 s), spanning the frozen twenty tasks and five real Impress export
control groups. All five completed specimens passed; unchanged, incorrect,
damaged-content and damaged-format specimens failed as required. Export
process/profile cleanup receipts passed. The frozen task-preserving-export-v1
profile has SHA256 1570bdddb8f92038fb316c4886d8b1d12fabfd868e09f2bb60bff58b42691900,
seven reference files, and LibreOffice 24.2.7.2 exporter identity. It adapts the
five Impress references only; other task categories retain raw scoring. This
is grader acceptance, not twenty agent task successes.

The Linux runner now verifies an optional frozen profile against the actual
exporter and environment fingerprint before app launch, requires it for
Impress, and reports rawOutcome plus adaptedOutcome separately. E2E and
runner TypeScript checks pass. The matching profile still needs distribution
through the hosted workflow and end-to-end admission verification before any
Impress agent dispatch. Existing paid-agent workflow pins remain unchanged.

DRV-L06 exact-window geometry follow-up: candidate
978fe0adf32f424599486d4dc7896967e56f4c57 built successfully in hosted run
34307064623 (binary SHA256
a2f8c4150bf707a57bb01204f4c714700e3d5193ac3169899c72cc718f856e30).
Remote calc-candidate-03 passed SETUP-L02 in 35.000 s but CALC-L01 still
failed: the saved workbook contains formula B2-C2 with cached value 75000 in
E1 instead of requested E2. Both owned process groups verified exited; the
remote Docker inventory was empty when artifacts were collected. Thus real
pointer input improves on the prior G17 no-op but has not passed cell targeting.
Snapshot diagnostics apply a SCREEN-to-X11 frame rebase of (0,17), while
get_element_bounds does not share that conversion or an exact-window hint.
This is the next geometry hypothesis to verify, not accepted driver behavior.
Keep the unchanged saved-E2 assertion; share the coordinate conversion before
rerunning the focused tests and existing input regressions. Local evidence:
evals/runs/linux-office-setup/calc-candidate-03 in the OpenSky SDK checkout.

**LOOP-L01 — Repeated manual result inspection delays the next iteration:**
A completed remote test previously required separate result JSON, cleanup,
spreadsheet XML, and driver-log reads, often after copying all screenshots.
`e2e/ci/summarize-desktop-run.py` now emits these facts in one read-only command,
including over SSH stdin without an installation. It preserves original test
failures, skips, and missing evidence rather than grading new acceptance.
Verified remotely against calc-candidate-03 (35.000 s reading pass, 85.539 s
saved-cell failure, E1 formula, both cleanups verified) and locally against
shared-setup-01 (Impress/Code passes). Remote summary command completed in
approximately one second; no end-to-end iteration speedup has yet been measured.
Container removal and actual binary hashing still require independent checks.
Usage: docs/remote-run-summary.md.

**LOOP-L02 — Hosted build queue and artifact transfer on every candidate:**
Added an optional one-off remote Docker compiler helper under
`e2e/ci/remote-driver`. It archives exact committed driver source, retains Cargo
caches keyed by builder image digest, checks all six focused Rust filters, and
verifies embedded source identity plus binary SHA256. Outer/nested shell syntax
and archive contents passed local checks. No remote compilation or speedup has
yet been verified: the VM currently has 7.5 GiB disk free, so cold build capacity
needs to be established before using it. It does not replace hosted or real GUI
acceptance; no persistent GitHub runner is registered.

**SET-074 — Frozen Linux grading references must be shared across agent arms:**
The remote 52-control pass and profile freeze prove the Linux exporter controls,
but hosted agent jobs still need an immutable downloadable profile. Added a
model-free hosted preflight that installs the shared Writer/Calc/Impress and
pinned Code release, verifies original benchmark assets, runs all grader
controls, and uploads one frozen profile plus receipts. An agent run will pin
that artifact run and profile hash after successful preflight; regeneration
per arm is not allowed. Workflow execution and downstream artifact admission
remain pending. These controls do not increase the agent task-success score.

DRV-L06 geometry acceptance: df79e0cf16e25ef586b1a9baf738d6cd39fa75cf
passed build and all six focused Rust filters in hosted run 34308230956.
Exact binary 3d21cdb9d26f67210c6ba80aef5066bcd895128203c8545294dc928f323037c8
passed remote calc-candidate-04: SETUP-L02 34.558 s and CALC-L01 76.844 s.
The saved E2 now contains formula B2-C2 and cached value 75000; both process
groups exited and the container was removed. Added distinct CALC-L02 behavior
coverage for a newly observed E50 after Page Down; typecheck passed, remote
execution pending. Existing input regressions also remain to be rerun on this
binary. No full-suite or agent acceptance is inferred from these SDK checks.

SET-074 hosted validation: run 34308469414 passed all 52 grading controls with
zero skips and froze seven references. Profile hash
7b19e7bc0f75719fe7f8e39d0a189b45c17338f42a3c7b6610e96519a7d1b769 is now
pinned by artifact run and verified against the actual exporter before model
reservation admission. The agent workflow uses the same app installer and Code
package, fetches all pinned task assets, and supports model-free setup by task
ID. Hosted setup and paid agent outcome evidence remain pending.

DRV-L06 scrolled-cell acceptance: calc-scroll-01 passed CALC-L02 in 81.038 s,
saving numeric 42 to the newly observed E50 after Page Down. Cleanup verified.
The four input regressions in geometry-input-regression-01 never reached their
actions: Writer's owned document window was not observed. All four cleanup
receipts passed. The initial live diagnostic missed the short-lived container,
so linux-app now saves the real X11 window tree on launch failure before cleanup.
This is failure-only evidence collection; launch criteria and tests are unchanged.
Do not promote the new binary until these input regressions actually run.

SET-074 first hosted Calc setup run 34309203584 stopped before driver/model
admission because the asset host reset an HTTPS connection. fetch-assets now
retries transient network errors up to three attempts with short backoff;
checksum mismatches and permanent HTTP errors still fail immediately. Existing
verified assets remain unchanged. New hosted execution is required.

Writer regression setup diagnosis: the older opensky-input-debug:0ee7c90 image
had no UTF-8 locale, unlike the passing full desktop image and hosted runner.
The retained window tree showed a live Writer window with a title encoding
failure. The next unchanged regression run explicitly uses LANG/LC_ALL=C.UTF-8;
TYPE-L01 and KEY-L01 have reached their actual actions and passed so far.

DRV-L06 final focused regression result: geometry-input-regression-02 passed
TYPE-L01 36.003 s, KEY-L01 35.146 s, CLICK-L01 43.073 s, and COORD-L01
76.599 s using df79e0cf1's exact binary. All four owned process groups exited,
all four keyboard mappings were restored, and no remote containers remained.
Only locale configuration changed from the setup failure; assertions were not
weakened. Together with Calc read/edit/scroll this is seven real SDK checks,
not canonical cross-platform certification or new agent task successes.

SET-074 source admission follow-up: hosted setup 34309492537 correctly rejected
the old profile because fetch-assets.py's network retry change altered its
pinned scoring-source digest. The full grading preflight is rerunning at
34309681923; both arms must use the newly validated artifact and hash afterward.
No model dispatch/reservation occurred.

SET-074 rebuilt profile: preflight 34309681923 passed all 52 controls without
skips and froze profile c7fa3e09273f8e9c0704eb872361ee8b8a0b41b388efacc206e8b0cb63a26565
against the current downloader/scoring sources. Both artifact copies have that
hash; the hosted setup workflow now pins this run and hash. Source admission
will still reject changes rather than silently using stale references.

**PERF-L01 — Screenshot-only calls extracted the full accessibility tree:**
Native BoundApp.getScreenshot now uses the driver's existing pixel-only path.
Exact-window selection, screenshot input mapping and prior AX token authority
are retained; typed browser observations retain their current path. Same-driver
sequential remote runs shot-speed-before-01 and shot-speed-after-01 passed both
SHOT-L01 (AX index remains usable after screenshot/save) and SHOT-L02 (new dialog
screenshot targets its field). All four owned apps exited and containers were
removed. Six screenshot calls per variant: median 5424.13 ms before, 611.19 ms
after. Combined two-test duration 123939.18 ms before, 95464.22 ms after. These
are small public-SDK latency samples, not new paired-agent scores or Mac/Windows
GUI certification. TypeScript build and e2e typecheck passed; no mocks were added.

**SET-075 — Mutable native package URL breaks a frozen campaign:**
Hosted setup 34310173052 passed grading admission, then rejected the changed
latest native package hash. The new observed official package hash is
2caa7df314ce37e9048359d8e6a4a78e24574a3b54d6bf510f17754b66dda775. Added a
model-free workflow to freeze exactly these bytes after package/entry-point
inspection. Native probing can consume that immutable artifact and still verify
its checksum; neither backend silently follows latest during a pair. New-package
runtime validation remains pending. Official download source rechecked at
https://learn.chatgpt.com/docs/linux/linux-app; Linux UI Computer Use support is
not claimed by these internal-backend probes. Prior reference evidence remains
versioned separately. No model spending occurred in the failed setup.

SET-075 frozen reference run 34310637093 succeeded and retained the exact new
package plus entry-point metadata. linux-agent now downloads that artifact and
checks its digest before model reservation admission. Runtime setup remains a
separate gate. CI 34310637007 found one legacy facade-call expectation still
requiring the old screenshot extraction flags; updated it to the intended
pixel-only request. The two real SHOT workflows remain the behavioral evidence.

LOOP-L01 timing support: the summary now maps typing/SHOT test artifact paths
and reports recorded public SDK method counts, failures, totals and medians.
It preserves skipped tests and distinguishes unavailable, empty and malformed
timing evidence. Existing screenshot before/after runs each report two passes,
four skips and verified cleanups; screenshot medians reproduce 5424.127 ms and
611.189 ms (six samples each). Older input and Calc runs remain readable with
unavailable timings. Temporary receipt copies verified missing-cleanup and
malformed-timing failure behavior. No GUI rerun or agent score is implied;
recorded fixture calls are not agent REPL calls or whole-run wall time.

**REPL-L01 — A legitimate action batch exhausted a hidden awaited-work limit:**
Matched Calc runs 34311313179/34311623462 at SDK757b7d9 passed all fingerprint
comparisons, cleanup and usage reconciliation. Native passed the raw OSWorld
workbook scorer (67.136s,12calls); OpenSky failed (111.632s,4calls) when its
third call batched nine formula entries and hit AsyncRepl's default60s wall
limit. The poisoned evaluator then refused recovery. This is retained as a
real interface failure, not relabeled as success or removed from results.
Public CUA REPL now sets awaitTimeoutMs:null: host actions may finish normally
while synchronous code/microtask bursts retain the60s CPU watchdog. Explicit
AsyncRepl timeouts retain their existing behavior. Real-timer REPL tests verify
action completion beyond the CPU budget, next-cell binding continuity and
recursive-microtask interruption. Desktop replay and new paired outcome remain
pending; tests alone do not establish task parity. Native/app/profile freeze
and all three hosted app setups passed with cleanup before these agent runs.


**PERF-L02 — Strict REPL burned CPU while waiting for host actions:**
The strict evaluator pumped an empty VM turn through `setImmediate` continuously
while host I/O was pending. A real two-second host timer used a median 1,301.922ms
of process CPU across three Node 24.5.0 macOS samples. The scheduler now yields
with a 1ms timer between drains; the same three-sample measurement used median
268.094ms CPU (79.4% less), with median wall time 1,999.603ms → 2,002.935ms.
One hundred sequential 5ms host waits took median 500.671ms → 564.047ms wall time
(+0.634ms/action), while CPU fell 320.132ms → 75.589ms. This trades a small
scheduling delay for substantially lower idle CPU; it is not a measured Linux
agent speedup. `e2e/ci/benchmark-repl-await.mts` reproduces the real-service
measurement; raw before/after receipts are in the workspace
`work/repl-idle-benchmark/{before,after}-repeated.jsonl`. VM synchronous and
microtask timeouts and strict capability revocation are unchanged. Validation:
14/14 existing AsyncRepl tests, 2/2 real timer fixture tests, and TypeScript build
passed. No model runs or GUI apps were started.

REPL-L01 transport continuation: the public CUA runtime now exposes
cua_repl_wait. An action batch continues after a bounded (at most30s) reply wait
and retains its cell ID, bindings and pending result. New code is refused until
that result is retrieved; waiting never replays desktop actions. Repeated reads
of the latest completed cell are marked replayed. The evaluator's default60s
outer MCP timeout therefore bounds an individual wait, not the action batch.
Both Linux/macOS paired adapters expose the same public wait tool. A real65s
operation exercises multiple waits; the isolated Linux REPL-L01 desktop test
checks exact saved text, subsequent-cell binding use and keymap restoration.
Hosted desktop validation is pending. Wait calls remain included in agent tool
counts and will be distinguished when interpreting interaction efficiency.

REPL-L01 real Linux acceptance: hosted run34312831722 passed the actual MCP
Writer workflow. Its first batch lasted124.434s across five waits (four30s
pending replies and a4.425s terminal reply), exceeding both former60s limits
without poisoning or restarting. A later cell saved the exact expected nine
text fragments once. Keymap restoration and owned-process cleanup passed.
This is deterministic public-tool acceptance; the new Terra pair is still
required for agent outcome and latency evidence.
## PERF-L03: repeated foreground typing scans

Real remote `type-profile-01` used the exact df79 driver and existing TYPE-L01 /
COORD-L01 saved-file tests. Both passed with verified cleanup. Thirty characters
took 4.309s to refuse background input and 5.913s in foreground; the 16-character
selected font field took 10.014s then 10.155s. Timestamped daemon diagnostics
show full accessibility walks repeated during the foreground retry. The wrapper
adds diagnostic overhead, so these are route measurements, not an agent speedup.

Driver candidate c2f9a2a60 directly sends unindexed foreground text through its
existing real keyboard route. Native indexed and background paths remain intact.
The focused build workflow pins this candidate; the agent campaign remains pinned
to df79 until saved-file/selection/Unicode and keymap regressions pass. Full native
desktop matrix and new agent timing remain unverified.
## CALC-L03 / CALC-L04: reproduce agent coordinate failures

Agent arm 22 (CI 34313264489, SDK 48c6ab55, df79 driver) outlived the old
REPL deadline but stopped at the spending guard after 728.8s. It repeatedly
failed to create Sheet2; a name-box click was followed by text in ordinary
cells. New public-SDK tests replay screenshot-derived name-box and plus-button
coordinates, guard the observed image dimensions, and assert saved E2 and saved
sheet names. No model or mocked input is used. Typecheck passes; remote real
desktop reproduction is pending. The first remote attempt lacked the workbook
mount and failed before app launch, so it is setup evidence only; a corrected
runner fingerprints and mounts the existing task asset explicitly.

PERF-L03 validation: c2f9a2a60 passed Linux build/focused Rust checks in CI
34314822844. The exact f5421082 binary passed TYPE-L01 and COORD-L01 with both
saved/visible outcomes, app exits and keymaps verified. Same image, wrapper, SDK
and test-source hashes; foreground typing 5.913s → 1.609s and 10.155s → 0.197s.
Including background attempts: 10.222s → 5.911s and 20.169s → 10.310s. Combined
test runtime 96.07s → 81.36s in one sequential diagnostic pair; this is not an
agent benchmark. The accelerator and indexed-save checks separately passed;
both app exits and keymaps were verified from their retained receipts.

CALC-L03/L04 validation: corrected `calc-coordinate-before-03` reproduces both
failures on exact df79. Saved E2 is empty after name-box input, and no Sheet2 is
observed after the plus click. Both app exits verified. The remote 1280×883
layout and original CI 1280×881 layout were visually inspected; both controls
occupy the selected pixels. The fixture accepts those two observed geometries.
Root cause and driver correction remain open; no passing-agent claim.
## CALC-L03 / CALC-L04 candidate: shared screenshot hit-testing

Driver db81cc461 uses shared snapshot bounds for X11 coordinate hit-testing
instead of raw toolkit Window extents. GTK accessibility misses on a headless
desktop now request foreground input before attempting an ignored synthetic
pointer fallback. This targets the saved empty E2 / missing Sheet2 reproduced
in calc-coordinate-before-03. The focused build workflow pins the candidate;
both unchanged real SDK outcome assertions and input regressions must pass
before an agent comparison. The paid campaign driver pin remains unchanged.

Validation of exact driver db81cc461 (binary SHA256
ec5761dd43734a6636fc534849960545787032d5a67bb62958baa94e59b969c2):
focused build 34316016256 passed, but **both unchanged Calc assertions failed**
in `calc-coordinate-after-01`. The candidate is not accepted. A separate
observation diagnostic, `calc-click-diagnostic-01`, recorded accessibility
delivery for the name-box click and foreground global-input delivery for the
new-sheet click. The latter placed the actual pointer at screen (116,861),
matching screenshot (116,844) plus the client origin (0,17), without producing
Sheet2. Both owned app exits and container removal were verified. Target
selection, gesture delivery and focus restoration remain under investigation.

Follow-up controls: real paced external clicks passed both saved outcomes;
unpaced same-connection XTest passed the name-box workflow but failed new-sheet
creation even with no focus restoration. Adding only flush plus a 50ms hold
passed both (`calc-external-paced-01`, `calc-external-unpaced-01`,
`calc-external-held-01`). The accessibility point probe found an actionable
panel around the name box without an EditableText node, explaining the
container activation path. The first probe timed out on Calc's virtual table;
later probes skipped that explicitly irrelevant subtree and recorded the skip.
All owned app groups exited. These are diagnostic bypasses, not SDK acceptance.

Driver candidate a9501e0ca requests foreground pixel input for compound panels
and holds real XTest button presses for 50ms. Its focused build is pinned here;
unchanged Calc and input regression outcomes remain required before updating
the paid agent workflow. Full paired timing and the desktop matrix are pending.

Exact a9501e0ca validation: build/focused Rust checks passed in 34318630951.
Binary SHA256 27329643542ab30c5a9058ee140ee3bb69006e8f6af7e3f946a789d1861160d1
passed both unchanged name-box/new-sheet workflows (98.06s), all four
TYPE/KEY/CLICK/COORD input regressions (132.26s), and both existing indexed and
scrolled-cell Calc workflows (124.13s). Saved E2 contains B2-C2 / 75000 and the
new-sheet workbook contains Sheet1 and Sheet2. All eight owned app groups
exited, all four input keyboard maps were restored, and containers were removed.
Evidence: `calc-coordinate-held-01`, `input-regression-a950-01`,
`calc-indexed-a950-01`. The agent workflow now pins this exact tested artifact;
fresh paired agent timing is next. CLICK-L01 is an indexed save-button test,
not double-click coverage. Real double-click behavior and the full canonical
platform matrix remain pending; the driver PR stays draft.


## RUN-L04: driver client interrupts an otherwise resumable action

OpenSky attempt 23 (`34319911691`, SDK `2c5f01a`) completed with a failed
saved-workbook score after one typing RPC exceeded the CLI client's default
30-second deadline. The REPL continuation worked. Killing the CLI does not
cancel the daemon's action, so this is a product failure with unknown delivery,
not an invalid benchmark to exclude.

Both CLI and MCP transports now omit ordinary operation deadlines by default;
`timeoutMs: null` also waits for completion. Explicit positive integer deadlines
remain available. Identity, startup, handshake, drain and shutdown limits remain
separate. Explicit timeout errors retain unknown-delivery/no-replay semantics.

Real public-SDK TYPE-L02 enters 4,400 ASCII characters with one typeText call,
saves through the normal format confirmation, and checks exact saved text and
keyboard restoration. On exact driver a9501e0ca, the old CLI failed at 30 seconds
(`deadline-before-cli-01`); the new CLI saved correctly after a single 50.152s
typing action (`deadline-after-cli-01`). The old client also could not confirm
session end while typing remained in flight; its app exit and container removal
were verified. Candidate app exit and keyboard map restoration passed.

The first real MCP run (`deadline-after-mcp-01`) exposed loss of the bare typed
background_unavailable code in error envelopes, preventing the same foreground
retry available through CLI. MCP now preserves structured error codes only on
error responses; successful arbitrary payloads are not reclassified as refusals.
The unchanged real test passed in `deadline-after-mcp-02`: one 50.128s
typing action saved all 4,400 characters, with restored keyboard map, verified
owned app exit and removed container. The initial MCP failure remains retained.
Build/E2E typecheck and existing transport contracts passed; those are not real-driver acceptance. Agent timing parity and
the exact spreadsheet interaction still require fresh validation.

## OBS-L01: no post-save evidence when an agent claims completion

Native attempt 24 (`34320620267`) displayed correct Sheet2 calculations but its
saved workbook was byte-identical to the initial asset (SHA256
8f9da5481c2bcefefebae562e037a71b5b93163ff6b48295fd4df30b86cf8279).
It ended immediately after Ctrl+S without observing afterward. A format dialog
is strongly indicated by prior successful native20's explicit confirmation,
but the exact final dialog was not captured. The grader correctly failed the
unchanged file; no scorer relaxation is warranted.

The Linux evaluator now retains an independent full-desktop final-state.jpg and
final-observation.json after the agent returns, before scoring and cleanup.
This read-only diagnostic uses the native observer for both arms, even if the
OpenSky evaluator is poisoned. It never saves or dismisses dialogs for the agent,
and capture errors do not alter task scoring. A bounded child limits only this
diagnostic; no whole-agent deadline or tool-call cap was added. Evaluator
TypeScript validation and unavailable-observer fallback passed. Actual remote
capture validation remains pending.


## PERF-L04: unnecessary background discovery for an already-focused input

Exact a950 range replay with the uncapped client completed its six-character
name-box typing action in 20.713s. It no longer hit a client deadline. The first
replay's E2 assertion failed because CI and exe.dev font metrics put the same
pixel in different columns: the saved formula landed in F2, matching the remote
screenshot. `calc-range-uncapped-01` is retained as a layout-mismatched diagnostic,
not proof of a driver targeting regression. CALC-L05 now selects E2 from current
accessibility state before replaying the same name-box range action.

Driver candidate bf40378b1 tries unindexed X11 typing through real keys only if
fresh active-window and core-focus ancestry checks identify the exact target.
It rechecks before every character without activation, restoration, persistent
focus caches or server grabs. A pre-input miss retains the existing background
path; possible partial delivery errors never fall through or request retry.
There remains a check-to-event race with other X clients; this is not an atomic
focus lease. Indexed, explicit foreground, Wayland and existing terminal paths
are preserved. Compilation and real foreground, sibling-window, modal and
indexed saved-outcome acceptance remain pending. The paid agent workflow still
pins validated a950; the build-only workflow selects bf40378b1 for evaluation.


The corrected real range test passed on a950 + SDK23086b1 in
`calc-range-uncapped-02` (90.475s). Saved E2 contains B2-C2-D2 and E10 contains
B10-C10-D10. The name-box range action took 20.985s; the initial indexed cell
click took 25.584s. This confirms the selected-range saved outcome, not a full
agent task or a performance improvement. Both range-replay app exits and
container removals were verified. The setup-only CI path also calls the final
screenshot helper so that diagnostic can be validated without model spending.


Exact bf40378b1 built successfully in CI34388992875 (binary SHA256
 a79ba9ed566c097931daab2ede6e85c0c86a0bc935e3b7e68f01836a448e4384).
The unchanged CALC-L05 passed in63.343s versus90.475s on a950, with the same
image/runner/test/fixture/SDK fingerprints and all nine saved formulas verified.
Range typing fell20.985s to0.219s; formula typing fell5.466s to0.239s.
This is one deterministic diagnostic comparison, not an agent speedup.
Four unchanged TYPE/KEY/CLICK/COORD regressions also passed (105.97s), with
all owned app exits, keyboard maps and container removals verified.

OBS-L01 real setup validation passed in CI34389002642: final-state.jpg visually
shows the owned Calc desktop; final-observation.json records successful101ms
capture, and app exit/temp cleanup passed. This no-model setup has no agent score.

## FOCUS-L03: a document request can mutate an active dialog

New real public-SDK focus tests use two independently owned Writer processes
and exact SDK window handles. FOCUS-L01 (foreground document) and FOCUS-L02
(background target with sibling retaining focus) passed on bf40378b1.
FOCUS-L03 failed: typing at the bound document while its Find dialog was active
appended FORBIDDEN DOCUMENT INPUT to that dialog's search field. The captured
final-modal-state.json contains the combined field value, proving wrong-window
mutation rather than only an unexpected return value. Both owned app groups
and temporary directories exited/removed in all three cases.

The original PID-wide accessibility fallback remains suspect; a950 control is
being run before attributing the bug to the optimization. Exact-window scoping
must cover every editable classification/write/retry path, refuse before input
when focus belongs to another window, and preserve genuine background targeting.
No paid-driver pin or agent speed claim is permitted from this candidate until
that behavior and the remaining indexed/scrolled acceptance are verified.
Evidence: `focus-typing-bf403-01`; the unchanged FOCUS-L03 assertion remains.


The unchanged a950 control (`focus-modal-a950-01`,27.58s) also appended the
forbidden text to the Find dialog. Its final-modal-state and both owned app
cleanup receipts were retrieved. This establishes that the wrong-window
mutation predates the fast path. Candidate435ef5940 scopes all three background
editable write attempts and focused-widget classification to the requested XID,
validates correlated frame geometry, and terminates on window mismatch before
that attempt can mutate or reach another fallback. Indexed/explicit foreground
paths are unchanged. Build and real unchanged focus/range/input/indexed acceptance
are pending; agent evaluations remain on a950 until the candidate is validated.


Exact-window candidate435ef5940 built successfully with focused Rust checks in
CI34394343940. Exact binarySHA256
4031b914b757bde656f5ea6d0b4ca4cb612fbaa8d3d91e3e7b3e4671fd796d99
passed unchanged FOCUS-L03 (29.20s run), foreground/sibling FOCUS-L01/02
(24.63s), CALC-L01/L02/L05 (178.50s), and TYPE/KEY/CLICK/COORD-L01
(104.91s). All13 owned process-group exits, temporary focus-fixture cleanup,
four keyboard maps and container removal were verified. Retrieved saved
E2:E10 contains all nine expected formulas. CALC-L05 took64.476s;
range-address typing took0.245s, retaining the earlier speed improvement.
Evidence: focus-modal-435-01, focus-siblings-435-01, calc-regression-435-01,
input-regression-435-01 under linux-office-setup. The agent workflow now pins
this exact artifact for a fresh measured pair; no new agent result is claimed.

Remaining limitations: the frame-focus refusal also rejects a nonmodal sibling
inside the same application process, whereas FOCUS-L02 uses separate processes.
The pre-existing Tk fallback still targets a global application name rather
than the caller's XID. These are not covered or resolved by the passing ten
checks. Canonical desktop matrix and full20 remain incomplete.

The earlier GitHub DNS failure was absent when execution used the authorized
network path outside the restricted sandbox. Both pushes and the build dispatch
completed there. Revalidate network restrictions before attributing a resolver
failure to a service outage; do not leave an available build path unused.


## COORD-L02: native screenshot coordinates outside a dialog image report success

OpenSky/Terra25 returned a 595×190 save-dialog image, then accepted clicks at
(448,588) and (450,557). Both are below that image. The two calls and follow-up
captures consumed14.67s before accessibility recovery. Native-style Vec2 is
documented in screenshot pixels, but only finite tuple validation was applied;
legacy native input received these points without an image-bounds check.

The facade candidate retains runtime dimensions per observed native target and
rejects click/drag/scroll points outside the latest known image before input.
Every new observation clears old dimensions; an image observation installs fresh
ones. This prevents a dialog crop from constraining the subsequent observed
document. No screenshot is required when no image mapping exists, and the public
Uint8Array screenshot result is unchanged. Legacy opensky.click is unaffected.
Build, E2E typecheck and19 existing facade checks pass. A real Writer baseline
reproduced the missing rejection in coordinate-bounds-before-01 (17.52s).
The candidate passed unchanged COORD-L02/03 and existing SHOT-L01/02 in
coordinate-bounds-after-01 (116.55s). Invalid click time fell from4.412s
(no-op success) to0.649ms (pre-input invalid_params); the corrected valid click
still saved the expected text. The fresh-document case saved its subsequent
edit, confirming that old dialog bounds were cleared. All five before/after
owned app exits, keyboard maps and container removals were verified. The
retrieved saved DOCX files and candidate source hash were independently checked.
These are real SDK outcomes, not a new agent speedup claim.

The preceding completed paired agent result remains unchanged: at SDK42806bd
and driver435, native26 passed (55.715s/8calls) and OpenSky25 failed the strict
reference comparison (182.606s/13calls). Named-sheet cached-value comparison
found all requested Gross Profit and Year_Profit values correct; the only18
value differences are additional E2:E10 and I2:I10 cells. The frozen reference
leaves these blank. This is no longer the earlier missing-save/typing-deadline
failure. Ubuntu patch labels differ24.04.5 versus24.04.4; other compared
fingerprints match. Both cleanup/usage receipts were verified and settled.
Evidence: calc-window-fixed-pair.json, saved-content-diagnostic.json, and the
retained independent post-agent screenshot. Cumulative spending is$82.7464418,
with no active reservation after this pair.


## CLICK-L02: already-focused coordinate clicks repeat accessibility discovery

Agent25 spent86.844s in12 click calls; the background X11 path performs an
accessibility hit test before using real mouse input. Driver candidate4e3028d6f
checks exact native focus, point geometry and topmost input shapes on the same
connection, then uses the existing XTest gesture directly when those checks
succeed. Modifier cleanup and50ms press hold remain shared. It does not change
indexed/Wayland or prior Chromium background-refusal behavior. Source review
is not runtime acceptance; focus/stacking can still change between requests.

New CALC-L06 exercises actual in-cell double-click editing: prepend9 to the
existing78000 value and require978000 saved, with the year cell unchanged.
This distinguishes double-click edit mode from a single selected cell. Current
SDK30b0a73 and driver435 baseline is running CALC-L03/L04/L05/L06 in the same
remote image used for candidate acceptance. Build-only workflow now pins the
new driver; the paid evaluation pin remains the verified435 executable.

The baseline focused-click-before-01 passed all four cases in164.31s. Candidate
4e3028d6f compiled but all four cases failed with action_outcome_mismatch: its
new internal path label was unknown to the common action-record publisher.
Correction4fb1e892e reuses the existing registered xtest transport, preserving
SDK outcome validation. Both build paths now include the existing known-path
normalization check. Failed artifacts remain focused-click-after-01; no speed
claim or paid pin change is accepted before the same real cases pass.

Corrected4fb1e892e built inCI34400764844 and passed the unchanged four Calc
cases in focused-click-after-02 (144.07s versus164.31s baseline). Independent
retained-workbook verification passed, including all nine range formulas and
the double-click edit. Recorded non-driver source/image hashes match. Coordinate
clicks fell from5.984/5.680/5.937s to0.204/0.201/0.174s; indexed clicking still
took24.835s. All four app groups exited and the container was removed. This is
a single sequential SDK comparison; further dialog/focus/input checks remain
pending, and no agent speedup or paid pin change is claimed.

A local read-only comparison helper now checks individual Vitest passes, source
and image equality, driver identity, owned-app cleanup, and actual saved XLSX
contents together. It rejects failed or same-driver comparisons before emitting
speed deltas. It reduces repeated manual parsing but cannot prove current remote
container removal; that remains a separate check.

The exact4fb1e892e executable has now passed17 real SDK cases: four Calc
coordinate/range/double-click cases, eight input/dialog/screenshot cases, three
focus/isolation cases, and two fresh/scrolled indexed-cell cases. Artifacts:
focused-click-after-02, click-dialog-4fb-01, click-focus-4fb-01,
click-indexed-4fb-01. All20 owned app groups exited, eight keyboard maps match,
focus temporary directories were removed, and all four containers are gone.
Retrieved XLSX, DOCX and ODT saved outcomes were independently checked.
BuildCI34400764844 produced SHA256
3550951c28dd413893f39b2fb4e7c5c5cadb1256517800b8937bad8daab420ce.
This is supporting Linux SDK acceptance; the canonical cross-platform matrix
and a fresh agent benchmark remain pending. The evaluation pin now selects
this exact verified build.

The remaining CALC-L05 indexed click took24.835s: the initial background RPC
took9.760s and the foreground retry15.010s. Five full2,316-node AT-SPI walks
consumed24.640s. These are duplicate element resolution/classification steps
inside the driver, not model reasoning. Next candidate should share one fresh,
window-scoped live element resolution within a request; no cross-request pixel
cache or weakened focus checks. This is diagnosis, not an implemented fix.

Candidate4863e5bff shares a fresh live target within each X11 indexed-click
request. Bounds refresh uses retained proxies and exact window correlation is
required. Typed pre-input unavailability can choose pointer delivery; submitted
AX requests that fail are never replayed. A negative doAction acknowledgment is
an error. Build-only pin updated; paid workflow remains accepted4fb. Exact
compile and real indexed/AX/window isolation validation remain pending.

Exact candidate4863e5bff passed build/focused Rust checks inCI34403392571, then
12 real SDK cases: CALC-L01/02/05, FOCUS-L04, and eight input/dialog/screenshot
cases. Artifacts indexed-resolution-486-01, indexed-window-after-01 and
indexed-dialog-486-01 retain the source identity and saved outcomes. Binary
SHA256ebf7f5426faf4c36431c4ea27f819dae6767742e54114ba8f971b3ac20f38968.
All13 owned app groups exited; eight keymaps and focus temporary cleanup were
verified, and the three containers are gone. Retrieved XLSX/DOCX/ODT contents
were independently verified. Cross-window refusal also passed on the4fb
baseline; it is regression evidence, not a newly reproduced defect.

The three indexed click calls now take5.214/5.197/5.216s versus
25.224/24.951/24.835s before. Each new driver RPC contains one2,316-node walk.
Recorded non-driver source/image hashes match; per-case comparisons come from
different suite selections and single samples. This is supporting SDK evidence,
not an agent benchmark or canonical cross-platform certification.

## SCORE-L02: content guard adds an unrequested sheet-order requirement

Native28 passed upstream (score1) with all named-sheet values matching gold,
but the additional Calc content guard compared an ordered list of sheets and
rejected [Sheet1,Sheet2] against [Sheet2,Sheet1]. This task names sheets without
requiring order. The guard now compares sparse content keyed by sheet name;
mandatory upstream rules still enforce order where specified (six of eight
Calc tasks). Original scores and artifacts remain intact; a separate explicit
named-sheet-content-v2 regrade corrects native28. No new agent run is claimed.

Copied real-file checks: native28 now passes, native26 stays passed, OpenSky27
extra18E/Icells still fail, and a damaged J2 copy fails. A scan of28 retained
receipts found no additional upstream-pass/content-guard-fail Calc cases.
The durable canonical-gold control checks original/reordered successes, damaged
J2/extraE2 failures, and explicit upstream sheet-order refusal before paid CI
admission. Original reference hashes remain unchanged; control tempfiles exit.

## DRAG-L01: foreground-only drag refusal has no public recovery path

Agent27's two scrollbar drag attempts both failed: the native-style facade
accepts only two points, so the agent-supplied foreground option was dropped.
The legacy SDK drag calls the driver without click's typed pre-input foreground
retry. Agent recovered through the name box; this did not cause the final
extra-cell scoring failure. The SDK now retries once only for a typed
`OpenSkyError` with code `background_unavailable`, retaining the exact window
and endpoints and requesting foreground delivery. Other errors and errors from
the retry propagate; uncertain input is never replayed. The facade stays a
normal two-point drag.

Real remote DRAG-L02 reproduces the refusal before the change, then passes with
the change: drag A2:A3, fill down, save, independently read A2=2015/A3=2015 and
unchanged A4=2017. The original baseline retains A3=2016. Both owned apps exited
and both containers were removed. SDK build and E2E typecheck passed. This
proves public cell-range dragging; the exact agent scrollbar gesture and
cross-platform drag behavior still need validation. No newer agent result is
claimed.


SCORE-L02 profile admission follow-up: agent attempt 29 stopped before model
admission because its frozen profile still pinned the old scorer and lacked
the new named-sheet control source. The admission guard correctly refused the
mismatch; the rollout omitted the required profile rebuild. Both admission and
agent steps were skipped, and the unused reservation was reconciled at zero
model cost from terminal CI evidence.

Preflight 34405939927 at SDK 80ffd7e passed all 52 real grading controls without
skips and froze profile b273feecbe566519f2c547c4329f8fe7f033c80a416a0715db40d2c060fd0bc5.
All seven retained reference hashes and exporter cleanup receipts were verified.
Both agent arms now pin this profile. The local dispatch controller additionally
compares exact committed scorer/manifest source hashes (including added/deleted
files) with the pinned immutable profile before reserving funds. Its negative
check catches the old profile in under one second; remote admission stays
mandatory. This is grading validation, not a task evaluation or parity gain.


## AX-L03: independent per-node metadata adds observation latency

Driver486's full Calc observation spends5.396s of6.148s walking2,316nodes. The
next driver candidate overlaps independent Action/Value/Text reads within each
node while keeping traversal order, global indices and returned fields intact.
Real acceptance is pending; the paid workflow remains on verified486. The
SDK fixture now retains exact public AX strings and includes drag in method
timing, enabling observation fidelity checks alongside saved outcomes. Recording
occurs after method timing and does not substitute app responses.

AX-L03 initial acceptance: exact1cd buildCI34407163131 passed focused Rust
checks and three unchanged real Calc cases against a new486 baseline. All saved
cells match, and all nine retained AX observations match fields/indices after
normalizing only owned document URIs from launch receipts. Six app groups exited,
and both containers were removed. AX time56.351s→54.356s and suite110.45s→107.55s
are single samples; this modest difference is not a proven general speed gain.
The paid pin remains486 pending broader fidelity and performance work.

Latest agent pair30/31 at SDK8c818c7 and the refreshed scoring profile completed
with valid cleanup/usage. Native passed58.975s/13calls; OpenSky failed143.448s/
11calls. OpenSky spent81.390s in AX reads and106.937s in tools overall, versus
native12.806s tool time. Requested output values match; exactly18 extra E/I
intermediate values cause the mandatory whole-sheet failure. Driver30's indexed
Save took8.637s versus prior27's17.630s, but different agent strategies prevent
attributing total elapsed improvement solely to that fix. Ubuntu patch labels
still differ; other compared fingerprints match. No new broad parity claim.


AX-L03 next candidate: read metadata concurrently across bounded groups of eight
structurally discovered preorder nodes. The same original operation deadline
applies, and only fully enriched prefixes may be returned, preserving global
index semantics. Structural DFS, child requests, limits and frame identity are
unchanged. Exact Linux build and retained-observation/saved-outcome comparison
against1cd are pending; no speed gain or paid pin change is claimed.


AX-L03 bounded candidate acceptance: exact45cb339ea build34408863210 passed
three unchanged real Calc cases in ax-metadata-chunked-01. The binary SHA matches
436eeb2022e6286d335ef4a7c2761ca6ac083cb7ed638fbfb2c6d30f83e0cc86; image and
non-driver sources match the retained1cd baseline. All saved cells and nine AX
observations match (only exact owned document URIs normalized). All three app
groups exited and Docker inventory is empty. AX54.356s→50.751s is a single
comparison, not a broad speed claim. The accepted paid pin remains486.

User direction on2026-09-09 prioritizes behavioral parity over performance;
park further tuning and broaden paired VS Code / Impress outcomes. Also,
linux-typing.yml and remote-driver/build.sh build Rust's unoptimized development
profile, while canonical cd-rust-cua-driver.yml shipping builds use release.
Historical timings describe the tested development build; the effect of release
optimization has not been measured. This is a comparison caveat, not a new
behavior failure or a reason to defer broader coverage.

Iteration retrieval: work/fetch-linux-sdk-artifact.py retrieves completed owned
SDK artifacts in one compressed SSH stream, verifies terminal report/container
state and safe archive members, and stages without output overwrites or changes
to remote ownership. Its first real use retrieved ax-metadata-chunked-01 in1.521s;
parent independently verified source hashes, saved outcomes and cleanup above.


Dashboard comparison guard: the local scorecard now requires matching nonempty
Code fingerprints for VS Code pairs and matching grading profiles whenever
either arm provides one (mandatory for Impress). It also compares run profiles.
Historical Writer pairs that both predate grading profiles remain eligible.
Seventeen retained-record and changed/missing-field controls passed; the live
server was restarted on the same localhost port and verified to show native32
passed/OpenSky33 running before the latter completed. This validation concerns
score selection, not new desktop behavior; the real Code pair is documented in
the Linux plan and campaign evidence.


One-run artifact finalization: work/finalize-linux-agent.py composes the existing
fetcher's terminal/source/identity checks, exclusive artifact installation and
unchanged usage reconciler. It refuses live, interrupted, invalid and incomplete
cleanup evidence, and never dispatches paid work or updates dashboard narrative.
Offline controls passed; first real uses finalized OpenSky34 and native35. Both
independent saved-background checks and raw/adapted graders passed, along with
cleanup and usage. This removes manual fetch/install/reconcile handoffs without
introducing a second accounting policy. Artifacts remain staged for audit.


Fixed-software baseline indexing: a separate immutable plan and refreshable
summary prevent historical SDK versions or passing retries from inflating the
current20-task metric. The refresh helper checks raw receipts, configuration,
cleanup and evidence hashes, retains failures and inventory of excluded/later
attempts, and does not alter scoring or accounting. Six imported arms and all
supporting hashes verified; seven missing/changed-evidence controls rejected.
The live endpoint was verified at3/20 pairs, native3/OpenSky2, with old-build
Writer rows pending and native36 running. The OS-label exception is explicit;
this is not acceptance of the strict identical-environment campaign requirement.


Baseline selection safeguards: refreshing now refuses to drop or replace a
previously selected arm, or accept changed supporting hashes. This prevents a
later passing retry from silently replacing a failure after evidence loss.
Inventory classifies pending evidence, invalid terminal attempts and later
valid duplicates separately; the status page renders concise notes without
counting pending attempts as failures. Offline loss/replacement/hash-change
and evidence-state controls passed. Live endpoint verification kept native36
Passed/OpenSky37 Running,3completed pairs,0unscored terminal attempts and one
pending-evidence attempt. Raw outcomes and immutable plan remain unchanged.

Native36 passed Calc fill-blanks in48.932s/5calls with valid cleanup/usage. A
separate saved-file diagnostic verified all cells against frozen gold: exactly
46 originally empty cells changed insideB1:E30, with all other values preserved.
OpenSky37 is dispatched on the same source; its result remains pending. The
shared diagnostic helper writes only additive analysis, never official scores.


Fill-blanks pair36/37 completed on unchanged8c software with all recorded
fingerprints matching, including Ubuntu label. Both passed:46originally blank
cells filled insideB1:E30, every other cell value preserved, full saved values
matching gold and cleanup verified. Native48.932s/5calls, OpenSky246.626s/16calls;
no timing change is required for this behavioral pass. The fixed baseline is
4/20pairs with native4/OpenSky3; the earlier Calc-profit failure stays selected.

The OpenSky trace contains79 public SDK calls with one rejected operation:
getAXState({query:"A1"}) on a native app. It recovered with ordinary screenshot
and name-box actions; all78 other calls completed. Shared StateOptions.query
is exposed on App but runtime rejects native app query/context as browser-only.
A future type/documentation clarification is warranted; this is API-use
confusion, not evidence of driver input failure. Do not modify the frozen
baseline source to tune this otherwise successful run.

Hosted live monitoring: gh run watch --compact --interval30 can report stage
changes/completion. The frozen runner saves agent stdout to events.jsonl and
uploads it after the task step, so no individual-agent action feed exists now.
Quiet workflow logs are not a hang signal. Keep a live job rather than restart
on an observation timeout; no new instrumentation is needed to continue coverage.


OpenSky38 passed sorting records by amount in122.419s/15calls. All76 nonempty
saved cell values match the original hash-verified gold workbook; cleanup and
final usage receipts passed. Native39 is dispatched on the same frozen source.
Current settled estimate$87.8222508 plus$5reserved remains inside the$100 limit.
Sorting remains unpaired until native39 is verified; the full-set baseline stays
4/20completed pairs with native4/OpenSky3. The stage watcher ended successfully
and did not affect the underlying run or impose a task limit.


Sorting pair38/39 is complete: both saved all 76 nonempty cell values exactly
as the frozen gold reference, with cleanup and usage verified. The fixed
software baseline now contains 5/20 pairs (native 5 passed, OpenSky 4 passed).
Ubuntu patch labels differ for this pair; other compared fingerprints match.

Native40 passed the dropdown task. An additive saved-file inspection verified
literal choices Pass/Fail/Held, coverage D2:D29, unsuppressed dropdown arrow,
validation settings matching gold, and unchanged cell data. The frozen grader
does not check the arrow flag; this supplemental evidence does not alter its
score and does not constitute fresh GUI rendering. OpenSky41 is pending.

Chart diagnostic preparation: the frozen reference contains one clustered
column chart on Sheet2, title Sales & COGS, with two ten-week series. Read-only
inspection can report full title, series names/cache points, source cells and
charts on all sheets, including details not fully checked by the frozen grader.
Reference-only verification passed; no new agent acceptance follows from it.
Eight tiny numeric differences already exist between original and gold input
values, so diagnostics report both comparisons without attributing those
differences to the agent or changing the scoring policy.


Dropdown pair40/41 completed: native passed, OpenSky failed, with all compared
environment fingerprints matching and both cleanup/usage receipts valid.
Saved-output diagnostic shows correct Pass/Fail/Held choices only in D2;
D3:D29 has an empty list. Existing cell values are unchanged. This validates
the original failure independently and narrows the behavior to applying list
entries across the selected range; cause classification remains pending trace
inspection. Keep this failure selected in the frozen baseline (6/20 pairs,
native 6 passed, OpenSky 4 passed). Chart42 is running on unchanged software.


Chart pair42/43 passed on both backends, with all compared fingerprints matching.
Both saved chart structures (full title, two ten-week series, cached values and
placement) and worksheet values match the original reference. Fixed baseline:
7/20 pairs, native 7 passed and OpenSky 5 passed. Native44 subsequently failed
splitting names/ranks: eight output cells differ from gold, with all original
nonempty values preserved. Matching OpenSky45 remains pending.

DROPDOWN-L01 is a real public-SDK diagnostic using the original workbook and
accepted driver486/SDK8c in the disposable remote Linux desktop. Before01 failed
setup because OCR read Entries as Enties; cleanup passed and no target input
was attempted. Fixture accepts only that observed OCR variant. Exact numeric
serialization (9.0 versus9) is normalized without tolerance; OCR caret suffixes
are tolerated only in the visual observation, while saved choices stay exact.
Before02 verified multiline text remains in the visually focused Entries field
with three correct choices, then failed immediate CTRL+S after closing Validity.
The SDK intentionally retains the exact observed window ID for input and refuses
when that dialog is gone; a new observation adopts the workbook window. This
is a post-dialog API usability limitation, not proven driver input corruption.
Before03 adds the normal post-dismissal observation to complete the saved range
check. No passing saved-output acceptance is claimed until it finishes. Both
prior runs retain source archives, screenshots, output readers and clean exits.


Before03 passed the real public SDK workflow. Separate observations verified
that multiline typing left the Validity dialog open with all three choices.
After observing the workbook following dialog dismissal, save succeeded. Both
the fixture reader and an independent openpyxl inspection verified unchanged
original cell values and exactly the gold list rule across D2:D29. All 28 cells
have Pass/Fail/Held with visible dropdown arrows. Cleanup receipt confirms app
exit; retrieved Docker inventory is empty. This rules out a general multiline
entry failure for correctly coordinate-focused Entries. It does not resolve
the original agent's ambiguous indexed target1551, replace its frozen failure,
or validate every multiline/control/platform combination. Full source archive
and all three outcomes are retained under linux-office-setup/dropdown-multiline-*
for reproduction. No driver/SDK implementation changes or model calls occurred.


Splitting pair44/45 is complete: both failed (eight wrong/missing output cells
for native, six wrong cells for OpenSky), with original nonempty cell values
preserved and cleanup verified. Ubuntu labels differ; other fingerprints match.
Frozen baseline:8/20 pairs, native7/OpenSky5. No failed attempt was replaced.

Native46 passed the slide4 table-header task. Read-only PPTX inspection confirms
T1/T2/T3/T4 and no other text changes; the original table bounds, row heights,
column widths and explicit Russo One32.3pt white header fonts remain unchanged.
The diagnostic retains raw gold comparisons, style fields and adapted-reference
hash receipts without claiming a fresh render or changing the official score.
OpenSky47 is pending. The helper improves failure diagnosis, not the model score.


Header pair46/47 is complete: both passed, with identical compared environment
fingerprints and saved table snapshots (text, header fonts and geometry). Both
preserve other slide text. The fixed baseline now has 9/20 pairs: native 8 passed,
OpenSky 6 passed. Original failures remain selected. OpenSky48 is running the
next duplicate-slides task on the same frozen source.

Duplicate-slide diagnostic preparation verifies the requested order as original
slides1–24 followed by copies23 and24. It reports exact text order, picture hashes
and geometry separately, preserving raw reference differences and official
scores. The raw golds contain unrelated earlier-slide differences; the existing
frozen task-preserving scoring profile handles that policy. No new agent result
or adapted-reference rendering is inferred from this read-only preparation.


## CLICK-L03: indexed editable activation can submit a dialog

Observed: OpenSky dropdown41 batches an indexed click on an unlabeled text
control advertising `activate` with multiline typing; the next observation is
the workbook. The trace does not establish whether click or typing submitted
the dialog. Coordinate-focused DROPDOWN-L01 now passes the same multiline
string and all 28 saved validations, so general newline delivery is not the
remaining hypothesis.

Source inspection found an inconsistent click contract in Linux AT-SPI:
coordinate actions avoid EditableText activation because it can submit dialogs,
while both indexed activation entry points allowed it. An unvalidated local
driver candidate now refuses activation before input for editable controls,
uses the existing exact-target pointer fallback, and requires foreground
recovery when that target window is not already focused. Unknown/failed AX
mutations still cannot be replayed. The baseline remains driver486/SDK8c.

Validation so far: Rust parsing and diff hygiene only. GitHub/remote network
access is unavailable; no Linux build, real GUI result, promotion, or parity
pass is claimed. Existing failed agent41 remains selected.

Required real regression: in a fresh LibreOffice Validity dialog, use a visible
single-line editable field that exposes `activate` (such as the Input Help
Title field), identify it from a fresh public AX observation after entering a
unique marker, then indexed-click it and observe before sending more text.
Assert the dialog stays open, editing changes that field, and accepting/saving
persists that title with other document values unchanged. Run first on486,
then the exact candidate. The Entries editor alone may expose no activation
action and therefore cannot establish coverage of this bug. Also rerun
DROPDOWN-L01, indexed Calc selection, and focus/modal isolation. Verify owned
app exits and container removal. Background editable clicks may now explicitly
require foreground delivery; cross-platform/Wayland behavior is unverified.

CLICK-L03 is now drafted in e2e/specs/linux-editable-click.test.ts with its
fixture in e2e/fixtures/linux-editable-click.ts. Setup uses the real dropdown
fixture, fills valid choices, opens Input Help, locates Title from its screenshot,
and enters a unique marker. A fresh AX snapshot must identify exactly one
marked text control advertising activate; no historical ordinal is reused.
Focus is moved away before the tested indexed click. The test checks the dialog
is still open immediately after clicking, edits the title, accepts/saves, and
reads the external workbook for all28prompt titles, original choices and cells.
Screenshots and AX observations are retained. Typecheck and a read-only reader
check on retained workbooks are supporting checks, not real GUI acceptance.

Review clarified the native Wayland limitation: the generic editable guard
refuses before input, while the existing explicit-foreground pointer fallback
is X11-only. This candidate prevents accidental activation on Wayland but does
not supply working indexed editable clicks there. A Wayland pointer/focus
implementation and real compositor validation remain required. X11's exact
window correlation and no-replay rules remain intact by source review.

Pre-run review corrected CLICK-L03's inherited dialog-open observation: the
Validity AX dialog determines open/closed state. The Entries label disappears
on Input Help and cannot serve as dialog-dismissal evidence. The test also
asserts the dialog remains open after replacement typing. This is a fixture
correction before its first GUI run, not an observed driver pass.

CLICK-L03 before01 reproduced dialog submission from the indexed click alone
on accepted driver486 and SDK8c. The fresh marked Title target was1597 with
activate; immediately after click, both AX and screenshot returned to the
workbook. Failure was the first post-click assertion, before replacement
typing. App group104/pid134 exited; container removal and source hashes are
retained. An isolated candidate fbf0d0c632763f0daae0e326c1d2fe3a44a89f2a contains only this
correction on486 (cherry-picked with provenance), excluding metadata speed
candidates. The separate build-only workflow is pinned to it; paid baseline
remains8c/486. Build and candidate GUI acceptance are still pending.

CLICK-L03 after01 passed on isolated driverfbf0d0c (binary SHA
3506fcdad1a21b474edbc620e8f574f9de3bde5f0b3c4b49aed4f875f31a8bb9)
and identical SDK8c/test archiveafd3ac3c. CI34444425615 compiled and passed
64focused Rust tests; its model-evaluation job was skipped. Fresh screenshots
and AX show the marked field stays in the open dialog after indexed click
and replacement typing. The original driver closed it on the first click.
An independent openpyxl reader verifies all28saved prompt titles, unchanged
Pass/Fail/Held lists, and every original nonempty cell value. App group103/pid128
exited; retrieved container inventory was empty. Both before/after artifacts
and source archives are retained under linux-office-setup/editable-click-*.
This is real narrow X11 acceptance, not an agent-task retry or Wayland/matrix
acceptance. Focus, indexed Calc, and multiline regressions remain pending;
paid baseline pins and its frozen failed dropdown arm remain unchanged.

The same isolated candidate passed seven subsequent real regressions in
editable-regressions-after-01: CALC-L01/L02/L05, FOCUS-L02/L03/L04, and
DROPDOWN-L01. Full SDK source still matches8c; archivef9123277 retains all
tests, fixtures and original inputs. Independent saved-file checks verified
E2/E50, every E2:E10 formula and cached result, all outside cells, both documents
in each focus test, and all28dropdown choices. Ten unique owned app groups
exited; the final container inventory was empty. No model calls or spending
occurred in these SDK tests. The driver change is supported for these X11
workflows; native Wayland remains explicitly unsupported for this fallback,
and the canonical cross-platform matrix/release acceptance is still pending.
Frozen agent baseline and accounting remain unchanged by these checks.

### FINALIZE-L01 — completed arms missing from the live baseline

The local controller finalized and settled a run but required a separate manual
`refresh-linux-baseline.py` invocation before its outcome appeared in the frozen
baseline. The local `work/finalize-linux-agent.py` now calls that existing verifier
after reconciliation when an existing plan matches the arm software revision.
It does not create plans, regrade outcomes, dispatch retries, or change budget
limits. A refresh failure explicitly reports that settlement already succeeded.

Validation used retained passing image arm52 and failing dropdown arm41: both
refresh paths preserved every selected outcome and provenance hash, the frozen
plan, ledger and dashboard selection. An older software arm was skipped. This
is controller validation only; no new agent or GUI acceptance is claimed.
Legacy dashboard running markers remain caller-owned because task/backend alone
cannot distinguish a completed arm from a later attempt. Exact run identity is
required before automating their removal.

### LIB-008 Linux follow-up — selection refuses supported recovery

Frozen agent arm62 (CI34508871812, SDK8c/driver486) called
`selectText(1088, "2")` twice. Runtime trace lines2/5 report background delivery
unavailable before the keyboard selection completes. `pressElementKey` sends
background first, but its focus-error matcher does not recognize this typed
`background_unavailable` refusal. The facade also ignores the agent-provided
`delivery_mode` option on selectText. A native-app query observation was separately
rejected as browser-only. No source correction or real selection acceptance is
claimed yet.

The agent recovered with coordinates and keyboard selection, deliberately
formatted the title only, and saved unchanged text with1of8gold subscript digits.
This incomplete scope is independently established by saved character formatting
and its final answer; the API refusal is not proven to cause the seven omissions.
Original failed score and trace remain retained.

Before changing recovery, reproduce a saved replacement in a non-first paragraph:
the current algorithm combines an element-local offset with Ctrl+Home document
start, and per-key recovery can refocus between movements. Cover duplicate/context
selection, sibling windows and modal refusal. Any replay must use a typed
pre-input refusal and an exact window, not a widened generic error regex.
The independent diagnostic is retained in arm62/subscript-diagnostic.json.

Native arm63 (CI34509449602) independently produced the same title-only1of8
subscript result with unchanged text. Both original failures are now paired.
This is counterevidence against attributing the seven omitted occurrences to
OpenSky selection refusal; the refusal itself remains an observed SDK gap.


LIB-008 Linux selection reproduction (2026-09-10): the frozen strikethrough pair
now establishes a native-only outcome gap. Native64 struck all 387 characters
in the requested final paragraph; OpenSky65 struck none after two selectText
refusals, then incorrectly reported success. Original scores remain unchanged.
The independent saved-file evidence is in `65-writer-strike-opensky/linux-office/strike-diagnostic.json`.

`SELECT-L01` reproduces the exact pre-input refusal on the unchanged SDK8c and
driver486 in an owned Linux Writer window. Its later paragraph contains an
emoji, a combining character, and two identical words; prefix/suffix identify
only the second word. Selection fails before typing; all three original
paragraphs remain intact. App process-group exit, temporary removal and empty
container inventory are verified in `linux-office-setup/selection-before-01`.

Candidate implementation in this work branch calls the Linux driver's new
`select_text` operation with the observed token/snapshot. It accepts only an
explicit completed, verified result; no keyboard or pointer replay occurs.
The isolated driver candidate uses live Text-interface range/caret mutation
and read-back. `SELECT-L02/L03` cover before/after caret placement. SDK build
and E2E typecheck pass. Linux candidate build/runtime, formatting action after
selection, sibling-focus preservation and modal refusal remain pending; this
is not yet a verified fix or an improved agent result. The frozen paid baseline
continues using SDK8c/driver486. Older drivers lacking the new operation refuse;
there is intentionally no fallback to the known incorrect Linux key sequence.

Linux CI34512906961 caught one X11 reply-lifetime compiler error in driver1bad.
Candidate1c39cd44d binds the focus reply before the connection is dropped.
The first build failed before artifact creation; no GUI result or model spending
was produced. A corrected Linux build is pending.

CI34513349949 built1c39 and passed67focused Rust checks. Its real SELECT-L01
run (`selection-after-01`) was refused by missing canonical risk registration
before selection. All three paragraphs stayed unchanged and app/temp/container
cleanup passed. Driver00fb3c4 adds select_text to the existing R1 desktop-input
classification, window-scope/own-process/origin restrictions and token capability;
it does not weaken unknown-tool denial. The two focused policy tests pass locally.
Corrected Linux build and native acceptance remain pending.

CI34514497505 built00fb and its focused checks passed. Real SELECT-L01
(`selection-after-02`) then reached the Text interface and refused a character
count mismatch before mutation. Original Unicode paragraph/text and cleanup
were independently verified. Candidate12c5233 selects an offset convention only
when native count exactly equals live scalar or UTF-16 count, then verifies
GetText over the full matched substring before applying range/caret mutation.
Unknown counts and incorrect substring probes remain refusals; the actual unit
is reported. Five pure matching/unit tests pass. Linux build and real acceptance
remain pending. SELECT-L04 is drafted to assert saved paragraph strikethrough
and unchanged text, rather than only a successful selection call.


CI34515619007 built driver12c5233. Real `selection-after-03` passed the
unchanged SELECT-L01: only the contextual second word was replaced in the saved
ODT. `selection-format-after-01` passed both before/after caret tests, but L04
saved no strikethrough. Independent XML inspection confirmed unchanged text and
absence of any strike property; this was not a parser false negative. All owned
apps exited, temporary files were removed, and container inventory was empty.

Toolbar diagnostics isolated a stale target problem: selection enables Cut,
Copy and other menu actions, changing the indexable application-wide ordinals.
The old token still resolves to its earlier ordinal and can actuate a different
control. A fresh AX observation before the click passes saved strikethrough
(`selection-toolbar-diagnostic-01`, D01); an observed screenshot pointer passes
(run02, D02); observing only after the stale click still fails (run02, D03).
This distinguishes target freshness from waiting after the click. The first D02
attempt used an invalid coordinate object; it failed before input and is retained
separately from the corrected public tuple call. Both runs verified text and
app/temp/container cleanup. No model evaluation spending was incurred.

L04 now observes after selection before using the SDK's stable public toolbar
index. This represents an agent observing its changed UI, not acceptance of the
old silent mis-target. A separate stale-token guard must verify that the driver
refuses old references after submitted selection mutation. Scoped PID snapshot
invalidation is in development because index ordering spans sibling windows;
other sessions/PIDs must remain untouched. Formatting after fresh observation is
verified diagnostically; guard acceptance and agent improvement remain pending.


Driver624fc7e implements invalidation at submission and completion/unwind for
all snapshots belonging to the PID/current runtime. Twenty-five focused registry
tests pass locally; Linux build and real acceptance are pending. It cannot revoke
already-resolved concurrent actions or prevent a late concurrent snapshot from
registering after completion. The new SELECT-G01–G04 public-SDK drafts cover a
same-process focused sibling, active Find dialog, superseded snapshot, and stale
toolbar refusal followed by fresh-target formatting. E2E typecheck and discovery
pass; these checks are not GUI acceptance. The original SELECT-L04 failure is
retained in its immutable artifact directory.


CI34517797281 built624fc7e successfully and passed its focused checks (model
job skipped). The first G04 run on prior12c stopped at selection with
`selection window identity is ambiguous`: two maximized Writer windows shared
identical geometry. It did not reach the stale-toolbar assertion. Both saved
documents stayed unchanged; cleanup passed (`selection-guard-before-01`). This
is a separate unresolved limitation. G04 now opens one window; sibling/dialog
fixtures arrange distinct window bounds through ordinary window-manager input,
and no longer accept ambiguous-identity refusal as evidence of their guards.


The narrowed unchanged G04 reproduced the intended failure on12c in
`selection-guard-before-02`: selection succeeded, then the stale toolbar click
resolved instead of rejecting. The identical fixture passed on624 in
`selection-guard-after-01`: stale reference refused, fresh target clicked, and
exactly `needle` had saved solid strikethrough with all text unchanged. Saved XML,
app exit, temporary removal and empty container inventory were independently
verified. This accepts the sequential stale-target correction for the tested
Writer workflow; G01–G03 and full L01–L04 on624 remain pending. No new agent score
or model spending is claimed. Original failed outcomes remain retained.


`selection-guards-after-02` stopped all three remaining guard cases in fixture
setup: the image has no Openbox maximize/restore key binding, so assumed Alt+F10
did not restore the sibling window. No guard assertion was reached. Fixture
setup now sends the ordinary EWMH restore request to the owned window and checks
the reported state before arranging distinct bounds; no application behavior is
mocked or driver input changed. Typecheck passes; remote rerun pending.


All four SELECT-L01–L04 cases passed on624 in
`selection-regressions-after-04`: exact contextual replacement after Unicode,
before/after caret placement, and saved full-paragraph strikethrough after fresh
observation. Saved text and formatting were independently inspected; all four
apps/temp directories and the container were cleaned up. This supersedes the
pending normal-regression status, not the frozen agent scores. Candidate
linux-agent.yml now pins the tested624 binary from CI34517797281; its immutable
native package and scoring profile are unchanged. No candidate agent dispatch
has occurred yet.


`selection-guards-after-03` reached the real refusal assertions. G01/G03 then
failed exact saved text because LibreOffice corrected `document. needle.` to
`document. Needle.` after typing; G02 failed during teardown capture of the
already closed Find dialog. Saved documents and cleanup were inspected. Fixture
text now uses `document contains needle.` so ordinary autocorrection does not
change unrelated fixture text. Teardown captures each distinct still-live window
once and retains optional capture errors separately, avoiding a closed-dialog
capture turning a completed behavior test into failure. No driver behavior or
LibreOffice settings changed. Typecheck passed; clean rerun pending. Original
failures remain visible in retained artifacts.


`selection-guards-after-04` passed G01–G03 on unchanged driver624: focused
same-process sibling refusal preserves subsequent sibling typing; the active
Find dialog and both documents remain unchanged after refusal; a superseded
snapshot rejects selection and later target typing appends exactly once. Saved
target/sibling files, all app/temp exits, empty container inventory and absence
of capture errors were independently verified. Together with earlier G04 and
L01–L04 acceptance this completes the focused sequential selection suite on624.
Coincident maximized-window ambiguity and concurrent-client races remain explicit
limitations. Proceed to a separate matched agent correction campaign; original
20-task baseline and all failed attempts remain unchanged.

## LIB-009 — Indexed dialog submission can leave no saved dropdown

- Symptom: candidate agent CI34521973488 on SDK e8e6b647 / driver624fc7ea entered List validation and Pass/Fail/Held visibly, called the previously observed OK index1578, and reported success. The retained XLSX is byte-identical to the input and has no validation rules. Native34521515914 passed on matching runtime and scoring fingerprints. Both completed and cleaned up correctly.
- Layer/cause: unresolved. The modal screenshot shows the choices; an earlier out-of-image coordinate click refused before input, after which indexed OK was used. The last observed full dialog labeled index1578 as OK. Possible index/target drift or activation semantics; the agent's unsupported app query and combo selection attempts are separate friction and do not yet explain the unsaved rules.
- Evidence: campaign-linux-selection-candidate/calc-dropdown-pair.json and each arm's dropdown-diagnostic.json, screenshots and action receipts. Original score preserved: native pass, OpenSky fail.
- Validation: added DROPDOWN-L02 to reuse the OK index observed before changing criteria, refresh the visible dialog after Entries input, click the observed button, then require the saved rules across D2:D29 with all existing values unchanged. Typecheck passed; remote dropdown-submit-before-01 pending.
- Scope/tradeoff: no runtime change or paid rerun yet. Existing coordinate-submission test remains separate. This is a consumer-visible saved outcome test, not an assertion of driver internals.

- Follow-up evidence: dropdown-submit-before-01 never reached GUI (input asset absent). Explicitly mounted the verified original workbook in stagev2. Unchanged DROPDOWN-L02 passed in dropdown-submit-before-02; independent XLSX check verifies List choices on D2:D29, all existing values unchanged, app exit and container removal. Generic indexed OK failure is not reproduced. The paid agent typed the option name, while this control used arrow-key selection. DROPDOWN-L03 isolates that public interaction in dropdown-submit-typed-list-01; result pending.

- Further controls: DROPDOWN-L03 passed in dropdown-submit-typed-list-01 (typed option name, indexed OK); independent saved check confirms all28rules and unchanged values, cleanup passed. DROPDOWN-L04 passed in dropdown-submit-rejected-point-01 (combined AX+screenshot, rejected outside-image coordinate, retained indexed OK without an intervening read); artifact retrieved; independent saved check confirms all28rules, unchanged values, app exit and container removal. These results do not reproduce the paid failure. Next discriminating route is the full observed prefix through the public CUA REPL transport, including the original combo actions and selection refusal. No runtime patch has been justified.

- Public transport replay: added actual stdio MCP client and DROPDOWN-L05, preserving recorded cell boundaries, expected query/selectText/outside-image errors, and observations. Numeric control identities are resolved only from emitted current-desktop AX text. The replay additionally handles the normal XLSX format confirmation if submission succeeds. Initial remote attempt01 stopped before startup due nested asset mount under a read-only source mount; bundle now contains the verified workbook. Attempt02 opened/cleaned the owned Calc instance but MCP rejected the Docker host because driver-runtime.ts still required GITHUB_ACTIONS. Reused assertDisposableLinuxDesktop (explicit Docker marker plus /.dockerenv, or CI) while retaining PID/start-time/socket/executable/source/permission checks. Attempt03 is active; no model calls or spending.

- Attempt03 reached the original selectText pre-mutation refusal and continued in the same REPL. It then stopped because recorded CI dialog coordinates (474x455 image) exceeded the remote GTK dialog (425x416). The replay now scales the two in-dialog points from the observed current image dimensions, preserving the explicit outside-image rejection and numeric identities from current AX. Attempt04 pending. This is an explicit replay layout adjustment, not driver failure or agent score evidence.

- Attempt04 passed the complete public MCP sequence after screenshot coordinate scaling. Independent XLSX inspection confirms the requested choices on D2:D29, all existing values unchanged, and normal validation flags. App, MCP group and temporary directory cleanup passed. This does not reproduce the paid failure; recorded CI versus remote GTK layout differs. Added an allowlisted `repl_case=dropdown` option to the existing Linux agent workflow (repl mode only) to run the same regression under the CI desktop installer and pinned driver/native package, with no model or reservation. Existing async-typing default and agent mode remain intact. Typecheck, shell syntax and diff checks pass; CI acceptance pending.

- CI34525442189 passed DROPDOWN-L05 on source7685955 and driver624. Verified the archive digest, source, terminal Vitest result, all28saved choices, unchanged sparse values/sheet order, and app/MCP/temp cleanup. Full desktop shell teardown has no separate verified receipt. A supplemental paid OpenSky run34526207718 on unchanged frozen e8/624 is being retained in a separate reliability campaign; original correction scores stay native2/2, OpenSky1/2. Source review also found live ordinal index resolution as a structural identity risk, but no causal link to this failure is proven.

- Supplemental agent34526207718 finished with LibreOffice Signal6, unchanged input workbook, and no validation. Its last two intended Validity activations actually requested indices observed as Descriptive Statistics and Sampling; do not infer driver retargeting from the agent titles. The original submission failure was not reproduced. The run is retained as an unsuccessful attempt with invalid paired evaluation, app/temp cleanup verified, and terminal usage settled at $0.9416428 through a reviewed app-exit-specific reconciler. No score replacement or further paid retry. GTK INDEX-L01 is being added to isolate the separate ordinal-identity risk; its first disposable run lacked system GI and stopped before app launch.


## LIB-010 — A changing AT-SPI index can activate a different control

- Symptom: real GTK INDEX-L01 observes OK at index1, enables an earlier disabled control using the public SDK, then clicks the retained OK reference without another observation. Driver624 returns success but the visible outcome is CANCEL. INDEX-L02 removes the observed OK control and uses its retained reference; driver624 activates Enable earlier control instead of rejecting the missing target.
- Cause/layer: Linux indexed click resolves the observed ordinal in a fresh enabled-node traversal, so insertion/removal reassigns the ordinal to another object. The existing snapshot token verifies membership, not stable accessible object identity.
- Evidence: gtk-index-drift-before-02 and gtk-index-remove-before-01 retain initial AX/session bindings, click receipts, final screenshots, exact624 driver identity, and app/temp/container cleanup. The first GTK attempt lacked system GI and stopped before launch; it is retained as setup failure.
- Fix: driver8edfebc14001f58e08488cc7b2f01ca692100347 binds the observed target to its AT-SPI object and owning frame, scoped to runtime/PID/window/snapshot; a disappeared target is rejected before input. Draft driver PR3 contains the correction. The later6c3279 head only fixes inherited module declaration formatting; the compiled and GUI-tested candidate is8ed. Paid workflow promotion remains pending supporting regressions.
- Validation: INDEX-L01/L02 are real public SDK tests with an actual GTK app; typecheck passes. Both fail meaningfully on624. Tests verify user-visible action results, with snapshot maps retained only as diagnostics. No mocks or paid agent calls.
- Limitation: these controls prove a driver defect independently; they do not establish that it caused the earlier Calc dropdown failure or the later LibreOffice crash. Original paired scores remain unchanged.

- Candidate acceptance: CI34528098770 built8ed and passed focused Rust checks. gtk-index-identity-after-01 passed INDEX-L01 (retained OK activated OK after the tree changed) and INDEX-L02 (removed OK rejected with no other action). dropdown-index-identity-after-01 passed the unchanged full public MCP sequence; independent saved XLSX inspection confirms choices on D2:D29, unchanged original values/sheet order, and visible-dropdown saved flags. App/MCP/temp cleanup and empty remote container inventory verified. Supporting Calc/window/editable-control regressions remain in progress. Ordinary PR Rustfmt now passes after6c; one MCP discovery check failed and remains under inspection. These are supporting diagnostics, not canonical desktop certification or a new agent parity score.

- Supporting index-identity-regressions-after-01 passed CALC-L01/L02, FOCUS-L04 and CLICK-L03 on exact8ed. Independent saved-file inspection confirms E2 formula B2-C2=75000, scrolled E50=42, unchanged target/sibling documents, and all28dropdown choices/help titles with original values preserved. Five owned app exits and empty container inventory verified; FOCUS-L04 has explicit temporary-removal receipt. Seven focused public SDK/MCP cases now pass across the three candidate runs. This permits a separate experimental agent smoke (campaign-linux-index-candidate, SDKa1e9e40), not release readiness; canonical desktop certification remains pending.

- Iteration friction: GitHub initially returned the generic workflow display title immediately after accepted dispatch34530155297; the next read returned the exact reservation title. The local pair monitor now retries only that specific generic title up to three status reads, revalidating all other identities each time. Wrong reservation titles/API errors still stop. This does not redispatch or impose an agent deadline; offline gate checks are helper validation, not driver acceptance.


## Linux correction smoke: empty dropdown lists and builtin discovery interruption

- Exact SDKa1e9e40/driver8ed OpenSky run34530155297 completed a valid failed attempt:472226ms,30calls,$1.4920846. The saved workbook contains two empty list rules whose union covers exactly D2:D29; all59original cell values and sheet order remain unchanged. The agent claimed success, but the saved file has no requested choices. Call25 exposes a text0control absent from its screenshot; call26 sets that control to a literal escaped string, changes AX text, and produces a byte-identical screenshot with visible Entries still empty. Hidden-control emission and missing labels/selection text are under investigation; this is not proof of a new click identity defect. Original scores are preserved.
- Native counterpart34531183179 was interrupted before desktop admission for builtin codex.list_mcp_resources returning resources:[] (events44–45). App/temp cleanup passed, but no final usage receipt exists; the existing interrupted-run reconciler settled its full$5reservation conservatively. It is invalid/unscored, not a native task failure. Cumulative settled conservative accounting is$110.835879 with$0reserved, approved through$150. No further paid runs yet.
- Harness correction: permit only Codex builtin list_mcp_resources/list_mcp_resource_templates inventory, with optional desktop-only server and string cursor, no unknown args/plugin context. Retain/count the calls; resource reads, other servers, code/actions and existing policy checks remain rejected. Only desktop execution errors invalidate desktop program state. Sixteen focused policy checks, retained-event validation, TypeScript and diff checks pass; no new live agent acceptance is claimed. A new committed evaluator source must be frozen for future pairs.
- Read-only OBSERVE-D01 records public AX/screenshot plus raw AT-SPI visibility and label relations in the real List dialog on the existing disposable remote desktop. This diagnostic is not a behavior pass or parity score. visibility-probe-before-01 is running on exact8ed with unchanged e8 SDK runtime; all raw metadata reads are separate from the public SDK actions used to prepare the dialog.

- OBSERVE-D01 completed with app/container cleanup: raw AT-SPI states show the numeric Maximum field has showing=false/visible=false and inactive-tab contents have showing=false; visible Entries has showing=true/visible=true beneath a panel labelled-by Entries. Public AX nevertheless emits hidden numeric/tab controls without those distinctions. Text-only probe calls hit a GI method-name collision and were retained as errors; state/relations/bounds reads succeeded. The next probe uses explicit Atspi.Text.get_text (not yet rerun). This is diagnostic confirmation of observation fidelity loss, not a completed visibility fix.


## Linux visible-control regression and candidate

VISIBLE-L01 uses a real Calc List dialog and ordinary public SDK actions. It requires hidden Maximum controls to be absent, identifies the Entries editor through its public label, enters the three actual newline-separated choices, switches tabs to check visibility changes, then verifies all28saved rules and unchanged original values. Fixture code owns observation parsing and cleanup. visible-controls-before-01 fails meaningfully on8ed at hidden Maximum; app exit and empty container inventory verified. The first probe's assertions are not substituted for this saved-outcome regression.

Driver PR4 (codex/linux-observation-visibility) implements visibility-aware rendering while consuming every original actionable ordinal, retains unknown state, reads actual label relationships without screen-proximity inference, and clears stale sibling ancestry even for passive/hidden containers. It is stacked on the existing identity correction. Build/after acceptance are pending; closed menu descendants and Wayland observations require explicit regression/coverage accounting. No new paid run or agent score is claimed.

- Candidate2ff75 CI34533766015 builds and passes focused Rust checks. visible-controls-after-01 passes hidden-field filtering, labelled Entries editing, and tab visibility/text retention, then fails immediate CTRL+S after OK: the exact bound dialog has closed and the SDK refuses implicit keyboard retargeting. Final public observation shows the original workbook; app exit and empty container inventory verified. Saved choices remain unverified. The test now explicitly asserts returning to the original workbook before saving, matching the observation step in existing dropdown/CLICK-L03 workflows. This adds a visible outcome assertion; it does not remove the guard or alter saved-file expectations. The first failure is retained; no new agent score or acceptance yet.

- Visibility acceptance on exact2ff75/hash9540f4: visible-controls-after-02 passes the same visibility/editing/tab assertions plus explicit workbook-return observation. Independent XLSX inspection confirms Pass/Fail/Held on every D2:D29 cell, visible arrows, all59original values and sheet order preserved. visibility-regressions-after-01 passes CALC-L01/L02, FOCUS-L04, CLICK-L03 with independent saved formulas/values, unchanged sibling/target documents, and28saved help titles/choices. visibility-gtk-index-after-01 passes retained OK after insertion and rejects removed OK without another action. All owned apps exit, temporary cleanup is verified or confined to removed containers, and each terminal inventory is empty. These seven focused cases allow experimental smoke on separately frozen SDK825b585, but do not constitute canonical desktop certification or a new agent score.

- First visibility-candidate agent pair on frozen SDK825b585 passed on both backends: native34535407636 (37.397s,11calls,$0.2993042) and OpenSky34535872276 (136.510s,16calls,$0.579563). Fingerprint comparison reports no differing fields; both are valid completed turns with app/temp cleanup and final usage receipts. Independent saved XLSX inspection confirms all28Pass/Fail/Held lists and59original values plus sheet order unchanged. This is one new paired dropdown result, not a replacement for the old failed attempts or20-task baseline. Native used11desktop.js calls and did not exercise builtin inventory in this run; the discovery exception remains covered offline. The second smoke pair is Writer strikethrough on the same frozen source.

- The second visibility-candidate pair also passes: Writer strike OpenSky34536419737 (87.936s,5calls,$0.2043066), native34538911657 (24.562s,5calls,$0.1891558). Independent checks confirm all387last-paragraph characters struck, unchanged text and other paragraph strike flags, matching environment fingerprints, and verified cleanup. Two-task smoke is now2/2 on each backend, costing$1.2723296. Expand on the same frozen source to the three previously selected tasks (subscript, freeze, profit), retaining all first outcomes. All three scoring-source preflights pass.
- Status monitor20634 stopped on the exact gh connection error while its CI run continued. A subsequent authoritative read proved completion; monitor9515 resumed the same receipt and finalized it, with no redispatch. The helper now retries only that exact empty-output/exit1connection message, sharing a maximum of3status reads with the existing generic-title allowance. Other failures/identity mismatches still stop. Pure classifier checks and parent code review pass; the new branch has not yet been exercised by a real subsequent connection failure. Paid source, task deadlines, dispatch and ledger logic are unchanged.

- Five-task subscript inspection uses a read-only character-level diagnostic against hash-verified original/gold assets. It reports all8expected H2O positions and whether the full subscript mask matches gold, preserving the frozen official score. Methodology sanity checks: gold8/8 and exact format match; retained baseline OpenSky62file1/8 and mismatch, with unchanged text. This is inspection validation, not a new driver or agent acceptance. The full frozen scorer already combines preserved text and exact character subscript masks with its upstream predicate; no evaluator change is needed.


## TEXT-010 — Repeated subscript scope and selection navigation

- First valid subscript pair on frozen SDK825b585/driver2ff75 fails on both backends: OpenSky34539212639 (101.036s,6calls,$0.2066768) and native34539577783 (22.670s,6calls,$0.2068). Saved text is unchanged. Native correctly subscripts only the opening digit (1/8); OpenSky subscripts the opening O (0/8 target digits). Both claims are limited to the heading. The task gold requires all8 digits. Preserve both official failures and matching fingerprints; current completed-pair score is2/3 each, not full-suite parity.
- OpenSky selected H2O, then sent RIGHT, LEFT, SHIFT+RIGHT, LEFT, SHIFT+LEFT before activating Subscript. Static review found no wrong arrow mapping, indexed refocus or replay. The SDK observation does not expose selection/caret ranges, so its unchanged AX diff cannot establish unchanged selection. AT-SPI selection verifies endpoints but does not verify caret/anchor direction for noncollapsed ranges. This is an unresolved selection interoperability seam, not a confirmed key-delivery bug.
- Pending discriminating check: replace a directly selected digit; compare the recorded arrow sequence after public selectText versus normal Find UI selection in disposable Writer documents. No product patch or benchmark change is justified yet.
- Read-only subscript-diagnostic.json in both current arms verifies hash-locked original/gold text and per-character direct subscript masks. Cleanup and final usage are verified. This diagnosis preserves scorer results; no new behavior acceptance is claimed.

## EVAL-011 — Saved spreadsheet outcome diagnostics for the five-task ramp

- Added an external read-only helper, work/diagnose-five-spreadsheets.py, with hash-locked original/gold assets from frozen825b585, terminal arm identity checks, before/after artifact hashes and exclusive optional diagnostic output. Freeze checks fixed row/column splits and preserved sheet content; profit checks requested values and unexpected nonempty cells/formulas. It does not replace official scoring or claim visual scrolling verification.
- Validated against both gold files and four retained prior outputs, including row-only freezing and18extra profit formulas. Current native freeze34539956864 (33.427s,7calls,$0.2354984) officially fails and independently shows only row1 frozen (xSplit0,ySplit1); gold requires columnsA–B too (xSplit2,ySplit1). All cached values/formulas/sheet order remain unchanged; app/temp cleanup passed. Its trace intentionally chooses A2 and a header-row workflow. Task interpretation is implicated; no input failure is established. The task wording asks to freeze A1:B1; retain the gold requirement and do not silently loosen it.
- Diagnostic caveat: this task's generic score.formatMatches=true does not mean frozen panes match. Read official taskSuccess and the saved region diagnostic. Matching OpenSky run is pending; no four-pair score yet.

- Matching OpenSky freeze34540164951 also fails (134.313s,10calls,$0.3866858), saving the same row-only frozen region and unchanged contents. Fingerprints match and cleanup passes. Both explicitly choose a header-row workflow; the pair is retained as both failed, making the current matched score2/4 each. OpenSky additionally encounters a stale indexed cell token and unsupported AX query, then recovers with coordinates. Those are real interaction friction but do not explain choosing only a header row. No score adjustment or product change.
- SELECT-ARROW-L01/L02/L03 are now drafted as real saved-text comparisons: direct digit selection, the retained five-arrow sequence after selectText, and the same sequence after ordinary Find. Setup, evidence and owned cleanup live in a fixture; each test line is a public action or saved outcome assertion. E2E typecheck passes. Initial remote diagnostic is pending, so expected digit replacement is a hypothesis for the two arrow cases, not accepted behavior or a confirmed driver defect.

- selection-arrows-before-01 completed on exact2ff75/e8 runtime: direct digit selection replaces2 correctly; both the native Text selection and ordinary Find entry points followed by the recorded arrow sequence replaceO. Thus L01 passes and L02/L03 fail the intended-digit hypothesis identically. Independently parsed all three retained ODT files; both other paragraphs are unchanged, all app/temp cleanup passes and container inventory is empty. This rules against a selectText-specific explanation in this document, but both arrow routes still use OpenSky key delivery; it does not independently certify native-reference keyboard equivalence. Keep the two diagnostic failures and avoid changing selection offsets merely to satisfy the mistaken expectation. No paid score or product patch changes.

- OpenSky profit34540641086 passes officially on frozen825b/2ff (216.993s,16calls,$0.6353718), with verified cleanup/final usage. Independent saved inspection confirms all nine J2:J10 values, all nine Year_Profit labels plus header, exact named-sheet cached content and no extra nonempty cells/formulas. Sheet order differs from gold, which this task does not request and the previously validated named-sheet scoring intentionally ignores. This is a first valid candidate success, distinct from the old extra-formula failure; native counterpart remains pending.

- Native profit34541194867 fails (49.814s,10calls,$0.3182012): all requested outputs match, but nine extra I2:I10 formulas remain. Exact saved inspection, matching pair fingerprints, terminal usage and cleanup are verified. Five-task ramp is OpenSky3/5, native2/5, with shared subscript/freeze failures retained. Conservative settled accounting is$114.0974426.
- Adopted same-source expansion to the original frozen20 task IDs, avoiding ten repeat arms. campaign-linux-visibility-candidate/full20-selection.json fixes first-five pair/result/score/environment/CI hashes and all remaining15 arm names before dispatch. All40 reference hashes match. This is a staged development-informed benchmark, not a holdout or broad statistical parity claim. No source/scorer/model changes; no old results replaced. Fill11native/12OpenSky starts the remaining15 under existing serial$5 reservations and$150 approved cap.

- Live scorecard now accepts optional selectedArms declarations and filters exact ARM/linux-office identities before pairing or per-backend fallback. Missing/invalid declared evidence stays missing/invalid; malformed declarations or duplicate selected-directory records fail closed. Default campaigns retain prior selection behavior. Retained-data checks confirm current5pairs2native/3OpenSky, actual first9-record prefix with4pairs, exclusion of later historical same-task arms, and no fallback for absent selected arms. These checks validate report selection, not new agent evidence. After restarting the owned localhost server, status-visibility-full20-start.json verifies5/20, current budget and active fill arm; frozen paid sources and all score files remain untouched.

- Full20 fill native34541578386 passes (45.946s,4calls,$0.2007114): independent saved check confirms46changes, all confined to originally blank B1:E30 cells, exact gold values and unchanged sheet order. Cleanup/final usage pass; matching OpenSky12 is pending. Existing fill diagnostic now accepts an explicit campaign, checks terminal evidence and uses optional exclusive --write instead of overwriting its report. No scorer or workbook changes.

- Fill OpenSky34541814210 also passes (219.068s,17calls,$0.7119714), with exact saved gold values, all46edits confined to original blanks, unchanged sheet order, verified cleanup and matching fingerprints. Candidate now has6valid pairs: OpenSky4/6, native3/6. Reader70716 exercised the exact-network retry branch twice and then stopped after the third failed read; a subsequent authoritative read proved the same run completed. Reader43659 resumed existing receipts, verified the already-settled native arm without rewrites, and finalized OpenSky with no duplicate dispatch/reservation. Network recovery altered no scoring evidence. Sort13/14 is the next declared pair.

- Read-only sort/chart helper reuses existing sparse workbook and chart readers against frozen825b references. Six methodology checks cover two gold files and four retained historical outputs; details/hashes are retained in work/sort-chart-diagnostic-checks.json. It exposes complete record associations, chart series bindings/caches and content differences without changing official scores or workbooks. OpenSky sort34544271290 passes (99.487s,7calls,$0.4322802): all18amounts ascending, full row multiset/header unchanged, all sparse values and sheet order match gold. Cleanup/final usage verified; native14 still pending, so paired score remains4/6OpenSky,3/6native.

- Native sort34544640226 fails (26.236s,8calls,$0.244085) although amounts ascend. Independent follow-up resolves the18typed-value differences: every date lost m/d/yy formatting and is saved as General numeric serial; serial-to-date normalization and all other fields match the reference rows. Do not describe this as shuffled associations. sort-date-format-diagnostic.json preserves that distinction alongside the untouched official failure and first diagnostic. Pair fingerprints/cleanup match; seven pairs now OpenSky5/7, native3/7.
- Added finite external run-visibility-full20-tail.py to remove between-pair dispatch gaps for the already declared remaining13tasks. It verifies first5evidence hashes, completed prior declared pairs, source cleanliness, selected arms, matching fingerprints, valid cleanup and settled reservations; delegates all spending/admission/scoring to the existing serial pair helper. Valid task failures continue into the fixed metric; helper errors or invalid/mismatched/unsettled evidence stop. Initial local check exposed the retained ci-run.json schema (url/headSha rather than raw REST id/head_sha); corrected and revalidated against both actual fill/sort pairs, with no dispatch in inspection mode. Queue started at chart15/16, unchanged$150cap. It does not impose a task deadline or rewrite scores; parent still reviews saved outcomes and updates live narrative.

- Parent visually inspected native14 final-state.jpg: the Date column visibly contains Excel serial integers (for example44893), agreeing with the saved General formats. This confirms a user-visible presentation failure rather than only a Python datetime/number comparison difference.

- OpenSky chart34545008248 passes (168.931s,11calls,$0.5712056), cleanup/usage verified. Independent saved inspection confirms Sheet2 clustered column, full Sales & COGS title, both series names, ten-week category/data references and cached values; chart details and all sparse saved values exactly match gold. Original-versus-saved COGS values have only the same tiny floating-point serialization differences present in gold; do not call them byte-identical original values. Native16 pending; completed-pair metric remains5/7OpenSky,3/7native.

- Native chart34545389877 passes (53.653s,13calls,$0.3454482), with final usage and app/temp cleanup. Independent saved inspection confirms exact gold chart details including both ten-week series, Sheet2 placement and all sparse values. Sheet order differs, which the requested chart placement does not constrain. Pair fingerprints match; eight completed pairs are OpenSky6/8, native4/8. Native split17 is active in the unchanged finite queue.
- Scorecard Running/Awaiting result markers now derive from the sole active reservation and its exact accepted selected-arm dispatch receipt, checking campaign/source/task/backend/reservation identity. Completed summary evidence takes precedence. Real retained-data and explicitly labelled projections cover transitions, invalid/ambiguous suppression and legacy fallback in work/selected-active-arm-checks.json. Restarted owned server; live status-selected-active-live.json verifies8paired tasks, OpenSky6/native4 and native split17 Running. No score, task or frozen source changes.

- Native split34545622570 passes (122.059s,11calls,$0.3752868). Independent split-saved-diagnostic confirms exact gold sparse values, spelling-sensitive B2:D22 outputs, unchanged original nonempty values and sheet order; cleanup/usage verified. OpenSky18 is pending. New local split/Impress diagnostic reuses existing readers and validates nine raw-gold/historical cases without changing official scoring or source assets. Methodology evidence: work/split-impress-diagnostic-checks.json.

- Active Linux plan and parity README no longer present superseded checkpoints as current instructions. Archived all earlier plan milestones in linux-parity-history.md; active guidance identifies immutable baseline/correction evidence, serial queue recovery, canonical certification gaps and authoritative spending ledger. Documentation only; frozen evaluator, source assets, scores and dispatch remain unchanged.

- OpenSky split34546004338 passes (168.202s,13calls,$0.9669), exact gold sparse values and original values/sheet order preserved. Pair fingerprints and cleanup match; nine pairs are OpenSky7/9 and native5/9. Retain three recovered errors separately: string setValue on a numeric Value element, stale AT-SPI object on subsequent indexed click, unsupported app-scope query. The agent recovered through ordinary typing; these errors do not invalidate the saved success or independently prove a driver defect.
- Extended the local saved-output adapter for remaining duplicate/font/image tasks using existing pure readers. Nine raw-reference/historical checks preserve prior diagnostic behavior, including duplicate trailing-newline differences and image export geometry rounding. Exact commands/caveats are in work/next-desktop-inspection-plan.md; work/impress-tail-diagnostic-checks.json retains hashes. No scorer, frozen source or output edits.

- OpenSky background34546442524 is a valid failed attempt (180.625s,12calls,$0.4056714), both raw/adapted scores0. Saved slide1 is Light Green2 #77bc65, whereas frozen gold is #00a933; slide2 background, text/count/size are unchanged. Parent inspected retained final screenshot, which visibly shows the green fill and Light Green2 label. No tool calls failed and final answer accurately names that shade. Instruction says only “give it a green background color”: retain this benchmark ambiguity and the strict score, without presenting it as a proven driver/input failure or changing expectations during the campaign. Native20 pending.
- Rechecked immutable historical baseline with refresh-linux-baseline.py --check: native18/20, OpenSky14/20, historical environment caveat retained. On the exact nine completed correction tasks, OpenSky changes3to7successes and native7to5; work/visibility-9task-transitions.json verifies selected arms and matching paired scores. This is a single-attempt cross-iteration comparison, not causal attribution or evidence that native performance is fixed.

- Scorecard adds short saved-outcome notes to the exact retained arm/CI URL, rendered as plain text. Current failure notes describe missed digits, frozen region, extra formulas, lost date formatting and green-shade ambiguity; no internal SDK cleanup appears there. Notes only attach to valid displayed runs with matching artifact runUrl; scores and pairing logic are unchanged. Live status-outcome-notes-live.json verifies seven notes on failed arms; native20 finished during verification, so this snapshot has ten pairs with7OpenSky/5native successes. Owned server restarted as PID93908; no GUI use.
- Final-task adapter work/diagnose-final-desktop.py covers editor replace/indent, Writer center/lowercase/font and Calc sheet-copy using existing saved readers and frozen825b references. Eighteen reference/historical checks preserve file/score hashes, including four-space indentation, body/table text, explicit font runs and worksheet order/values. Unchanged center/font reference assets are labelled as starting-state controls, not target success; inherited styles/rendered layout remain unresolved. Exact commands: work/final-desktop-inspection-plan.md.

- Native background34546886021 also fails the frozen color rule (23.620s,8calls,$0.2355362): saved #81d41a lime green versus #00a933. Text, slide count/size and later background are unchanged; parent inspected final screenshot and accurate lime-green final claim. Both pair fingerprints and cleanup match. Ten completed pairs are OpenSky7/10, native5/10; preserve both failures and benchmark shade ambiguity. Native table21 now active; cumulative settled accounting$118.5865388 plus$5reserved.

- Native table34547148034 passes (46.510s,11calls,$0.3138012). Independent saved inspection confirms the single slide4 table starts T1/T2/T3/T4, with no other text changes and unchanged slide count/size. App/temp cleanup and final usage verified; matching OpenSky22 is active.

- OpenSky table34547377970 also passes (110.086s,7calls,$0.3090694): same exact requested headers and no other text changes. Pair fingerprints, cleanup and usage match. Eleven completed pairs are OpenSky8/11, native6/11. Separate native Find/arrow control is being prepared from isolated825b to distinguish shared Writer sequence semantics from OpenSky key delivery; no new native-control result exists yet.

- OpenSky duplicate34547720117 passes (201.978s,16calls,$0.4650564):26slides with exact last-four23/24/23/24 text and picture-hash order. Independently checked the strict reader differences on slides21/22: only trailing newlines differ from raw input, as in the preserved export diagnostics; raw geometry differences remain diagnostic and official scores unchanged. Cleanup/usage pass; native24 pending.
- Native no-model Find/arrow control is isolated at c441caf90f421497376ece1598cfd061b041d462, branch codex/linux-native-arrow-control, CI34548153115. Five intended files add the real owned Writer fixture/spec and explicit repl allowlist. Typecheck/collection/shell/diff checks pass; runtime src and package/driver pins remain identical to825b. Parent reviewed no-replay cell handling and failure/cleanup evidence. Remote run is active, no behavioral result yet and no model reservation.

- Native arrow control CI34548153115 on c441caf completed its exact input sequence and saved H2MARK, replacing O just like both retained OpenSky cases. Independently parsed ODT, verified all request/response IDs with no RPC errors/replays, exact frozen native package/source, and native/app/temp cleanup. Its original digit-intent assertion fails and remains retained at linux-office-setup/native-selection-arrows-before-01. This supports native/OpenSky equivalence for this sequence, not a key-delivery defect. Corrected the new native assertion and OpenSky L02/L03 assertions to expect the independently observed O; L01 still requires direct selection of2. No product input logic or paid score changes. Assertion-only correction is checked against retained real outputs; it is not a new live pass or a retroactive green CI result.

- Native duplicate34548156585 is a valid failure (42.121s,13calls,$0.363518): correct26slides/ABAB order but slide1 picture moves upward360000EMU (~0.3937in) relative to passingOpenSky23. All compared text/directfonts match; OpenSky picture top differs from original by43EMU only. Native starts CTRL+END/SHIFT+UP before its first slide-list click, suggesting canvas focus. Additive duplicate-picture-position-diagnostic.json retains source hashes; no regrade or product delivery defect claim. Twelve matched pairs are OpenSky9/12,native6/12. Native font34548517736 then passes (63.473s,18calls,$0.460886); font-saved diagnostic retained, OpenSky26 active.

- Documentation audit found two stale parity README paragraphs claiming native Linux availability and GUI agents were still unverified. Updated them against the existing pinned linux-agent.yml and native-linux-guide.md, distinguishing setup/repl from paid task completion and retaining the historical macOS section. No workflow/source freeze, task or scoring changes. Linux canonical certification needs no extra host/API key; exact candidate X11/Wayland command and artifact gates are retained in work/visibility-certification-plan.md pending completion of frozen20.

- OpenSky font34548773663 is a valid failure (521.384s,35calls,$0.93227), matching native25 fingerprints and cleanup. Both target fonts end60/28pt but text splits into Target a/udience and Elaborate on what you/ want to discuss. Trace batches setValue+Enter before each first observed split. Driver set_value explicitly writes AT-SPI properties without focus/commit, while app.pressKey uses current focus. Three real font-field public-SDK controls distinguish the unfocused sequence from focused setValue and ordinary focused typing; typecheck passed, remote execution pending. No runtime change or regrade. Thirteen matched pairs: OpenSky9/13,native7/13.
- OpenSky image34549623255 passes (74.865s,5calls,$0.2598208): original image bytes move to right half of slide2, text unchanged, crop/rotation preserved and image remains on slide. Saved width/height each differ from raw original by360EMU; vertical position by3240EMU. These tiny differences remain diagnostic; no scoring change. Native28 active.

- Native image34549920697 passes (37.887s,12calls,$0.3288644), with same image identity/text/crop/rotation preservation and tiny raw-export geometry differences. Pair fingerprints and cleanup match: fourteen pairs OpenSky10/14,native8/14; cumulative$122.019825.
- Font field controls before01 all stop before app launch because default Python lacks python-pptx; retained exact setup failure and empty Docker inventory, all temporary cleanup verified. Same tests/runtime2ff driver are restaged as font-field-v2 on already-installed opensky-full-scoring:24.04 image979ed3719353c3677b375195688a6920d53c1aac6d19a06925e1b8f22a72b175. Local stage helper now accepts independently pinned desktop image name/id, preserves old default and refuses a changed name with default identity. Syntax and generated hash/runner checks pass. No model use.
- Font26 menu1297 was Character in one observation and explicitly Media in a later full replacement tree after dialog close; reused1297 then correctly opened the latest Media target. This is not evidence of the fixed between-observation driver ordinal-drift bug. Numeric ID lifetime across app handles remains an SDK usability question, not yet a contract change.

- Native editor replace34550138642 passes (15.324s,3calls,$0.1584336): all10 occurrences replaced, exact saved text and trailing newline match gold, app/temp cleanup and usage verified. OpenSky30 follows. Font controls before02 now run in session48790 with the verified scoring image; no behavioral outcome yet.

- OpenSky editor replace34550378724 passes (59.549s,10calls,$0.5205016): same exact10 replacements and full saved text/trailing newline as gold. Matched fingerprints/cleanup;15pairs OpenSky11/15,native9/15, cumulative$122.6987602.
- Font-field-before02 on verified scoring image completed three real failures with all app/temp/container cleanup: L01 setValue then unfocusedEnter replaces selectedtext with newline; L02 indexed focus+setValue and L03 indexed focus+typing preservetext but both save70pt. Intermediate AX assertions prove text unchanged immediately after setValue. Parent viewed before/final screenshots: requested60pt visible in field while slide stays70pt. Added L04 visible field coordinate control [1213,173], taken from exact retained1280x883 screenshot, to distinguish indexed field focus from coordinate route used by native25. No driver fix or passing result yet.

- OpenSky indent34550662600 passes (31.378s,3calls,$0.231713): exact saved gold text, four spaces added to lines2–10 only, trailing newline unchanged, cleanup/usage verified. Native32 active.
- FONT-FIELD-L04 coordinate-before01 passes on exact2ff/scoring image; independent XML confirms unchanged Target audience and6000hundredths-pt, all app/temp/container cleanup verified. L03 indexed-click route saved70pt. L04 additionally observes after Enter; next control must align these observations to separate geometry from settle time. Read-only bounds/ancestor diagnostic is being prepared; no driver cause/fix asserted yet.

- Native indent34550876823 passes (21.046s,4calls,$0.1770578), exact saved gold/trailing newline, matched fingerprints and cleanup. Sixteen pairs OpenSky12/16,native10/16; cumulative$123.107531.
- Added FONT-FIELD-L05 matching L04 observation cadence exactly, changing only numeric vs coordinate click target. Both capture read-only owned-PID field and ancestor bounds via font-field-bounds.py before task input. Probe bounded by60seconds/12000nodes/depth48 and refuses ambiguous target; ancestor intersection is approximate, not occlusion proof. Typecheck, probe syntax/help and stage checks pass. Remote font-field-bounds-before01 starts against unchanged2ff on the same verified scoring image. Original failed controls/paid scores remain intact.

- Native Writer center34551167432 passes (13.403s,4calls,$0.1651454): only first heading alignment changes to center;59paragraphs/all body-table text unchanged. Cleanup/usage verified; OpenSky34 active.
- Font bounds-before01 stops L04/L05 before test actions because /usr/bin/python3 lacks gi; both owned apps/temp dirs/containers cleaned, original diagnostics retained. Building separate opensky-font-probe image on exact existing scoring parent, adding python3-gi/gir1.2-atspi-2.0 and verifying both Atspi and pptx imports during build. This changes diagnostic dependencies only, not paid campaign or driver; no new behavior result claimed.

- Font bounds controls font-field-bounds-before-02 complete on unchanged2ff/runtimee8: L04 pixel click saves60pt; matched L05 indexed click saves70pt. All saved text/source/owned app/temp/container checks verified. Read-only AT-SPI field Screen1197,173 versus Window1197,156 differs by the exact X11 client origin0,17. Driver debug adds17 again because the maximized outer frame is0,0. L06/L07 in font-field-centers-before-01 reproduce the geometry distinction using public pixel clicks:1227,190 leaves70pt;1227,173 saves60pt. No original failed score is replaced.
- Isolated driver correction 2e81b62123eda2807ff15edcf6834389dc938c45 checks component Screen−Window evidence before applying the fallback Screen rebase; GTK/Wayland reconstruction remains unchanged. Draft cua#5 records reproduction and pending exact-source acceptance. The build-only Linux workflow now pins this candidate in this SDK branch only; frozen825b paid source remains unchanged. Rust formatting and SDK E2E typecheck pass; full Rust build and real candidate acceptance are pending. Extra Window-extents reads may add latency for nonzero rebase candidates.
- Writer center pair completed17: both preserve body/table text and center only heading. Lowercase pair completed18: both exact gold lowercase text. Native Writer font37 passes all42nonempty runs Times New Roman with text unchanged. Paid queue remains on825b/2ff; cumulative settled$124.3964944, cap$150.

- Displaced Code control ORIGIN-L01 on baseline2ff passes: indexed Find/Replace input saves exactly Updated text followed by unchanged second line. Owned XID at200,100 with960x700 client geometry; app/temp/container cleanup verified. The input document and initial window placement are fixture setup; edits use public app clicks/keys/typing and the assertion reads the saved file. Candidate2e81b acceptance remains pending. No added image dependency: initial draft wmctrl command was removed before any test dispatch after dependency preflight; existing xdotool placement suffices and is asserted.
- Exact candidate2e81b build/focused Rust checks passed CI34552663384, binary hash ecdaf1129eae2cde7f9021aa743ac76e666cb4cdd10075b82b0a278c877e1904. Font L02–L05 now running unchanged against that binary; frozen campaign remains unchanged.

- Frozen visibility full20 completed:16/20OpenSky,14/20native,13both,3OpenSky-only,1native-only,3neither. All40first attempts and matching fingerprints/cleanup/usage retained. Final OpenSky sheetcopy40 succeeds with exactnames/order/backup/sparsevalues (364.834s,22calls,$0.5955272). Final monitor lost GitHub connectivity after dispatch; authoritative run34553084515 was already complete. Resume19087 finalized the existing receipt without redispatch, reverified all earlierpairs and exited cleanly. Cumulative settled$125.6727662, no reservation; current cap$150. Live scorecard now marks comparison complete and keeps the presentation font gap explicit.
- Candidate font-field-origin-after-01 passes L02/L03/L04/L05: independently parsed each PPTX has unchanged Target audience and60pt. All4owned app exits/temp removals and inactive container verified; no bounds-budget exhaustion in retained logs. Candidate code-origin-after-01 also passes exact saved text at same200,100/960x700 geometry as baseline. Exact2e81b binary verified. Calc support checks remain active; no candidate agent outcome yet.

- screen-origin-calc-after-01 runs the retained template's fixed four-case selection (CALC-L01/L02,FOCUS-L04,CLICK-L03), not just the outer two-case argument: all4pass. Independently verified E2=B2-C2/75000, E50=42, unchanged target/sibling documents,28replacement help titles and choices, and unchanged dropdown cell values. All5app groups exited; focus temporary receipt and removed container cover cleanup. No bounds-budget exhaustion. Together with4font cases and1Code case,9realSDK cases pass exact2e81b. New campaign81cdcee changes only driver artifact pin and friction notes from825b; source runtime/evaluator bytes are identical. Its first matched Terra font task is starting under the existing$150cap.
- Canonical driver Linux desktop workflow dispatch remains unavailable in the fork: API404 for e2e-rust-linux.yml;14registered workflows omit that workflow while ordinary Linux unit/Nix/format workflows are active. Do not claim canonical certification from SDK checks. Next work can route the unchanged canonical harness through available CI, preserving its full selection and artifacts. No workflow enablement or main-branch merge was performed.

- Standalone Linux installer certification uses the registered linux-typing.yml path on isolated codex/linux-installer-certification, with a hosted Ubuntu runner checking out exact driver2e81. It invokes the unchanged canonical install-local.sh--release, then the actual installed opensky-driver version/identity/serve/get_config. The original unregistered canonical workflow still referenced the stale cua-driver-local binary name. Private install directories and socket are asserted fresh; daemon exit and temporary removal are retained with source/hash/config evidence. No autostart or shared exe host namespace is used. Bash parsing/diff checks passed; live acceptance remains pending. Full Linux shared/native/capture certification runs separately in driver CI34558519742 on the same exact source.

### INSTALL-CI-ENV-01 — runner context in job environment

GitHub rejected the first installer dispatch before creating a run: `runner.temp` is unavailable in job-level `env`. Resolve the same private paths in a first shell step via `RUNNER_TEMP` and `GITHUB_ENV`. No installer or product behavior changes. The rejected dispatch spent no model budget; remote execution validation remains pending.

### LINUX-COMBINED-CERTIFICATION-01 — exact release candidate

Combined driver source403572f34 cherry-picks the verified pixel refusal propagation ce1b and visible fixture setup4815 with source attribution. Product/test bytes independently match their respective accepted revisions. No other executable driver change. This verification branch is an integration of drafts6/7 on2e81, not a replacement implementation workstream.

The isolated SDK wrapper runs the original canonical Linux script for complete shared/native/capture release lanes with no cell/harness filters, strict preflight/video checks and shared minimum80cells. It also runs the verified local-install bridge against403572f34. Prior exact2e81 full shared lane has83passing typed cases (48delivered,35expectedrefusals); Linux native/capture original failures remain retained. New whole-candidate acceptance remains pending. Linux-only executable/test differences require affected Linux recertification; prior Windows/macOS evidence remains separately scoped. No paid evaluations or frozen campaign changes. Shared lane additionally retains the exact release binary for future SDK/agent checks only after the full candidate gate is independently accepted.

### LINUX-CERTIFICATION-METADATA-01 — small outcome download before recordings

Symptom: the completed shared lane in run34561195062 requires a roughly244MB artifact download before cases/results/source can be inspected. The delay is artifact packaging and retrieval, not a driver or agent behavior result.

This isolated workflow follow-up adds `linux-candidate-{shared,native,capture}-metadata` before the original full artifact upload. It copies unchanged cases/results/environment/summary files and records SHA256, source checkout/pin, wrapper revision, run/attempt/job-key/lane provenance. Each file is bounded at2MiB; missing or oversized files are explicitly reported, never silently truncated. Large accessibility logs and all recordings remain in the unchanged full artifact. The source receipt is provenance, not authoritative job-completion evidence; acceptance still requires a terminal CI job and full video/trajectory inspection.

Driver source403572f34, canonical scripts/selections, build steps, release binary and original artifact names/content/retention are unchanged. Local YAML, every shell block and embedded Python parse successfully; original desktop steps and installer job compare unchanged. Retained current native metadata totals54,910bytes and capture10,678bytes, all below the per-file limit; source files were read only. Actual CI upload behavior remains untested. No dispatch or new driver acceptance is claimed; run34561195062 and its source remain frozen.

CALC-MOTION-01 certification staging: wrapper pins exact driver ed9fd15e39a1d2acd07c4f3078440c3ab2ad44f2. The original six SDK workbook contracts pass with independently decoded saved files and owned cleanup. This workflow retains all canonical shared/native/capture lanes and installer unchanged; no certification result exists until dispatch and evidence inspection. Paid campaign remains frozen.
