import type { Browser, Page } from "@playwright/test";
import { actionIndex, expect, test as base } from "./fixtures.js";

const test = base.extend<{ page: Page }>({
  page: async ({ cua, playwright }, use) => {
    const tab = await cua.createBrowserTab("chrome", "about:blank", {
      sessionName: "Playwright E2E",
      visible: false,
    });
    if (!tab.debuggerHttpUrl) {
      throw new Error("OpenSky did not expose the driver-owned headless browser endpoint.");
    }

    let browser: Browser | undefined;
    try {
      browser = await playwright.chromium.connectOverCDP(tab.debuggerHttpUrl);
      const pages = browser.contexts().flatMap(context => context.pages());
      if (pages.length !== 1) {
        throw new Error(`Expected one driver-owned headless page; found ${pages.length}.`);
      }
      await use(pages[0]!);
    } finally {
      // The CUA fixture owns this Chromium process. Closing its exact tab ends
      // the driver session; browser.close() would bypass that ownership path.
      await tab.close();
    }
  },
});

test("clicks a button through CUA and exposes the result through Playwright", async ({ cua, page }) => {
  await page.setContent(`
    <button type="button" onclick="this.textContent = 'Clicked'">Click me</button>
  `);
  await expect(page.getByRole("button")).toHaveText("Click me");

  const [tabInfo] = await cua.listTabs({ browser: "chrome" });
  const tab = await cua.getTab(tabInfo!.id, { browser: "chrome" });
  const state = await tab.getAXState({ emit: false, disableDiffing: true });
  await tab.click(actionIndex(state, "button", "Click me"));

  await expect(page.getByRole("button")).toHaveText("Clicked");
});

test("edits and saves browser-local text through CUA", async ({ cua, page }) => {
  await page.setContent(`
    <label>Name <input aria-label="Name"></label>
    <button type="button" onclick="document.querySelector('output').textContent = document.querySelector('input').value">
      Save
    </button>
    <output>Not saved</output>
  `);

  const [tabInfo] = await cua.listTabs({ browser: "chrome" });
  const tab = await cua.getTab(tabInfo!.id, { browser: "chrome" });
  let state = await tab.getAXState({ emit: false, disableDiffing: true });
  await tab.setValue(actionIndex(state, "textbox", "Name"), "Ada Lovelace");
  state = await tab.getAXState({ emit: false, disableDiffing: true });
  await tab.click(actionIndex(state, "button", "Save"));

  await expect(page.locator("output")).toHaveText("Ada Lovelace");
});

test("starts delayed browser-local work through CUA", async ({ cua, page }) => {
  await page.setContent(`
    <button type="button" onclick="setTimeout(() => document.querySelector('output').textContent = 'Ready', 100)">
      Load
    </button>
    <output>Waiting</output>
  `);

  const [tabInfo] = await cua.listTabs({ browser: "chrome" });
  const tab = await cua.getTab(tabInfo!.id, { browser: "chrome" });
  const state = await tab.getAXState({ emit: false, disableDiffing: true });
  await tab.click(actionIndex(state, "button", "Load"));

  await expect(page.locator("output")).toHaveText("Ready");
});
