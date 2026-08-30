import { cp, mkdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface SkillInstallOptions {
  global?: boolean;
  cwd?: string;
  home?: string;
  agents?: string[];
}

export interface SkillInstallResult {
  source: string;
  destinations: string[];
}

export function skillSourceDir(from = import.meta.url): string {
  const here = dirname(fileURLToPath(from));
  return join(here, "..", "skills", "ccua");
}

export function defaultAgents(): string[] {
  return ["agents", "cursor", "claude", "codex"];
}

export function skillDestinations(options: SkillInstallOptions = {}): string[] {
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? process.env.HOME ?? process.env.USERPROFILE ?? cwd;
  const agents = options.agents ?? defaultAgents();
  const dirs: string[] = [];
  if (options.global) {
    for (const agent of agents) {
      dirs.push(join(home, `.${agent}`, "skills", "ccua"));
    }
  } else {
    for (const agent of agents) {
      dirs.push(join(cwd, `.${agent}`, "skills", "ccua"));
    }
  }
  return [...new Set(dirs)];
}

export async function installSkill(options: SkillInstallOptions = {}): Promise<SkillInstallResult> {
  const source = await resolveSkillSource();
  const destinations = skillDestinations(options);
  for (const destination of destinations) {
    await mkdir(dirname(destination), { recursive: true });
    await rm(destination, { recursive: true, force: true });
    await cp(source, destination, { recursive: true });
  }
  return { source, destinations };
}

export async function uninstallSkill(options: SkillInstallOptions = {}): Promise<string[]> {
  const destinations = skillDestinations(options);
  const removed: string[] = [];
  for (const destination of destinations) {
    await rm(destination, { recursive: true, force: true });
    removed.push(destination);
  }
  return removed;
}

async function resolveSkillSource(): Promise<string> {
  const candidates = [
    skillSourceDir(),
    join(process.cwd(), "skills", "ccua"),
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills", "ccua"),
  ];
  for (const candidate of candidates) {
    try {
      const info = await stat(join(candidate, "SKILL.md"));
      if (info.isFile()) return candidate;
    } catch {
      // try next
    }
  }
  throw new Error(`ccua skill source was not found. Expected skills/ccua/SKILL.md`);
}
