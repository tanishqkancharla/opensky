import { expect } from "vitest";
import { test } from "../fixtures/native-files.js";

test("OPEN-N01: opens and closes the requested file while a same-named document stays open", async ({ sdk, files }) => {
  const sibling = await sdk.open_target({ app: "TextEdit", targets: [files.sibling], includeScreenshot: false });

  const requested = await sdk.open_target({ app: "TextEdit", targets: [files.requested], includeScreenshot: false });

  expect(requested.text).toContain("Requested document: α 😀 exact file.");
  expect(requested.text).not.toContain("Sibling document must remain open.");
  await sdk.close_target({ app: requested.targetHandle });
  expect((await sdk.get_app_state({ app: sibling.targetHandle, includeScreenshot: false, disableDiff: true })).text)
    .toContain("Sibling document must remain open.");
});
