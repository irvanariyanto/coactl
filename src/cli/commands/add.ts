import * as p from "@clack/prompts";
import chalk from "chalk";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ASSET_KINDS } from "../../schema/index.js";
import { loadClaudeFormat } from "../../schema/load.js";
import { renderClaudeAssetMd } from "../../scaffold/templates.js";
import { globalConfigDir } from "../../io/global-paths.js";
import { BRAND } from "../../tui/theme.js";
import type { AssetKind } from "../../schema/index.js";

const KEBAB_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function claudeAssetPath(kind: AssetKind, id: string, root: string): { dir: string; file: string } {
  switch (kind) {
    case "skill":    return { dir: join(root, "skills",    id), file: "SKILL.md" };
    case "command":  return { dir: join(root, "commands",  id), file: "COMMAND.md" };
    case "workflow": return { dir: join(root, "workflows", id), file: "WORKFLOW.md" };
    case "rule":     return { dir: join(root, "rules",     id), file: "RULE.md" };
  }
}

export async function addAction(id: string, options: { kind?: string; force?: boolean; global?: boolean }): Promise<void> {
  p.intro(chalk.bgCyan(chalk.black(` ${BRAND} add `)));

  if (!KEBAB_REGEX.test(id)) {
    p.log.error(`Invalid id "${id}" — must be kebab-case (e.g. my-asset)`);
    process.exitCode = 1;
    return;
  }

  let kind = options.kind;

  if (!kind) {
    const selected = await p.select({
      message: "What kind of asset?",
      options: [
        { value: "skill", label: "Skill", hint: "Triggered by file patterns or agent decisions" },
        { value: "command", label: "Command", hint: "Invoked explicitly, e.g. /review" },
        { value: "rule", label: "Rule", hint: "Always-on guidance" },
        { value: "workflow", label: "Workflow", hint: "Multi-step orchestration" },
      ],
    });
    if (p.isCancel(selected)) {
      p.cancel("Cancelled.");
      return;
    }
    kind = selected as string;
  }

  if (!ASSET_KINDS.includes(kind as AssetKind)) {
    p.log.error(`Invalid kind "${kind}" — must be one of: ${ASSET_KINDS.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const root = options.global ? globalConfigDir() : join(process.cwd(), ".coactl");
  const { dir, file } = claudeAssetPath(kind as AssetKind, id, root);
  const fullPath = join(dir, file);

  if (existsSync(fullPath) && !options.force) {
    p.log.error(`Asset "${id}" already exists at ${fullPath}. Use --force to overwrite.`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, renderClaudeAssetMd({ id, kind: kind as AssetKind }));

  try {
    const result = loadClaudeFormat(fullPath, id, kind as AssetKind);
    if (!result) throw new Error("File did not parse as a coactl asset (missing frontmatter or targets field)");
  } catch (err) {
    p.log.error(`Scaffolded asset failed validation (template drift):\n${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  p.log.success(`Created ${chalk.cyan(kind)} asset: ${chalk.bold(id)}`);
  p.log.info(`Path: ${fullPath}`);
  p.outro(chalk.green("Done."));
}
