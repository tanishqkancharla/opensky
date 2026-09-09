import { expect } from "vitest";
import { desktopSetupTest } from "../fixtures/linux-desktop-setup.js";

const calc = desktopSetupTest({
  taskId: "035f41ba-6653-43ab-aa63-c86d449d62e5", file: "IncomeStatement2.xlsx", mode: "--calc" as const,
});
const impress = desktopSetupTest({
  taskId: "5cfb9197-e72b-454b-900e-c06b0c802b40", file: "33_1.pptx", mode: "--impress" as const,
});

calc("SETUP-L02: reads the income statement in Calc", { timeout: 120_000 }, async ({ app }) => {
  await app.pressKey("CTRL+HOME");
  await expect(app.getAXState({ disableDiffing: true })).resolves.toContain("Net Sales");
});

impress("SETUP-L03: reads the first slide in Impress", { timeout: 120_000 }, async ({ app }) => {
  await expect(app.getAXState({ disableDiffing: true })).resolves.toContain("VIRTUAL QUIZ");
});

const code = desktopSetupTest({
  taskId: "0ed39f63-6049-43d4-ba4d-5fa2fe04a951", file: "vscode_replace_text.txt", mode: "--code",
});

code("SETUP-L04: reads the benchmark text in VS Code", { timeout: 120_000 }, async ({ app }) => {
  await expect(app.getAXState({ disableDiffing: true })).resolves.toContain("In order to evaluate");
});
