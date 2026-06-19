import * as p from "@clack/prompts";
import chalk from "chalk";
import { buildSourceLoaders } from "../../sources/registry-of-sources.js";
import { loadManifest } from "../../schema/load.js";
import { computeIntegrity } from "../../registry/integrity.js";
import { createSpinner, printHeader } from "../../ui/output.js";
import { BRAND } from "../../tui/theme.js";

export async function installAction(idAtVersion: string): Promise<void> {
  p.intro(chalk.bgCyan(chalk.black(` ${BRAND} install `)));
  printHeader("install");

  const [id, version] = idAtVersion.split("@");

  if (!id) {
    p.log.error("Usage: coactl install <id>[@<version>]");
    process.exitCode = 1;
    return;
  }

  const spinner = createSpinner(`Searching sources for ${chalk.bold(id)}...`).start();

  try {
    const manifest = loadManifest("./agent.manifest.yaml");
    const loaders = buildSourceLoaders("./agent.manifest.yaml");

    let foundAsset: { id: string; sourceName: string; dir: string; version?: string } | null = null;

    for (const loader of loaders) {
      const result = await loader.load();
      const match = result.assets.find((a) => a.asset.id === id);
      if (match) {
        foundAsset = {
          id: match.asset.id,
          sourceName: match.sourceName,
          dir: match.origin.dir,
          version: match.asset.version,
        };
        break;
      }
    }

    spinner.stop();

    if (!foundAsset) {
      p.log.error(`Asset "${id}" not found in any configured source.`);
      process.exitCode = 1;
      return;
    }

    const integrity = computeIntegrity(foundAsset.dir);
    p.log.success(`Found ${chalk.bold(id)} in source ${chalk.cyan(foundAsset.sourceName)}`);
    p.log.message(`Version:   ${chalk.dim(foundAsset.version ?? "unknown")}`);
    p.log.message(`Integrity: ${chalk.dim(integrity)}`);

    // TODO(AC-014): write lockfile entry { id, source, version, integrity }
    p.log.warn("Lockfile recording is not yet implemented (AC-014).");
    p.outro(chalk.green(`Installed ${chalk.bold(id)}.`));
  } catch (err) {
    spinner.stop();
    p.log.error(`Install failed: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}
