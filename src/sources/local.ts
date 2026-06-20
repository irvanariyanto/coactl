import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadClaudeFormat } from "../schema/load.js";
import type { AssetKind } from "../schema/asset.js";
import type { LoadResult, SourceLoader } from "./types.js";

const KIND_DIRS: Array<{ subdir: string; file: string; kind: AssetKind }> = [
  { subdir: "skills",    file: "SKILL.md",    kind: "skill" },
  { subdir: "commands",  file: "COMMAND.md",  kind: "command" },
  { subdir: "workflows", file: "WORKFLOW.md", kind: "workflow" },
  { subdir: "rules",     file: "RULE.md",     kind: "rule" },
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

    for (const { subdir, file, kind } of KIND_DIRS) {
      const kindDir = join(root, subdir);
      if (!existsSync(kindDir)) continue;
      for (const entry of readdirSync(kindDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const id = entry.name;
        const dir = join(kindDir, id);
        const filePath = join(dir, file);
        if (!existsSync(filePath)) continue;
        try {
          const result = loadClaudeFormat(filePath, id, kind);
          if (!result) continue;
          assets.push({ asset: result.asset, sourceName: this.sourceName, origin: { dir }, readOnly: false, bodyText: result.bodyText });
        } catch (err) {
          errors.push({ dir, error: err as Error });
        }
      }
    }

    assets.sort((a, b) => a.asset.id.localeCompare(b.asset.id));
    return { assets, errors };
  }
}
