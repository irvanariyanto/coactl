import * as p from "@clack/prompts";
import chalk from "chalk";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { stringify } from "yaml";
import { globalConfigDir, globalManifestPath } from "../../io/global-paths.js";
import { BRAND } from "../../tui/theme.js";

export async function initAction(options: { force?: boolean; global?: boolean }): Promise<void> {
  p.intro(chalk.bgCyan(chalk.black(` ${BRAND} init `)));

  const manifestPath = options.global ? globalManifestPath() : resolve(".coactl/agent.manifest.yaml");

  mkdirSync(dirname(manifestPath), { recursive: true });

  if (existsSync(manifestPath) && !options.force) {
    const overwrite = await p.confirm({ message: "agent.manifest.yaml already exists. Overwrite?" });
    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel("Aborted.");
      return;
    }
  }

  const interactive = process.stdin.isTTY;

  let sourceName = "local";
  let assetsPath = ".";

  if (interactive) {
    const nameInput = await p.text({ message: "Local source name", placeholder: "local", defaultValue: "local" });
    if (p.isCancel(nameInput)) { p.cancel("Aborted."); return; }
    const pathInput = await p.text({ message: "Assets directory path (relative to .coactl/)", placeholder: ".", defaultValue: "." });
    if (p.isCancel(pathInput)) { p.cancel("Aborted."); return; }
    sourceName = (nameInput as string) || "local";
    assetsPath = (pathInput as string) || ".";
  }

  const manifest = {
    sources: [{ name: sourceName, type: "local", path: assetsPath }],
    resolution: { precedence: [sourceName] },
  };

  writeFileSync(manifestPath, stringify(manifest), "utf-8");
  p.log.success(`Created ${chalk.cyan(options.global ? "agent.manifest.yaml" : ".coactl/agent.manifest.yaml")}`);

  const absAssetsDir = join(dirname(resolve(manifestPath)), assetsPath);
  if (!existsSync(absAssetsDir)) {
    for (const subdir of ["skills", "commands", "workflows", "rules"]) {
      mkdirSync(join(absAssetsDir, subdir), { recursive: true });
    }
    p.log.success(`Created ${chalk.cyan(assetsPath + "/")}`);
  }

  p.outro(chalk.green(`${options.global ? "Global config" : "Project"} ready. Run ${chalk.bold(`coactl add --kind rule my-first-rule${options.global ? " --global" : ""}`)} to scaffold your first asset.`));
}
