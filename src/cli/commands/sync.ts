import * as p from "@clack/prompts";
import chalk from "chalk";
import { buildSourceLoaders } from "../../sources/registry-of-sources.js";
import { resolveRegistry } from "../../registry/resolve.js";
import { transform } from "../../transform/engine.js";
import { loadManifest } from "../../schema/load.js";
import { writeFiles } from "../../io/write-files.js";
import { createSpinner, printHeader } from "../../ui/output.js";
import type { AssetKind, Target } from "../../schema/index.js";

export async function syncAction(options: { global?: boolean; kind?: string; target?: string }): Promise<void> {
  printHeader("sync");

  if (options.global) {
    p.log.warn("--global is not yet implemented (AC-022). Using project scope.");
  }

  const spinner = createSpinner("Loading manifest and sources...").start();

  try {
    const manifest = loadManifest("./agent.manifest.yaml");
    const loaders = buildSourceLoaders("./agent.manifest.yaml");

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
      targets: options.target ? ([options.target as Target] as const) : undefined,
      kinds: options.kind ? ([options.kind as AssetKind] as const) : undefined,
    });

    spinner.stop();

    if (result.files.length === 0) {
      p.log.warn("No files to write.");
      return;
    }

    const writSpinner = createSpinner(`Writing ${result.files.length} file(s)...`).start();
    const summary = writeFiles(result.files);
    writSpinner.stop();

    if (summary.written > 0) {
      p.log.success(`${chalk.green(summary.written)} file(s) written`);
    }
    if (summary.unchanged > 0) {
      p.log.message(`${chalk.dim(summary.unchanged)} file(s) unchanged`);
    }

    if (result.diagnostics.length > 0) {
      p.log.message(`${result.diagnostics.length} diagnostic(s):`);
      for (const diag of result.diagnostics) {
        const icon = diag.level === "warn" ? "⚠" : "ℹ";
        console.log(`${icon} ${chalk.yellow(diag.assetId)}: ${diag.message}`);
      }
    }

    if (summary.errors.length > 0) {
      p.log.error(`${summary.errors.length} error(s):`);
      for (const err of summary.errors) {
        console.log(`  ${chalk.red(err.path)}: ${err.error}`);
      }
      process.exitCode = 1;
    } else {
      p.outro(chalk.green("Sync completed."));
    }
  } catch (err) {
    spinner.stop();
    p.log.error(`Sync failed: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}
