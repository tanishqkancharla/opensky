import {withOwnedMacClipboard} from "../fixtures/mac-clipboard-owner.js";
import {writeFile} from "node:fs/promises";
import {join} from "node:path";
import { expect } from "vitest";
import { nativeEditorIndex, nativeTest as test, nativeText } from "../fixtures/sdk.js";

// macOS TextEdit on the disposable runner. The oracle is the actual saved file,
// not a driver acknowledgment or a test double's remembered value.
test("PASTE-N01: pastes multiline text into the native document", async ({ sdk, document }) => {
  const state = await sdk.get_app_state({ app: document.handle, includeScreenshot: false, disableDiff: true });
  const editor = nativeEditorIndex(state.text);
  await sdk.select_text({ app: document.handle, element_index: editor,
    text: document.initialText, selection_type: "text" });
  await withOwnedMacClipboard("First native line\nSecond native line\n",false,async clipboard=>{
  await sdk.paste({ app: document.handle, text: "First native line\nSecond native line\n", format: "text" });
  await sdk.press_key({ app: document.handle, key: "super+s" });

  await expect.poll(() => document.read()).toBe("First native line\nSecond native line\n");
  expect(await clipboard.markerPreserved()).toBe(true);
  });
});

test("PASTE-N04: preserves a competing copy after actual text insertion", async ({sdk,document}) => {
  const payload="Owned competing writer first line\nOwned competing writer second line\n";
  const state=await sdk.get_app_state({app:document.handle,includeScreenshot:false,disableDiff:true});
  await sdk.press_key({app:document.handle,element_index:nativeEditorIndex(state.text),key:"super+a"});
  await withOwnedMacClipboard(payload,false,async clipboard=>{
    await clipboard.prepareCompetingCopy({...document.identity,windowId:document.windowId,path:document.path});
    // Start the separate real writer before one public paste. Catch immediately
    // so a watcher failure cannot produce an unhandled rejection during paste.
    const copy=clipboard.copyAfterInsertion().then(receipt=>({receipt}),error=>({error}));
    let pasteError:unknown;
    try { await sdk.paste({app:document.handle,text:payload,format:"text"}); }
    catch(error) { pasteError=error; }
    const copied=await copy;
    if("error" in copied)throw copied.error;
    expect(copied.receipt).toMatchObject({copied:true,insertionObserved:true,payloadObservedBeforeCopy:true});
    const details=(pasteError as {details?:Record<string,unknown>}|undefined)?.details;
    // Early external copy may invalidate the driver's board-token observation.
    // Keep that uncertainty honest; actual insertion is proved independently.
    if(pasteError)expect(details).toMatchObject({status:"unknown",effect:"unknown",clipboard_policy:"restore",clipboard_restore_status:"unverified_input",clipboard_restored:false,do_not_replay:true});
    await writeFile(join(document.artifacts,"competing-paste-outcome.json"),JSON.stringify({
      publicPasteReturned:!pasteError,driverOutcome:details??null,competingCopy:copied.receipt,
      insertionOracle:"explicit save and exact file contents",pasteReplayed:false,
    },null,2));
    expect(await clipboard.newerMarkerPreserved()).toBe(true);
    await sdk.press_key({app:document.handle,key:"super+s"});
    await expect.poll(()=>document.read()).toBe(payload);
    expect(await clipboard.newerMarkerPreserved()).toBe(true);
  });
});

test("SELECT-N01: replaces the disambiguated second occurrence after Unicode text", async ({ sdk, document }) => {
  const state = await sdk.get_app_state({ app: document.handle, includeScreenshot: false, disableDiff: true });
  await sdk.select_text({
    app: document.handle, element_index: nativeEditorIndex(state.text),
    text: "needle", prefix: "two ", suffix: ".", selection_type: "text",
  });
  await sdk.type_text({ app: document.handle, text: "chosen" });
  await sdk.press_key({ app: document.handle, key: "super+s" });

  await expect.poll(() => document.read()).toBe(nativeText.replace("two needle", "two chosen"));
});

test("SELECT-N03: an ambiguous match preserves the established selection", async ({ sdk, document }) => {
  await sdk.select_text({ app: document.handle, element_index: document.editorIndex, text: "needle", prefix: "two ", suffix: "." });
  const state = await sdk.get_app_state({ app: document.handle, includeScreenshot: false, disableDiff: true });
  await expect(sdk.select_text({ app: document.handle, element_index: nativeEditorIndex(state.text), text: "needle" })).rejects.toThrow(/ambiguous/i);
  await sdk.type_text({ app: document.handle, text: "chosen" });
  await sdk.press_key({ app: document.handle, key: "super+s" });
  await expect.poll(() => document.read()).toBe(nativeText.replace("two needle", "two chosen"));
});

for (const { selection, replacement } of [
  { selection: "cursor_before" as const, replacement: "two Xneedle" },
  { selection: "cursor_after" as const, replacement: "two needleX" },
]) {
  test(`SELECT-N-${selection}: inserts at the requested edge without replacing the match`, async ({ sdk, document }) => {
    const state = await sdk.get_app_state({ app: document.handle, includeScreenshot: false, disableDiff: true });
    await sdk.select_text({
      app: document.handle, element_index: nativeEditorIndex(state.text),
      text: "needle", prefix: "two ", suffix: ".", selection_type: selection,
    });
    await sdk.type_text({ app: document.handle, text: "X" });
    await sdk.press_key({ app: document.handle, key: "super+s" });

    await expect.poll(() => document.read()).toBe(nativeText.replace("two needle", replacement));
  });
}

test("TYPE-N06: long Unicode packets replace a selection and persist the complete multiline tail", async ({ sdk, document }) => {
  const state = await sdk.get_app_state({ app: document.handle, includeScreenshot: false, disableDiff: true });
  await sdk.select_text({ app: document.handle, element_index: nativeEditorIndex(state.text),
    text: document.initialText, selection_type: "text" });
  // Uppercase starts avoid TextEdit's sentence capitalization while retaining
  // the surrogate boundary, combining mark, tabs, and multiline tail oracle.
  const payload = `${"A".repeat(19)}😀 β e\u0301\tpacket boundary\n`.repeat(6) + "Complete final tail 😀\n";
  await sdk.type_text({ app: document.handle, text: payload });
  await sdk.press_key({ app: document.handle, key: "super+s" });
  await expect.poll(() => document.read()).toBe(payload);
});
