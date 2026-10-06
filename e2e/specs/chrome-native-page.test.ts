import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { createOpenSky } from "opensky-cua";
import { test } from "../fixtures/sdk.js";

const coldPage = test.extend({ html: `<main><h1>Cold native page</h1><label>Count <input type="number" value="0" min="0" max="5" readonly></label></main>` });

// Run on a cold Mac Chrome process. Do not acquire a native-plugin handle or a
// typed browser tab: either would exercise a different accessibility path.
coldPage("AX-N01: cold Chrome publishes body controls through its native app handle", async ({ sdk, cua, site }) => {
  if (process.platform !== "darwin") throw new Error("Requires actual macOS Chrome");
  const directory = await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir(), "chrome-native-page-"));
  const session = "cold-native-page-" + randomUUID();
  // Instrument the concrete fixture client, without changing returned data.
  const driver = (sdk as ReturnType<typeof createOpenSky>).driver;
  const original = driver.call.bind(driver);
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const states: string[] = [];
  let owner: any;
  driver.call = async (tool, args = {}) => {
    calls.push({ tool, args });
    return original(tool, args);
  };
  try {
    const before = (await driver.call("list_windows", {})).structured as any;
    expect(before.windows.filter((w: any) => w.app_name === "Google Chrome" && w.is_on_screen)).toHaveLength(0);
    const prepared = (await driver.call("browser_prepare", { session, allow_launch: true, profile: { mode: "isolated_new" } })).structured as any;
    expect(prepared.status).toBe("ok");
    expect(prepared.prepared).toBe(true);
    expect(Number.isInteger(prepared.prepared_pid)).toBe(true);
    await expect.poll(async () => {
      const value = (await driver.call("list_windows", { session, pid: prepared.prepared_pid })).structured as any;
      const windows = value.windows.filter((w: any) => w.pid === prepared.prepared_pid && w.is_on_screen && w.layer === 0 && w.bounds.width > 100 && w.bounds.height > 100);
      if (windows.length === 1) owner = windows[0];
      return windows.length;
    }, { timeout: 5000, interval: 100 }).toBe(1);
    const app = await cua.getApp("Google Chrome");
    await app.pressKey("CMD+L");
    await app.typeText(site.url);
    await app.pressKey("ENTER");
    await expect.poll(async () => {
      const state = await app.getAXState({ emit: false, disableDiffing: true });
      states.push(state);
      return state;
    }, { timeout: 5000, interval: 100 }).toContain('AXIncrementor "Count"');
    const final = states.at(-1)!;
    expect(final).toContain("AXWebArea");
    expect(final).toContain("Cold native page");
    expect(final).toContain(new URL(site.url).host);
    expect(calls.filter(call => call.tool === "browser_prepare")).toHaveLength(1);
    expect(calls.some(call => ["browser_get_state", "browser_attach", "browser_click", "browser_eval"].includes(call.tool))).toBe(false);
  } finally {
    driver.call = original;
    await writeFile(join(directory, "proof.json"), JSON.stringify({ owner, calls, states, nativePluginUsed: false }, null, 2));
    const ended = (await driver.call("end_session", { session })).structured as any;
    const safeToContinue = ended.session === session && ended.active === false;
    await writeFile(join(directory, "cleanup.json"), JSON.stringify({ session, safeToContinue, ended }, null, 2));
    expect(safeToContinue).toBe(true);
  }
}, 30000);
