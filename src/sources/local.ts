import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadAsset } from "../schema/load.js";
import type { LoadResult, SourceLoader } from "./types.js";

export class LocalSource implements SourceLoader {
  constructor(
    private readonly sourceName: string,
    private readonly sourcePath: string,
  ) {}

  async load(): Promise<LoadResult> {
    const baseDir = resolve(this.sourcePath);
    const assets: LoadResult["assets"] = [];
    const errors: LoadResult["errors"] = [];

    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(baseDir, { withFileTypes: true });
    } catch {
      return { assets: [], errors: [{ dir: baseDir, error: new Error(`Cannot read source path: ${baseDir}`) }] };
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = join(baseDir, entry.name);
      if (!existsSync(join(dir, "asset.yaml"))) continue;

      try {
        const { asset } = loadAsset(dir);
        assets.push({ asset, sourceName: this.sourceName, origin: { dir }, readOnly: false });
      } catch (err) {
        errors.push({ dir, error: err as Error });
      }
    }

    assets.sort((a, b) => a.asset.id.localeCompare(b.asset.id));
    return { assets, errors };
  }
}
