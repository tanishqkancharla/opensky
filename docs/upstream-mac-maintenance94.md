# Post-0.38 Mac maintenance candidate

Driver candidate `13505413d11c40cc91092df5c0bcb7e2cfc3e289` ports two upstream Mac changes while preserving OpenSky's local ownership and typing safeguards. OpenSky 0.2.43 remains the published SDK and selects driver `9efa30f02189b33f2b09370e9cc0daaab25972ea`. The canonical component release remains 0.38.0; these are selected post-release commits. [Structured evidence](upstream-mac-maintenance94.json).

## Changes and attribution

- [ddupont808's bundled-host health fix](https://github.com/trycua/cua/commit/88b4b63fdf36b611bbc00c287840e821b649c193) recognizes executables inside any app bundle for the WindowServer diagnostic. OpenSky's existing bundle case stays covered. The runtime invalid-connection detector still takes precedence, and this classification grants no permissions.
- [injaneity's Space-free enumeration change](https://github.com/trycua/cua/commit/2d5d5d64637d2d2f8f2561c8301403515df826c2) avoids Space snapshots in background keyboard facts and post-action window polling, whose consumers use window IDs, owners, titles and bounds. Space-aware public enumeration keeps its existing flags and metadata. The wrappers share options/layer filters. The same upstream commit shortens only a containment test's Unix socket path, leaving secret evidence in its private directory.

Both contributor-authored commits retain their authorship and source trailers. Conflict resolution retains the fork's window_info_by_id import, attached-sheet/inline-editor ancestry and OpenSky bundle coverage. The Mac typing implementation is byte-identical to released driver9efa30f021. No SDK runtime change is included.

## Verification

711 Mac platform tests and 1,203 tests across all 18 core binaries/doc-test runs pass. Seven Mac host opt-ins and two core/doc tests remain ignored. Restoring only the previous bundled-host policy makes the existing Mac health owner fail (710 pass, one failure); source is restored clean and the installed signed binary is unchanged by that counterfactual. No duplicate implementation-string test is added.

The installed candidate's public SDK health_report, filtered to windowserver_connection, passes without a prompt. Original Calendar capture verifies the exact PID/window, stable signing certificate, both existing TCC grants, daemon source, and actual 250/50 ms observation settings. Generic app-bundle classification is unit verified; no arbitrary embedded host's WindowServer connection or permissions are claimed.

Ten real Mac cases pass: physical Safari window transitions and app cues, exact-document observation after a sibling opens, native app/document focus, Save-sheet edit/cancel, foreground WebKit retained-prefix0/2, and native background/foreground retained-prefix0/2. Independent app receipts retain Alpha87 exactly once and uncertain results omit suffix counts. Each recipe cleans its exact apps and artifacts; original Calendar is preserved.

The change removes unnecessary Space queries from the selected hot paths. No speed, cost, context or parity-score improvement is inferred from these regression cases. Other Space layouts remain outside the observed desktop scope.

## Remaining qualification

Fresh exact-source Bookworm archive/application effects and three-platform checks are pending before release. Mac #19/#66 stay open; a passing cold open does not establish an intermittent launch fix. Sandboxed Bookworm Chrome, Windows GUI, Wayland and other architectures remain unqualified. The upstream Linux MPX popup fix and broader flaky-test changes were reviewed but are outside this candidate. No VM, sandbox bypass, new permission, paid arm or score row is used.
