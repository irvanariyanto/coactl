import * as p from "@clack/prompts";
import chalk from "chalk";
import { buildSourceLoaders } from "../../sources/registry-of-sources.js";
import { loadManifest } from "../../schema/load.js";
import { computeIntegrity } from "../../registry/integrity.js";
import { readLockfile, writeLockfile, upsertLockEntry } from "../../registry/lockfile.js";
import { createSpinner, printHeader } from "../../ui/output.js";
import { resolveManifestPath } from "../../io/global-paths.js";
import { BRAND } from "../../tui/theme.js";

export async function installAction(idAtVersion: string, options: { global?: boolean; project?: boolean }): Promise<void> {
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
    const manifestPath = resolveManifestPath(options);
    const manifest = loadManifest(manifestPath);
    const loaders = buildSourceLoaders(manifestPath);

    let foundAsset: { id: string; sourceName: string; dir: string; version?: string } | null = null;

    for (const loader of loaders) {
      const result = await loader.load();
      const match = result.assets.find((a) => a.asset.id === id);
      if (match) {
        foundAsset = { id: match.asset.id, sourceName: match.sourceName, dir: match.origin.dir, version: match.asset.version };
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
    const lockfile = readLockfile();
    const updated = upsertLockEntry(lockfile, id, { source: foundAsset.sourceName, version: foundAsset.version, integrity });
    writeLockfile(updated);

    p.log.success(`Found ${chalk.bold(id)} in source ${chalk.cyan(foundAsset.sourceName)}`);
    p.log.message(`Version:   ${chalk.dim(foundAsset.version ?? "unknown")}`);
    p.log.message(`Integrity: ${chalk.dim(integrity)}`);
    p.outro(chalk.green(`Installed ${chalk.bold(id)} — lockfile updated.`));
  } catch (err) {
    spinner.stop();
    p.log.error(`Install failed: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}
