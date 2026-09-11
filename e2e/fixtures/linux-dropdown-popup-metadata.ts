import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test as consumer } from "./linux-dropdown-consumer.js";

const exec = promisify(execFile);
type Command = { executable: string; args: string[]; startedAt: string; finishedAt: string; exitCode: number | string | null; signal: string | null; stderr: string; stdout?: string; outputFile?: string };

export const test = consumer.extend<{ popupObserver: { capture(): Promise<void> } }>({
  popupObserver: async ({ app, task }, use) => {
    const directory = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "dropdown", task.name.split(":")[0]);
    const owned = JSON.parse(await readFile(resolve(directory, "app-ownership.json"), "utf8")) as { pid: number; window: string; startTicks: string };
    if (!Number.isSafeInteger(owned.pid) || owned.pid <= 0 || !/^\d+$/.test(owned.window) || !/^\d+$/.test(owned.startTicks)) throw new Error("Invalid owned app identity");
    const commands: Command[] = [];
    const captures: { label: string; startedAt: string; finishedAt: string }[] = [];
    const command = async (executable: string, args: string[], outputFile?: string, required = true) => {
      const startedAt = new Date().toISOString();
      let stdout = Buffer.alloc(0), stderr = "", exitCode: number | string | null = 0, signal: string | null = null;
      try {
        const result = await exec(executable, args, { encoding: "buffer", timeout: 10_000, maxBuffer: 32 * 1024 * 1024 });
        stdout = result.stdout; stderr = result.stderr.toString();
      } catch (error) {
        const failure = error as { stdout?: Buffer; stderr?: Buffer; code?: number | string; signal?: string };
        stdout = Buffer.from(failure.stdout ?? ""); stderr = String(failure.stderr ?? error);
        exitCode = failure.code ?? null; signal = failure.signal ?? null;
      }
      commands.push({ executable, args, startedAt, finishedAt: new Date().toISOString(), exitCode, signal, stderr,
        ...(outputFile ? { outputFile } : { stdout: stdout.toString() }) });
      if (outputFile) await writeFile(resolve(directory, outputFile), stdout, { flag: "wx" });
      if (required && (exitCode !== 0 || signal || stdout.length === 0)) throw new Error(`Diagnostic observer failed: ${executable} ${args.join(" ")}`);
      if (outputFile?.endsWith(".png") && !stdout.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Desktop observer did not return PNG bytes");
      return stdout.toString().trim();
    };
    const popupMetadata = async (label: string, tree: string) => {
      const rootRows = tree.split("\n").filter(line => /^ {5}0x[0-9a-f]+\s/i.test(line));
      if (rootRows.length === 0 || rootRows.length > 64) throw new Error(`Unexpected bounded root child inventory: ${rootRows.length}`);
      const rows = [];
      for (const row of rootRows) {
        const xid = row.match(/^ {5}(0x[0-9a-f]+)/i)![1]!;
        const info = await command("/usr/bin/xwininfo", ["-id", xid], `${label}-${xid}-window.txt`, false);
        const viewable = /Map State:\s*IsViewable/.test(info);
        const possibleLibreOffice = /LibreOffice|soffice/i.test(row);
        const geometry = Object.fromEntries(["Absolute upper-left X", "Absolute upper-left Y", "Width", "Height", "Border width"].map(key => [key, info.match(new RegExp(`${key}:\\s*(-?\\d+)`))?.[1] ?? null]));
        const properties = viewable || possibleLibreOffice
          ? await command("/usr/bin/xprop", ["-id", xid, "_NET_WM_PID", "WM_TRANSIENT_FOR", "WM_CLIENT_LEADER", "_NET_WM_WINDOW_TYPE", "WM_CLASS"], `${label}-${xid}-properties.txt`, false)
          : undefined;
        rows.push({ xid, row, viewable, possibleLibreOffice, geometry,
          overrideRedirect: info.match(/Override Redirect State:\s*(\S+)/)?.[1] ?? null,
          properties, limitation: "Title/class is a diagnostic candidate hint, not ownership proof; missing properties and command errors remain raw evidence." });
      }
      await command("/usr/bin/xprop", ["-id", owned.window, "_NET_WM_PID", "WM_TRANSIENT_FOR", "WM_CLIENT_LEADER", "_NET_WM_WINDOW_TYPE", "WM_CLASS"], `${label}-owned-properties.txt`, false);
      return rows;
    };
    const posture = async (label: string) => {
      const stat = await readFile(`/proc/${owned.pid}/stat`, "utf8");
      const ticks = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
      if (ticks !== owned.startTicks) throw new Error("Owned app PID was reused");
      const ownerPid = await command("/usr/bin/xdotool", ["getwindowpid", owned.window]);
      if (ownerPid !== String(owned.pid)) throw new Error("Owned XID changed process");
      const activeXid = await command("/usr/bin/xdotool", ["getactivewindow"]);
      if (!/^\d+$/.test(activeXid)) throw new Error("Invalid active XID");
      // Some override-redirect popup windows expose no PID; retain that result
      // honestly instead of treating a missing property as another process.
      const activePid = await command("/usr/bin/xdotool", ["getwindowpid", activeXid], undefined, false);
      const tree = await command("/usr/bin/xwininfo", ["-root", "-tree"], `${label}-window-tree.txt`);
      const candidates = await popupMetadata(label, tree);
      await command("/usr/bin/xwininfo", ["-id", owned.window], `${label}-owned-window.txt`);
      return { candidates, activeXid, activePid, ownedPid: owned.pid, ownedXid: owned.window, at: new Date().toISOString() };
    };
    await use({ capture: async () => {
      let before: Awaited<ReturnType<typeof posture>> | undefined, after: typeof before, failure: string | undefined;
      let completed = false;
      try {
        before = await posture("before");
        let startedAt = new Date().toISOString();
        await app.getAXStateAndScreenshot({ disableDiffing: true });
        captures.push({ label: "app-before (consumer-001.png/txt)", startedAt, finishedAt: new Date().toISOString() });
        await command("/usr/bin/import", ["-window", "root", "png:-"], "root.png");
        startedAt = new Date().toISOString();
        await app.getAXStateAndScreenshot({ disableDiffing: true });
        captures.push({ label: "app-after (consumer-002.png/txt)", startedAt, finishedAt: new Date().toISOString() });
        after = await posture("after");
        if (before.activeXid !== after.activeXid || before.activePid !== after.activePid) throw new Error("Active window changed during capture bracket");
        completed = true;
      } catch (error) { failure = String(error); throw error; }
      finally {
        await writeFile(resolve(directory, "popup-capture-diagnostic.json"), JSON.stringify({
          purpose: "Read-only same-popup observation diagnostic; completion is not SDK screenshot parity acceptance",
          owned, before, after, captures, commands, completed, failure,
          candidateChanges: before && after ? Array.from(new Set([...before.candidates, ...after.candidates].map(row => row.xid))).flatMap(xid => {
            const first = before!.candidates.find(row => row.xid === xid), last = after!.candidates.find(row => row.xid === xid);
            return JSON.stringify(first) === JSON.stringify(last) ? [] : [{ xid, before: first, after: last }];
          }) : undefined,
          limitation: "Sequential captures are not atomic. Inspect both app images and window inventories before interpreting root differences; no input, focus or pointer action is submitted inside this capture bracket.",
        }, null, 2), { flag: "wx" });
      }
    } });
  },
});
