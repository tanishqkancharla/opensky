# Linux visibility correction smoke

Candidate driver source: 2ff75ef21a5173935fd4cbd1b69fa6094299211d
Build: https://github.com/tanishqkancharla/opensky/actions/runs/34533766015
Binary SHA256: 9540f4cb078a854ae103bebd087d27688fa4dd1b7b2db9d0450c67adbf87782a

The SDK runtime remains e8. The evaluator includes the narrowly scoped builtin
resource-discovery correction, validated offline; live acceptance is pending.
Both native and OpenSky arms must use this exact committed evaluator revision,
frozen scoring profile and native reference package. No task prompts are changed.

Smoke: dropdown choices (native then OpenSky), then last-paragraph strikethrough
(OpenSky then native). Preserve first valid outcomes, failures and invalid attempts.
Do not ramp to five until both matched pairs are reviewed for validity.

VISIBLE-L01 passes on the exact driver: hidden fields omitted, Entries labelled,
tab switching preserves content, all28saved dropdown cells have Pass/Fail/Held,
and59original values plus sheet order are unchanged. The first after test lacked
an observation after closing the dialog and was retained as a failed attempt;
the accepted test adds the same return-to-workbook observation used by existing
dropdown regressions, without weakening saved assertions. Cleanup is verified.
Supporting cell/modal/identity checks are pending; this branch is prepared only.
Do not dispatch paid arms until those results pass and are inspected. Canonical
desktop certification remains a separate release/readiness gate.

Historical20-task baseline remains native18/20 and OpenSky14/20. The previous
selection smoke remains native2/2 and OpenSky1/2. The index campaign has no valid
matched pair: OpenSky failed dropdown; native was interrupted before desktop use.
No driver regression pass changes these agent scores.
