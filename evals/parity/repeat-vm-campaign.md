# Repeat VM campaign entrypoint

`repeat-vm-campaign.py` plans a fresh, bounded repeat against an already
provisioned immutable VM stage. It does not provision a desktop, configure a
remote host, build a driver, admit spending, or replace the stage controller.

The stage must contain the frozen selection, setup and code-host receipts,
launcher, source bundle, full file manifest, original accepted pair gates, and
the existing office and editor provider scripts plus `review-pair-recovered.py`.
The controller selects a provider solely from each frozen task row's `fixture`:
`office` uses `run-arm-recovered.py`; `editor` uses the additive recovered editor
provider and its separately reviewed VS Code setup/preflight receipts. It verifies
their hashes and the fixed source, driver, image,
code/assets, scorer, model, and task-order contract before writing any new
index. The output directory must be new and outside the stage.

```sh
python3 evals/parity/repeat-vm-campaign.py \
  --stage /absolute/path/to/immutable-stage \
  --output /absolute/path/to/new-repeat-2 \
  --count 2
```

Plan-only mode is the default. It writes a receipt plus a 20-row index: the
selected first two, five, or twenty tasks have deterministic globally unused
provider run names; the rest remain visibly `unrun`. It does not contact the
remote worker or reserve any evaluation budget.

`--run` is the only dispatch mode. It takes a local exclusive controller lock,
rejects any unsettled ledger reservation or incomplete provider dispatch, and
then calls only the stage's serialized arm runner. The provider retains the
remote worker lock and owns reservation, dispatch, collection, cleanup, and
settlement. The new campaign writes references to provider runs and new pair
gates under `--output`; it never writes a gate into the frozen stage root.

The ramp is finite and ordered: count 5 requires `--previous` to name an
accepted count-2 result, and count 20 requires an accepted count-5 result.
The predecessor is not trusted by its `accepted` flag alone: the entrypoint
rechecks its exact 20-row index, selected prefix, retained gates, provider
completion/result/score/cleanup evidence, and fresh pair reviews under the new
output. Task failures remain in the new pair gates; the entrypoint does not
retry or hide them. A stage or runner hash change after planning fails closed.

Before accepting each new pair, the existing pair verifier runs and the
entrypoint independently checks terminal cleanup and settled usage plus the
frozen source, image, code/assets, driver, scorer, Terra-medium invocation,
null task budgets, and code-host runtime evidence. Provider stdout/stderr is
retained per arm under the new output, while the CLI prints only compact
completion outcome/call/time rows.

The first real count-2 acceptance completed all four arms on the frozen stage:
OpenSky 2/2, native 1/2, and 18 tasks unrun. All pair/cleanup/usage checks passed.
Evaluation inference was $1.3717876, excluding coding and infrastructure. The
count-5 plan subsequently revalidated its predecessor from raw artifacts; no
five-task repeat was dispatched as part of this acceptance.

The subsequent count-5 execution completed ten valid arms (OpenSky 5/5, native
4/5; 15 tasks unrun) for $2.772508 evaluation inference. The full20 repeat was
admitted only after that completed stage passed raw-evidence revalidation.
Its result is pending and must not be combined with the original V14 score.

## Interrupted full20 recovery

Use `--resume` to inspect an existing halted count-20 campaign. Without `--run`
it is strictly read-only. `--resume --run` first performs the same admission,
snapshots the old index and arm receipt/log in `attempt-history/`, then records
the failed attempt in the row's `attemptHistory` before dispatching the admitted
fresh ID through the serialized provider.

```sh
python3 evals/parity/repeat-vm-campaign.py \
  --stage /absolute/path/to/immutable-stage \
  --resume /absolute/path/to/halted-repeat-20
```

The admission report revalidates every retained completed pair from its raw arm
evidence and retained gate, preserves all 20 index rows, and hashes the original
receipt/index before reporting a replacement. It admits exactly one new provider
run name only when the original attempt is terminal, settled, unscored, and
proves the pre-agent editor setup failure (`OPENSKY_EVAL_VSCODE` missing). Scored,
unknown, live, nonterminal, or other failed attempts are rejected. The original
run directory, receipt, and index history remain evidence; a future dispatch
must use the reported fresh run ID after review.
