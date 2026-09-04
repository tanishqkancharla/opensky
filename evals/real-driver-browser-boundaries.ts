#!/usr/bin/env node
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CuaDriverClient } from "../src/driver.js";
import { createOpenSky } from "../src/opensky.js";
import { RecordingDriverClient } from "./driver-tape.js";

const session = process.env.OPENSKY_SESSION ?? `opensky-browser-boundaries-${process.pid}`;
const home = await mkdtemp(join(tmpdir(), "opensky-real-browser-boundaries-"));
const driver = new RecordingDriverClient(new CuaDriverClient({ session }));
const opensky = createOpenSky({
  driver,
  session,
  homeDir: home,
  screenshotDir: join(home, "screenshots"),
  settleDelayMs: 300,
});
const checks: Array<Record<string, unknown>> = [];

try {
  let state = await opensky.open_target({
    app: "Google Chrome",
    targets: ["https://en.wikipedia.org/wiki/Ada_Lovelace"],
    includeScreenshot: true,
  });
  checks.push({
    name: "typed screenshot",
    passed: Boolean(state.screenshot?.url),
    textCharacters: state.text.length,
    url: state.target?.document.url,
  });

  for (const [name, action] of [
    ["coordinate click", () => opensky.click({ app: "Google Chrome", x: 20, y: 20 })],
    ["ambient type without focused field", () => opensky.type_text({ app: "Google Chrome", text: "must not land" })],
    ["typed includeAppChrome", () => opensky.get_app_state({ app: "Google Chrome", includeAppChrome: true })],
  ] as const) {
    const before = driver.tape.calls.length;
    let error = "";
    try {
      await action();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    checks.push({
      name,
      passed: /No native foreground or coordinate input was sent|includeAppChrome is not available/.test(error) &&
        driver.tape.calls.length === before,
      error,
      emittedDriverCalls: driver.tape.calls.length - before,
    });
  }

  {
    const before = driver.tape.calls.length;
    let error = "";
    try {
      await opensky.press_key({ app: "Google Chrome", key: "Escape" });
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    const emitted = driver.tape.calls.slice(before);
    checks.push({
      name: "exact-tab key",
      passed: emitted.some((call) => call.tool === "browser_key") &&
        emitted.every((call) => call.tool !== "press_key" && call.tool !== "hotkey"),
      error: error || undefined,
    });
  }

  const scrollIndices = indicesWithAction(state.text, "scroll");
  {
    const before = driver.tape.calls.length;
    let error = "";
    try {
      await opensky.scroll({
        app: "Google Chrome",
        ...(scrollIndices.length > 0 ? { element_index: scrollIndices[0] } : {}),
        direction: "down",
        pages: 2,
      });
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    if (!error) state = await opensky.get_app_state({ app: "Google Chrome", includeScreenshot: false });
    const emitted = driver.tape.calls.slice(before);
    checks.push({
      name: "typed two-page scroll",
      passed: scrollIndices.length > 0
        ? emitted.some((call) => call.tool === "browser_pointer" && call.args.action === "scroll" && call.args.delta_y === 1_200)
        : /driver cannot yet expose this page's document scroller/.test(error) && emitted.length === 0,
      route: scrollIndices.length > 0 ? "semantic_ref" : "fail_closed_driver_gap",
      elementIndex: scrollIndices[0],
      error: error || undefined,
      postStateCharacters: state.text.length,
    });
  }

  const linkIndex = firstIndex(state.text, "link");
  if (linkIndex !== undefined) {
    const before = driver.tape.calls.length;
    let error = "";
    try {
      await opensky.click({ app: "Google Chrome", element_index: linkIndex, mouse_button: "right" });
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    checks.push({
      name: "typed right click",
      passed: driver.tape.calls.slice(before).some((call) =>
        call.tool === "browser_pointer" && call.args.action === "right_click"
      ),
      elementIndex: linkIndex,
      error: error || undefined,
    });
  }

  process.stdout.write(`${JSON.stringify({
    passed: checks.every((check) => check.passed === true),
    checks,
    driverCalls: driver.tape.calls.map((call) => ({ tool: call.tool, durationMs: call.observed?.durationMs })),
  }, null, 2)}\n`);
} finally {
  await opensky.close();
  process.stderr.write(`[boundaries] cleanup complete for ${session}\n`);
}

function indicesWithAction(text: string, action: string): number[] {
  return text.split("\n").flatMap((line) => {
    const match = line.match(/^- \[(\d+)\].*\[actions=\[([^\]]+)\]\]/);
    return match?.[2]?.split(",").includes(action) ? [Number(match[1])] : [];
  });
}

function firstIndex(text: string, role: string): number | undefined {
  const match = text.match(new RegExp(`^- \\[(\\d+)\\] ${role} `, "m"));
  return match ? Number(match[1]) : undefined;
}
