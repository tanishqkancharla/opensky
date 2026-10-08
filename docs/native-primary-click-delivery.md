# Native Mac primary button delivery — current scoped policy and rejected experiment

Intake: https://github.com/tanishqkancharla/opensky/issues/27. Driver source 190060e03437333cccf4e62b26fd72ca664f8867, installed executable SHA256 6d947a84efa55bfc9a996c658ed6b1207410b25524563826b2ae7421b3342de0. No Rust changes for this experiment.

An owned no-store counter confirms one native Reload and one SDK Reload each increment the displayed count by one. SDK nevertheless reports an uncertain AXPress outcome and opens an unrelated Recently Closed Tabs toolbar menu; screenshots confirm the popup is visible. This refines the earlier paid failure diagnosis: lack of reload effect is not established.

One raw foreground driver control returned normally without a popup. That single control did not generalize: the generic SDK foreground policy failed the extended existing AX-N01 keeper. Passive evidence confirms its single Reload targeted the exact current window/token s000000d7:14, role AXButton, identifier ReloadButton, with delivery_mode foreground. It still produced unknown effect metadata and the popup while the actual counter increased 1→2. No index mismatch or omitted foreground mode is supported by this receipt.

The generic runtime policy is rejected and rolled back. The candidate is withdrawn; no fixed-defect, completed paid-task, resource-gain or canonical-matrix claim. The extended keeper remains a retained counterexample for the next scoped repair. No equivalent shortcut or click was replayed. All owned app/helper cleanup passed.

Process improvement: the existing E2E fixture now optionally records capped passive driver receipts, including whitelisted structured errors, and flushes them after SDK shutdown. The parent failure packet keeps bounded assertion excerpts, exact dispatch lineage, uncertainty and links to raw artifacts. It does not add agent-visible context or disk waits between actions. Known failed gates continue to block paid dispatch.

## Current scoped policy

The withdrawn policy above applied foreground delivery too broadly. Commit e8f37b2 instead selects foreground only for a single unmodified left indexed Mac AXButton whose observed action list omits AXPress/press; advertised and unknown actions retain their existing routes. The driver keeps exact token/PID/window/geometry/focus guards and refuses unsupported background input before dispatch. Driver draft42 now uses one PID-addressed window-local sequence for that branch, without AX or shortcut replay. Its current local BUTTON-N01 and later AX-N01 keepers pass, including honest route/delivery/unverifiable receipts. See https://github.com/tanishqkancharla/cua/pull/42 for exact candidate and paired-run evidence.

This branch is being integrated with updated PR24 single-budget observation. Current merged-wrapper verification is pending; this does not revive the rejected generic foreground or unadvertised AXPress routes. Full canonical matrix/review and broader keyboard scope remain pending.
