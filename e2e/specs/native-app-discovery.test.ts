import { expect } from "vitest";
import { openedAppTest, quitAppTest } from "../fixtures/app-discovery.js";

openedAppTest("APP-N01: discovers an app opened after an earlier inventory", async ({ sdk }) => {
  await expect.poll(() => sdk.list_apps()).toContainEqual(expect.objectContaining({ id: "com.apple.TextEdit", isRunning: true }));
});

quitAppTest("APP-N02: removes the running flag after an app quits", async ({ sdk }) => {
  await expect.poll(() => sdk.list_apps()).toContainEqual(expect.objectContaining({ id: "com.apple.TextEdit", isRunning: false }));
  expect(await sdk.list_apps()).not.toContainEqual(expect.objectContaining({ id: "com.apple.TextEdit", isRunning: true }));
});
