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
