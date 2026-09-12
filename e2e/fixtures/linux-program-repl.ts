import { resolve } from "node:path";
import { test as base } from "./linux-typing.js";
import { withOwnedDesktopRepl, type CuaReplClient } from "./cua-repl-client.js";

export const test = base.extend<{ openskyRepl: CuaReplClient; nativeRepl: CuaReplClient }>({
  openskyRepl: async ({ app, task }, use) => {
    void app;
    await withOwnedDesktopRepl("opensky", resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "typing", task.name.split(":")[0], "repl"), use, { recordInputResults: true });
  },
  nativeRepl: async ({ app, task }, use) => {
    void app;
    await withOwnedDesktopRepl("native", resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "typing", task.name.split(":")[0], "repl"), use);
  },
});
