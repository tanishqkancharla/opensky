import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { mkdirPrivate, writeFilePrivateAtomic } from "./secure-fs.js";
import type { ResolvedApp, SnapshotElement, TargetHandle } from "./types.js";

export interface PersistedSession {
  version: 2;
  /** Canonical target records. */
  targets: Record<TargetHandle, ResolvedApp>;
  /** Normalized app aliases point to canonical targets instead of copying bindings. */
  aliases: Record<string, TargetHandle>;
  trees: Record<string, { tree: string; elements: SnapshotElement[]; snapshotId?: string }>;
  /** Unmigrated legacy entries; new cleanup ownership lives in per-session leases. */
  managedBrowserSessions: string[];
}

export class SessionStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<PersistedSession | LegacyPersistedSession> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<PersistedSession & LegacyPersistedSession>;
      if (parsed.version !== 2 || !parsed.targets || !parsed.aliases) {
        return {
          apps: parsed.apps ?? {},
          trees: parsed.trees ?? {},
          managedBrowserSessions: managedSessions(parsed.managedBrowserSessions),
        };
      }
      return {
        version: 2,
        targets: parsed.targets,
        aliases: parsed.aliases,
        trees: parsed.trees ?? {},
        managedBrowserSessions: managedSessions(parsed.managedBrowserSessions),
      };
    } catch {
      return { version: 2, targets: {}, aliases: {}, trees: {}, managedBrowserSessions: [] };
    }
  }

  async save(session: PersistedSession): Promise<void> {
    await mkdirPrivate(dirname(this.filePath));
    await writeFilePrivateAtomic(this.filePath, JSON.stringify(session, null, 2));
  }
}

export interface LegacyPersistedSession {
  apps: Record<string, Omit<ResolvedApp, "handle" | "openedAt"> & Partial<Pick<ResolvedApp, "handle" | "openedAt">>>;
  trees: Record<string, { tree: string; elements: SnapshotElement[]; snapshotId?: string }>;
  managedBrowserSessions: string[];
}

function managedSessions(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function sessionFile(homeDir: string): string {
  return join(homeDir, "session.json");
}
