import * as p from "@clack/prompts";
import chalk from "chalk";
import { dirname, resolve } from "node:path";
import { buildSourceLoaders } from "../../sources/registry-of-sources.js";
import { resolveRegistry } from "../../registry/resolve.js";
import { transform } from "../../transform/engine.js";
import { loadManifest } from "../../schema/load.js";
import { pruneManagedOutputs, writeFiles } from "../../io/write-files.js";
import { globalRootDir, resolveScope } from "../../io/global-paths.js";
import { createSpinner, printHeader } from "../../ui/output.js";
import { SUPPORTED_TARGETS, type AssetKind, type Target } from "../../schema/index.js";

const TARGET_HINTS: Record<Target, string> = {
  "claude-code": ".claude/  (skills, commands, rules)",
  "codex": ".agents/skills/, AGENTS.md, CODEX_HOME/prompts/",
  "cursor": ".cursor/rules/  (.mdc files)",
  "windsurf": ".windsurfrules  (managed blocks)",
  "copilot": ".github/copilot-instructions.md  (managed blocks)",
};

export async function syncAction(options: {
  global?: boolean;
  project?: boolean;
  kind?: string;
  target?: string;
  strict?: boolean;
  prune?: boolean;
  dryRun?: boolean;
}): Promise<void> {
  printHeader("sync");

  const { path: manifestPath, scope } = resolveScope(options);
  const rootDir = scope === "global" ? globalRootDir() : dirname(dirname(resolve(manifestPath)));

  if (scope === "global" && !options.global) {
    if (process.stdout.isTTY) {
      const confirmed = await p.confirm({
        message: `No project manifest found. Sync to global scope (${globalRootDir()}) instead?`,
        initialValue: false,
      });
      if (p.isCancel(confirmed) || !confirmed) {
        p.cancel('Run "coactl init" to create a project manifest first.');
        return;
      }
    } else {
      p.log.error(`No project manifest found. Run "coactl init" to create one, or use --global to sync globally.`);
      process.exitCode = 1;
      return;
    }
  } else if (scope === "global") {
    p.log.message(`Syncing to global paths (${globalRootDir()})`);
  } else {
    p.log.message(`Syncing project at ${rootDir}`);
  }

  let selectedTargets: Target[] | undefined;

  if (!options.target && process.stdout.isTTY) {
    const picked = await p.multiselect<Target>({
      message: "Sync to which targets?",
      options: SUPPORTED_TARGETS.map((t) => ({
        value: t,
        label: t,
        hint: TARGET_HINTS[t],
      })),
      initialValues: [...SUPPORTED_TARGETS],
    });
    if (p.isCancel(picked)) {
      p.cancel("Cancelled.");
      return;
    }
    selectedTargets = picked as Target[];
    if (selectedTargets.length === 0) {
      p.log.warn("No targets selected.");
      return;
    }
  } else if (options.target) {
    selectedTargets = [options.target as Target];
  }

  const spinner = createSpinner("Loading manifest and sources...").start();

  try {
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
      targets: selectedTargets,
      kinds: options.kind ? ([options.kind as AssetKind] as const) : undefined,
      scope,
    });

    spinner.stop();

    if (result.files.length === 0 && !options.prune) {
      if (result.diagnostics.length > 0) {
        p.log.message(`${result.diagnostics.length} diagnostic(s):`);
        for (const diag of result.diagnostics) {
          const icon = diag.level === "warn" ? "⚠" : "ℹ";
          console.log(`${icon} ${chalk.yellow(diag.assetId)}: ${diag.message}`);
        }
      }
      if (options.strict && result.diagnostics.length > 0) {
        p.log.error("Strict sync failed: one or more selected assets are degraded or unsupported.");
        process.exitCode = 1;
      }
      p.log.warn("No files to write.");
      return;
    }

    const summary = options.dryRun
      ? { written: 0, unchanged: 0, errors: [] as Array<{ path: string; error: string }> }
      : (() => {
          const writeSpinner = createSpinner(`Writing ${result.files.length} file(s)...`).start();
          const writeSummary = writeFiles(result.files, rootDir);
          writeSpinner.stop();
          return writeSummary;
        })();

    // Group output by target
    const byTarget = new Map<string, typeof result.files>();
    for (const file of result.files) {
      const group = byTarget.get(file.target) ?? [];
      group.push(file);
      byTarget.set(file.target, group);
    }
    for (const [target, files] of byTarget) {
      console.log(`\n  ${chalk.bold(target)}  ${chalk.dim(`${files.length} file(s)`)}`);
      for (const file of files) {
        console.log(`    ${chalk.green("✓")} ${chalk.dim(file.assetId.padEnd(24))} ${chalk.cyan(file.path)}`);
      }
    }
    console.log();

    if (options.dryRun && result.files.length > 0) {
      p.log.message(`Dry run: ${result.files.length} file(s) would be written or updated`);
    } else if (summary.written > 0) {
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

    let pruneErrors: Array<{ path: string; error: string }> = [];
    if (options.prune) {
      // Pruning must consider every kind for the selected targets. Otherwise a filtered
      // sync such as `--kind rule --prune` would delete valid command or skill output.
      const expectedFiles = options.kind
        ? transform(registry, manifest, { targets: selectedTargets, scope }).files
        : result.files;
      const pruneSummary = pruneManagedOutputs(expectedFiles, {
        rootDir,
        scope,
        targets: selectedTargets ?? [...SUPPORTED_TARGETS],
        dryRun: options.dryRun,
      });
      pruneErrors = pruneSummary.errors;
      if (pruneSummary.pruned.length > 0) {
        const action = options.dryRun ? "would prune" : "pruned";
        p.log.message(`${action} ${pruneSummary.pruned.length} stale Coactl-managed output(s)`);
        for (const path of pruneSummary.pruned) console.log(`    ${chalk.dim(path)}`);
      }
    }

    const errors = [...summary.errors, ...pruneErrors];
    if (errors.length > 0) {
      p.log.error(`${errors.length} error(s):`);
      for (const err of errors) {
        console.log(`  ${chalk.red(err.path)}: ${err.error}`);
      }
      process.exitCode = 1;
    } else if (options.strict && result.diagnostics.length > 0) {
      p.log.error("Strict sync failed: one or more selected assets are degraded or unsupported.");
      process.exitCode = 1;
    } else if (options.dryRun) {
      p.outro(chalk.dim("Dry run completed."));
    } else {
      p.outro(chalk.green("Sync completed."));
    }
  } catch (err) {
    spinner.stop();
    p.log.error(`Sync failed: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}
