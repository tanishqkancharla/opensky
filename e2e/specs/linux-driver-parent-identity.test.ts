import { expect, test } from "vitest";
import { verifyParentLinuxDriverIdentity } from "../../evals/parity/driver-runtime.js";

const live = { executable: "/owned/opensky-driver", pid: 123, socketInode: "456", startTicks: "789", source: "a".repeat(40) };

test("isolated verifier accepts only the complete current parent driver identity", () => {
  expect(() => verifyParentLinuxDriverIdentity({ ...live }, live)).not.toThrow();
  for (const field of Object.keys(live)) {
    const missing = { ...live } as Record<string, unknown>; delete missing[field];
    expect(() => verifyParentLinuxDriverIdentity(missing, live)).toThrow(/identity differs/);
  }
});

test("reused PID, replaced socket, other executable and source cannot inherit parent verification", () => {
  for (const altered of [
    { ...live, pid: 124 }, { ...live, startTicks: "790" }, { ...live, socketInode: "457" },
    { ...live, executable: "/other/opensky-driver" }, { ...live, source: "b".repeat(40) },
    { ...live, GITHUB_ACTIONS: "true" }, null, [],
  ]) expect(() => verifyParentLinuxDriverIdentity(altered, live)).toThrow(/identity differs/);
});
