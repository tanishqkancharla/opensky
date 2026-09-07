# Deferred driver and backend work

The 2026-09-06 rename makes OpenSky Driver the exclusive native backend.
Native implementation now belongs in the `tanishqkancharla/cua` fork under
`libs/cua-driver`; SDK integration and consumer tests remain in OpenSky.
These capability gaps remain deferred: renaming the driver does not fix them.
Historical evidence IDs refer to [harness-friction.md](harness-friction.md).
Historical failures were not rerun or reclassified as passes here.

Scope correction (2026-09-06): OpenSky targets standalone SDK consumers. Codex
in-app browsers and Codex deliverable/handoff lifecycle are not parity gaps.
Hidden standalone browser support is not inferred from an in-app browser.
Consumer-style SDK E2E drafts are in [../e2e/README.md](../e2e/README.md), with
real-fixture prerequisites and pending cases stated separately.

## Driver/backend requirements

| Gap | Required capability | Acceptance before claiming parity |
| --- | --- | --- |
| Native paste, including formatted and multiline text (LIB-009) | One exact-target compound paste operation that saves all clipboard formats, writes the requested text/HTML, dispatches paste, and conditionally restores only if the clipboard still belongs to that operation. Report ambiguous delivery without replay. | Actual editable app: text, Markdown and HTML; preserved unrelated clipboard formats; concurrent user clipboard write; wrong-focus/window tests; no duplicate paste after a failed receipt. |
| Browser paste (LIB-009/014) | Exact-tab paste with actual paste semantics, format negotiation, and page-scoped input. Computer documents Markdown as source text and no browser clipboard restoration. Do not silently implement paste with typing. | Textarea/contenteditable and a paste-event listener: multiline values, HTML, Markdown source, event delivery and exact-tab isolation. |
| Existing browser tabs and provider identity (LIB-014) | Enumerate provider/profile/tab IDs and selected tab; bind to an existing tab using verified provider identity. Distinguish user-owned from agent-created tabs. Current isolated owned sessions cannot establish the user's inventory. | Two profiles, duplicate titles/URLs, close/reopen with reused numeric IDs, explicit tab mentions, selected-tab changes, and cleanup that leaves user tabs open. |
| macOS/Linux trusted coordinate scroll (DRV-002) | Exact-tab trusted scrolling without silently activating a different window; preserve the underlying rejection when the platform refuses it. | A real canvas/custom scroller after a same-tab screenshot; movement visible in fresh state; background/Space changes, stale mapping and sibling isolation. |
| Semantic collection/context and text fidelity (LIB-015/021/022/023/024) | Retain required AX properties, text, source identity, order and qualifiers before projection. Supply bounded context/continuation with correct omissions and lifetime. Report readiness/change epochs if the source can prove them. | Repeat the declared generic article/list/table and separated-match probes against the exact driver build; test delayed content and virtualized lists without claiming completeness from an unchanged subset. The earlier e40 driver candidate remains separately awaiting live acceptance. |
| Exact action refusal details (DRV-003/005) | Preserve inner error code, reason and structured payload through the driver, CLI and MCP projection. A TypeScript parser cannot reconstruct discarded details. | Actual refused input with matching inner and public diagnostics; unknown delivery must never be automatically replayed. Existing TypeScript MCP support stays opt-in until its separate acceptance is complete. |
| Finder/Desktop and Safari/WebKit (DRV-001/SET-007) | Address Finder's nonordinary Desktop/file surface and prove exact Safari/WebKit page/window identity and input authority. | Open the requested resource, verify identity from fresh state, act on it, and clean up only proven-owned targets. |
| Native text selection/range actions (LIB-007/008) | Atomic exact-element selection/range updates when the current targeted-key route cannot deliver correct semantics or bounded latency. | Unicode, multiline and repeated-text disambiguation; cursor-before/after; background focus; visible control/selection change rather than a nominal acknowledgment. |
| Auxiliary windows and lifecycle (CLN-001/006) | Prove request-correlated sheets/panels/windows and expose exact cooperative close plus durable ownership receipts where missing. Cross-process TypeScript state transactions are a separate host concern. | Multiple windows, save sheets, interrupted close, crashes and concurrent runtimes; no broad close hotkeys or guessed sibling adoption. |
| Windows/Linux parity (SET-007) | Equivalent per-platform identity, AX/input, screenshot and cleanup contracts. | Real provisioned Windows/Linux runs; macOS fixtures do not certify these platforms. |

## Host integration, not automatically a driver rewrite

These also prevent complete Computer parity, but assigning them all to the native
driver would be misleading:

- **File/remote image URLs**: `nodeRepl.emitImage` needs an authorized host asset
  resolver. The strict evaluator currently accepts in-memory bytes/data URLs and
  keeps filesystem/network access unavailable.
- **Optional browser APIs**: capabilities, clipboard inventory, read-only page
  evaluation, locators, dialogs, exports, user-tab claiming and browser history
  need actual provider implementations. Inventory/capability APIs should advertise
  only supported operations, not fabricated objects.
- **Approval mediation and real-driver CI** (SET-004/005): a host/runner must supply
  consent handling and a provisioned, permissioned desktop. The fork now provides remote Linux/Windows desktop harnesses and three-OS
  build/unit CI (SET-012). macOS GUI acceptance remains unconfigured because no
  separate Mac is available. No tests or API stubs substitute for that deployment.
- **Concurrent state persistence** (CLN-006): locking/versioned transactions belong
  in the TypeScript session store; native ownership receipts and crash recovery
  are separate requirements. The current pass preserves the existing limitation.

For each later capability, record the exact driver/host revision, a failing
baseline, the corrected fresh state, and exact cleanup evidence. Keep contract
fixtures, live controlled probes and model evaluations separately labeled.

## First SDK desktop evidence (2026-09-07)

[Run 34159847059](https://github.com/tanishqkancharla/opensky/actions/runs/34159847059)
exposed the same trusted-coordinate-scroll gap on Linux: standalone trusted CDP
input can activate the window, so the driver refuses it under the background
contract. The positive SCROLL-B01 case remains failing; Xvfb configuration does
not itself implement a valid delivery route.

STALE-B01 additionally found that CDP retained a detached control and the shared
DOM click path still called its handler. OpenSky Driver candidate `59bdc18e0`
checks node attachment in the same JS turn as dispatch and reports stale refs
without clicking; the SDK scenario is being rerun against that exact build.
This narrow fix does not complete the other capabilities in the table.
