# Repeat VM campaign entrypoint

`repeat-vm-campaign.py` plans a fresh, bounded repeat against an already
provisioned immutable VM stage. It does not provision a desktop, configure a
remote host, build a driver, admit spending, or replace the stage controller.

The stage must contain the frozen selection, setup and code-host receipts,
launcher, source bundle, full file manifest, original accepted pair gates, and
the existing `run-arm-recovered.py` plus `review-pair-recovered.py` provider
scripts. Planning verifies their hashes and the fixed source, driver, image,
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
