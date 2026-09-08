import { test as base } from "vitest";
import { DesktopProgramPolicy } from "../../evals/parity/desktop-program.js";

export const test = base.extend<{ native: DesktopProgramPolicy; opensky: DesktopProgramPolicy }>({
  native: async ({}, use) => { await use(new DesktopProgramPolicy({ backend: "native", appSelectors: ["org.libreoffice.script"] })); },
  opensky: async ({}, use) => { await use(new DesktopProgramPolicy({ backend: "opensky", appSelectors: ["org.libreoffice.script"] })); },
});
