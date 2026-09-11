# Pending SDK E2E scenario contracts

These correspond one-to-one to the named `test.todo` declarations. Each is a draft
for a real positive workflow unless listed under the rejection supplement. No fake
driver, mocked clipboard, or fabricated ownership receipt satisfies a prerequisite.
The existing SDK calls below are actual APIs; where a public capability is missing,
the prerequisite says so instead of inventing a method.

## Clipboard and native editing

**PASTE-L02 — restore the user's clipboard formats** (LIB-009).
Given a native editor with a selected insertion point and a real OS pasteboard
containing text, HTML, opaque 8-bit, 16-bit and 32-bit payloads, call
`sdk.paste({app: handle, text: "Inserted", format: "text"})`.
Verify the saved document contains `Inserted` and the OS pasteboard client reads
the original formats and bytes afterward. These observations jointly establish
paste-with-restoration. Prerequisite: a real pasteboard reader/writer with ownership
and cleanup; no equivalent public OpenSky clipboard API currently exists.

**PASTE-L03 — paste with an empty clipboard** (LIB-009).
Given the same native editor and an independently cleared real OS clipboard, call
`sdk.paste({app: handle, text: "Inserted", format: "text"})`, save, and read the
ODT through an external document reader. Verify the inserted and surrounding text,
then verify a separate clipboard requestor still finds no selection owner.

**CLIP-N02 — preserve a concurrent clipboard update** (LIB-009).
Given the same real clipboard fixture, use a real editor that writes a distinct
clipboard value when it handles the paste. Call `sdk.paste` and verify that value
survives after the document receives the pasted text. The editor's event handshake
must establish the concurrent write occurred before the operation's restore phase;
arbitrary sleeps do not prove this race. Prerequisite: a real app/clipboard event
fixture and a settled paste contract that makes that ordering observable. This is
a successful concurrent-user workflow, not an expected-error test.

**PASTE-N02 — native HTML formatting** (LIB-009).
Given a new rich-text document, call `sdk.paste` with
`<strong>Priority</strong> note` and `format:"html"`, save through the SDK, then
read it using a real rich-text document reader. Verify `Priority` has bold formatting
and the remaining text is ordinary text. Do not match a particular RTF byte layout.
Prerequisite: fixture-owned rich-text document lifecycle and a real format-aware
reader. The implemented plain `.txt` fixture cannot prove rich formatting.

**RANGE-N01 — native range value** (LIB-007).
Given a real native app exposing one labeled slider initially at 20, observe its
index, call `sdk.set_value({app: handle, element_index, value:"65"})`, then observe
the app's displayed value of 65. An action receipt alone is insufficient.
Prerequisite: an installed native fixture app with an accessible slider and a
visible value label; no synthetic AX tree or driver callback.

**FOCUS-N01 — edit the bound document while a sibling is focused** (LIB-006/008).
Given two fixture-owned native documents with distinct initial contents, bind the
first and let a real desktop user/fixture focus the second. Use `select_text` and
`type_text` on the first handle, then save both through their exact handles. Verify
only the first file changed. Prerequisite: a real focus controller and independent
focus observation. Do not infer focus from a method returning successfully.

## Standalone browser identity and ownership

**TABS-B01 — choose among duplicate tabs in two profiles** (LIB-014).
Given two real standalone browser profiles with tabs at the same URL/title but
different fixture content, call `cua.getState`/`listTabs`, choose the target using
its actual provider/profile/tab identity, then `cua.getTab` and `getAXState`.
Verify the requested profile's content. Prerequisite: real profile fixtures and
public existing-tab enumeration/binding, which the owned-only facade lacks today.
The setup must establish which real profile is intended before SDK discovery;
never infer identity from duplicate title text.

**TABS-B02 — selected-tab identity** (LIB-014).
Given two tabs in one real profile, change the selected tab through the real user
surface, call `browser.tabs.selected()` and observe its distinctive page content.
Verify it is the selected tab. Prerequisite: real selection observation and shared
profile lifecycle. Two independent isolated SDK sessions do not test this behavior.

**TABS-B03 — user tab survives agent cleanup** (LIB-014/CLN-006).
Given a pre-existing fixture tab treated as user-owned, bind/claim it through a
supported public API and create a separate SDK-owned tab. End the SDK lifecycle.
Verify through the actual browser's user-tab inventory that the pre-existing tab
remains and the agent-created tab is gone. Prerequisite: public claim/release
semantics plus a real independent browser inventory. The facade's own map is not
an independent cleanup oracle. Do not test this on a person's actual tabs.

## Native resources and lifecycle

