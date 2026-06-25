import * as p from "@clack/prompts";
import chalk from "chalk";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { renderClaudeAssetFrontmatter } from "../../scaffold/templates.js";
import {
  aiderConfigDir,
  antigravityConfigDir,
  clineConfigDir,
  codexConfigDir,
  continueConfigDir,
  geminiConfigDir,
  globalConfigDir,
  jetbrainsConfigDir,
  opencodeConfigDir,
  rooCodeConfigDir,
  zedConfigDir,
} from "../../io/global-paths.js";
import { BRAND } from "../../tui/theme.js";
import type { AssetKind } from "../../schema/index.js";
import { detectInstalledTargets } from "../../tools/detect.js";

export type ToolSource =
  | "claude-code"
  | "codex"
  | "antigravity"
  | "gemini"
  | "cline"
  | "roo-code"
  | "continue"
  | "aider"
  | "opencode"
  | "zed"
  | "jetbrains"
  | "cursor"
  | "windsurf"
  | "copilot";
const VALID_SOURCES: ToolSource[] = [
  "claude-code",
  "codex",
  "antigravity",
  "gemini",
  "cline",
  "roo-code",
  "continue",
  "aider",
  "opencode",
  "zed",
  "jetbrains",
  "cursor",
  "windsurf",
  "copilot",
];

function installedToolSources(): ToolSource[] {
  return detectInstalledTargets().filter((target): target is ToolSource =>
    VALID_SOURCES.includes(target as ToolSource),
  );
}

export interface ImportedAsset {
  id: string;
  kind: AssetKind;
  body: string;
  description?: string;
}

function sourcePath(tool: ToolSource, global?: boolean): string {
  const base = global ? homedir() : process.cwd();
  switch (tool) {
    case "claude-code": return join(base, ".claude");
    case "codex":       return global ? codexConfigDir() : process.cwd();
    case "antigravity": return global ? antigravityConfigDir() : process.cwd();
    case "gemini":      return global ? geminiConfigDir() : process.cwd();
    case "cline":       return global ? join(clineConfigDir(), "Rules") : join(process.cwd(), ".clinerules");
    case "roo-code":    return global ? join(rooCodeConfigDir(), "rules") : join(process.cwd(), ".roo", "rules");
    case "continue":    return global ? join(continueConfigDir(), "rules") : join(process.cwd(), ".continue", "rules");
    case "aider":       return global ? join(aiderConfigDir(), "CONVENTIONS.md") : join(process.cwd(), "CONVENTIONS.md");
    case "opencode":    return global ? opencodeConfigDir() : process.cwd();
    case "zed":         return global ? zedConfigDir() : process.cwd();
    case "jetbrains":   return global ? join(jetbrainsConfigDir(), "rules") : join(process.cwd(), ".aiassistant", "rules");
    case "cursor":      return join(base, ".cursor", "rules");
    case "windsurf":    return join(base, ".windsurfrules");
    case "copilot":     return join(base, ".github", "copilot-instructions.md");
  }
}

const SOURCE_REL: Record<ToolSource, string> = {
  "claude-code": ".claude/{skills,commands,rules}/",
  "codex": "AGENTS.md, .agents/skills/, CODEX_HOME/prompts/",
  "antigravity": "AGENTS.md, .antigravity/skills/, .antigravity/commands/",
  "gemini": "GEMINI.md, .gemini/skills/",
  "cline": ".clinerules/",
  "roo-code": ".roo/rules/",
  "continue": ".continue/rules/",
  "aider": "CONVENTIONS.md",
  "opencode": "AGENTS.md, .opencode/skills/",
  "zed": "AGENTS.md, .agents/skills/",
  "jetbrains": ".aiassistant/rules/",
  "cursor": ".cursor/rules/",
  "windsurf": ".windsurfrules",
  "copilot": ".github/copilot-instructions.md",
};

