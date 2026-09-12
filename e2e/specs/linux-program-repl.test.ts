import { expect } from "vitest";
import { test } from "../fixtures/linux-program-repl.js";

test("PROGRAM-L01: an OpenSky loop edits the document and a later cell saves it", { timeout: 180_000 }, async ({ openskyRepl, document }) => {
  await expect(openskyRepl.cell('var app = await cua.getApp("LibreOffice"); await app.pressKey("CTRL+A");')).resolves.toMatchObject({ isError: false });
  await expect(openskyRepl.cell('var labels = ["First", "", "Third"]; for (let i = 0; i < labels.length; i++) { if (labels[i]) await app.typeText(`${i + 1}: ${labels[i]}. `); }')).resolves.toMatchObject({ isError: false });
  await expect(openskyRepl.cell('await app.typeText("Saved."); await app.pressKey("CTRL+S");')).resolves.toMatchObject({ isError: false });
  await expect.poll(() => openskyRepl.cell('await app.getAXState();'), { timeout: 15_000 }).toMatchObject({ content: expect.arrayContaining([expect.objectContaining({ type: "text", text: expect.stringContaining("Use Word 2007 Format") })]) });
  await expect(openskyRepl.cell('await app.pressKey("ENTER");')).resolves.toMatchObject({ isError: false });
  await expect.poll(() => document.readText()).toBe("1: First. 3: Third. Saved.");
});

test("PROGRAM-L02: a native loop edits the document and a later cell saves it", { timeout: 180_000 }, async ({ nativeRepl, app, document }) => {
  await expect(nativeRepl.cell('globalThis.sky = (await import("@oai/sky")).sky; await sky.press_key({key:"CTRL+a"});')).resolves.not.toMatchObject({ isError: true });
  await expect(nativeRepl.cell('var labels = ["First", "", "Third"]; for (let i = 0; i < labels.length; i++) { if (labels[i]) await sky.type_text({text:`${i + 1}: ${labels[i]}. `}); }')).resolves.not.toMatchObject({ isError: true });
  await expect(nativeRepl.cell('await sky.type_text({text:"Saved."}); await sky.press_key({key:"CTRL+s"});')).resolves.not.toMatchObject({ isError: true });
  await expect.poll(() => app.getAXState({ disableDiffing: true }), { timeout: 15_000 }).toContain("Use Word 2007 Format");
  await expect(nativeRepl.cell('await sky.press_key({key:"Return"});')).resolves.not.toMatchObject({ isError: true });
  await expect.poll(() => document.readText()).toBe("1: First. 3: Third. Saved.");
});
