import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadAsset } from "../schema/load.js";
import { hashKey } from "./cache.js";
import type { LoadResult, SourceLoader } from "./types.js";

const PKG_CACHE_DIR = join(homedir(), ".cache", "coactl", "pkg");

// Assumption: package is an npm-compatible tarball. We use `npm pack` semantics
// to download without running install scripts (security: never run postinstall).
export class PackageSource implements SourceLoader {
  constructor(
    private readonly sourceName: string,
    private readonly registry: string,
    private readonly install: string,
  ) {}

  async load(): Promise<LoadResult> {
    const cacheKey = hashKey(`${this.registry}:${this.install}`);
    const extractDir = join(PKG_CACHE_DIR, cacheKey);

    if (!existsSync(extractDir)) {
      mkdirSync(extractDir, { recursive: true });
      // Download without executing scripts: use `npm pack` to fetch and unpack
      execSync(
        `npm pack --pack-destination ${extractDir} --registry ${this.registry} ${this.install}`,
        { stdio: "pipe" },
      );
      // npm pack produces a .tgz — extract it
      const tgz = execSync(`ls ${extractDir}/*.tgz`, { encoding: "utf-8" }).trim();
      execSync(`tar -xzf ${tgz} -C ${extractDir} --strip-components=1`, { stdio: "pipe" });
    }

    const assetsDir = join(extractDir, "assets");
    if (!existsSync(assetsDir)) {
      return { assets: [], errors: [{ dir: assetsDir, error: new Error(`No assets/ dir in package ${this.install}`) }] };
    }

    const assets: LoadResult["assets"] = [];
    const errors: LoadResult["errors"] = [];

    for (const entry of readdirSync(assetsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(assetsDir, entry.name);
      if (!existsSync(join(dir, "asset.yaml"))) continue;
      try {
        const { asset } = loadAsset(dir);
        assets.push({ asset, sourceName: this.sourceName, origin: { dir }, readOnly: true });
      } catch (err) {
        errors.push({ dir, error: err as Error });
      }
    }

    assets.sort((a, b) => a.asset.id.localeCompare(b.asset.id));
    return { assets, errors };
  }
}
