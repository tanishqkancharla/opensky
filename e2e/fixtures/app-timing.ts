import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { App } from "../../src/cua.js";
import type { DriverClient } from "../../src/types.js";

/** Observe public calls without substituting or changing their app behavior. */
export function recordAppTiming(app: App, artifacts: string): App {
  const measured = new Set(["getScreenshot", "getAXState", "getAXStateAndScreenshot", "click", "drag", "typeText", "pressKey", "selectText", "paste"]);
  let observationSequence = 0;
  let screenshotSequence = 0;
  return new Proxy(app, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      if (!measured.has(String(key))) return value.bind(target);
      return async (...args: unknown[]) => {
        const started = performance.now();
        let passed = false;
        let observation: string | undefined;
        let screenshot: Uint8Array | undefined;
        const sequence = key === "getAXState" || key === "getAXStateAndScreenshot" ? ++observationSequence : undefined;
        const imageSequence = key === "getScreenshot" || key === "getAXStateAndScreenshot" ? ++screenshotSequence : undefined;
        try {
          const result = await value.apply(target, args);
          if (key === "getAXState" && typeof result === "string") observation = result;
          if (key === "getScreenshot" && result instanceof Uint8Array) screenshot = result;
          if (key === "getAXStateAndScreenshot" && result && typeof result === "object") {
            if (typeof result.state === "string") observation = result.state;
            if (result.screenshot instanceof Uint8Array) screenshot = result.screenshot;
          }
          passed = true;
          return result;
        } finally {
          const elapsedMs = performance.now() - started;
          await appendFile(join(artifacts, "method-timing.jsonl"), JSON.stringify({ method: key, elapsedMs, passed }) + "\n");
          // Retain returned bytes/state after timing, without another UI read.
          if (screenshot !== undefined) await writeFile(join(artifacts, `screenshot-${String(imageSequence).padStart(3, "0")}.png`), screenshot);
          // Retain the exact public observation for before/after fidelity checks.
          // Artifact writes occur after measuring the original method duration.
          if (observation !== undefined) await writeFile(join(artifacts, `observation-${String(sequence).padStart(3, "0")}.txt`), observation);
        }
      };
    },
  });
}


/** Retain identity/coordinate provenance from calls already made by the SDK. */
export function recordDriverCalls(driver: DriverClient, artifacts: string): void {
  const call = driver.call.bind(driver);
  let sequence = 0;
  const fields = ["pid", "window_id", "target_id", "snapshot_id", "capture_id", "frame",
    "screenshot_width", "screenshot_height", "screenshot_frame_valid", "coordinate_frame",
    "path", "hit", "screen_point", "window_point", "delivery_mode", "effect", "verified",
    "focus_before", "focus_after", "focus_restored", "focus_guard", "code", "reason"];
  const select = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object") return {};
    const record = value as Record<string, unknown>;
    return Object.fromEntries(fields.filter(key => record[key] !== undefined)
      .map(key => [key, record[key]]));
  };
  driver.call = async (tool, args = {}) => {
    const request = ++sequence;
    const started = performance.now();
    let result: Awaited<ReturnType<DriverClient["call"]>> | undefined;
    let error: unknown;
    try {
      result = await call(tool, args);
      return result;
    } catch (caught) {
      error = caught;
      throw caught;
    } finally {
      const elapsedMs = performance.now() - started;
      const structured = result?.structured as Record<string, unknown> | undefined;
      const windows = Array.isArray(structured?.windows) ? structured.windows : undefined;
      await appendFile(join(artifacts, "driver-calls.jsonl"), JSON.stringify({
        request, tool, elapsedMs, passed: result !== undefined,
        args: { ...select(args), ...Object.fromEntries(["x", "y", "button", "count", "element_token", "include_screenshot", "include_accessibility_tree"]
          .filter(key => args[key] !== undefined).map(key => [key, args[key]])) },
        resultKeys: structured && typeof structured === "object" ? Object.keys(structured) : [],
        structured: select(structured),
        ...(windows ? { windows: windows.map(window => {
          const row = window as Record<string, unknown>;
          return Object.fromEntries(["pid", "window_id", "title", "bounds", "z_index", "is_on_screen", "on_current_space", "layer"]
            .filter(key => row[key] !== undefined).map(key => [key, row[key]]));
        }) } : {}),
        text: result?.text.slice(0, 2000),
        ...(error !== undefined ? { error: String(error).slice(0, 2000), code: (error as { code?: unknown })?.code, refusal: select((error as { details?: unknown })?.details) } : {}),
      }) + "\n");
    }
  };
}
