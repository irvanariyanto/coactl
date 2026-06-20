import * as p from "@clack/prompts";
import chalk from "chalk";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stringify } from "yaml";
import { BRAND } from "../../tui/theme.js";

export async function initAction(options: { force?: boolean }): Promise<void> {
  p.intro(chalk.bgCyan(chalk.black(` ${BRAND} init `)));

  const manifestPath = resolve("./agent.manifest.yaml");

  if (existsSync(manifestPath) && !options.force) {
    const overwrite = await p.confirm({ message: "agent.manifest.yaml already exists. Overwrite?" });
    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel("Aborted.");
      return;
    }
  }

  const sourceName = await p.text({
    message: "Local source name",
    placeholder: "local",
    defaultValue: "local",
  });
  if (p.isCancel(sourceName)) { p.cancel("Aborted."); return; }

  const assetsPath = await p.text({
    message: "Assets directory path",
    placeholder: "./assets",
    defaultValue: "./assets",
  });
  if (p.isCancel(assetsPath)) { p.cancel("Aborted."); return; }

  const name = (sourceName as string) || "local";
  const path = (assetsPath as string) || "./assets";

  const manifest = {
    sources: [{ name, type: "local", path }],
    resolution: { precedence: [name] },
  };

  writeFileSync(manifestPath, stringify(manifest), "utf-8");
  p.log.success(`Created ${chalk.cyan("agent.manifest.yaml")}`);

  const absAssetsDir = resolve(path);
  if (!existsSync(absAssetsDir)) {
    mkdirSync(absAssetsDir, { recursive: true });
    p.log.success(`Created ${chalk.cyan(path + "/")}`);
  }

  p.outro(chalk.green(`Project ready. Run ${chalk.bold("coactl add --kind rule my-first-rule")} to scaffold your first asset.`));
}
