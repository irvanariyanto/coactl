import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Target } from "../schema/index.js";

// Decision (PRD §11): --global and project assets are strictly separate targets.
// Project sync never touches global files and vice versa.
export function globalRootDir(): string {
  return homedir();
}

export function globalConfigDir(): string {
  return join(homedir(), ".config", "coactl");
}

export function globalManifestPath(): string {
  return join(globalConfigDir(), "agent.manifest.yaml");
}

export function globalAssetsDir(): string {
  return join(globalConfigDir(), "assets");
}

export function codexConfigDir(): string {
  return resolve(process.env.CODEX_HOME || join(homedir(), ".codex"));
}

export interface ManifestScopeOptions {
  global?: boolean;
  project?: boolean;
}

export interface ResolvedScope {
  path: string;
  scope: "global" | "project";
}

// Walks up from `startDir` looking for a project manifest, the same way eslint/tsconfig
// auto-discover config — so commands resolve correctly when run from a subdirectory.
export function findProjectManifest(startDir: string = process.cwd()): string | undefined {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, ".coactl", "agent.manifest.yaml");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

// Resolution order: --global forces the global manifest; --project forces project scope
// (still auto-discovered by walking up, but never falls back to global — so a missing
// manifest surfaces as a clear "file not found" instead of silently reading global state);
// with neither flag, auto-detect a project manifest and fall back to global when none exists.
export function resolveScope(options: ManifestScopeOptions = {}): ResolvedScope {
  if (options.global) return { path: globalManifestPath(), scope: "global" };
  const found = findProjectManifest();
  if (options.project) return { path: found ?? resolve(".coactl/agent.manifest.yaml"), scope: "project" };
  if (found) return { path: found, scope: "project" };
  return { path: globalManifestPath(), scope: "global" };
}

export function resolveManifestPath(options: ManifestScopeOptions = {}): string {
  return resolveScope(options).path;
}

// Lockfile lives alongside whichever manifest is in scope — install/update/dashboard
// must use this instead of the bare "./agent.lock.yaml" default, otherwise --global
// (or running from a project subdirectory) silently reads/writes the wrong lockfile.
export function resolveLockfilePath(options: ManifestScopeOptions = {}): string {
  return join(dirname(resolveManifestPath(options)), "agent.lock.yaml");
}

export function lockfilePathForManifest(manifestPath: string): string {
  return join(dirname(manifestPath), "agent.lock.yaml");
}

export function globalBasePath(target: Target): string {
  const home = homedir();
  switch (target) {
    case "claude-code": return join(home, ".claude");
    case "codex": return codexConfigDir();
    case "cursor": return join(home, ".cursor");
    case "windsurf": return home;
    case "copilot": return join(home, ".github");
  }
}
