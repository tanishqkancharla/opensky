import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base } from "./linux-dropdown.js";

const exec = promisify(execFile);

// Diagnostics only: the probe does not count as a new behavior acceptance test.
// App setup and cleanup use the same real public SDK fixture as DROPDOWN-L05.
export const test = base.extend<{ probe: { capture(): Promise<void> } }>({
  probe: async ({ app, dialog, task }, use) => {
    void dialog;
    const directory = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "visibility", task.name.split(":")[0]);
    await mkdir(directory, { recursive: true });
    await use({ capture: async () => {
      await writeFile(resolve(directory, "public-ax.txt"), await app.getAXState({ disableDiffing: true }));
      await writeFile(resolve(directory, "public-screenshot.png"), await app.getScreenshot());
      const result = await exec("/usr/bin/python3", [fileURLToPath(new URL("./atspi-visibility-probe.py", import.meta.url))], { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
      await writeFile(resolve(directory, "atspi.json"), result.stdout);
      await writeFile(resolve(directory, "probe-stderr.txt"), result.stderr);
    } });
  },
});