**FINDER-N01 — requested folder is visibly open** (DRV-001).
Given a unique temporary folder containing `sdk-marker.txt`, call
`sdk.open_target({app:"Finder",targets:[folder]})` and inspect the returned public
state. Verify the current folder exposes `sdk-marker.txt`. Tear down with the
returned exact owned handle. Prerequisite: real Finder Desktop/folder targeting
and provable owned-window cleanup; a launch acknowledgment or title match is not
success. Keep this pending until that lifecycle is available, since failed opening
currently may lack a safely closable handle.

**WEBKIT-N01 — exact Safari document** (LIB-011/DRV-001/SET-007).
Given a fixture-owned Safari sibling with the same title as the requested local
page, open the requested URL through `sdk.open_target({app:"Safari",targets:[url]})`.
Observe through the returned exact handle and verify the current document URL and
its distinct page content. Prerequisite: current WebKit document identity, a real
sibling fixture and exact cleanup. `requested:[url]` records intent and is not the
URL assertion; use current observed document identity.

**CLOSE-N01 — save-sheet resolution closes only the owned document** (CLN-001).
Given an edited fixture document and an untouched sibling, call `close_target`.
If the app presents its genuine save sheet, use fresh public AX state to choose
Save, resolving only the fixture's known temporary path, and finish exact close.
Verify the saved file and independently observed absence of that document, with
the sibling still open. Prerequisite: a real native app/window inventory and sheet
ownership. Do not hide expected sheet handling inside a generic cleanup helper.
The transient refusal is part of completing this positive close workflow, not
the final assertion.

## Rejection and ambiguous-delivery supplements

**IDENTITY-B01 — numeric tab-ID reuse** (LIB-014).
Given a previously bound fixture tab, close it through the real browser and create
a different tab until the provider actually reuses that numeric ID. Attempt to
resolve the old provider identity through the SDK. Verify rejection and unchanged
replacement content. Prerequisite: a provider test environment that can genuinely
produce reuse with distinct generation identity; do not manufacture an ID in an
SDK response. If actual reuse cannot be produced, report incomplete coverage.

**ERROR-D01 — preserve a real refusal** (DRV-003/005).
Given a real, documented unsupported driver route on the provisioned runner, call
the corresponding SDK action once. Verify the public `OpenSkyError` preserves the
documented code and relevant reason of the actual driver refusal. Compare with a
real documented diagnostic surface, not a guessed error message or an injected
exception. Prerequisite: a stable real refusal trigger and its public diagnostic
oracle. Run independently with the CLI and MCP transports when available.

**DELIVERY-D01 — no duplicate input after transport loss** (LIB-005/DRV-004/005).
Given a real page/app with a durable input-event journal, send one unique input
through the SDK. After the real collaborator confirms receiving it, interrupt the
actual transport before the response reaches the SDK. Recover using observation,
without resubmitting the action. Verify exactly one journaled input and correct
resulting content. Prerequisite: a pass-through process/network fault fixture
with delivery acknowledgment; it may interrupt real traffic but must not fabricate
driver results. This is distinct from a stale-element rejection before dispatch.

## Coverage map and later platform runs

| Deferred issue | Implemented test bodies | Pending contracts |
| --- | --- | --- |
| Native/browser paste (LIB-009/014) | PASTE-B01/02/03, PASTE-L01/02/03 | CLIP-N02, PASTE-N02 |
| Trusted coordinate scroll (DRV-002) | SCROLL-B01 | Background focus/Space isolation needs the real focus fixture |
| Semantic context/text/freshness (LIB-015/021/022/023/024) | CONTEXT-B-list/article/table, TEXT-B01, FRESH-B01 | Whole-group continuation, virtualization and general readiness need separately declared source/order cases; these tests make no completeness claim |
| Existing tabs and identity (LIB-014) | — | TABS-B01/02/03, IDENTITY-B01 |
| Native selection/range (LIB-007/008) | SELECT-N01, SELECT-N-cursor_before/after | RANGE-N01, FOCUS-N01 |
| Native resource/lifecycle (DRV-001/CLN-001) | Native-document fixture uses exact handles | FINDER-N01, WEBKIT-N01, CLOSE-N01 |
| Diagnostics/delivery (DRV-003/004/005) | STALE-B01 only covers SDK stale-reference behavior | ERROR-D01, DELIVERY-D01 |
| Windows/Linux (SET-007) | Reuse browser cases on real separate runners | Native cases need each platform's actual native fixture app; macOS tests do not certify them |

An implemented scenario is not a passing scenario until run. Native format and
clipboard behavior beyond these defined assertions should get separate cases,
not extra unrelated assertions attached to existing tests.
