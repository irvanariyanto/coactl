import * as p from "@clack/prompts";
import chalk from "chalk";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse, stringify } from "yaml";
import { loadManifest } from "../../schema/load.js";
import { resolveScope } from "../../io/global-paths.js";
import { BRAND } from "../../tui/theme.js";
import type { AssetKind, Target } from "../../schema/index.js";
import type { SourceConfig } from "../../schema/manifest.js";

const KIND_DIRS: Array<{ subdir: string; file: string; kind: AssetKind }> = [
  { subdir: "skills", file: "SKILL.md", kind: "skill" },
  { subdir: "commands", file: "COMMAND.md", kind: "command" },
  { subdir: "workflows", file: "WORKFLOW.md", kind: "workflow" },
  { subdir: "rules", file: "RULE.md", kind: "rule" },
];

const TARGET_ORDER: Target[] = [
  "claude-code",
  "codex",
  "antigravity",
  "gemini",
  "cline",
  "roo-code",
  "continue",
  "aider",
  "opencode",
  "zed",
  "jetbrains",
  "cursor",
  "windsurf",
  "copilot",
];

interface MigrationCounts {
  updated: number;
  alreadyIncluded: number;
  skippedUnsupported: number;
  skippedNonCoactl: number;
  skippedInvalid: number;
  skippedReadOnlySources: number;
}

function splitFrontmatter(content: string): { fm: string; body: string } | null {
  const stripped = content.replace(/^<!--[\s\S]*?-->\n*/, "").trimStart();
  const match = stripped.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  return { fm: match[1], body: match[2] };
}

function sortTargets(targets: string[]): string[] {
  const unique = [...new Set(targets)];
  return TARGET_ORDER.filter((target) => unique.includes(target));
}

function supportsCodex(kind: AssetKind, scope: "global" | "project"): boolean {
  if (kind === "skill" || kind === "rule") return true;
  if (kind === "command") return scope === "global";
  return false;
}

function localSourceRoots(manifestPath: string, sources: SourceConfig[]): { roots: string[]; skippedReadOnlySources: number } {
  const manifestDir = dirname(resolve(manifestPath));
  const roots: string[] = [];
  let skippedReadOnlySources = 0;

  for (const source of sources) {
    if (source.type !== "local") {
      skippedReadOnlySources += 1;
      continue;
    }
    roots.push(resolve(manifestDir, source.path));
  }

  return { roots, skippedReadOnlySources };
}

function migrateFile(filePath: string, kind: AssetKind, scope: "global" | "project", counts: MigrationCounts): void {
  if (!supportsCodex(kind, scope)) {
    counts.skippedUnsupported += 1;
    return;
  }

  const raw = readFileSync(filePath, "utf-8");
  const parts = splitFrontmatter(raw);
  if (!parts) {
    counts.skippedNonCoactl += 1;
    return;
  }

  let frontmatter: unknown;
  try {
    frontmatter = parse(parts.fm);
  } catch {
    counts.skippedInvalid += 1;
    return;
  }

  if (!frontmatter || typeof frontmatter !== "object" || !("targets" in frontmatter)) {
    counts.skippedNonCoactl += 1;
    return;
  }

  const currentTargets = Array.isArray((frontmatter as { targets?: unknown }).targets)
    ? (frontmatter as { targets: unknown[] }).targets
    : undefined;

  if (!currentTargets || currentTargets.some((target) => typeof target !== "string")) {
    counts.skippedInvalid += 1;
    return;
  }

  if (currentTargets.includes("codex")) {
    counts.alreadyIncluded += 1;
    return;
  }

  const nextTargets = sortTargets([...currentTargets as string[], "codex"]);
  writeFileSync(
    filePath,
    `---\n${stringify({ ...(frontmatter as Record<string, unknown>), targets: nextTargets }).trimEnd()}\n---\n\n${parts.body.trimStart()}`,
    "utf-8",
  );
  counts.updated += 1;
}

export async function enableCodexAction(options: { global?: boolean; project?: boolean }): Promise<void> {
  p.intro(chalk.bgCyan(chalk.black(` ${BRAND} enable-codex `)));

  const { path: manifestPath, scope } = resolveScope(options);
  if (!existsSync(manifestPath)) {
    p.log.error(
      scope === "global"
        ? 'No global manifest found. Run "coactl init --global" first.'
        : `No project manifest found at ${manifestPath}. Run "coactl init" first.`,
    );
    process.exitCode = 1;
    return;
  }

  const manifest = loadManifest(manifestPath);
  const { roots, skippedReadOnlySources } = localSourceRoots(manifestPath, manifest.sources);
  const counts: MigrationCounts = {
    updated: 0,
    alreadyIncluded: 0,
    skippedUnsupported: 0,
    skippedNonCoactl: 0,
    skippedInvalid: 0,
    skippedReadOnlySources,
  };

  for (const root of roots) {
    for (const { subdir, file, kind } of KIND_DIRS) {
      const kindDir = join(root, subdir);
      if (!existsSync(kindDir)) continue;
      for (const entry of readdirSync(kindDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const filePath = join(kindDir, entry.name, file);
        if (!existsSync(filePath)) continue;
        migrateFile(filePath, kind, scope, counts);
      }
    }
  }

  if (counts.updated === 0) {
    p.log.warn("No asset targets changed.");
  } else {
    p.log.success(`Enabled Codex for ${chalk.bold(String(counts.updated))} compatible asset${counts.updated === 1 ? "" : "s"}.`);
  }

  if (counts.alreadyIncluded > 0) p.log.info(`${counts.alreadyIncluded} asset${counts.alreadyIncluded === 1 ? "" : "s"} already targeted Codex.`);
  if (counts.skippedUnsupported > 0) p.log.info(`${counts.skippedUnsupported} asset${counts.skippedUnsupported === 1 ? "" : "s"} skipped because Codex does not support that kind in ${scope} scope.`);
  if (counts.skippedReadOnlySources > 0) p.log.info(`${counts.skippedReadOnlySources} non-local source${counts.skippedReadOnlySources === 1 ? "" : "s"} skipped because automatic target updates only apply to local assets.`);
  if (counts.skippedNonCoactl > 0) p.log.info(`${counts.skippedNonCoactl} file${counts.skippedNonCoactl === 1 ? "" : "s"} skipped because they are not coactl-managed assets.`);
  if (counts.skippedInvalid > 0) p.log.warn(`${counts.skippedInvalid} file${counts.skippedInvalid === 1 ? "" : "s"} were skipped due to invalid frontmatter. Fix them manually and rerun the command.`);

  p.outro(chalk.green("Done."));
}
