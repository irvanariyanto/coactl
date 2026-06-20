import * as p from "@clack/prompts";
import chalk from "chalk";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { renderAssetYaml } from "../../scaffold/templates.js";
import { parseHeader } from "../../transform/header.js";
import { globalAssetsDir } from "../../io/global-paths.js";
import { BRAND } from "../../tui/theme.js";

function claudeSkillsDir(global?: boolean): string {
  return global ? join(homedir(), ".claude", "skills") : resolve(".claude", "skills");
}

function stripHeader(content: string): string {
  return content.replace(/^<!--\n[\s\S]*?-->\n/, "").trimStart();
}

async function importOne(id: string, skillsDir: string, assetsDir: string, force?: boolean): Promise<boolean> {
  const skillFile = join(skillsDir, id, "SKILL.md");
  if (!existsSync(skillFile)) {
    p.log.error(`Skill "${id}" not found at ${skillFile}`);
    return false;
  }

  const raw = readFileSync(skillFile, "utf-8");
  const hasHeader = parseHeader(raw) !== null;
  const body = hasHeader ? stripHeader(raw) : raw;

  const assetDir = join(assetsDir, id);
  if (existsSync(assetDir) && !force) {
    p.log.warn(`"${id}" already exists in assets. Use --force to overwrite.`);
    return false;
  }

  mkdirSync(assetDir, { recursive: true });
  writeFileSync(join(assetDir, "asset.yaml"), renderAssetYaml({ id, kind: "skill" }));
  writeFileSync(join(assetDir, "body.md"), body);

  p.log.success(`Imported ${chalk.bold(id)} → ${assetDir}`);
  return true;
}

export async function importAction(id: string | undefined, options: { all?: boolean; global?: boolean; force?: boolean }): Promise<void> {
  p.intro(chalk.bgCyan(chalk.black(` ${BRAND} import `)));

  if (!id && !options.all) {
    p.log.error("Provide a skill id or use --all to import all skills.");
    process.exitCode = 1;
    return;
  }

  const skillsDir = claudeSkillsDir(options.global);
  const assetsDir = options.global ? globalAssetsDir() : resolve("assets");

  if (!existsSync(skillsDir)) {
    p.log.error(`No skills directory found at ${skillsDir}`);
    process.exitCode = 1;
    return;
  }

  if (options.all) {
    const dirs = readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    if (dirs.length === 0) {
      p.log.warn("No skills found.");
      return;
    }

    let count = 0;
    for (const skillId of dirs) {
      if (await importOne(skillId, skillsDir, assetsDir, options.force)) count++;
    }
    p.outro(chalk.green(`Imported ${count}/${dirs.length} skill(s). Run ${chalk.bold("coactl sync")} to generate native files.`));
  } else {
    const ok = await importOne(id!, skillsDir, assetsDir, options.force);
    if (ok) {
      p.outro(chalk.green(`Done. Run ${chalk.bold("coactl sync")} to generate native files for other tools.`));
    } else {
      process.exitCode = 1;
    }
  }
}
