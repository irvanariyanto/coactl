import chalk from "chalk";
import { buildSourceLoaders } from "../../sources/registry-of-sources.js";
import { resolveRegistry } from "../../registry/resolve.js";
import { transform } from "../../transform/engine.js";
import { loadManifest } from "../../schema/load.js";
import { capabilityFor } from "../../adapters/capability-matrix.js";
import { createTable, printHeader } from "../../ui/output.js";
import { resolveManifestPath } from "../../io/global-paths.js";

export async function explainAction(id: string, options: { json?: boolean; global?: boolean; project?: boolean }): Promise<void> {
  if (!options.json) printHeader(`explain ${id}`);

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

    const rows = resolved.asset.targets.map((target) => {
      const capability = capabilityFor(target, resolved.asset.kind);
      let paths: string[] = [];
      let notes = "";
      if (capability !== "skip") {
        try {
          const result = transform(registry, manifest, { targets: [target], kinds: [resolved.asset.kind] });
          paths = result.files.filter((f) => f.assetId === id).map((f) => f.path);
          notes = result.diagnostics
            .filter((d) => d.assetId === id && d.target === target)
            .map((d) => d.message)
            .join("; ");
        } catch { notes = "adapter error"; }
      } else {
        notes = "not supported — skipped";
      }
      return { target, capability, paths, notes };
    });

    if (options.json) {
      console.log(JSON.stringify({ id, kind: resolved.asset.kind, targets: rows }, null, 2));
      return;
    }

    const table = createTable(["Target", "Capability", "Output Path(s)", "Notes"]);
    for (const row of rows) {
      const cap = row.capability === "native" ? chalk.green(row.capability) :
        row.capability === "degraded" ? chalk.yellow(row.capability) : chalk.dim(row.capability);
      table.push([row.target, cap, row.paths.join("\n") || chalk.dim("—"), chalk.dim(row.notes)]);
    }
    console.log(table.toString());
  } catch (err) {
    console.error(chalk.red(`explain failed: ${(err as Error).message}`));
    process.exitCode = 1;
  }
}
