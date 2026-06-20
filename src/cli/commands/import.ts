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
    case "cursor":      return join(homedir(), ".cursor", "rules");
    case "windsurf":    return join(homedir(), ".windsurfrules");
    case "copilot":     return join(homedir(), ".github", "copilot-instructions.md");
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
  switch (kind) {
    case "skill":    return { dir: join(root, "skills",    id), file: "SKILL.md" };
    case "command":  return { dir: join(root, "commands",  id), file: "COMMAND.md" };
    case "workflow": return { dir: join(root, "workflows", id), file: "WORKFLOW.md" };
    case "rule":     return { dir: join(root, "rules",     id), file: "RULE.md" };
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

  let tool: ToolSource;
  if (options.from) {
    if (!VALID_SOURCES.includes(options.from as ToolSource)) {
      p.log.error(`Unknown source "${options.from}". Valid: ${VALID_SOURCES.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    tool = options.from as ToolSource;
  } else if (!id && !options.all) {
    const picked = await p.select({
      message: "Import from which tool?",
      options: [
        { value: "claude-code", label: "Claude Code", hint: "~/.claude/skills/" },
        { value: "cursor",      label: "Cursor",      hint: ".cursor/rules/" },
        { value: "windsurf",    label: "Windsurf",    hint: ".windsurfrules" },
        { value: "copilot",     label: "Copilot",     hint: ".github/copilot-instructions.md" },
      ],
    });
    if (p.isCancel(picked)) {
      p.cancel("Cancelled.");
      return;
    }
    tool = picked as ToolSource;
  } else {
    tool = "claude-code";
  }

  const sourceLoc = sourcePath(tool, options.global);
  const root = options.global ? globalConfigDir() : join(process.cwd(), ".coactl");
  const assets = listAssets(tool, options.global);

  if (options.all) {
    if (assets.length === 0) {
      p.log.warn(`No assets found at ${sourceLoc}`);
      return;
    }
    let count = 0;
    for (const asset of assets) {
      if (writeAsset(asset, root, options.force)) count++;
    }
    p.outro(chalk.green(`Imported ${count}/${assets.length} asset(s). Run ${chalk.bold("coactl sync")} to generate files for other tools.`));
    return;
  }

  if (id) {
    const asset = assets.find((a) => a.id === id);
    if (!asset) {
      p.log.error(`"${id}" not found in ${tool} at ${sourceLoc}`);
      process.exitCode = 1;
      return;
    }
    const ok = writeAsset(asset, root, options.force);
    if (ok) {
      p.outro(chalk.green(`Done. Run ${chalk.bold("coactl sync")} to generate files for other tools.`));
    } else {
      process.exitCode = 1;
    }
    return;
  }

  // Interactive picker — no id or --all given
  if (assets.length === 0) {
    p.log.warn(`No assets found at ${sourceLoc}`);
    return;
  }

  const selected = await p.multiselect<string>({
    message: `Select assets to import from ${chalk.bold(tool)}:`,
    options: assets.map((a) => ({
      value: a.id,
      label: a.id,
      hint: a.kind,
    })),
  });

  if (p.isCancel(selected)) {
    p.cancel("Cancelled.");
    return;
  }

  const toImport = assets.filter((a) => selected.includes(a.id));
  let count = 0;
  for (const asset of toImport) {
    if (writeAsset(asset, root, options.force)) count++;
  }
  p.outro(chalk.green(`Imported ${count}/${toImport.length} asset(s). Run ${chalk.bold("coactl sync")} to generate files for other tools.`));
}
