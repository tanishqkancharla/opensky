import { expect } from "vitest";
import { test } from "../fixtures/linux-paste-focus.js";

test("PASTE-G01: refused paste preserves the focused sibling document and its next edit", { timeout: 180_000 }, async ({ app, sdk, target, sibling, documents, desktop }) => {
  await sdk.invoke("bring_to_front", sibling);
  await expect(app.paste("Unexpected paste", { format: "text" })).rejects.toThrow(/exact focused window/i);
  await expect(desktop.activeWindow()).resolves.toBe(sibling.window_id);
  await sdk.invoke("type_text", { ...sibling, text: " Added once.", delivery_mode: "foreground" });
  await sdk.invoke("press_key", { ...sibling, key: "s", modifiers: ["ctrl"], delivery_mode: "foreground" });
  await sdk.invoke("press_key", { ...target, key: "s", modifiers: ["ctrl"], delivery_mode: "foreground" });
  await expect.poll(() => documents.target()).toBe("Target document contains needle.");
  await expect.poll(() => documents.sibling()).toBe("Sibling document contains needle. Added once.");
});