// Human-readable location hint, prefixed with ~/ for global scope and left
// cwd-relative for project scope — matching where sourcePath actually reads.
export function sourceHint(tool: ToolSource, global?: boolean): string {
  if (tool === "codex") {
    return global
      ? "~/.agents/skills/, CODEX_HOME/AGENTS.md, CODEX_HOME/prompts/"
      : ".agents/skills/, AGENTS.md";
  }
  if (tool === "antigravity") {
    return global
      ? "ANTIGRAVITY_HOME/skills/, ANTIGRAVITY_HOME/commands/, ANTIGRAVITY_HOME/AGENTS.md"
      : ".antigravity/skills/, .antigravity/commands/, AGENTS.md";
  }
  if (tool === "gemini") {
    return global ? "GEMINI_HOME/skills/, GEMINI_HOME/GEMINI.md" : ".gemini/skills/, GEMINI.md";
  }
  if (tool === "opencode") {
    return global ? "OPENCODE_HOME/skills/, OPENCODE_HOME/AGENTS.md" : ".opencode/skills/, AGENTS.md";
  }
  if (tool === "zed") {
    return global ? "ZED_HOME/skills/, ZED_HOME/AGENTS.md" : ".agents/skills/, AGENTS.md";
  }
  return (global ? "~/" : "") + SOURCE_REL[tool];
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

// Reads the description out of a YAML frontmatter block so importing a real skill/rule
// preserves its original description instead of falling back to a placeholder.
function extractDescription(content: string): string | undefined {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatter) return undefined;
  const m = frontmatter[1].match(/^description:\s*(.+)$/m);
  if (!m) return undefined;
  return m[1].trim().replace(/^["']|["']$/g, "");
}

function isWorkflowFrontmatter(content: string): boolean {
  return /^kind:\s*workflow\s*$/m.test(content);
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

function listSkillDir(skillsDir: string): ImportedAsset[] {
  if (!existsSync(skillsDir)) return [];
  const assets: ImportedAsset[] = [];
  for (const name of readdirSync(skillsDir)) {
    const dir = join(skillsDir, name);
    const file = join(dir, "SKILL.md");
    if (!existsSync(dir) || !statSync(dir).isDirectory() || !existsSync(file)) continue;
    const raw = readFileSync(file, "utf-8");
    assets.push({
      id: name,
      kind: "skill",
      body: stripCoactlHeader(stripYamlFrontmatter(raw)),
      description: extractDescription(raw),
    });
  }
  return assets;
}

function listMarkdownRuleDir(rulesDir: string, kind: AssetKind = "rule"): ImportedAsset[] {
  if (!existsSync(rulesDir)) return [];
  return readdirSync(rulesDir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const raw = readFileSync(join(rulesDir, file), "utf-8");
      return {
        id: basename(file, ".md"),
        kind,
        body: stripCoactlHeader(stripYamlFrontmatter(raw)),
        description: extractDescription(raw),
      };
    });
}

function listAggregateRule(filePath: string, fallbackId: string): ImportedAsset[] {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf-8");
  const blocks = extractCoactlBlocks(raw);
  if (blocks.length > 0) return blocks.map((block) => ({ ...block, kind: "rule" as AssetKind }));
  return raw.trim().length > 0 ? [{ id: fallbackId, kind: "rule", body: raw.trimStart() }] : [];
}

export function listAssets(tool: ToolSource, global?: boolean): ImportedAsset[] {
  const path = sourcePath(tool, global);

  if (tool === "claude-code") {
    const assets: ImportedAsset[] = [];

    const skillsDir = join(path, "skills");
    if (existsSync(skillsDir)) {
      // statSync (not Dirent.isDirectory) so symlinked skill dirs — e.g. plugin-installed
      // skills — are detected; Dirent.isDirectory() ignores what a symlink points to.
      // existsSync first since a dangling symlink would otherwise throw in statSync.
      for (const name of readdirSync(skillsDir)) {
        const dir = join(skillsDir, name);
        const file = join(dir, "SKILL.md");
        if (!existsSync(dir) || !statSync(dir).isDirectory() || !existsSync(file)) continue;
        const raw = readFileSync(file, "utf-8");
        // Coactl-generated Claude files place their drift header after frontmatter.
        // Strip both layers so re-importing a generated asset preserves only its body.
        assets.push({ id: name, kind: "skill", body: stripCoactlHeader(stripYamlFrontmatter(raw)), description: extractDescription(raw) });
      }
    }

    // Commands and workflows both land in .claude/commands/{id}.md (flat files, no
    // subdirectory) — only the "kind: workflow" frontmatter field tells them apart.
    const commandsDir = join(path, "commands");
    if (existsSync(commandsDir)) {
      for (const file of readdirSync(commandsDir)) {
        if (!file.endsWith(".md")) continue;
        const raw = readFileSync(join(commandsDir, file), "utf-8");
        const kind: AssetKind = isWorkflowFrontmatter(raw) ? "workflow" : "command";
        assets.push({ id: basename(file, ".md"), kind, body: stripCoactlHeader(stripYamlFrontmatter(raw)), description: extractDescription(raw) });
      }
    }

    const rulesDir = join(path, "rules");
    if (existsSync(rulesDir)) {
      for (const file of readdirSync(rulesDir)) {
        if (!file.endsWith(".md")) continue;
        const raw = readFileSync(join(rulesDir, file), "utf-8");
        assets.push({ id: basename(file, ".md"), kind: "rule", body: stripCoactlHeader(stripYamlFrontmatter(raw)), description: extractDescription(raw) });
      }
    }

    return assets;
  }

  if (tool === "codex") {
    const assets: ImportedAsset[] = [];
    const skillsDir = global
      ? join(homedir(), ".agents", "skills")
      : join(process.cwd(), ".agents", "skills");

    if (existsSync(skillsDir)) {
      for (const name of readdirSync(skillsDir)) {
        const dir = join(skillsDir, name);
        const file = join(dir, "SKILL.md");
        if (!existsSync(dir) || !statSync(dir).isDirectory() || !existsSync(file)) continue;
        const raw = readFileSync(file, "utf-8");
        assets.push({
          id: name,
          kind: "skill",
          body: stripCoactlHeader(stripYamlFrontmatter(raw)),
          description: extractDescription(raw),
        });
      }
    }

    const agentsFile = global ? join(codexConfigDir(), "AGENTS.md") : join(process.cwd(), "AGENTS.md");
    if (existsSync(agentsFile)) {
      const raw = readFileSync(agentsFile, "utf-8");
      const blocks = extractCoactlBlocks(raw);
      if (blocks.length > 0) {
        assets.push(...blocks.map((block) => ({ ...block, kind: "rule" as AssetKind })));
      } else if (raw.trim().length > 0) {
        assets.push({ id: "codex-agents", kind: "rule", body: raw.trimStart() });
      }
    }

    // Coactl only emits Codex prompts in global scope because project commands
    // are not supported by the current Codex adapter.
    const promptsDir = join(codexConfigDir(), "prompts");
    if (global && existsSync(promptsDir)) {
      for (const file of readdirSync(promptsDir)) {
        if (!file.endsWith(".md")) continue;
        const raw = readFileSync(join(promptsDir, file), "utf-8");
        assets.push({
          id: basename(file, ".md"),
          kind: "command",
          body: stripCoactlHeader(stripYamlFrontmatter(raw)),
          description: extractDescription(raw),
        });
      }
    }

    return assets;
  }

  if (tool === "antigravity") {
    const assets: ImportedAsset[] = [];
    const base = global ? antigravityConfigDir() : process.cwd();
    const skillsDir = global
      ? join(antigravityConfigDir(), "skills")
      : join(process.cwd(), ".antigravity", "skills");

    if (existsSync(skillsDir)) {
      for (const name of readdirSync(skillsDir)) {
        const dir = join(skillsDir, name);
        const file = join(dir, "SKILL.md");
        if (!existsSync(dir) || !statSync(dir).isDirectory() || !existsSync(file)) continue;
        const raw = readFileSync(file, "utf-8");
        assets.push({
          id: name,
          kind: "skill",
          body: stripCoactlHeader(stripYamlFrontmatter(raw)),
          description: extractDescription(raw),
        });
      }
    }

    const commandsDir = global
      ? join(antigravityConfigDir(), "commands")
      : join(process.cwd(), ".antigravity", "commands");
    if (existsSync(commandsDir)) {
      for (const file of readdirSync(commandsDir)) {
        if (!file.endsWith(".md")) continue;
        const raw = readFileSync(join(commandsDir, file), "utf-8");
        assets.push({
          id: basename(file, ".md"),
          kind: "command",
          body: stripCoactlHeader(stripYamlFrontmatter(raw)),
          description: extractDescription(raw),
        });
      }
    }

    const agentsFile = join(base, "AGENTS.md");
    if (existsSync(agentsFile)) {
      const raw = readFileSync(agentsFile, "utf-8");
      const blocks = extractCoactlBlocks(raw);
      if (blocks.length > 0) {
        assets.push(...blocks.map((block) => ({ ...block, kind: "rule" as AssetKind })));
      } else if (raw.trim().length > 0) {
        assets.push({ id: "antigravity-agents", kind: "rule", body: raw.trimStart() });
      }
    }

    return assets;
  }

  if (tool === "gemini") {
    const base = global ? geminiConfigDir() : process.cwd();
    return [
      ...listSkillDir(global ? join(geminiConfigDir(), "skills") : join(process.cwd(), ".gemini", "skills")),
      ...listAggregateRule(join(base, "GEMINI.md"), "gemini-instructions"),
    ];
  }

  if (tool === "cline") {
    return listMarkdownRuleDir(path, "rule");
  }

  if (tool === "roo-code") {
    return listMarkdownRuleDir(path, "rule");
  }

  if (tool === "continue") {
    return listMarkdownRuleDir(path, "rule");
  }

  if (tool === "aider") {
    return listAggregateRule(path, "aider-conventions");
  }

  if (tool === "opencode") {
    const base = global ? opencodeConfigDir() : process.cwd();
    return [
      ...listSkillDir(global ? join(opencodeConfigDir(), "skills") : join(process.cwd(), ".opencode", "skills")),
      ...listAggregateRule(join(base, "AGENTS.md"), "opencode-agents"),
    ];
  }

  if (tool === "zed") {
    const base = global ? zedConfigDir() : process.cwd();
    return [
      ...listSkillDir(global ? join(zedConfigDir(), "skills") : join(process.cwd(), ".agents", "skills")),
      ...listAggregateRule(join(base, "AGENTS.md"), "zed-agents"),
    ];
  }

  if (tool === "jetbrains") {
    return listMarkdownRuleDir(path, "rule");
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
          description: extractDescription(raw),
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

export function assetPath(kind: AssetKind, id: string, root: string): { dir: string; file: string } {
  switch (kind) {
    case "skill":    return { dir: join(root, "skills",    id), file: "SKILL.md" };
    case "command":  return { dir: join(root, "commands",  id), file: "COMMAND.md" };
    case "workflow": return { dir: join(root, "workflows", id), file: "WORKFLOW.md" };
    case "rule":     return { dir: join(root, "rules",     id), file: "RULE.md" };
  }
}

function writeAsset(asset: ImportedAsset, root: string, force?: boolean, includeCodexCommand = false): boolean {
  const { dir, file } = assetPath(asset.kind, asset.id, root);
  const fullPath = join(dir, file);

  if (existsSync(fullPath) && !force) {
    p.log.warn(`"${asset.id}" already exists. Use --force to overwrite.`);
    return false;
  }

  mkdirSync(dir, { recursive: true });
  const frontmatter = renderClaudeAssetFrontmatter({
    id: asset.id,
    kind: asset.kind,
    description: asset.description,
    includeCodexCommand,
  });
  writeFileSync(fullPath, frontmatter + asset.body);
  p.log.success(`Imported ${chalk.bold(asset.id)} (${asset.kind}) → ${fullPath}`);
  return true;
}

export async function importAction(
  id: string | undefined,
  options: { all?: boolean; global?: boolean; force?: boolean; from?: string },
): Promise<void> {
  p.intro(chalk.bgCyan(chalk.black(` ${BRAND} import `)));

  let tool: ToolSource | undefined;
  const installedTools = installedToolSources();
  if (options.from) {
    if (!VALID_SOURCES.includes(options.from as ToolSource)) {
      p.log.error(`Unknown source "${options.from}". Valid: ${VALID_SOURCES.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    tool = options.from as ToolSource;
  } else if (!id && !options.all) {
    if (installedTools.length === 0) {
      p.log.warn("No installed AI tools detected. Use --from <tool> to force an import source.");
      return;
    }
    const picked = await p.select({
      message: "Import from which tool?",
      options: installedTools.map((value) => ({ value, label: value, hint: `${sourceHint(value, options.global)} · installed` })),
    });
    if (p.isCancel(picked)) {
      p.cancel("Cancelled.");
      return;
    }
    tool = picked as ToolSource;
  }

  if (!tool && options.all) {
    if (installedTools.length === 0) {
      p.log.warn("No installed AI tools detected. Use --from <tool> to force an import source.");
      return;
    }
    const root = options.global ? globalConfigDir() : join(process.cwd(), ".coactl");
    let count = 0;
    let total = 0;
    for (const source of installedTools) {
      const assets = listAssets(source, options.global);
      total += assets.length;
      for (const asset of assets) {
        if (writeAsset(asset, root, options.force, options.global)) count++;
      }
    }
    if (total === 0) {
      p.log.warn(`No importable assets found in installed tools (${installedTools.join(", ")})`);
      return;
    }
    p.outro(chalk.green(`Imported ${count}/${total} asset(s) from ${installedTools.length} installed tool(s). Run ${chalk.bold("coactl sync")} to generate files for other tools.`));
    return;
  }

  if (!tool && id) {
    if (installedTools.length === 0) {
      p.log.warn("No installed AI tools detected. Use --from <tool> to force an import source.");
      return;
    }
    const root = options.global ? globalConfigDir() : join(process.cwd(), ".coactl");
    for (const source of installedTools) {
      const asset = listAssets(source, options.global).find((a) => a.id === id);
      if (!asset) continue;
      const ok = writeAsset(asset, root, options.force, options.global);
      if (ok) p.outro(chalk.green(`Imported from ${source}. Run ${chalk.bold("coactl sync")} to generate files for other tools.`));
      else process.exitCode = 1;
      return;
    }
    p.log.error(`"${id}" not found in installed tools (${installedTools.join(", ")})`);
    process.exitCode = 1;
    return;
  }

  if (!tool) {
    p.log.error("No import source selected.");
    process.exitCode = 1;
    return;
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
      if (writeAsset(asset, root, options.force, options.global)) count++;
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
    const ok = writeAsset(asset, root, options.force, options.global);
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
    if (writeAsset(asset, root, options.force, options.global)) count++;
  }
  p.outro(chalk.green(`Imported ${count}/${toImport.length} asset(s). Run ${chalk.bold("coactl sync")} to generate files for other tools.`));
}
