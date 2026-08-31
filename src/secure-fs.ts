import { chmod, mkdir, writeFile } from "node:fs/promises";

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
