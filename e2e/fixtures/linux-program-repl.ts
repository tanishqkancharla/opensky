import { resolve } from "node:path";
import { withX11InputRecord } from "./x11-input-record.js";
import { test as base } from "./linux-typing.js";
import { withOwnedDesktopRepl, type CuaReplClient } from "./cua-repl-client.js";

export const test = base.extend<{ openskyRepl: CuaReplClient; nativeRepl: CuaReplClient }>({
  openskyRepl: async ({ app, task }, use) => {
    void app;
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "typing", task.name.split(":")[0], "repl");
    await withX11InputRecord(artifacts, () => withOwnedDesktopRepl("opensky", artifacts, use, { recordInputResults: true }));
  },
  nativeRepl: async ({ app, task }, use) => {
    void app;
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "typing", task.name.split(":")[0], "repl");
    await withX11InputRecord(artifacts, () => withOwnedDesktopRepl("native", artifacts, use));
  },
});
