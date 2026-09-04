import { randomUUID } from "node:crypto";
import { chmod, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/** Create a directory that is readable only by the current user. */
export async function mkdirPrivate(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700).catch(() => undefined);
}

/** Write a file with mode 0600, even when umask or an existing file would be looser. */
export async function writeFilePrivate(path: string, data: string | Uint8Array): Promise<void> {
  await writeFile(path, data, { mode: 0o600 });
  await chmod(path, 0o600).catch(() => undefined);
}

/** Atomically replace a private file using a same-directory 0600 temporary. */
export async function writeFilePrivateAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const parent = dirname(path);
  await mkdirPrivate(parent);
  const temporary = join(parent, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFilePrivate(temporary, data);
    await rename(temporary, path);
    await chmod(path, 0o600).catch(() => undefined);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}
