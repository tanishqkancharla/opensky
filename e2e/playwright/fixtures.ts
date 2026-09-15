import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test as base } from "@playwright/test";
import { createCua, createOpenSky, type CuaFacade } from "opensky-cua";

export const test = base.extend<{ cua: CuaFacade }>({
  cua: async ({}, use) => {
    if (process.env.OPENSKY_REAL_DRIVER !== "1") {
      throw new Error("Set OPENSKY_REAL_DRIVER=1 to run the real OpenSky/Chrome boundary.");
    }
    const binaryPath = process.env.OPENSKY_DRIVER_BINARY ?? process.env.CUA_DRIVER_BINARY;
    if (!binaryPath) throw new Error("Set OPENSKY_DRIVER_BINARY to the installed OpenSky Driver binary.");

    const artifactRoot = process.env.OPENSKY_E2E_ARTIFACT_DIR ?? tmpdir();
    await mkdir(artifactRoot, { recursive: true });
    const homeDir = await mkdtemp(join(artifactRoot, "opensky-playwright-e2e-"));
    const keepArtifacts = process.env.OPENSKY_E2E_ARTIFACT_DIR !== undefined;
    const sdk = createOpenSky({
      homeDir,
      autoLaunch: false,
      driverOptions: {
        binaryPath,
        socket: process.env.OPENSKY_DRIVER_SOCKET ?? process.env.CUA_DRIVER_SOCKET,
        autoInstall: false,
        autoStart: false,
      },
    });
    try {
      await use(createCua(sdk));
    } finally {
      await sdk.close();
      if (!keepArtifacts) await rm(homeDir, { recursive: true, force: true });
    }
  },
});

export { expect };

export function actionIndex(state: string, role: string, name: string): number {
  const matches = state.split("\n").flatMap(line => {
    const match = line.match(/^- \[(\d+)\] (\S+) ("(?:[^"\\]|\\.)*")/);
    return match && match[2] === role && JSON.parse(match[3]!) === name ? [Number(match[1])] : [];
  });
  const unique = [...new Set(matches)];
  if (unique.length !== 1) throw new Error(`Expected one ${role} named ${JSON.stringify(name)}; found ${unique.length}`);
  return unique[0]!;
}
