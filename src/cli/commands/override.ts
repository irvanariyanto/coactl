import * as p from "@clack/prompts";
import chalk from "chalk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, stringify } from "yaml";
import { buildSourceLoaders } from "../../sources/registry-of-sources.js";
import { resolveRegistry } from "../../registry/resolve.js";
import { loadManifest } from "../../schema/load.js";
import { resolveManifestPath } from "../../io/global-paths.js";
import { BRAND } from "../../tui/theme.js";

export async function overrideAction(id: string, options: { global?: boolean }): Promise<void> {
  p.intro(chalk.bgCyan(chalk.black(` ${BRAND} override `)));

  const manifestPath = resolve(resolveManifestPath(options.global));
  if (!existsSync(manifestPath)) {
    p.log.error(options.global ? "No global manifest found. Run coactl init --global first." : "No agent.manifest.yaml found in current directory.");
    process.exitCode = 1;
    return;
  }

  try {
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
      p.log.error(`Asset "${id}" not found in registry.`);
      process.exitCode = 1;
      return;
    }

    const fields = await p.multiselect({
      message: `Which fields to override for ${chalk.bold(id)}?`,
      options: [
        { value: "targets", label: "Targets", hint: resolved.asset.targets.join(", ") },
        { value: "scope", label: "Scope", hint: "languages/paths" },
        { value: "patch", label: "Patch body", hint: "replacement body file" },
      ],
      required: true,
    });

    if (p.isCancel(fields)) { p.cancel("Cancelled."); return; }

    const overrideBlock: Record<string, unknown> = {};
    const selected = fields as string[];
    if (selected.includes("targets")) overrideBlock.targets = resolved.asset.targets;
    if (selected.includes("scope")) overrideBlock.scope = resolved.asset.scope ?? {};
    if (selected.includes("patch")) overrideBlock.patch = `patches/${id}.md`;

    const raw = parse(readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
    if (!raw.overrides) raw.overrides = {};
    (raw.overrides as Record<string, unknown>)[id] = overrideBlock;
    writeFileSync(manifestPath, stringify(raw), "utf-8");

    p.log.success(`Scaffolded override block for ${chalk.bold(id)} in agent.manifest.yaml`);
    p.outro(chalk.green("Override added. Edit the block to customize values."));
  } catch (err) {
    p.log.error(`Override failed: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}
