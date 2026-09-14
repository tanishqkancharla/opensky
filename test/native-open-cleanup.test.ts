import assert from "node:assert/strict";
import test from "node:test";

import { finishNativeOpen } from "../e2e/fixtures/native-open-outcome.js";
import { lifecycleFacade } from "../e2e/fixtures/native-open-facade.js";
import { createOpenSky } from "../src/opensky.js";

test("native open cleanup failure rejects even after the action completed", () => {
  const cleanupFailure = new Error("exact process exit was not verified");
  assert.throws(
    () => finishNativeOpen("action result", true, undefined, cleanupFailure),
    error => error === cleanupFailure,
  );
});

test("native open retains both action and cleanup failures", () => {
  const actionFailure = new Error("requested document assertion failed");
  const cleanupFailure = new Error("exact process exit was not verified");
  assert.throws(
    () => finishNativeOpen(undefined, false, actionFailure, cleanupFailure),
    error => error instanceof AggregateError && error.errors.includes(actionFailure) && error.errors.includes(cleanupFailure),
  );
});

test("native lifecycle facade leaves frozen SDK methods untouched", () => {
  const sdk = createOpenSky({ autoLaunch: false });
  const before = Object.getOwnPropertyDescriptor(sdk, "open_target");
  assert.equal(before?.writable, false);
  const facade = lifecycleFacade(sdk, { open: args => sdk.open_target(...args), close: args => sdk.close_target(...args) });
  assert.notEqual(facade, sdk);
  const after = Object.getOwnPropertyDescriptor(sdk, "open_target");
  assert.equal(after?.value, before?.value);
  assert.equal(after?.writable, false);
  assert.equal(Object.getOwnPropertyDescriptor(facade, "open_target")?.writable, true);
});
