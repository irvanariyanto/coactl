import * as p from "@clack/prompts";
import chalk from "chalk";
import { buildSourceLoaders } from "../../sources/registry-of-sources.js";
import { computeIntegrity } from "../../registry/integrity.js";
import { readLockfile, writeLockfile, upsertLockEntry } from "../../registry/lockfile.js";
import { createSpinner, printHeader } from "../../ui/output.js";
import { resolveManifestPath } from "../../io/global-paths.js";

export async function updateAction(options: { global?: boolean; project?: boolean }): Promise<void> {
  printHeader("update");

  const spinner = createSpinner("Loading lockfile and sources...").start();

  try {
    const lockfile = readLockfile();
    const ids = Object.keys(lockfile.assets);

    if (ids.length === 0) {
      spinner.stop();
      p.log.warn("No entries in lockfile — nothing to update.");
      return;
    }

    const loaders = buildSourceLoaders(resolveManifestPath(options));
    let changed = 0;
    let updated = lockfile;

    for (const id of ids) {
      const old = lockfile.assets[id];
      for (const loader of loaders) {
        const result = await loader.load();
        const match = result.assets.find((a) => a.asset.id === id);
        if (!match) continue;
        const newIntegrity = computeIntegrity(match.origin.dir);
        const newVersion = match.asset.version;
        if (newIntegrity !== old.integrity || newVersion !== old.version) {
          p.log.message(`${chalk.bold(id)}: ${chalk.dim(old.version ?? "?")} → ${chalk.cyan(newVersion ?? "?")} (integrity updated)`);
          updated = upsertLockEntry(updated, id, { source: match.sourceName, version: newVersion, integrity: newIntegrity });
          changed++;
        }
        break;
      }
    }

    writeLockfile(updated);
    spinner.stop();

    if (changed === 0) {
      p.log.message("All entries up to date.");
    } else {
      p.log.success(`Updated ${changed} entry/entries.`);
    }
  } catch (err) {
    spinner.stop();
    p.log.error(`Update failed: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}
