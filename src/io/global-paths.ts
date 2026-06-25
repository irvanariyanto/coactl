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

export function antigravityConfigDir(): string {
  return resolve(process.env.ANTIGRAVITY_HOME || join(homedir(), ".antigravity"));
}

export function geminiConfigDir(): string {
  return resolve(process.env.GEMINI_HOME || join(homedir(), ".gemini"));
}

export function clineConfigDir(): string {
  return resolve(process.env.CLINE_HOME || join(homedir(), "Cline"));
}

export function rooCodeConfigDir(): string {
  return resolve(process.env.ROO_CODE_HOME || join(homedir(), ".roo"));
}

export function continueConfigDir(): string {
  return resolve(process.env.CONTINUE_HOME || join(homedir(), ".continue"));
}

export function aiderConfigDir(): string {
  return resolve(process.env.AIDER_HOME || join(homedir(), ".aider"));
}

export function opencodeConfigDir(): string {
  return resolve(process.env.OPENCODE_HOME || join(homedir(), ".config", "opencode"));
}

export function zedConfigDir(): string {
  return resolve(process.env.ZED_HOME || join(homedir(), ".config", "zed"));
}

export function jetbrainsConfigDir(): string {
  return resolve(process.env.JETBRAINS_AI_HOME || join(homedir(), ".aiassistant"));
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
    case "antigravity": return antigravityConfigDir();
    case "gemini": return geminiConfigDir();
    case "cline": return clineConfigDir();
    case "roo-code": return rooCodeConfigDir();
    case "continue": return continueConfigDir();
    case "aider": return aiderConfigDir();
    case "opencode": return opencodeConfigDir();
    case "zed": return zedConfigDir();
    case "jetbrains": return jetbrainsConfigDir();
    case "cursor": return join(home, ".cursor");
    case "windsurf": return home;
    case "copilot": return join(home, ".github");
  }
}
