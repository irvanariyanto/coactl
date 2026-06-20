import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadClaudeFormat } from "../schema/load.js";
import type { AssetKind } from "../schema/asset.js";
import type { LoadResult, SourceLoader } from "./types.js";

const ASSET_FILES: Array<{ file: string; kind: AssetKind }> = [
  { file: "SKILL.md", kind: "skill" },
  { file: "COMMAND.md", kind: "command" },
  { file: "RULE.md", kind: "rule" },
];

export class LocalSource implements SourceLoader {
  constructor(
    private readonly sourceName: string,
    private readonly rootDir: string,
  ) {}

  async load(): Promise<LoadResult> {
    const root = resolve(this.rootDir);
    const assets: LoadResult["assets"] = [];
    const errors: LoadResult["errors"] = [];

    const assetsDir = root;
    if (!existsSync(assetsDir)) return { assets, errors };

    for (const entry of readdirSync(assetsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const id = entry.name;
      const dir = join(assetsDir, id);

      for (const { file, kind } of ASSET_FILES) {
        const filePath = join(dir, file);
        if (!existsSync(filePath)) continue;
        try {
          const result = loadClaudeFormat(filePath, id, kind);
          if (!result) continue;
          assets.push({ asset: result.asset, sourceName: this.sourceName, origin: { dir }, readOnly: false, bodyText: result.bodyText });
        } catch (err) {
          errors.push({ dir, error: err as Error });
        }
        break;
      }
    }

    assets.sort((a, b) => a.asset.id.localeCompare(b.asset.id));
    return { assets, errors };
  }
}
