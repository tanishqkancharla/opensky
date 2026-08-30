import { evalCase } from "./eval-case.js";

evalCase({ name: "calculator computes 6 × 7" }, async ({ harness }) => {
  const response = await harness.send(
    "Open Calculator, compute 6 × 7, and leave the result visible.",
  );

  return response.score([
    "Calculator's display (from get_app_state / window artifacts) shows 42.",
    "The agent used the computer-use harness tools (opensky, cua_driver_call, or Codex Computer Use), not osascript, cliclick, or other OS key injection.",
    "The path was efficient: target Calculator once, snapshot, enter 6 × 7 = (or equivalent), then re-snapshot to confirm. No extra apps, no repeated full-desktop scans, no click storms.",
  ]);
});
