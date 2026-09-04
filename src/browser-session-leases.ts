import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import { mkdirPrivate, writeFilePrivate, writeFilePrivateAtomic } from "./secure-fs.js";

const LEASE_VERSION = 1;
const LEASE_FILE = "lease.json";
const LEASE_DIR = "browser-session-leases";
const LEASE_NAME = /^([a-f0-9]{64})\.(\d+)\.([a-f0-9-]{36})\.lease$/;

interface BrowserSessionLease {
  version: 1;
  session: string;
  owner: {
    runtimeId: string;
    pid: number;
    createdAt: string;
  };
}

interface LeaseEntry {
  path: string;
  hash: string;
  pathPid: number;
  pathRuntimeId: string;
  record: BrowserSessionLease;
}

/**
 * Durable, per-driver-session ownership.
 *
 * Directory rename is the claim CAS. The directory name repeats the claiming
 * PID/runtime UUID, so a crash between rename and record rewrite remains
 * conservatively attributable and can be recovered only after that PID dies.
 */
export class BrowserSessionLeaseStore {
  private readonly directory: string;
  private readonly owned = new Map<string, string>();

  constructor(
    homeDir: string,
    readonly runtimeId: string,
    readonly pid: number = process.pid,
    private readonly createdAt: () => Date = () => new Date(),
  ) {
    this.directory = join(homeDir, LEASE_DIR);
  }

  async reserve(session: string): Promise<void> {
    validateSession(session);
    await mkdirPrivate(this.directory);
    const hash = sessionHash(session);
    const finalPath = this.pathFor(hash);
    const temporary = `${finalPath}.${randomUUID()}.tmp`;
    await mkdirPrivate(temporary);
    try {
      await writeFilePrivate(join(temporary, LEASE_FILE), JSON.stringify(this.record(session), null, 2));
      await rename(temporary, finalPath);
    } catch (error) {
      await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
    this.owned.set(session, finalPath);
  }

  /** Import a v1/v2 session-array entry only when its owner PID is recoverable. */
  async importLegacy(session: string, ownerPid: number): Promise<void> {
    validateSession(session);
    if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) return;
    const existing = (await this.entries()).some((entry) => entry.record.session === session);
    if (existing) return;
    await mkdirPrivate(this.directory);
    const hash = sessionHash(session);
    const runtimeId = legacyRuntimeId(session);
    const finalPath = join(this.directory, leaseName(hash, ownerPid, runtimeId));
    const temporary = `${finalPath}.${randomUUID()}.tmp`;
    await mkdirPrivate(temporary);
    try {
      const record: BrowserSessionLease = {
        version: LEASE_VERSION,
        session,
        owner: { runtimeId, pid: ownerPid, createdAt: this.createdAt().toISOString() },
      };
      await writeFilePrivate(join(temporary, LEASE_FILE), JSON.stringify(record, null, 2));
      await rename(temporary, finalPath);
    } catch (error) {
      await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
      // A concurrent migrator may have won. Do not overwrite its record.
      if (!(await this.entries()).some((entry) => entry.record.session === session)) throw error;
    }
  }

  /** Claim exact sessions whose effective owner PID is demonstrably absent. */
  async claimDeadOwners(): Promise<string[]> {
    await mkdirPrivate(this.directory);
    const claimed: string[] = [];
    for (const entry of await this.entries()) {
      if (entry.pathPid === this.pid && entry.pathRuntimeId === this.runtimeId) {
        this.owned.set(entry.record.session, entry.path);
        claimed.push(entry.record.session);
        continue;
      }
      if (pidMayBeAlive(entry.pathPid)) continue;
      const destination = this.pathFor(entry.hash);
      try {
        await rename(entry.path, destination);
      } catch (error) {
        if (isMissing(error) || isAlreadyExists(error)) continue;
        throw error;
      }
      const record = this.record(entry.record.session);
      await writeFilePrivateAtomic(join(destination, LEASE_FILE), JSON.stringify(record, null, 2));
      this.owned.set(record.session, destination);
      claimed.push(record.session);
    }
    return [...new Set(claimed)];
  }

  async release(session: string): Promise<void> {
    const path = this.owned.get(session);
    if (!path) return;
    await rm(path, { recursive: true, force: true });
    this.owned.delete(session);
  }

  private pathFor(hash: string): string {
    return join(this.directory, leaseName(hash, this.pid, this.runtimeId));
  }

  private record(session: string): BrowserSessionLease {
    return {
      version: LEASE_VERSION,
      session,
      owner: {
        runtimeId: this.runtimeId,
        pid: this.pid,
        createdAt: this.createdAt().toISOString(),
      },
    };
  }

  private async entries(): Promise<LeaseEntry[]> {
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const entries: LeaseEntry[] = [];
    for (const name of names.sort()) {
      const match = LEASE_NAME.exec(name);
      if (!match) continue;
      const path = join(this.directory, name);
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readFile(join(path, LEASE_FILE), "utf8"));
      } catch {
        // An unreadable record carries no safe destructive authority.
        continue;
      }
      const record = parseLease(parsed);
      if (!record || sessionHash(record.session) !== match[1]) continue;
      entries.push({
        path,
        hash: match[1]!,
        pathPid: Number(match[2]),
        pathRuntimeId: match[3]!,
        record,
      });
    }
    return entries;
  }
}

export function legacyBrowserSessionOwnerPid(session: string): number | undefined {
  const match = /-browser-(\d+)-\d+$/.exec(session);
  if (!match) return undefined;
  const pid = Number(match[1]);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
}

function parseLease(value: unknown): BrowserSessionLease | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const owner = record.owner;
  if (!owner || typeof owner !== "object" || Array.isArray(owner)) return undefined;
  const ownerRecord = owner as Record<string, unknown>;
  if (
    record.version !== LEASE_VERSION ||
    typeof record.session !== "string" || !record.session ||
    typeof ownerRecord.runtimeId !== "string" || !/^[a-f0-9-]{36}$/.test(ownerRecord.runtimeId) ||
    !Number.isSafeInteger(ownerRecord.pid) || Number(ownerRecord.pid) <= 0 ||
    typeof ownerRecord.createdAt !== "string" || !Number.isFinite(Date.parse(ownerRecord.createdAt))
  ) return undefined;
  return record as unknown as BrowserSessionLease;
}

function pidMayBeAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !isNoSuchProcess(error);
  }
}

function sessionHash(session: string): string {
  return createHash("sha256").update(session).digest("hex");
}

function leaseName(hash: string, pid: number, runtimeId: string): string {
  return `${hash}.${pid}.${runtimeId}.lease`;
}

function legacyRuntimeId(session: string): string {
  const hex = createHash("sha256").update(`legacy:${session}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validateSession(session: string): void {
  if (!session || session.length > 512 || /[\0\r\n]/.test(session)) {
    throw new Error("Invalid managed browser session name.");
  }
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function isMissing(error: unknown): boolean {
  return errorCode(error) === "ENOENT";
}

function isAlreadyExists(error: unknown): boolean {
  return ["EEXIST", "ENOTEMPTY"].includes(errorCode(error) ?? "");
}

function isNoSuchProcess(error: unknown): boolean {
  return errorCode(error) === "ESRCH";
}
