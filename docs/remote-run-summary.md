# Inspect a completed desktop run in one command

`e2e/ci/summarize-desktop-run.py` reads the original Vitest report, driver identity, cleanup
receipts, saved spreadsheet XML and repeated geometry diagnostics. It does not
launch apps, alter artifacts, re-grade tasks or run agents. This is a diagnostic
summary of existing evidence, not additional acceptance evidence.

Local artifact directory:

```sh
python3 e2e/ci/summarize-desktop-run.py \
  evals/runs/linux-office-setup/calc-candidate-03 \
  --formula B2-C2
```

To inspect immediately after a remote run without first downloading screenshots
and large logs, send the script over standard input. The remote machine needs
only its existing Python standard library; nothing is installed or persisted:

```sh
ssh -i /path/to/exe-ssh-key -o IdentitiesOnly=yes -o BatchMode=yes \
  vm+opensky@vm.exe.xyz \
  'python3 - /home/exedev/opensky-input-debug/artifacts/calc-candidate-03 --formula B2-C2' \
  < e2e/ci/summarize-desktop-run.py
```

Add `--json` for complete machine-readable output. Text output shows at most
20 saved formulas; `--formula` filters by exact formula text, without `=`.
The exit code is 0 only if the report says success, at least one test ran,
all executed tests passed, and their cleanup receipts verify exit. A failed run,
absent results, or missing/unreadable evidence returns 1. Skipped tests remain
explicitly skipped and never count as passes. Run this after the container
finishes; incomplete artifacts cannot establish a completed result.

Artifact copying and container-exit verification remain separate responsibilities.
Process cleanup receipts cannot prove that Docker removed its container. The
identity file records the reported source revision, not a fresh binary hash.

Validated against existing real Calc candidates 01, 02, 03 and the passing shared
Impress/Code setup run. Candidate 02 reports the formula in G17; candidate 03
reports E1, while retaining the original E2 assertion failure. Three local
artifact sets summarized in 0.004 seconds in one measured invocation. This
removes repeated manual JSON/XML/log inspection; no end-to-end cycle-time speedup
has yet been measured.
