import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { App } from "../../src/cua.js";

/** Observe public calls without substituting or changing their app behavior. */
export function recordAppTiming(app: App, artifacts: string): App {
  const measured = new Set(["getScreenshot", "getAXState", "getAXStateAndScreenshot", "click", "drag", "typeText", "pressKey", "selectText", "paste"]);
  let observationSequence = 0;
  return new Proxy(app, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      if (!measured.has(String(key))) return value.bind(target);
      return async (...args: unknown[]) => {
        const started = performance.now();
        let passed = false;
        let observation: string | undefined;
        const sequence = key === "getAXState" ? ++observationSequence : undefined;
        try {
          const result = await value.apply(target, args);
          if (key === "getAXState" && typeof result === "string") observation = result;
          passed = true;
          return result;
        } finally {
          const elapsedMs = performance.now() - started;
          await appendFile(join(artifacts, "method-timing.jsonl"), JSON.stringify({ method: key, elapsedMs, passed }) + "\n");
          // Retain the exact public observation for before/after fidelity checks.
          // Artifact writes occur after measuring the original method duration.
          if (observation !== undefined) await writeFile(join(artifacts, `observation-${String(sequence).padStart(3, "0")}.txt`), observation);
        }
      };
    },
  });
}
