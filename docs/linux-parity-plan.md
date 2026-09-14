# Linux parity objective and current evidence

Linux remains the priority under the user's September 8 direction. Compare
OpenSky's public SDK with genuine native Computer Use on isolated remote Linux
desktops, using matched Terra-medium Codex CLI agents, the same task assets,
and independent saved-outcome graders. Exclude Codex's in-app browser.

The later local macOS installation and public-SDK test requests are authorized
separately. They do not change a frozen Linux campaign or its scores.

## Measurement contract

- Start with one or two tasks, then five, then a frozen twenty after setup,
  reset, cleanup, and grading have been validated.
- Freeze SDK, driver, native runtime, app and image versions, task definitions,
  scoring policy, and model configuration within each comparison.
- Keep all twenty task rows visible, including unrun tasks and first failures.
  Report absolute success and native-success tasks that OpenSky fails. A shared
  failure does not demonstrate that either backend can perform the behavior.
- Keep deterministic public-experience tests separate from agent task scores.
  Use real applications and saved outcomes; do not mock the service, rewrite
  the agent's output document, or add app-specific product/harness guidance.
- Preserve native compaction without a whole-task deadline or tool-call budget.
  Track elapsed time, calls, context, and evaluation estimates. Task success
  takes priority over ordinary speed differences.
- One deterministic controller owns reservations, dispatch, collection,
  cleanup, and settlement. Each arm gets a fresh disposable desktop, app
  profile, and document. Never restart a live or uncertain run merely because
  an observation timed out, or replay input after unknown delivery.

## Current measured results

The [V14 report](linux-parity-v14.md) and its
[machine-readable receipt](linux-parity-v14.json) retain the source pins,
per-task outcomes, costs, evidence limitations, and run variability.

| Frozen full campaign | OpenSky | Native | Unrun |
| --- | ---: | ---: | ---: |
| Original V14 | 18/20 | 16/20 | 0 |
| Full V14 repeat | 16/20 | 14/20 | 0 |

The repeat advanced through real two-task and five-task gates before twenty.
Original V14 has no native-only successes; the repeat has one (dropdown).
Saved-file review found extra cells entered by OpenSky on that task, without
establishing a new SDK defect. These are measurements of the fixed Linux
configuration, not a general or statistical parity certificate. Ten original
pairs have explicitly reconstructed local receipts; their older raw archives
remain unavailable. The repeat retains its separate failed editor setup attempt.

The [repeat command](../evals/parity/repeat-vm-campaign.md) is implemented and
validated on the already-provisioned immutable stage. It does not provision a
new host. New-host portability is a documented limitation, not evidence that
the completed repeats were invalid. Keep future results separate from these
frozen campaigns.

## Verified integration and remaining work

The [public SDK gate](https://github.com/tanishqkancharla/opensky/actions/runs/34784123429)
passed 27 cases across three fresh desktops with the V14 driver. It retains
an earlier intermittent Unicode failure: one previous `TYPE-L01` run saved
`É near Dublin Zoo — 中文 😀.` instead of the requested complete sentence.
Subsequent passes do not resolve its cause. Existing XRecord traces capture
keyboard events, but an independent control disproved their XKB-notification
coverage. Do not infer application consumption from those traces or repeat
the same probe without a new discriminating observation.

The [combined driver CI](https://github.com/tanishqkancharla/cua/actions/runs/34805603685)
passed 265 Linux/Windows desktop cases and both source installer checks at
`a194945287b1de7f7dc2b29e69144bf1fc836f3c`. Expected refusals count as passed
contract cases, not successful agent tasks. This integration does not change
V14's frozen SDK or driver identities.

Local macOS saved-file acceptance previously passed five selection workflows
and plaintext paste on driver `03d6078ff0f29acbdd1a1417d7fd34b7b110ffd0`.
[Driver PR #19](https://github.com/tanishqkancharla/cua/pull/19) subsequently
moves paste read-back inside foreground activation. Its real saved-file paste
case passed; its selection control stopped before typing after an actual
Space transition. The canonical macOS GUI matrix remains unexecuted, so local
smokes must not be described as full macOS certification. See
[macOS validation](macos-current-validation.md) and the
[friction ledger](harness-friction.md) for exact acceptance boundaries.

Prioritize demonstrated public-behavior gaps. Expand evaluation coverage at
meaningful gates rather than rerunning a full campaign after every edit. Keep
source changes, their first relevant results, and remaining limitations linked.

## Accounting and cleanup

The user's September 13 direction removed periodic $50 approval checkpoints.
Continue to reserve and reconcile each evaluation through the authoritative
`evals/runs/parity-budget.json` ledger. Evaluation estimates exclude coding-agent
inference and infrastructure and must not be presented as total project cost.

Report completed runs and actionable failures. Remove disposable containers,
owned test apps/documents, transfer archives, and obsolete build artifacts after
collecting compact evidence. Preserve frozen inputs, first failures, necessary
build caches, and one local rollback. Never clean up a user's pre-existing app
or another controller's live work.
