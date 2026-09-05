# Real-driver acceptance corpus

`cases.ts` is the canonical frozen corpus for native-Codex versus Pi/OpenSky
acceptance runs. Every arm receives the same prompt and structural oracle. The
oracle records answer fields, required and forbidden trace evidence, and exact
target-lifecycle metadata; it does not include task-specific answer hints.

These cases are intended for serial execution against the real driver so each
arm can be scored from its own visible evidence and cleanup receipts. The
current serial runner and independent review workflow remain in
`work/eval-scripts`; that external integration re-exports this corpus.

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
