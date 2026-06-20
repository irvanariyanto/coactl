import chalk from "chalk";
import { buildSourceLoaders } from "../../sources/registry-of-sources.js";
import { resolveRegistry } from "../../registry/resolve.js";
import { loadManifest } from "../../schema/load.js";
import { transform } from "../../transform/engine.js";
import { checkDrift } from "../../registry/drift.js";
import { createSpinner, createTable, printHeader } from "../../ui/output.js";
import { resolveManifestPath } from "../../io/global-paths.js";

export async function statusAction(options: { json?: boolean; global?: boolean; project?: boolean }): Promise<void> {
  if (!options.json) printHeader("status");

  const spinner = createSpinner("Checking registry drift...").start();

  try {
    const manifestPath = resolveManifestPath(options);
    const manifest = loadManifest(manifestPath);
    const loaders = buildSourceLoaders(manifestPath);
    const allLoaded = [];
    for (const loader of loaders) {
      const result = await loader.load();
      allLoaded.push(...result.assets);
    }

    const registry = resolveRegistry(allLoaded, manifest);
    const { files, diagnostics } = transform(registry, manifest);
    const drift = checkDrift(files);
    spinner.stop();

    const hasDrift = drift.some((d) => d.status !== "clean");

    if (options.json) {
      console.log(JSON.stringify({ drift, diagnostics }, null, 2));
    } else {
      const table = createTable(["Status", "Path", "Asset"]);
      for (const entry of drift) {
        const icon =
          entry.status === "clean" ? chalk.green("✓ clean") :
          entry.status === "modified" ? chalk.red("✗ modified") :
          entry.status === "stale" ? chalk.yellow("⚠ stale") :
          chalk.dim("? missing");
        table.push([icon, entry.path, entry.assetId]);
      }
      if (drift.length > 0) console.log(table.toString());
      else console.log(chalk.green("All files up to date."));

      if (diagnostics.length > 0) {
        console.log(`\n${chalk.dim(`${diagnostics.length} diagnostic(s):`)} `);
        for (const d of diagnostics) {
          console.log(`  ${d.level === "warn" ? "⚠" : "ℹ"} ${d.assetId} (${d.target}): ${d.message}`);
        }
      }
    }

    if (hasDrift) process.exitCode = 1;
  } catch (err) {
    spinner.stop();
    if (options.json) {
      console.log(JSON.stringify({ error: (err as Error).message }));
    } else {
      console.error(chalk.red(`Status failed: ${(err as Error).message}`));
    }
    process.exitCode = 1;
  }
}
