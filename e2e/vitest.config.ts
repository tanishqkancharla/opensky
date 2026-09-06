import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["specs/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    maxWorkers: 1,
    sequence: { concurrent: false },
    retry: 0,
    bail: 1,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    reporters: ["verbose"],
    expect: { poll: { timeout: 5_000, interval: 50 } },
  },
});
