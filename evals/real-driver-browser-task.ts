#!/usr/bin/env node
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CuaDriverClient } from "../src/driver.js";
import { createOpenSky } from "../src/opensky.js";
import { RecordingDriverClient } from "./driver-tape.js";

const session = process.env.OPENSKY_SESSION ?? `opensky-browser-task-${process.pid}`;
const query = process.argv.slice(2).join(" ") || "vertical mouse";
const home = await mkdtemp(join(tmpdir(), "opensky-real-browser-task-"));
const driver = new RecordingDriverClient(new CuaDriverClient({ session }));
const opensky = createOpenSky({
  driver,
  session,
  homeDir: home,
  screenshotDir: join(home, "screenshots"),
  settleDelayMs: 800,
});

const events: Array<Record<string, unknown>> = [];
const record = (event: string, detail: Record<string, unknown> = {}) => {
  events.push({ event, elapsedMs: Math.round(performance.now()), ...detail });
};

try {
  record("open.start", { url: "https://www.amazon.com" });
  let state = await opensky.open_target({
    app: "Google Chrome",
    targets: ["https://www.amazon.com"],
    includeScreenshot: false,
  });
  record("open.done", { textCharacters: state.text.length, url: state.target?.document.url });
  const searchIndex = indexFor(state.text, "searchbox", "Search Amazon");
  record("type.start", { elementIndex: searchIndex, query });
  await opensky.type_text({ app: "Google Chrome", element_index: searchIndex, text: query });
  state = await opensky.get_app_state({ app: "Google Chrome", disableDiff: true, includeScreenshot: false });
  record("type.done", { textCharacters: state.text.length });
  const goIndex = indexFor(state.text, "button", "Go");
  record("submit.start", { elementIndex: goIndex });
  await opensky.click({ app: "Google Chrome", element_index: goIndex });
  state = await opensky.get_app_state({ app: "Google Chrome", disableDiff: true, includeScreenshot: false });
  record("submit.done", { textCharacters: state.text.length, url: state.target?.document.url });
  const url = state.target?.document.url ?? "";
  const passed = /\/s(?:\?|$)/.test(new URL(url).pathname + new URL(url).search) &&
    state.text.toLowerCase().includes(query.toLowerCase());
  process.stdout.write(`${JSON.stringify({
    passed,
    query,
    url,
    events,
    driverCalls: driver.tape.calls.map((call) => ({
      tool: call.tool,
      durationMs: call.observed?.durationMs,
      error: call.error,
    })),
    ...(process.env.OPENSKY_VERBOSE === "1" ? { stateText: state.text } : {}),
  }, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    error: error instanceof Error ? error.message : String(error),
    calls: driver.tape.calls.map((call) => ({ tool: call.tool, durationMs: call.observed?.durationMs, error: call.error })),
  }, null, 2)}\n`);
  throw error;
} finally {
  record("cleanup.start");
  await opensky.close();
  record("cleanup.done");
  process.stderr.write(`${JSON.stringify(events.at(-1))}\n`);
}

function indexFor(text: string, role: string, label: string): number {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`\\[(\\d+)\\] ${role} "${escaped}"`, "i"));
  if (!match) throw new Error(`Could not find ${role} ${JSON.stringify(label)} in the current semantic state.`);
  return Number(match[1]);
}
