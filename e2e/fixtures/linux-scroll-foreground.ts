import { expect, test as base } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createCua, createOpenSky } from "../../src/index.js";
import { assertDisposableLinuxDesktop, withOwnedLinuxApp } from "../../evals/parity/linux-app.js";

type Status = { target: number; nearby: number };
type Fixture = {
  target: { scroll(): Promise<void>; status(): Promise<Status> };
  sibling: { status(): Promise<string> };
};

const script = fileURLToPath(new URL("./gtk-scroll-foreground.py", import.meta.url));

function scrollLab(mode: "--target" | "--sibling", artifacts: string) {
  return {
    executable: "/usr/bin/python3", args: [script, mode], artifacts,
    documentTitle: mode === "--target" ? "^OpenSky Scroll Target$" : "^OpenSky Scroll Sibling$",
    env: { NO_AT_BRIDGE: "0", GDK_BACKEND: "x11" },
  };
}

function offset(state: string, label: string): number {
  const value = state.match(new RegExp(`${label} offset: (\\d+)`))?.[1];
  if (!value) throw new Error(`Missing ${label} offset in GTK state`);
  return Number(value);
}

export const test = base.extend<Fixture & { fixture: Fixture }>({
  fixture: async ({ task }, use) => {
    assertDisposableLinuxDesktop();
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "scroll-foreground", task.name.split(":")[0]);
    const targetArtifacts = join(artifacts, "target");
    const siblingArtifacts = join(artifacts, "sibling");
    await Promise.all([mkdir(targetArtifacts, { recursive: true }), mkdir(siblingArtifacts, { recursive: true })]);
    const temporary = await mkdtemp(join(tmpdir(), "opensky-scroll-foreground-"));
    const sdk = createOpenSky({ homeDir: join(temporary, "sdk"), autoLaunch: false,
      driverOptions: { binaryPath: process.env.OPENSKY_DRIVER_BINARY, socket: process.env.OPENSKY_DRIVER_SOCKET, autoStart: false, autoInstall: false } });
    try {
      await withOwnedLinuxApp(scrollLab("--target", targetArtifacts), async () => {
        const bound = await sdk.get_app_state({ app: "OpenSky Scroll Target", scope: "window", includeScreenshot: false });
        const target = await createCua(sdk).getApp(bound.targetHandle);
        await withOwnedLinuxApp(scrollLab("--sibling", siblingArtifacts), async siblingOwned => {
          const siblingWindow = { pid: siblingOwned.pid, window_id: Number(siblingOwned.window) };
          await sdk.invoke("bring_to_front", siblingWindow);
          await use({
            target: {
              scroll: () => target.scroll([240, 300], "down", 6),
              status: async () => {
                const state = await target.getAXState({ disableDiffing: true });
                await writeFile(join(targetArtifacts, "final-state.txt"), state);
                return { target: offset(state, "Target"), nearby: offset(state, "Nearby") };
              },
            },
            sibling: {
              status: async () => {
                const state = String(((await sdk.invoke("get_window_state", { ...siblingWindow, include_screenshot: false })).structured as { tree_markdown?: string })?.tree_markdown ?? "");
                await writeFile(join(siblingArtifacts, "final-state.txt"), state);
                return state;
              },
            },
          });
        });
      });
    } finally {
      await sdk.close();
      const cleanup = await Promise.all([targetArtifacts, siblingArtifacts].map(path => readFile(join(path, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null)));
      const verifiedExited = cleanup.every(receipt => receipt?.verifiedExited === true);
      if (verifiedExited) await rm(temporary, { recursive: true, force: true });
      await writeFile(join(artifacts, "temporary-cleanup.json"), JSON.stringify({ removed: verifiedExited }));
    }
  },
  target: async ({ fixture }, use) => use(fixture.target),
  sibling: async ({ fixture }, use) => use(fixture.sibling),
});
