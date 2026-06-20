import * as p from "@clack/prompts";
import chalk from "chalk";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { stringify } from "yaml";
import { globalManifestPath } from "../../io/global-paths.js";
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

  const manifest = {
    sources: [{ name: "local", type: "local", path: "." }],
    resolution: { precedence: ["local"] },
  };

  writeFileSync(manifestPath, stringify(manifest), "utf-8");
  p.log.success(`Created ${chalk.cyan(options.global ? "agent.manifest.yaml" : ".coactl/agent.manifest.yaml")}`);

  p.outro(chalk.green(`${options.global ? "Global config" : "Project"} ready. Run ${chalk.bold(`coactl add --kind rule my-first-rule${options.global ? " --global" : ""}`)} to scaffold your first asset.`));
}
