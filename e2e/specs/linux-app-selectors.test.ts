import { expect, test } from "vitest";
import { verifiedLinuxAppSelectors } from "../../evals/parity/linux-app-selectors.js";
import { DesktopProgramPolicy } from "../../evals/parity/desktop-program.js";

const writer = { id: "libreoffice-writer", displayName: "LibreOffice Writer", isRunning: true };
const fixture = (apps = [writer], resolve = (_: string) => "tgt_owned") => ({
  async getState(options: { emit: false }) { expect(options).toEqual({ emit: false }); return { apps }; },
  async getApp(selector: string) { return { targetHandle: resolve(selector) }; },
});

test("only the verified inventory alias is added to the existing app scope", async () => {
  const old = new DesktopProgramPolicy({ backend: "opensky", appSelectors: [writer.displayName], isolatedDesktop: "linux" });
  expect(old.accepts('const writer = await cua.getApp("libreoffice-writer");')).toBe(false);
  const proof = await verifiedLinuxAppSelectors(fixture([writer, { ...writer, id: "terminal", displayName: "Terminal" }]), writer.displayName);
  expect(proof.appSelectors).toEqual([writer.displayName, writer.id]);
  const policy = new DesktopProgramPolicy({ backend: "opensky", appSelectors: proof.appSelectors, isolatedDesktop: "linux" });
  expect(policy.accepts('const writer = await cua.getApp("libreoffice-writer"); await writer.getAXState();')).toBe(true);
  for (const code of ['await cua.getApp("terminal");', 'await cua.getApp("LibreOffice");',
    'var id = "libreoffice-writer"; await cua.getApp(id);', 'await import("node:fs/promises");']) {
    expect(policy.accepts(code), code).toBe(false);
  }
});

test("missing, inactive and ambiguous app inventory cannot expand scope", async () => {
  for (const apps of [[], [{ ...writer, isRunning: false }], [writer, { ...writer, id: "other-writer" }]]) {
    await expect(verifiedLinuxAppSelectors(fixture(apps), writer.displayName)).rejects.toThrow(/unique running/);
  }
});

test("empty, padded or opaque target IDs cannot be treated as app IDs", async () => {
  for (const id of ["", " ", " libreoffice-writer", "tgt_other"]) {
    await expect(verifiedLinuxAppSelectors(fixture([{ ...writer, id }]), writer.displayName)).rejects.toThrow(/unique running/);
  }
});

test("a foreign or missing resolved target cannot inherit authorized app scope", async () => {
  for (const target of ["tgt_foreign", ""]) {
    await expect(verifiedLinuxAppSelectors(fixture([writer], name => name === writer.displayName ? "tgt_owned" : target), writer.displayName))
      .rejects.toThrow(/authorized fixture target/);
  }
});


test("running Electron records with the same inventory ID identify one app", async () => {
  const code = { id: "code", displayName: "Visual Studio Code", isRunning: true };
  const proof = await verifiedLinuxAppSelectors(fixture([code, { ...code }, { ...code, id: "inactive-code", isRunning: false }]), code.displayName);
  expect(proof.appSelectors).toEqual([code.displayName, code.id]);
  expect(proof.namedTargetHandle).toBe(proof.identifiedTargetHandle);
});
