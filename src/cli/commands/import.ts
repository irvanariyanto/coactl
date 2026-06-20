import * as p from "@clack/prompts";
import chalk from "chalk";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { renderClaudeAssetFrontmatter } from "../../scaffold/templates.js";
import { parseHeader } from "../../transform/header.js";
import { globalConfigDir } from "../../io/global-paths.js";
import { BRAND } from "../../tui/theme.js";
import type { AssetKind } from "../../schema/index.js";

type ToolSource = "claude-code" | "cursor" | "windsurf" | "copilot";
const VALID_SOURCES: ToolSource[] = ["claude-code", "cursor", "windsurf", "copilot"];

interface ImportedAsset {
  id: string;
  kind: AssetKind;
  body: string;
}

function sourcePath(tool: ToolSource, global?: boolean): string {
  const base = global ? homedir() : process.cwd();
  switch (tool) {
    case "claude-code": return join(homedir(), ".claude", "skills");
    case "cursor":      return join(base, ".cursor", "rules");
    case "windsurf":    return join(base, ".windsurfrules");
    case "copilot":     return join(base, ".github", "copilot-instructions.md");
  }
}

function stripCoactlHeader(content: string): string {
  return content.replace(/^<!--\n[\s\S]*?-->\n/, "").trimStart();
}

function stripYamlFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n\n?/, "").trimStart();
}

function kindFromCursorFrontmatter(content: string): AssetKind {
  const m = content.match(/^alwaysApply:\s*(true|false)/m);
  return m?.[1] === "true" ? "rule" : "skill";
}

function extractCoactlBlocks(content: string): Array<{ id: string; body: string }> {
  const blocks: Array<{ id: string; body: string }> = [];
  const re = /<!-- BEGIN coactl:([^\s>]+) -->([\s\S]*?)<!-- END coactl:\1 -->/g;
  let match;
  while ((match = re.exec(content)) !== null) {
    blocks.push({ id: match[1], body: stripCoactlHeader(match[2].trim()) });
  }
  return blocks;
}

function listAssets(tool: ToolSource, global?: boolean): ImportedAsset[] {
  const path = sourcePath(tool, global);

  if (tool === "claude-code") {
    if (!existsSync(path)) return [];
    return readdirSync(path, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(path, d.name, "SKILL.md")))
      .map((d) => {
        const raw = readFileSync(join(path, d.name, "SKILL.md"), "utf-8");
        return { id: d.name, kind: "skill" as AssetKind, body: parseHeader(raw) ? stripCoactlHeader(raw) : raw };
      });
  }

  if (tool === "cursor") {
    if (!existsSync(path)) return [];
    return readdirSync(path)
      .filter((f) => f.endsWith(".mdc"))
      .map((f) => {
        const raw = readFileSync(join(path, f), "utf-8");
        return {
          id: basename(f, ".mdc"),
          kind: kindFromCursorFrontmatter(raw),
          body: stripCoactlHeader(stripYamlFrontmatter(raw)),
        };
      });
  }

  // windsurf / copilot — single aggregate file
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  const blocks = extractCoactlBlocks(content);
  if (blocks.length > 0) return blocks.map((b) => ({ ...b, kind: "rule" as AssetKind }));
  const id = tool === "windsurf" ? "windsurf-rules" : "copilot-instructions";
  return [{ id, kind: "rule" as AssetKind, body: content.trimStart() }];
}

function assetPath(kind: AssetKind, id: string, root: string): { dir: string; file: string } {
  const dir = join(root, "assets", id);
  switch (kind) {
    case "skill":    return { dir, file: "SKILL.md" };
    case "command":
    case "workflow": return { dir, file: "COMMAND.md" };
    case "rule":     return { dir, file: "RULE.md" };
  }
}

function writeAsset(asset: ImportedAsset, root: string, force?: boolean): boolean {
  const { dir, file } = assetPath(asset.kind, asset.id, root);
  const fullPath = join(dir, file);

  if (existsSync(fullPath) && !force) {
    p.log.warn(`"${asset.id}" already exists. Use --force to overwrite.`);
    return false;
  }

  mkdirSync(dir, { recursive: true });
  const frontmatter = renderClaudeAssetFrontmatter({ id: asset.id, kind: asset.kind });
  writeFileSync(fullPath, frontmatter + asset.body);
  p.log.success(`Imported ${chalk.bold(asset.id)} (${asset.kind}) → ${fullPath}`);
  return true;
}

export async function importAction(
  id: string | undefined,
  options: { all?: boolean; global?: boolean; force?: boolean; from?: string },
): Promise<void> {
  p.intro(chalk.bgCyan(chalk.black(` ${BRAND} import `)));

  const tool = (options.from ?? "claude-code") as ToolSource;
  if (!VALID_SOURCES.includes(tool)) {
    p.log.error(`Unknown source "${tool}". Valid: ${VALID_SOURCES.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  if (!id && !options.all) {
    p.log.error("Provide an asset id or use --all to import everything from the source.");
    process.exitCode = 1;
    return;
  }

  const path = sourcePath(tool, options.global);
  const root = options.global ? globalConfigDir() : process.cwd();

  if (options.all) {
    const assets = listAssets(tool, options.global);
    if (assets.length === 0) {
      p.log.warn(`No assets found at ${path}`);
      return;
    }
    let count = 0;
    for (const asset of assets) {
      if (writeAsset(asset, root, options.force)) count++;
    }
    p.outro(chalk.green(`Imported ${count}/${assets.length} asset(s). Run ${chalk.bold("coactl sync")} to generate files for other tools.`));
  } else {
    const assets = listAssets(tool, options.global);
    const asset = assets.find((a) => a.id === id);
    if (!asset) {
      p.log.error(`"${id}" not found in ${tool} at ${path}`);
      process.exitCode = 1;
      return;
    }
    const ok = writeAsset(asset, root, options.force);
    if (ok) {
      p.outro(chalk.green(`Done. Run ${chalk.bold("coactl sync")} to generate files for other tools.`));
    } else {
      process.exitCode = 1;
    }
  }
}
