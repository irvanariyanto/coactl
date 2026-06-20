import { existsSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { loadClaudeFormat } from "../schema/load.js";
import type { LoadResult, SourceLoader } from "./types.js";

export class LocalSource implements SourceLoader {
  constructor(
    private readonly sourceName: string,
    private readonly rootDir: string,
  ) {}

  async load(): Promise<LoadResult> {
    const root = resolve(this.rootDir);
    const assets: LoadResult["assets"] = [];
    const errors: LoadResult["errors"] = [];

    // Skills: .claude/skills/{id}/SKILL.md
    const skillsDir = join(root, ".claude", "skills");
    if (existsSync(skillsDir)) {
      for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const skillFile = join(skillsDir, entry.name, "SKILL.md");
        if (!existsSync(skillFile)) continue;
        try {
          const result = loadClaudeFormat(skillFile, entry.name, "skill");
          if (!result) continue;
          assets.push({ asset: result.asset, sourceName: this.sourceName, origin: { dir: join(skillsDir, entry.name) }, readOnly: false, bodyText: result.bodyText });
        } catch (err) {
          errors.push({ dir: join(skillsDir, entry.name), error: err as Error });
        }
      }
    }

    // Commands + Workflows: .claude/commands/{id}.md
    const commandsDir = join(root, ".claude", "commands");
    if (existsSync(commandsDir)) {
      for (const entry of readdirSync(commandsDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const id = basename(entry.name, ".md");
        const filePath = join(commandsDir, entry.name);
        try {
          const result = loadClaudeFormat(filePath, id, "command");
          if (!result) continue;
          assets.push({ asset: result.asset, sourceName: this.sourceName, origin: { dir: commandsDir }, readOnly: false, bodyText: result.bodyText });
        } catch (err) {
          errors.push({ dir: filePath, error: err as Error });
        }
      }
    }

    // Rules: .claude/rules/{id}.md
    const rulesDir = join(root, ".claude", "rules");
    if (existsSync(rulesDir)) {
      for (const entry of readdirSync(rulesDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const id = basename(entry.name, ".md");
        const filePath = join(rulesDir, entry.name);
        try {
          const result = loadClaudeFormat(filePath, id, "rule");
          if (!result) continue;
          assets.push({ asset: result.asset, sourceName: this.sourceName, origin: { dir: rulesDir }, readOnly: false, bodyText: result.bodyText });
        } catch (err) {
          errors.push({ dir: filePath, error: err as Error });
        }
      }
    }

    assets.sort((a, b) => a.asset.id.localeCompare(b.asset.id));
    return { assets, errors };
  }
}
