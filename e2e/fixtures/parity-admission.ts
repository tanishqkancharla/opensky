import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as base } from "vitest";
import { DesktopAdmission } from "../../evals/parity/admission.js";

export const test = base.extend<{
  allowance: { gate: DesktopAdmission; receipt(): Promise<unknown> };
  expired: DesktopAdmission;
  uncapped: { gate: DesktopAdmission; receipt(): Promise<unknown> };
  unarmed: DesktopAdmission;
}>({
  allowance: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), "opensky-admission-"));
    const config = join(directory, "config.json"), receipt = join(directory, "receipt.json");
    await writeFile(config, JSON.stringify({ armed: true, maxCalls: 2, deadline: Date.now() + 60_000 }));
    try { await use({ gate: new DesktopAdmission(config, receipt), receipt: async () => JSON.parse(await readFile(receipt, "utf8")) }); }
    finally { await rm(directory, { recursive: true, force: true }); }
  },
  expired: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), "opensky-admission-expired-"));
    const config = join(directory, "config.json");
    await writeFile(config, JSON.stringify({ armed: true, maxCalls: 2, deadline: 1 }));
    try { await use(new DesktopAdmission(config, join(directory, "receipt.json"))); }
    finally { await rm(directory, { recursive: true, force: true }); }
  },
  uncapped: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), "opensky-admission-uncapped-"));
    const config = join(directory, "config.json"), receipt = join(directory, "receipt.json");
    await writeFile(config, JSON.stringify({ armed: true, maxCalls: null, deadline: null }));
    const gate = new DesktopAdmission(config, receipt);
    // Drive setup beyond the historical call allowance; the action under test
    // is the next dispatch through the same real admission service.
    for (let i = 0; i < 20; i++) gate.admit();
    try { await use({ gate, receipt: async () => JSON.parse(await readFile(receipt, "utf8")) }); }
    finally { await rm(directory, { recursive: true, force: true }); }
  },
  unarmed: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), "opensky-admission-unarmed-"));
    const config = join(directory, "config.json");
    await writeFile(config, JSON.stringify({ armed: false, maxCalls: null, deadline: null }));
    try { await use(new DesktopAdmission(config, join(directory, "receipt.json"))); }
    finally { await rm(directory, { recursive: true, force: true }); }
  },
});
