# Impress grading validation

This is saved-file grader acceptance, not desktop SDK acceptance or an agent
campaign. New campaigns require an explicitly frozen scoring profile. Historical
scores and scoring without a profile are unchanged.

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

## Freeze and use a campaign profile

After the real-export controls pass, prepare a new profile from their retained
artifacts. Preparation regrades all 25 control files with current sources,
verifies export receipts, checks the original asset pins, and copies only the
validated reference files. It does not run an agent or re-export any artifact.

```sh
python evals/parity/osworld/scoring_profile.py freeze \
  --controls /path/to/control-artifacts \
  --output /path/to/new-scoring-profile \
  --libreoffice /path/to/LibreOffice.app/Contents/MacOS/soffice
```

Set `OPENSKY_EVAL_SCORING_PROFILE` to its `profile.json` when starting a new
campaign. The controller retains its own reference copies in `scoring/`, records
individual reference hashes and the profile identity in the plan, and verifies
them again before each arm. The runner verifies the profile and actual exporter
before app setup and spending admission. Scoring rechecks references and sources
after the agent finishes, rejecting a changed profile as an infrastructure error.
Stages 5 and 20 require the same scoring and task-limit profiles as their prior
stage. A scoring-source or original-asset change requires a newly validated
profile and a fresh smoke ramp.

Each arm records `rawOutcome` and `adaptedOutcome` separately. The primary
`outcome` uses adapted Impress scoring under this named policy; other task
categories retain their original grading. Summaries also expose raw native and
OpenSky success counts. Raw historical outcomes are never rewritten.

The opt-in `scoring-profile.test.ts` suite exercises the real profile verifier,
read-only scorer and controller refusal path. It uses
`OPENSKY_EVAL_TEST_SCORING_PROFILE` for the prepared manifest,
`OPENSKY_EVAL_CONTROL_ARTIFACTS` for completed specimens, and the same Python and
LibreOffice executable variables as the exporter tests. It checks missing,
changed and incomplete references, exporter/source mismatch, post-admission
changes, retained campaign copies and separate raw/adapted results.

## Limits

These controls establish specific success/failure discrimination. They do not
prove complete visual equivalence or cover every possible unintended edit.
The upstream green task still requires its specific RGB value, 00A933, although
its instruction just says green; this policy does not silently relax that rule.

Fresh paired smoke runs are still required to establish actual agent outcomes
under this scoring profile. Do not reinterpret the constructed controls or
historical raw scores as new agent successes.
