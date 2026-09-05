# Real-driver acceptance corpus

`cases.ts` is the canonical frozen corpus for native-Codex versus Pi/OpenSky
acceptance runs. Every arm receives the same prompt and structural oracle. The
oracle records answer fields, required and forbidden trace evidence, and exact
target-lifecycle metadata; it does not include task-specific answer hints.

These cases are intended for serial execution against the real driver so each
arm can be scored from its own visible evidence and cleanup receipts. The
current serial runner and independent review workflow remain in
`work/eval-scripts`; that external integration re-exports this corpus.

## Native baseline reuse

As requested on 2026-09-05, capture a native Computer Use session once per task
and reuse that evidence for later OpenSky iterations. Do not rerun native on
every patch. A new task needs its own baseline; a changed native implementation
must not be silently represented by an older baseline.

Comparisons must identify the original native run, date, model, reasoning,
tool version when available, and hashed source artifacts. Match the exact task
prompt and oracle. Preserve original timestamps and distinguish a reused
baseline from a fresh paired run; never copy historical observations into a new
run and describe them as newly executed. Dynamic-site state, browser profiles,
and provider token accounting remain explicit comparison caveats.

Only the frozen task goes to the Pi model. Baseline answers and observations
are post-hoc comparison evidence, never instructions or a correctness oracle
for a new arm. Grade each arm against its own observations and cleanup. Report
efficiency only after correctness, grounding, policy and cleanup pass. Keep live
GUI runs serial and clean their exact owned resources after each attempt.

The corpus and its contract tests are repository-native, but their presence or
a passing unit test is not CI acceptance-score evidence. A score is evidence
only when a real-driver run records the public trace, exact cleanup, metrics,
and an independently validated review artifact.

`evidence.ts` keeps driver-session evidence distinct from target-lifecycle
evidence. An exact isolated browser session can prove its owned browser target
absent after a verified drain and inactive receipt. An inactive driver session
alone cannot prove that a native window disappeared: native-window cases need
separate exact window identity-and-absence evidence, including any
evaluator-created prerequisite window, before cleanup can pass.

`payload-metrics.ts` provides pure public-transcript metrics: serialized
argument/result character counts, model-visible text characters, image-block
counts, and available encoded-image character counts. Host-only metadata stays
separate from model-visible content; these character counts are not token or
image-cost estimates. Missing or malformed public-call counts remain unknown,
not zero. Repository tests cover these contracts, and the external transcript
renderer imports them through a compatibility re-export. No historical run
artifacts are rewritten by these helpers.

`public-transcript.ts` produces a lossy readable projection, never scoring
evidence: public text and ordinary metadata remain, while image encodings,
typed bytes, screenshot byte objects, signature-recognized serialized image
buffers, and private reasoning/signatures are omitted. Unknown numeric objects
remain intact. Raw artifacts and payload measurements must use the original
data, not this projection. The external renderer accepts `EVAL_TIMELINE_FILE`
as a simple `.md` basename for a separately named derived transcript.

`../driver-tape.ts` retains the legacy version-1 error string and adds
`errorMetadata` for `OpenSkyError`: name, exact code when available, and bounded
JSON-safe details. Replay restores the typed error; old string-only tapes stay
compatible. Stacks, environments, causes, and non-JSON or oversized details are
omitted. This is prospective evidence preservation, not a way to reconstruct
causes missing from historical recordings or from the driver transport.
