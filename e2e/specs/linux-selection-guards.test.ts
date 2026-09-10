import { expect } from "vitest";
import { test } from "../fixtures/linux-selection-guards.js";

test("SELECT-G01: refuses selection while its sibling owns focus and preserves sibling typing", { timeout: 180_000 }, async ({ sdk, target, sibling, selection, documents, desktop }) => {
  await sdk.invoke("bring_to_front", sibling);
  await expect(sdk.invoke("select_text", selection)).rejects.toThrow(/refused|focused widget/i);
  await expect(desktop.activeWindow()).resolves.toBe(sibling.window_id);
  await sdk.invoke("type_text", { ...sibling, text: " Added once.", delivery_mode: "foreground" });
  await sdk.invoke("press_key", { ...sibling, key: "s", modifiers: ["ctrl"], delivery_mode: "foreground" });
  await sdk.invoke("press_key", { ...target, key: "s", modifiers: ["ctrl"], delivery_mode: "foreground" });
  await expect.poll(() => documents.target()).toBe("Target document. needle.");
  await expect.poll(() => documents.sibling()).toBe("Sibling document. needle. Added once.");
});

test("SELECT-G02: a document selection cannot disturb its active Find dialog", { timeout: 180_000 }, async ({ sdk, target, selection, modal, documents, desktop }) => {
  await expect(modal.readState()).resolves.toContain("Keep this search");
  await expect(sdk.invoke("select_text", selection)).rejects.toThrow(/refused|another window|modal/i);
  await expect(desktop.activeWindow()).resolves.toBe(modal.target.window_id);
  await expect(modal.readState()).resolves.toContain("Keep this search");
  await sdk.invoke("press_key", { ...modal.target, key: "Escape", delivery_mode: "foreground" });
  await sdk.invoke("press_key", { ...target, key: "s", modifiers: ["ctrl"], delivery_mode: "foreground" });
  await expect.poll(() => documents.target()).toBe("Target document. needle.");
  await expect.poll(() => documents.sibling()).toBe("Sibling document. needle.");
});

test("SELECT-G03: a superseded observed selection token is rejected without replacing text", { timeout: 180_000 }, async ({ sdk, target, selection, documents }) => {
  await sdk.invoke("get_window_state", { ...target, include_screenshot: false });
  await expect(sdk.invoke("select_text", selection)).rejects.toThrow(/stale/i);
  await sdk.invoke("press_key", { ...target, key: "End", modifiers: ["ctrl"], delivery_mode: "foreground" });
  await sdk.invoke("type_text", { ...target, text: " Added once.", delivery_mode: "foreground" });
  await sdk.invoke("press_key", { ...target, key: "s", modifiers: ["ctrl"], delivery_mode: "foreground" });
  await expect.poll(() => documents.target()).toBe("Target document. needle. Added once.");
  await expect.poll(() => documents.sibling()).toBe("Sibling document. needle.");
});

// Regression draft: selection can enable menus and shift application-wide
// indices. The retained toolbar token must not retarget another live control.
test("SELECT-G04: selection invalidates retained toolbar tokens and a fresh target formats the selected text", { timeout: 180_000 }, async ({ sdk, target, selection, toolbar, observeToolbar, documents }) => {
  await sdk.invoke("select_text", selection);
  await expect(sdk.invoke("click", toolbar)).rejects.toThrow(/stale/i);
  const freshToolbar = await observeToolbar();
  await sdk.invoke("click", freshToolbar);
  await sdk.invoke("press_key", { ...target, key: "s", modifiers: ["ctrl"], delivery_mode: "foreground" });
  await expect.poll(() => documents.struck()).toEqual(["needle"]);
  await expect.poll(() => documents.target()).toBe("Target document. needle.");
  await expect.poll(() => documents.sibling()).toBe("Sibling document. needle.");
});
