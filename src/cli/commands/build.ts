import * as p from "@clack/prompts";
import chalk from "chalk";
import { buildSourceLoaders } from "../../sources/registry-of-sources.js";
import { resolveRegistry } from "../../registry/resolve.js";
import { transform } from "../../transform/engine.js";
import { loadManifest } from "../../schema/load.js";
import { createSpinner, createTable, printHeader } from "../../ui/output.js";
import { resolveManifestPath } from "../../io/global-paths.js";
import type { Target, AssetKind } from "../../schema/index.js";

export async function buildAction(options: { target?: string; kind?: string; global?: boolean; project?: boolean }): Promise<void> {
  printHeader("build");

  if (!options.target) {
    p.log.error("--target is required");
    process.exitCode = 1;
    return;
  }

  const spinner = createSpinner("Loading manifest and sources...").start();

  try {
    const manifestPath = resolveManifestPath(options);
    const manifest = loadManifest(manifestPath);
    const loaders = buildSourceLoaders(manifestPath);

    const allLoaded = [];
    for (const loader of loaders) {
      const result = await loader.load();
      allLoaded.push(...result.assets);
      if (result.errors.length > 0) {
        for (const err of result.errors) {
          p.log.warn(`Failed to load asset from ${err.dir}: ${err.error.message}`);
        }
      }
    }

    const registry = resolveRegistry(allLoaded, manifest);
    const result = transform(registry, manifest, {
      targets: [options.target as Target],
      kinds: options.kind ? ([options.kind as AssetKind] as const) : undefined,
    });

    spinner.stop();

    p.log.step(`Found ${result.files.length} file(s) to emit for ${chalk.cyan(options.target)}`);

    if (result.files.length > 0) {
      const table = createTable(["Path", "Size", "Asset"]);
      for (const file of result.files) {
        table.push([
          file.path,
          `${(file.contents.length / 1024).toFixed(1)}KB`,
          file.assetId,
        ]);
      }
      console.log(table.toString());
    }

    if (result.diagnostics.length > 0) {
      p.log.warn(`${result.diagnostics.length} diagnostic(s):`);
      for (const diag of result.diagnostics) {
        const icon = diag.level === "warn" ? "⚠" : "ℹ";
        console.log(`${icon} ${chalk.yellow(diag.assetId)}: ${diag.message}`);
      }
    }

    p.outro(chalk.dim("(dry run — no files written)"));
  } catch (err) {
    spinner.stop();
    p.log.error(`Build failed: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}
