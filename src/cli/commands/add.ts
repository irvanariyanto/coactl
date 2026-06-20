import * as p from "@clack/prompts";
import chalk from "chalk";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ASSET_KINDS } from "../../schema/index.js";
import { loadAsset } from "../../schema/load.js";
import { renderAssetYaml, renderBodyMd } from "../../scaffold/templates.js";
import { globalAssetsDir } from "../../io/global-paths.js";
import { BRAND } from "../../tui/theme.js";
import type { AssetKind } from "../../schema/index.js";

const KEBAB_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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

  const assetDir = options.global ? resolve(globalAssetsDir(), id) : resolve(process.cwd(), "assets", id);

  if (existsSync(assetDir) && !options.force) {
    p.log.error(`Asset "${id}" already exists at ${assetDir}. Use --force to overwrite.`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(assetDir, { recursive: true });
  writeFileSync(join(assetDir, "asset.yaml"), renderAssetYaml({ id, kind: kind as AssetKind }));
  writeFileSync(join(assetDir, "body.md"), renderBodyMd({ id, kind: kind as AssetKind }));

  try {
    loadAsset(assetDir);
  } catch (err) {
    p.log.error(`Scaffolded asset failed validation (template drift):\n${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  p.log.success(`Created ${chalk.cyan(kind)} asset: ${chalk.bold(id)}`);
  p.log.info(`Path: ${assetDir}`);
  p.outro(chalk.green("Done."));
}
