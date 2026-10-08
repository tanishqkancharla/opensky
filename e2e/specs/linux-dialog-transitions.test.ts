import { expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "../fixtures/linux-typing.js";

const exec = promisify(execFile);
const artifacts = (name: string) => resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "typing", name.split(":")[0]);

/** Read-only, independently owned X11 window observation. Never inject input. */
async function findDialogs(directory: string) {
  const owner = JSON.parse(await readFile(join(directory, "app-ownership.json"), "utf8"));
  const stat = await readFile(`/proc/${owner.pid}/stat`, "utf8");
  expect(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19]).toBe(owner.startTicks);
  const search = await exec("xdotool", ["search", "--onlyvisible", "--name", "^Find and Replace$"]).catch(() => ({ stdout: "" }));
  const dialogs: number[] = [];
  for (const window of search.stdout.trim().split("\n").filter(Boolean)) {
    const pid = Number((await exec("xdotool", ["getwindowpid", window])).stdout.trim());
    if (pid !== owner.pid) continue;
    const transient = (await exec("xprop", ["-id", window, "WM_TRANSIENT_FOR"])).stdout;
    const parent = transient.match(/window id # (0x[0-9a-f]+)/i)?.[1];
    expect(Number(parent)).toBe(Number(owner.window));
    dialogs.push(Number(window));
  }
  await writeFile(join(directory, "dialog-window-readback.json"), JSON.stringify({ owner, dialogs }, null, 2));
  return dialogs;
}

function findButton(state: string) {
  const matches = [
    ...state.matchAll(/\[(\d+)\] toggle button "Find and Replace"/g),
    ...state.matchAll(/^\s*(\d+) toggle button \(unchecked\) Find and Replace$/gm),
  ];
  expect(matches).toHaveLength(1);
  return Number(matches[0][1]);
}

test("ACTION-L01: advertised primary press opens the owned Find and Replace dialog", async ({ app, task, keyboard }) => {
  const directory = artifacts(task.name);
  const state = await app.getAXState({ disableDiffing: true });
  await writeFile(join(directory, "primary-action-state.txt"), state);
  await app.performSecondaryAction(findButton(state), "press");
  await expect.poll(() => findDialogs(directory), { timeout: 10_000 }).toHaveLength(1);
  await expect(keyboard.unchanged()).resolves.toBe(true);
});

test("DIALOG-L01: after the observed dialog closes another key reaches the owned document", async ({ app, task, keyboard }) => {
  const directory = artifacts(task.name);
  await app.pressKey("CTRL+H");
  await expect.poll(() => findDialogs(directory), { timeout: 10_000 }).toHaveLength(1);
  const state = await app.getAXState({ disableDiffing: true });
  await writeFile(join(directory, "dialog-state.txt"), state);
  await app.pressKey("ESCAPE");
  await expect.poll(() => findDialogs(directory), { timeout: 10_000 }).toHaveLength(0);
  // No intervening app observation or fallback input: expose the actual
  // public binding behavior after the observed dialog's window disappears.
  await app.pressKey("CTRL+HOME");
  await writeFile(join(directory, "returned-document-state.txt"), await app.getAXState({ disableDiffing: true }));
  await expect(keyboard.unchanged()).resolves.toBe(true);
});
