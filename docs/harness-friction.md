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
