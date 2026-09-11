import { expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test as dropdown } from "./linux-dropdown.js";
import type { App } from "../../src/cua.js";

type Values = Record<string, Record<string, unknown>>;

// Reuse the original pinned workbook, ordinary List setup and owned-app cleanup.
// This fixture adds outcome capture, not another input backend or app setting.
export const test = dropdown.extend<{ app: App; expectedValues: Values }>({
  app: async ({ fixture, task }, use) => {
    const { app, dialog } = fixture;
    await app.click(dialog.entriesPoint);
    await app.typeText("Pass\nFail\nHeld");
    await expect(dialog.observe()).resolves.toMatchObject({ open: true, choices: ["Pass", "Fail", "Held"] });
    const configured = await app.getAXState({ disableDiffing: true });
    const sort = configured.split("\n").filter(line => line.includes('check box "Sort entries ascending"'));
    expect(sort).toHaveLength(1);
    expect(sort[0]).not.toContain("[selected]");
    await app.click(dialog.initialOkIndex);
    await expect(dialog.observe()).resolves.toMatchObject({ open: false });
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "dropdown", task.name.split(":")[0]);
    await mkdir(artifacts, { recursive: true });
    let observation = 0;
    const observed = new Proxy(app, { get(target, key) {
      if (key === "getAXStateAndScreenshot") return async (...args: Parameters<App["getAXStateAndScreenshot"]>) => {
        const result = await target.getAXStateAndScreenshot({ ...args[0], disableDiffing: true });
        const stem = `consumer-${String(++observation).padStart(3, "0")}`;
        await writeFile(resolve(artifacts, `${stem}.txt`), result.state, { flag: "wx" });
        if (!result.screenshot) throw new Error("Consumer observation did not return a screenshot");
        await writeFile(resolve(artifacts, `${stem}.png`), result.screenshot, { flag: "wx" });
        return result;
      };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    await use(observed);
  },
  expectedValues: async ({ fixture }, use) => {
    const expected = structuredClone(fixture.document.originalValues);
    for (const [cell, value] of [["D2", "Fail"], ["D3", "Fail"], ["D4", "Pass"]]) {
      expected.Sheet1![cell!] = { kind: "text", value, formula: null };
    }
    await use(expected);
  },
});
