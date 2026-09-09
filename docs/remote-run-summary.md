# Inspect a completed desktop run in one command

`e2e/ci/summarize-desktop-run.py` reads the original Vitest report, driver identity, cleanup
receipts, optional public-method timings, saved spreadsheet XML and repeated geometry diagnostics.
Both `setup/TEST-ID` and `typing/TEST-ID` evidence directories are supported. It does not
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

Typing and screenshot runs also show call count, failed-call count, total time,
and median time per recorded public SDK method. These counts include fixture
setup/cleanup calls and are not agent REPL calls; summed method time is not total
run wall time. JSON output includes per-test timing summaries. Missing timing
files are explicitly unavailable and do not imply zero calls or invalidate older
runs that did not record timing. Empty and malformed files are distinguished;
malformed records produce line-specific evidence issues and an incomplete exit
status. Ambiguous evidence directories also fail closed.

Validated against `shot-speed-before-01` and `shot-speed-after-01`: each preserves
two passes, four skips, and two verified cleanups. Six screenshot samples per
run reproduce medians 5424.127 ms and 611.189 ms. The older four-test input run
and two-test Calc run still pass with timing unavailable. Missing-cleanup and
malformed-timing checks use temporary copies of those existing receipts, without
running or changing the desktop service. This does not add new GUI acceptance.
