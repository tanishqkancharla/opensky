import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { assertDisposableLinuxDesktop } from "./linux-app.js";

/** Shared launch setup for SDK checks and both agent arms. Task edits remain UI actions. */
export async function prepareLinuxBenchmarkApp(input: {
  category?: string; document: string; temporary: string; artifacts: string; vscodePath?: string;
}) {
  assertDisposableLinuxDesktop();
  const isCode = input.category === "vs_code";
  if (isCode && !input.vscodePath) throw new Error("Provide the fingerprinted Linux VS Code installation");
  if (input.category && !["vs_code", "libreoffice_writer", "libreoffice_calc", "libreoffice_impress"].includes(input.category)) {
    throw new Error(`Unsupported Linux app category: ${input.category}`);
  }
  const profile = join(input.temporary, "profile");
  const profileSettings = isCode ? {
    "update.mode": "none", "telemetry.telemetryLevel": "off", "workbench.startupEditor": "none", "editor.accessibilitySupport": "on",
  } : undefined;
  if (profileSettings) {
    await mkdir(join(profile, "User"), { recursive: true });
    await writeFile(join(profile, "User/settings.json"), JSON.stringify(profileSettings));
  }
  const options = {
    executable: isCode ? join(input.vscodePath!, "code") : "/usr/bin/libreoffice",
    documentTitle: basename(input.document), artifacts: input.artifacts,
    args: isCode ? ["--user-data-dir", profile, "--extensions-dir", join(input.temporary, "extensions"), "--disable-extensions", "--skip-welcome", "--skip-release-notes", "--new-window", "--force-renderer-accessibility",
      ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []), input.document]
      : [`-env:UserInstallation=${pathToFileURL(profile).href}`, "--norestore", "--nologo", "--nofirststartwizard",
        input.category === "libreoffice_calc" ? "--calc" : input.category === "libreoffice_impress" ? "--impress" : "--writer", input.document],
    env: { SAL_USE_VCLPLUGIN: "gtk3", NO_AT_BRIDGE: "0" },
  };
  await writeFile(join(input.artifacts, "app-launch.json"), JSON.stringify({ ...options, profileSettings }, null, 2));
  return { options, appName: isCode ? "Visual Studio Code" : "LibreOffice",
    menus: isCode ? ["File", "Edit", "Selection", "View"] : ["File", "Edit", "View", "Insert"] };
}
