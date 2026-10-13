import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { test } from "../fixtures/sdk.js";
import { servePage } from "../fixtures/site.js";

test("CLICK-M02: native Maps text click avoids WebKit delay while preserving query delivery", async ({ cua }) => {
  const artifacts = await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir(), "native-click-settle-"));
  const app = await cua.getApp("Maps");
  let serial = 0;
  const state = async () => {
    const text = await app.getAXState({ disableDiffing: true, emit: false });
    await writeFile(join(artifacts, `${serial++}-state.txt`), text);
    return text;
  };
  const field = (text: string) => {
    const rows = text.split("\n").filter(l => l.includes("AXTextField") && l.includes("id=MapsSearchTextField"));
    expect(rows).toHaveLength(1);
    return Number(rows[0]!.match(/\[(\d+)\]/)![1]);
  };
  const measurements: Array<{ query: string; seconds: number; queryObserved: boolean; cardObserved: boolean }> = [];
  for (const [query, heading] of [["Central Park, New York", "Central Park"], ["Millennium Park, Chicago", "Millennium Park"], ["Central Park, New York", "Central Park"]]) {
    let text = await state();
    const started = performance.now();
    await app.click(field(text));
    const seconds = (performance.now() - started) / 1000;
    text = await state();
    await app.setValue(field(text), query!);
    text = await state();
    await app.pressKey("Return");
    await expect.poll(async () => {
      text = await state();
      return text.includes(`= "${query}"`) && text.includes(`AXHeading (${heading})`);
    }, { timeout: 10_000 }).toBe(true);
    measurements.push({ query: query!, seconds, queryObserved: true, cardObserved: true });
  }
  const median = measurements.map(m => m.seconds).sort((a, b) => a - b)[1]!;
  await writeFile(join(artifacts, "acceptance.json"), JSON.stringify({ measurements, median,
    limits: "Three actual local Mac click-only timings, separate actual query/card observations; no whole-agent score claim." }, null, 2));
  expect(median).toBeLessThan(1.1);
}, 60_000);

test("CLICK-W01: Safari web text click retains focus settling and renderer input", async ({ sdk, cua }) => {
  const artifacts = await mkdtemp(join(process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir(), "web-click-settle-"));
  const site = await servePage(`<!doctype html><html><head><title>Web focus settle fixture</title></head><body>
    <h1>Web focus settle fixture</h1><label>Parity Web Input <input aria-label="Parity Web Input" id="parity-input"></label>
    <p id="renderer-output">Renderer received: empty</p>
    <script>document.getElementById('parity-input').addEventListener('input', e => { document.getElementById('renderer-output').textContent = 'Renderer received: ' + e.target.value; });</script>
  </body></html>`);
  const driver = (sdk as unknown as { driver: { call(tool: string, args?: Record<string, unknown>): Promise<{ structured: unknown }> } }).driver;
  const call = driver.call.bind(driver);
  const clicks: Array<{ args: Record<string, unknown>; result: unknown }> = [];
  driver.call = async (tool, args = {}) => {
    const result = await call(tool, args);
    if (tool === "click") clicks.push({ args, result });
    return result;
  };
  try {
    const app = await cua.getApp("Safari");
    await app.pressKey("super+l");
    await app.typeText(site.url);
    await app.pressKey("Return");
    let text = "";
    let serial = 0;
    const state = async () => {
      text = await app.getAXState({ disableDiffing: true, emit: false });
      await writeFile(join(artifacts, `${serial++}-state.txt`), text);
      return text;
    };
    await expect.poll(async () => (await state()).includes("Renderer received: empty"), { timeout: 15_000 }).toBe(true);
    const rows = text.split("\n").filter(l => l.includes("AXTextField") && l.includes("Parity Web Input"));
    expect(rows).toHaveLength(1);
    const started = performance.now();
    await app.click(Number(rows[0]!.match(/\[(\d+)\]/)![1]));
    const seconds = (performance.now() - started) / 1000;
    // Immediate typing: renderer-generated output is independent of AXValue echo.
    await app.typeText("steady-renderer-input");
    await expect.poll(async () => (await state()).includes("Renderer received: steady-renderer-input"), { timeout: 10_000 }).toBe(true);
    await writeFile(join(artifacts, "acceptance.json"), JSON.stringify({ seconds, clicks,
      rendererInputObserved: true, limits: "Actual Safari/WebKit DOM input-handler output observed through native AX; no AXValue-only acceptance." }, null, 2));
    expect(clicks).toHaveLength(1);
    expect(seconds).toBeGreaterThan(1.1);
  } finally { await site.close(); }
  // Cold exact Safari process/window teardown belongs to the controller.
}, 60_000);
