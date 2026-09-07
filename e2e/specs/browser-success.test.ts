import { expect } from "vitest";
import { actionIndex, leafText, screenshotCenter, scrollMarkerTop, test } from "../fixtures/sdk.js";
import { canvasPage, collectionPage, latePage } from "../fixtures/site.js";
import { backgroundTest } from "../fixtures/desktop.js";

// Positive acceptance targets. Paste/scroll may fail against today's driver.
// Do not turn an unsupported-operation error into a passing expectation.
test("PASTE-B01: pastes multiline text as one real paste into a textarea", async ({ sdk, tab, site }) => {
  const field = actionIndex(await tab.getAXState({ emit: false, disableDiffing: true }), "textbox", "Draft message");
  await sdk.press_key({ app: tab.id, element_index: field, key: "End" });
  await tab.paste("First line\nSecond line", { format: "text" });

  await expect.poll(async () => (await site.read()).text).toBe("First line\nSecond line");
  expect(await site.read()).toMatchObject({ pasteCount: 1, trustedPaste: true });
  expect(await tab.getAXState({ emit: false })).toContain("Second line");
});

test("PASTE-B02: pastes HTML formatting into a rich editor", async ({ sdk, tab, site }) => {
  const field = actionIndex(await tab.getAXState({ emit: false, disableDiffing: true }), "textbox", "Rich message");
  await sdk.press_key({ app: tab.id, element_index: field, key: "End" });
  await tab.paste("<strong>Priority</strong> note", { format: "html" });

  await expect.poll(async () => (await site.read()).text).toBe("Priority note");
  // The running editor reports computed font weight, not an exact HTML serialization.
  expect((await site.read()).bold).toBe(true);
});

test("PASTE-B03: inserts Markdown source literally in the browser editor", async ({ sdk, tab, site }) => {
  const field = actionIndex(await tab.getAXState({ emit: false, disableDiffing: true }), "textbox", "Rich message");
  await sdk.press_key({ app: tab.id, element_index: field, key: "End" });
  await tab.paste("**Priority** note", { format: "md" });

  await expect.poll(async () => (await site.read()).text).toBe("**Priority** note");
  expect((await site.read()).bold).toBe(false);
});

const canvasTest = backgroundTest.extend({ html: canvasPage });
canvasTest("SCROLL-B01: moves a custom canvas with trusted screenshot-coordinate scroll", async ({ tab, site, foregroundApp }) => {
  const before = await tab.getScreenshot({ emit: false });
  await tab.scroll(screenshotCenter(before), "down", 3);

  await expect.poll(async () => scrollMarkerTop(await tab.getScreenshot({ emit: false }))).toBeLessThan(scrollMarkerTop(before));
  await expect.poll(async () => (await site.read()).trustedWheel).toBe(true);
  expect(new Set(foregroundApp.activeWindows())).toEqual(new Set([foregroundApp.windowId]));
});

for (const kind of ["list", "article", "table"] as const) {
  const collectionTest = test.extend({ html: collectionPage(kind) });
  collectionTest(`CONTEXT-B-${kind}: retains the qualifier for each separated match`, async ({ tab }) => {
    const state = await tab.getAXState({ query: "Inspect", emit: false });
    expect(leafText(state)).toEqual(expect.arrayContaining([
      "Qualifier alpha: provisional",
      "Qualifier beta: provisional",
      "Qualifier gamma: provisional",
    ]));
  });
}

const fidelityText = "Price < 10 & café — 東京 😀";
const fidelityTest = test.extend({ html: `<main><p>Price &lt; 10 &amp; café — 東京 😀</p></main>` });
fidelityTest("TEXT-B01: preserves Unicode and punctuation in the observed text", async ({ tab }) => {
  expect(leafText(await tab.getAXState({ emit: false, disableDiffing: true }))).toContain(fidelityText);
});

const lateTest = test.extend({ html: latePage });
lateTest("FRESH-B01: observes a late result after the page has completed loading it", async ({ tab, site }) => {
  const button = actionIndex(await tab.getAXState({ emit: false, disableDiffing: true }), "button", "Load later result");
  await tab.click(button);
  // This is the real page reporting its completed DOM mutation. No repeated
  // SDK action or AX polling masks a stale first post-completion observation.
  await expect.poll(async () => (await site.read()).phase).toBe("ready");
  expect(await tab.getAXState({ emit: false })).toContain("Later result ready");
});
