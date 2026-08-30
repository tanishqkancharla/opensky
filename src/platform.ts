export type OpenSkyTarget = "mac" | "win" | "linux";

export function detectTarget(platform = process.platform): OpenSkyTarget {
  if (platform === "darwin") return "mac";
  if (platform === "win32") return "win";
  return "linux";
}

export function pasteModifierFor(target: OpenSkyTarget): "cmd" | "ctrl" {
  return target === "mac" ? "cmd" : "ctrl";
}

export function homeDir(override?: string): string {
  return override ?? process.env.OPENSKY_HOME ?? defaultHome();
}

function defaultHome(): string {
  const base = process.env.HOME || process.env.USERPROFILE || process.cwd();
  return `${base}/.opensky`;
}
