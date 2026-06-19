import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";

export interface CacheEntry {
  path: string;
  exists: boolean;
}

const CACHE_DIR = join(homedir(), ".cache", "coactl");

function ensureCacheDir(): string {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
  return CACHE_DIR;
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function getCachePath(key: string): string {
  const cacheDir = ensureCacheDir();
  const hash = hashKey(key);
  return join(cacheDir, hash);
}

export function readCache(key: string): string | null {
  const path = getCachePath(key);
  if (existsSync(path)) {
    return readFileSync(path, "utf-8");
  }
  return null;
}

export function writeCache(key: string, content: string): string {
  const path = getCachePath(key);
  const dir = join(path, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, content, "utf-8");
  return path;
}

export function cacheKeyForGit(url: string, ref: string): string {
  return `git:${url}:${ref}`;
}

export function cacheKeyForUrl(url: string): string {
  return `url:${url}`;
}

export function cacheKeyForPackage(registry: string, install: string): string {
  return `pkg:${registry}:${install}`;
}
