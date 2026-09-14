# Frozen campaign adapters

`run-v15-campaign.py` is the exact adapter used for the completed V15 2→5→20
measurement. SHA-256:
`18c8be2bc2d56c88fad25103e7b7585cdc952c1e2576577f399fe60fa9cdc0d1`.
It pins the parent controller and changes only driver admission and release gates.
The parent still owns ramp order, dispatch, validation, cleanup and settlement.

This is a retained-setup entrypoint. It requires the existing evaluation workspace
with `work/opensky-delivery`, `work/vm-agent-unicode-v15`, the frozen V14 selection,
release receipts, and already provisioned worker. It does not provision a new
host or distribute native runtime/authentication assets. The file is deliberately
kept byte-identical to the executed adapter; its relative paths expect it at
`work/run-v15-campaign.py`.

From the evaluation workspace root, install this committed copy at that location
only if it is missing. If it exists, compare it instead of overwriting it:

```sh
cmp work/opensky-delivery/evals/parity/adapters/run-v15-campaign.py \
  work/run-v15-campaign.py
```

For a missing file, copy it with `cp -n`. Then plan a new two-task campaign:

```sh
python3 work/run-v15-campaign.py \
  --stage "$PWD/work/vm-agent-unicode-v15" \
  --output "$PWD/work/v15-repeat-02-smoke" --count 2
```

The output path must be unused. Plan-only is the default: no remote execution,
model calls or budget reservation. For execution, use another unused output path
and add `--run`. After acceptance, use `--count 5 --previous <accepted-smoke>`;
after that passes admission, use `--count 20 --previous <accepted-five>`.
All stages run fresh attempts on the same frozen task rows. Do not reuse the
completed campaign output paths or mutate their receipts.

See [controller semantics](../repeat-vm-campaign.md) and the
[V15 measurement](../../../docs/linux-parity-v15.md). The adapter itself rejects
changed parent-controller, source-bundle, stage, release, model or task pins.
