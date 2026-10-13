import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { test } from "../fixtures/sdk.js";

type Window = { pid: number; window_id: number; app_name: string; is_on_screen: boolean; title: string };
type Driver = { invoke(tool: string, args: Record<string, unknown>): Promise<{ structured: unknown }> };

test("CLICK-N01: adjacent Calculator buttons deliver each digit within the native click budget", async ({ sdk, cua }) => {
  const driver = sdk as unknown as Driver;
  const artifacts = await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir(), "calculator-click-"));
  expect((await sdk.list_apps()).some(a => a.id === "com.apple.calculator" && a.isRunning)).toBe(false);
  const windows = async () => ((await driver.invoke("list_windows", {})).structured as { windows: Window[] }).windows;
  const before = new Set((await windows()).map(w => `${w.pid}:${w.window_id}`));
  let owned: Window | undefined;
  const durations: number[] = [];
  try {
    await driver.invoke("launch_app", { bundle_id: "com.apple.calculator",
      creates_new_application_instance: true, additional_arguments: ["-ApplePersistenceIgnoreState", "YES"] });
    const app = await cua.getApp("Calculator");
    const initial = await app.getAXState({ disableDiffing: true, emit: false });
    const fresh = (await windows()).filter(w => w.app_name === "Calculator" && w.is_on_screen
      && w.title === "Calculator" && !before.has(`${w.pid}:${w.window_id}`));
    expect(fresh).toHaveLength(1);
    owned = fresh[0]!;
    const index = (name: string) => {
      const lines = initial.split("\n").filter(l => l.includes(`AXButton (${name})`));
      expect(lines).toHaveLength(1);
      return Number(lines[0]!.match(/\[(\d+)\]/)![1]);
    };
    await app.click(index("All Clear"));
    const digits = [index("1"), index("2")];
    for (let i = 0; i < 6; i++) {
      const started = performance.now();
      await app.click(digits[i % 2]!);
      durations.push(performance.now() - started);
    }
    const final = await app.getAXState({ disableDiffing: true, emit: false });
    await writeFile(join(artifacts, "after.txt"), final);
    let cursor: null | { motion: { glide_duration_ms: number; timing?: string } } = null;
    let cursorLimitation: unknown = null;
    try { cursor = (await driver.invoke("get_agent_cursor_state", {})).structured as { motion: { glide_duration_ms: number; timing?: string } }; }
    catch (error) {
      const e = error as { code?: string; details?: { status?: string; refusal?: { facility?: string } } };
      // This input/timing owner also runs on a daemon without an AppKit
      // overlay host. Only that exact documented refusal is an environment
      // limitation; no arbitrary driver error is converted into a pass.
      expect(e.code).toBe("facility_unavailable");
      expect(e.details).toMatchObject({status:"refused",refusal:{facility:"macos_cursor_overlay"}});
      cursorLimitation = e.details;
    }
    await writeFile(join(artifacts, "timings.json"), JSON.stringify({ durations, cursor, cursorLimitation, cursorStyleVerified:cursor !== null, owned }, null, 2));
    expect(final).toMatch(/AXStaticText = "121,212" \(Edit field\)/);
    // Native timing tracks input without the legacy fixed visual glide.
    if (cursor) expect(cursor.motion.glide_duration_ms).toBe(cursor.motion.timing === "native" ? 0 : 200);
    const sorted = [...durations].sort((a, b) => a - b);
    // The prior default took about2.27s; retain500ms headroom over local1.3s.
    expect((sorted[2]! + sorted[3]!) / 2).toBeLessThan(1800);
  } finally {
    let gone = !owned;
    if (owned) {
      await driver.invoke("close_window", { pid: owned.pid, window_id: owned.window_id });
      await expect.poll(async () => (await windows()).some(w => w.pid === owned!.pid
        && w.window_id === owned!.window_id && w.is_on_screen)).toBe(false);
      gone = true;
    }
    await writeFile(join(artifacts, "cleanup.json"), JSON.stringify({ app: "Calculator fixture window",
      owned, safeToContinue: gone, notes: "GUI controller independently verifies final app exit." }, null, 2));
  }
}, 60_000);

test("DIFF-N01: ordinary Calculator diffs expose changing display text without actionable IDs", async ({ sdk, cua }) => {
  const driver = sdk as unknown as Driver;
  const artifacts = await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir(), "calculator-display-"));
  expect((await sdk.list_apps()).some(a => a.id === "com.apple.calculator" && a.isRunning)).toBe(false);
  const windows = async () => ((await driver.invoke("list_windows", {})).structured as { windows: Window[] }).windows;
  const before = new Set((await windows()).map(w => `${w.pid}:${w.window_id}`));
  let owned: Window | undefined;
  try {
    await driver.invoke("launch_app", { bundle_id: "com.apple.calculator",
      creates_new_application_instance: true, additional_arguments: ["-ApplePersistenceIgnoreState", "YES"] });
    const app = await cua.getApp("Calculator");
    let tree = await app.getAXState({ disableDiffing: true, emit: false });
    const fresh = (await windows()).filter(w => w.app_name === "Calculator" && w.is_on_screen
      && w.title === "Calculator" && !before.has(`${w.pid}:${w.window_id}`));
    expect(fresh).toHaveLength(1);
    owned = fresh[0]!;
    const index = (name: string) => {
      const lines = tree.split("\n").filter(l => l.includes(`AXButton (${name})`));
      expect(lines).toHaveLength(1);
      return Number(lines[0]!.match(/\[(\d+)\]/)![1]);
    };
    await app.click(index("All Clear"));
    tree = await app.getAXState({ disableDiffing: true, emit: false });
    await writeFile(join(artifacts, "before.txt"), tree);
    await app.click(index("2"));
    await app.click(index("1"));
    await app.click(index("3"));
    const diff = await app.getAXState({ emit: false });
    await writeFile(join(artifacts, "diff.txt"), diff);
    expect(diff).toMatch(/AXStaticText = "213" \(Edit field\)/);
    expect(diff).not.toMatch(/\[\d+\] AXStaticText = "213"/);
    const full = await app.getAXState({ disableDiffing: true, emit: false });
    await writeFile(join(artifacts, "full.txt"), full);
    expect(full).toMatch(/AXStaticText = "213" \(Edit field\)/);
  } finally {
    if (owned) {
      await driver.invoke("close_window", { pid: owned.pid, window_id: owned.window_id });
      await expect.poll(async () => (await windows()).some(w => w.pid === owned!.pid
        && w.window_id === owned!.window_id && w.is_on_screen)).toBe(false);
    }
    await writeFile(join(artifacts, "cleanup.json"), JSON.stringify({ app: "Calculator display fixture", owned,
      safeToContinue: true, notes: "GUI controller independently verifies app exit." }));
  }
}, 60_000);
