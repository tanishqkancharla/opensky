import { test, expect } from "../fixtures/tool-cell.js";

test("a 65-second operation completes through bounded waits without being restarted", { timeout: 90_000 }, async ({ cells, delayedResult }) => {
  const first = await cells.start(delayedResult, 0);
  expect(first.details.cellStatus).toBe("running");
  await expect(cells.start(delayedResult, 0)).resolves.toMatchObject({ isError: true, details: { cellId: first.details.cellId } });
  await expect(cells.wait(first.details.cellId)).resolves.toMatchObject({ details: { cellStatus: "running" } });
  await expect(cells.wait(first.details.cellId)).resolves.toMatchObject({ details: { cellStatus: "running" } });
  await expect(cells.wait(first.details.cellId)).resolves.toMatchObject({ content: [{ text: "Finished the original operation." }], details: { cellStatus: "completed", replayed: false } });
  await expect(cells.wait(first.details.cellId, 0)).resolves.toMatchObject({ details: { cellStatus: "completed", replayed: true } });
});
