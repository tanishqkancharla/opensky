import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { mkdirPrivate, writeFilePrivate } from "./secure-fs.js";
import type { ResolvedApp, SnapshotElement } from "./types.js";

export interface PersistedSession {
  apps: Record<string, ResolvedApp>;
  trees: Record<string, { tree: string; elements: SnapshotElement[]; snapshotId?: string }>;
  /** Driver sessions owned by this OpenSky home and safe to reap after a host crash. */
  managedBrowserSessions: string[];
}

export class SessionStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<PersistedSession> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedSession;
      return {
        apps: parsed.apps ?? {},
        trees: parsed.trees ?? {},
        managedBrowserSessions: Array.isArray(parsed.managedBrowserSessions)
          ? parsed.managedBrowserSessions.filter((value): value is string => typeof value === "string")
          : [],
      };
    } catch {
      return { apps: {}, trees: {}, managedBrowserSessions: [] };
    }
  }

  async save(session: PersistedSession): Promise<void> {
    await mkdirPrivate(dirname(this.filePath));
    await writeFilePrivate(this.filePath, JSON.stringify(session, null, 2));
  }
}

export function sessionFile(homeDir: string): string {
  return join(homeDir, "session.json");
}
