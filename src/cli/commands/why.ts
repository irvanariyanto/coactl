import chalk from "chalk";
import { buildSourceLoaders } from "../../sources/registry-of-sources.js";
import { resolveRegistry } from "../../registry/resolve.js";
import { loadManifest } from "../../schema/load.js";
import { createTable, printHeader } from "../../ui/output.js";
import { resolveManifestPath } from "../../io/global-paths.js";

export async function whyAction(id: string, options: { json?: boolean; global?: boolean }): Promise<void> {
  if (!options.json) printHeader(`why ${id}`);

  try {
    const manifestPath = resolveManifestPath(options.global);
    const manifest = loadManifest(manifestPath);
    const loaders = buildSourceLoaders(manifestPath);
    const allLoaded = [];
    for (const loader of loaders) {
      const result = await loader.load();
      allLoaded.push(...result.assets);
    }
    const registry = resolveRegistry(allLoaded, manifest);
    const resolved = registry.get(id);

    if (!resolved) {
      if (options.json) {
        console.log(JSON.stringify({ error: `Asset "${id}" not found` }));
      } else {
        console.error(chalk.red(`Asset "${id}" not found in registry.`));
      }
      process.exitCode = 1;
      return;
    }

    if (options.json) {
      console.log(JSON.stringify({
        id,
        winningSource: resolved.provenance.winningSource,
        candidates: resolved.provenance.candidates,
        targets: resolved.asset.targets,
        overrides: manifest.overrides?.[id] ?? null,
      }, null, 2));
      return;
    }

    const { winningSource, candidates } = resolved.provenance;
    const precedence = manifest.resolution.precedence;

    const table = createTable(["Rank", "Source", "Status"]);
    candidates.forEach((c, i) => {
      const rank = precedence.indexOf(c.sourceName);
      const rankStr = rank === -1 ? chalk.dim("unlisted") : String(rank + 1);
      const status = c.sourceName === winningSource ? chalk.green("winner") : chalk.dim("loser");
      table.push([rankStr, c.sourceName, status]);
    });
    console.log(table.toString());

    console.log(`\n${chalk.bold("Targets:")} ${resolved.asset.targets.join(", ")}`);

    const overrides = manifest.overrides?.[id];
    if (overrides) {
      const fields = Object.keys(overrides).join(", ");
      console.log(`${chalk.bold("Overrides applied:")} ${chalk.yellow(fields)}`);
    } else {
      console.log(chalk.dim("No overrides applied."));
    }
  } catch (err) {
    console.error(chalk.red(`why failed: ${(err as Error).message}`));
    process.exitCode = 1;
  }
}
