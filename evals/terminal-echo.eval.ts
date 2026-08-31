import { evalCase } from "./eval-case.js";

evalCase({ name: "terminal echoes OPENSKY-OK" }, async ({ harness }) => {
  const response = await harness.send(
    [
      "This desktop is Linux Omarchy (Hyprland). There is no Calculator app.",
      "Open the Foot terminal (launch it if it is not already open).",
      "Type the command `echo OPENSKY-OK` and press Enter.",
      "Leave that command output visible in the terminal window.",
      "Do not open a browser, Calculator, or any other app.",
    ].join(" "),
  );

  return response.score([
    "A Foot/terminal window artifact (get_app_state, get_window_state, or screenshot text) shows the command output OPENSKY-OK.",
    "The agent used the computer-use harness tools (opensky, cua_driver_call, or Codex Computer Use), not osascript, cliclick, or other OS key injection.",
    "The path was efficient: target Foot once, snapshot, type echo OPENSKY-OK, press Enter, then re-snapshot to confirm. No extra apps, no repeated full-desktop scans, no click storms.",
  ]);
});
