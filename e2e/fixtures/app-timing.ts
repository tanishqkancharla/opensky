import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { App } from "../../src/cua.js";

/** Observe public calls without substituting or changing their app behavior. */
export function recordAppTiming(app: App, artifacts: string): App {
  const measured = new Set(["getScreenshot", "getAXState", "getAXStateAndScreenshot", "click", "typeText", "pressKey"]);
  return new Proxy(app, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      if (!measured.has(String(key))) return value.bind(target);
      return async (...args: unknown[]) => {
        const started = performance.now();
        let passed = false;
        try {
          const result = await value.apply(target, args);
          passed = true;
          return result;
        } finally {
          const elapsedMs = performance.now() - started;
          await appendFile(join(artifacts, "method-timing.jsonl"), JSON.stringify({ method: key, elapsedMs, passed }) + "\n");
        }
      };
    },
  });
}
