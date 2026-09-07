import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import { test } from "./sdk.js";

const exec = promisify(execFile);

/** An independent real application and the window manager's focus history.
 * This is external desktop state a human can see, not OpenSky internals. */
export const backgroundTest = test.extend<{
  foregroundApp: { windowId: string; activeWindows(): string[] };
}>({
  foregroundApp: async ({ tab }, use) => {
    if (process.platform !== "linux") throw new Error("The foreground witness currently requires an X11 desktop.");
    // Depend on the owned tab so browser startup precedes the focus baseline.
    void tab;
    const terminal = spawn("xterm", ["-T", "OpenSky SDK foreground witness", "-e", "cat"], { stdio: "ignore" });
    let watcher: ReturnType<typeof spawn> | undefined;
    try {
      await once(terminal, "spawn");
      const { stdout } = await exec("xdotool", ["search", "--sync", "--onlyvisible", "--pid", String(terminal.pid)], { timeout: 10_000 });
      const ids = stdout.trim().split(/\s+/);
      if (ids.length !== 1) throw new Error("The foreground witness must have one window");
      const windowId = BigInt(ids[0]!).toString();
      await exec("xdotool", ["windowactivate", "--sync", windowId], { timeout: 5_000 });
      watcher = spawn("xprop", ["-spy", "-root", "_NET_ACTIVE_WINDOW"], { stdio: ["ignore", "pipe", "pipe"] });
      const active: string[] = [];
      let pending = "";
      watcher.stdout!.on("data", chunk => {
        pending += String(chunk);
        const lines = pending.split("\n");
        pending = lines.pop()!;
        for (const line of lines) {
          const id = line.match(/window id # (0x[0-9a-f]+)/i)?.[1];
          if (id) active.push(BigInt(id).toString());
        }
      });
      await once(watcher.stdout!, "data");
      if (active[0] !== windowId) throw new Error("The independent terminal did not become foreground");
      await use({ windowId, activeWindows: () => [...active] });
    } finally {
      watcher?.kill("SIGTERM");
      terminal.kill("SIGTERM");
    }
  },
});
