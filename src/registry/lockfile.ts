import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, stringify } from "yaml";
import { LockfileSchema } from "../schema/lockfile.js";
import { ValidationError, formatZodError } from "../schema/errors.js";
import type { Lockfile, LockfileEntry } from "../schema/index.js";

const DEFAULT_LOCKFILE = "./agent.lock.yaml";

export function readLockfile(path = DEFAULT_LOCKFILE): Lockfile {
  const full = resolve(path);
  if (!existsSync(full)) return { assets: {} };
  const raw = parse(readFileSync(full, "utf-8"));
  const result = LockfileSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(full, formatZodError(result.error));
  }
  return result.data;
}

export function writeLockfile(lockfile: Lockfile, path = DEFAULT_LOCKFILE): void {
  const sorted: Lockfile = {
    assets: Object.fromEntries(
      Object.entries(lockfile.assets).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
  writeFileSync(resolve(path), stringify(sorted), "utf-8");
}

export function upsertLockEntry(
  lockfile: Lockfile,
  id: string,
  entry: LockfileEntry,
): Lockfile {
  return { assets: { ...lockfile.assets, [id]: entry } };
}
