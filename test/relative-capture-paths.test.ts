import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createOpenSky } from "../src/opensky.js";
import { makeHarness } from "./harness.ts";

test("native captures send absolute paths when SDK storage paths are relative", async () => {
  for (const target of ["mac", "linux"] as const) {
    for (const explicitScreenshotDir of [false, true]) {
      const { driver, dir } = await makeHarness();
      const home = join(dir, "relative home Ω");
      const shots = explicitScreenshotDir ? join(dir, "relative shots Ω") : join(home, "screenshots");
      const captured: string[] = [];
      const tools: string[] = [];
      const call = driver.call.bind(driver);
      driver.call = async (tool, args = {}) => {
        tools.push(tool);
        if (tool === "get_window_state" && args.include_screenshot === true) {
          assert.equal(typeof args.screenshot_out_file, "string");
          const output = args.screenshot_out_file as string;
          assert.ok(isAbsolute(output), "a daemon may have a different working directory");
          assert.ok(output.startsWith(shots + sep), "capture stays in the host-selected directory");
          captured.push(output);
        }
        return call(tool, args);
      };
      const sdk = createOpenSky({
        driver, target, autoLaunch: false, settleDelayMs: 0,
        homeDir: relative(process.cwd(), home),
        ...(explicitScreenshotDir ? { screenshotDir: relative(process.cwd(), shots) } : {}),
      });
      try {
        const state = await sdk.get_app_state({ app: "Calculator", includeScreenshot: true });
        assert.equal(captured.length, 1);
        assert.ok(state.screenshot);
        assert.equal(fileURLToPath(state.screenshot.url), resolve(captured[0]!));
        assert.ok((await readFile(captured[0]!)).byteLength > 0);
        assert.ok(!tools.some(tool => ["launch_app", "click", "type_text", "set_value"].includes(tool)));
      } finally { await sdk.close(); }
    }
  }
});
