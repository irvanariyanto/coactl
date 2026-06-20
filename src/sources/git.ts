import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadAsset } from "../schema/load.js";
import { hashKey } from "./cache.js";
import type { LoadResult, SourceLoader } from "./types.js";
import { readdirSync } from "node:fs";

const GIT_CACHE_DIR = join(homedir(), ".cache", "coactl", "git");

export class GitSource implements SourceLoader {
  constructor(
    private readonly sourceName: string,
    private readonly url: string,
    private readonly ref: string,
    private readonly subdir?: string,
  ) {}

  async load(): Promise<LoadResult> {
    const assets: LoadResult["assets"] = [];
    const errors: LoadResult["errors"] = [];

    const cacheKey = hashKey(`${this.url}:${this.ref}`);
    const repoDir = join(GIT_CACHE_DIR, cacheKey);

    try {
      if (!existsSync(repoDir)) {
        mkdirSync(repoDir, { recursive: true });
        execSync(`git clone --depth 1 --branch ${this.ref} ${this.url} ${repoDir}`, { stdio: "pipe" });
      } else {
        execSync(`git -C ${repoDir} fetch --depth 1 origin ${this.ref}`, { stdio: "pipe" });
        execSync(`git -C ${repoDir} checkout FETCH_HEAD`, { stdio: "pipe" });
      }
    } catch (err) {
      return { assets: [], errors: [{ dir: repoDir, error: err as Error }] };
    }

    const commit = execSync(`git -C ${repoDir} rev-parse HEAD`, { encoding: "utf-8" }).trim();
    const assetsDir = this.subdir ? join(repoDir, this.subdir) : repoDir;

    if (!existsSync(assetsDir)) {
      return { assets: [], errors: [{ dir: assetsDir, error: new Error(`subdir not found: ${assetsDir}`) }] };
    }

    for (const entry of readdirSync(assetsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(assetsDir, entry.name);
      if (!existsSync(join(dir, "asset.yaml"))) continue;
      try {
        const { asset, bodyText } = loadAsset(dir);
        assets.push({ asset, sourceName: this.sourceName, origin: { dir }, readOnly: true, bodyText });
      } catch (err) {
        errors.push({ dir, error: err as Error });
      }
    }

    assets.sort((a, b) => a.asset.id.localeCompare(b.asset.id));
    return { assets, errors };
  }
}
