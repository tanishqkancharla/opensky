# Impress grading validation

This is saved-file grader acceptance, not desktop SDK acceptance or an agent
campaign. The campaign still uses the original pinned references. Historical
scores are unchanged.

## Why an adaptation is needed

The original grader rejects some no-edit LibreOffice exports because inherited
background and alignment values become explicit or are represented differently.
Exporting references with the same production LibreOffice version addresses
those differences without disabling any original comparison options.

The duplicate-slide task has an additional problem: its supplied gold files
change earlier slides 5, 7 and 21. A completion built by preserving the input and
appending the final two slides is rejected even after both decks are exported.
The explicit `task-preserving-export-v1` diagnostic policy therefore derives
that task's reference from the pinned input: all original slides, then copies
of the last two in A,B order. Other tasks continue to use exported upstream gold
files. Raw upstream outcomes remain available separately.

## Acceptance controls

`e2e/specs/impress-export-score.test.ts` drives the real exporter and read-only
grader through fixtures. For each of the five Impress tasks it checks:

- A completed specimen, independently constructed from the original input.
- An unchanged input, which must fail the task.
- An incorrect edit: red background, T5 heading, swapped duplicate order,
  incomplete font-size change, or an image moved insufficiently far right.
- An unrelated text edit, which must fail preservation.
- An unrelated background-color edit, which must fail while text still matches.

The duplicate completion fixture copies package parts directly; the adapted
reference uses a separate presentation-part implementation. Neither copies the
supplied gold to produce the completed specimen. Both independently pass through
the installed LibreOffice exporter. Grading never re-exports or repairs an agent
artifact.

Run from the SDK repository with absolute executable paths:

```sh
OPENSKY_EVAL_PYTHON=/path/to/python \
OPENSKY_EVAL_LIBREOFFICE=/path/to/soffice \
OPENSKY_EVAL_CONTROL_ARTIFACTS=/path/to/new-evidence-directory \
npm run test --prefix e2e -- specs/impress-export-score.test.ts --bail=0
```

The suite is opt-in because it needs the real installed exporter. Every export
uses a private temporary profile and records process exit, profile removal,
exporter identity and file hashes. Artifact directories must be fresh. Omit
`OPENSKY_EVAL_CONTROL_ARTIFACTS` to use disposable output storage.

## Limits and remaining integration

These controls establish specific success/failure discrimination. They do not
prove complete visual equivalence or cover every possible unintended edit.
The upstream green task still requires its specific RGB value, 00A933, although
its instruction just says green; this policy does not silently relax that rule.

Before admitting new agent runs, freeze the adapted reference files, their
hashes, generation policy and exporter identity in a campaign scoring profile.
Reject profile/environment mismatches before dispatch. Report original and
adapted scores separately, and restart the smoke ramp with the same profile for
both backends. Do not reinterpret historical raw scores as new successes.
