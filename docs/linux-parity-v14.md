# Linux V14 paired measurement

V14 completed **20 matched Linux tasks / 40 arms** with clean final measurement verification: OpenSky passed **18/20 (90%)** and native Computer Use passed **16/20 (80%)**. OpenSky passed **16/16 native-success tasks**; there are no native-only successes in this measurement. The repaired [SDK CI gate](https://github.com/tanishqkancharla/opensky/actions/runs/34784123429) passed **27/27 cases** across three desktops using the exact V14 driver binary. Saved Unicode text, unchanged keyboard maps, and all 27 app cleanups were verified. Earlier failures remain retained: CI 34782011989 failed package setup, and CI 34782566739 exposed six obsolete dialog test assumptions plus one intermittent Unicode truncation. The dialog tests are corrected; the Unicode cause remains unresolved despite six subsequent successful traced attempts (three warm, three CI).

The frozen configuration used SDK `c69d3b8533ffc860759707737e45dc5578466b23`, driver source `bd7c5a52253b20a8169d0a9a10437b8a14c68f6a` (SHA-256 `ba8b7c854f05f15be028ceee7ea0fbdf3266bd6f616309d5e78f0014c00c6e7d`), image `sha256:7643bdb4ffdf5c661a0c88d357985cd884790f74272b993d26ed2e2703032b1f`, code/assets `05b25943c5c469782bcab4d8bfe4b64e04c04f998e63e100b45dead2590beca8`, scorer `985cb748fefedc3958bd1791288bfe51d83f0f7a700ddfae8fd941907b5b553b`, and Terra medium. The final verifier found 20 accepted and validated pairs, no missing tasks, and no integrity errors.

| Task | Task ID | OpenSky | Native | Receipt |
| --- | --- | --- | --- | --- |
| Slide 1 green background | `9cf05d24-6bd9-4dae-8967-f67d88f5d38a` | Pass | Pass | Reconstructed receipt |
| Center document heading | `3ef2b351-8a84-4ff2-8724-d86eae9b842e` | Pass | Pass | Original receipt |
| Weekly Sales/COGS chart | `12382c62-0cd1-4bf2-bdc8-1d20bf9b2371` | Pass | Pass | Original receipt |
| Set document font Times New Roman | `0e763496-b6bb-4508-a427-fad0b6c3e195` | Pass | Pass | Original receipt |
| Pass/Fail/Held dropdown | `ecb0df7a-4e8d-4a03-b162-053391d3afaf` | Pass | Pass | Reconstructed receipt |
| Alternate two copied slides | `9ec204e4-f0a3-42f8-8458-b772a6797cab` | Pass | Pass | Reconstructed receipt |
| Fill blanks from cell above | `01b269ae-2111-4a07-81fd-3fcd711993b0` | Pass | Pass | Reconstructed receipt |
| Slide 14 textbox sizes | `3161d64e-3120-47b4-aaad-6a764a92493b` | Pass | Pass | Original receipt |
| Freeze A1:B1 headers | `4188d3a4-077d-46b7-9c86-23e1a036f6c1` | Fail | Fail | Original receipt |
| Move Slide 2 image right | `2b94c692-6abb-48ae-ab0b-b3e8a19cb340` | Pass | Pass | Original receipt |
| Indent lines 2–10 | `ec71221e-ac43-46f9-89b8-ee7d80f7e1c5` | Pass | Pass | Reconstructed receipt |
| Convert document text to lowercase | `d53ff5ee-3b1a-431e-b2be-30ed2673079b` | Pass | Pass | Original receipt |
| Gross-profit and Year_Profit worksheet | `035f41ba-6653-43ab-aa63-c86d449d62e5` | Pass | Pass | Reconstructed receipt |
| Replace text with test | `0ed39f63-6049-43d4-ba4d-5fa2fe04a951` | Pass | Pass | Reconstructed receipt |
| Rename and copy worksheets | `0cecd4f3-74de-457b-ba94-29ad6b5dafb6` | Pass | Pass | Original receipt |
| Sort records by amount | `51b11269-2ca8-4b2a-9163-f21758420e78` | Pass | Pass | Original receipt |
| Split name and rank fields | `37608790-6147-45d0-9f20-1137bb35703d` | Pass | Fail | Reconstructed receipt |
| Strike through final paragraph | `72b810ef-4156-4d09-8f08-a0cf57e7cefe` | Pass | Pass | Reconstructed receipt |
| Subscript 2 in H2O | `0b17a146-2934-46c7-8727-73ff6b6483e8` | Fail | Fail | Reconstructed receipt |
| Slide 4 table first row | `5cfb9197-e72b-454b-900e-c06b0c802b40` | Pass | Fail | Original receipt |

The two both-fail tasks are interpretation failures, not evidence of an OpenSky-specific defect. For freeze, both saved a row-only freeze at A2 while the reference requires row 1 and columns A-B frozen at C2; native explicitly selected A2 and OpenSky activated the row-boundary freeze. For subscript, OpenSky formatted one correct digit and native formatted a wrong `O`; both saved outcomes failed.

Across all 40 arms, OpenSky used 219 tool calls and 1,875,881 ms; native used 174 calls and 1,476,140 ms. The evaluation estimate is $9.6495524 for OpenSky plus $3.5424996 for native, or **$13.192052** total. These figures exclude coding-agent inference and infrastructure.

This is one trial per task/backend under adapted saved-outcome scoring. Backend-specific public API instructions differ. Ten pairs have explicit reconstructed local receipts based on retained remote outcomes, usage, environment, task/prompt, and cleanup evidence; no evaluation was repeated, and older archived raw evidence remains unavailable. The result measures this frozen Linux configuration and does not establish repeatability or general API parity.

## Re-running

The [bounded repeat command](../evals/parity/repeat-vm-campaign.md) runs matched evaluations against an already provisioned immutable V14 stage. Its first real two-task acceptance completed four valid arms: OpenSky **2/2**, native **1/2**, with the other 18 tasks explicitly unrun. All usage settled and all containers were removed; evaluation inference was **$1.3717876**. The count-5 planner then revalidated those raw outcomes and accepted the predecessor without dispatching another run.

These repeat results remain separate from the original 20-task measurement. Native failed the repeated background task that it passed in V14, demonstrating run variability. The wrapper does not provision a new host; full fresh 5/20 repeat execution has not been validated.

The committed [machine-readable receipt](linux-parity-v14.json) is the publishable V14 evidence. Raw campaign artifacts are retained separately and are not represented as publicly available by this report.
