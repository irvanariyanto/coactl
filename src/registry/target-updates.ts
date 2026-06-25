import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse, stringify } from "yaml";
import { capabilityFor } from "../adapters/capability-matrix.js";
import { SUPPORTED_TARGETS, type AssetKind, type Target } from "../schema/index.js";
import type { Manifest, SourceConfig } from "../schema/index.js";

const KIND_DIRS: Array<{ subdir: string; file: string; kind: AssetKind }> = [
  { subdir: "skills", file: "SKILL.md", kind: "skill" },
  { subdir: "commands", file: "COMMAND.md", kind: "command" },
  { subdir: "workflows", file: "WORKFLOW.md", kind: "workflow" },
  { subdir: "rules", file: "RULE.md", kind: "rule" },
];

export interface TargetUpdateCounts {
  updated: number;
  alreadyEnabled: number;
  alreadyDisabled: number;
  skippedUnsupported: number;
  skippedNonCoactl: number;
  skippedInvalid: number;
  skippedReadOnlySources: number;
}

export interface TargetUpdateResult extends TargetUpdateCounts {
  targetCount: number;
}

function emptyCounts(skippedReadOnlySources = 0): TargetUpdateCounts {
  return {
    updated: 0,
    alreadyEnabled: 0,
    alreadyDisabled: 0,
    skippedUnsupported: 0,
    skippedNonCoactl: 0,
    skippedInvalid: 0,
    skippedReadOnlySources,
  };
}

function splitFrontmatter(content: string): { fm: string; body: string } | null {
  const stripped = content.replace(/^<!--[\s\S]*?-->\n*/, "").trimStart();
  const match = stripped.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  return { fm: match[1], body: match[2] };
}

function sortTargets(targets: string[]): string[] {
  const unique = [...new Set(targets)];
  return SUPPORTED_TARGETS.filter((target) => unique.includes(target));
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

function updateFileTargets(
  filePath: string,
  kind: AssetKind,
  scope: "global" | "project",
  targets: Target[],
  enable: boolean,
  counts: TargetUpdateCounts,
): void {
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

  let nextTargets = currentTargets as string[];
  let changed = false;

  for (const target of targets) {
    if (capabilityFor(target, kind, scope) === "skip") {
      counts.skippedUnsupported += 1;
      continue;
    }

    const hasTarget = nextTargets.includes(target);
    if (enable && hasTarget) {
      counts.alreadyEnabled += 1;
      continue;
    }
    if (!enable && !hasTarget) {
      counts.alreadyDisabled += 1;
      continue;
    }

    nextTargets = enable
      ? sortTargets([...nextTargets, target])
      : nextTargets.filter((existing) => existing !== target);
    changed = true;
  }

  if (!changed) return;

  writeFileSync(
    filePath,
    `---\n${stringify({ ...(frontmatter as Record<string, unknown>), targets: nextTargets }).trimEnd()}\n---\n\n${parts.body.trimStart()}`,
    "utf-8",
  );
  counts.updated += 1;
}

export function updateLocalAssetTargets(options: {
  manifestPath: string;
  manifest: Manifest;
  scope: "global" | "project";
  targets: Target[];
  enable: boolean;
}): TargetUpdateResult {
  const { roots, skippedReadOnlySources } = localSourceRoots(options.manifestPath, options.manifest.sources);
  const counts = emptyCounts(skippedReadOnlySources);

  for (const root of roots) {
    for (const { subdir, file, kind } of KIND_DIRS) {
      const kindDir = join(root, subdir);
      if (!existsSync(kindDir)) continue;
      for (const entry of readdirSync(kindDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const filePath = join(kindDir, entry.name, file);
        if (!existsSync(filePath)) continue;
        updateFileTargets(filePath, kind, options.scope, options.targets, options.enable, counts);
      }
    }
  }

  return { ...counts, targetCount: options.targets.length };
}
