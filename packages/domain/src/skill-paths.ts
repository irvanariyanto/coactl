import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";
import type { ScopeMode, SkillTool } from "./schema.js";
import type { ToolDetectionOptions } from "./detect.js";

export interface SkillPathCandidate {
  path: string;
  exists: boolean;
  /** False for vendor-managed trees (e.g. skills-cursor): list/import-from only. */
  writable: boolean;
}

export interface ResolvedSkillPath {
  tool: SkillTool;
  scope: ScopeMode;
  /** Canonical location used for new writes when the skill does not exist yet. Always writable. */
  preferred: string;
  /** All locations scanned for existing skills (preferred first). */
  candidates: string[];
  /** Candidates with exists/writable metadata, same order as `candidates`. */
  candidateDetails: SkillPathCandidate[];
  /** First existing candidate, otherwise preferred. */
  path: string;
  exists: boolean;
}

/** Vendor-managed skill trees are readable/importable but never written to. */
export function isReadOnlySkillDir(dir: string): boolean {
  return basename(resolve(dir)) === "skills-cursor";
}

function homePath(home: string, ...parts: string[]): string {
  return join(home, ...parts);
}

function unique(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    const resolved = resolve(p);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

function firstExisting(paths: string[]): string | undefined {
  return paths.find((p) => {
    try {
      return existsSync(p);
    } catch {
      return false;
    }
  });
}

/**
 * Official / observed skill directories per tool.
 * Candidates are ordered: preferred write target first, then alternate valid sources.
 */
export function skillPathCandidates(
  tool: SkillTool,
  scope: ScopeMode,
  projectRoot: string,
  options: ToolDetectionOptions = {},
): string[] {
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const root = resolve(projectRoot);

  if (scope === "project") {
    switch (tool) {
      case "claude-code":
        return unique([join(root, ".claude", "skills")]);
      case "cursor":
        return unique([
          join(root, ".cursor", "skills"),
          join(root, ".cursor", "skills-cursor"),
        ]);
      case "codex":
        // Agent Skills standard in-repo; some setups also use .codex/skills
        return unique([join(root, ".agents", "skills"), join(root, ".codex", "skills")]);
      case "zed":
        return unique([join(root, ".agents", "skills")]);
      case "antigravity":
        return unique([join(root, ".antigravity", "skills")]);
      case "gemini":
        return unique([join(root, ".gemini", "skills")]);
      case "opencode":
        return unique([join(root, ".opencode", "skills")]);
    }
  }

  // global
  switch (tool) {
    case "claude-code":
      return unique([homePath(home, ".claude", "skills")]);
    case "cursor":
      return unique([
        homePath(home, ".cursor", "skills"),
        homePath(home, ".cursor", "skills-cursor"),
      ]);
    case "codex": {
      const codexHome = resolve(env.CODEX_HOME || homePath(home, ".codex"));
      return unique([
        join(codexHome, "skills"),
        homePath(home, ".codex", "skills"),
        homePath(home, ".agents", "skills"),
      ]);
    }
    case "zed": {
      const zedHome = resolve(env.ZED_HOME || homePath(home, ".config", "zed"));
      return unique([join(zedHome, "skills"), homePath(home, ".agents", "skills")]);
    }
    case "antigravity": {
      const agHome = resolve(env.ANTIGRAVITY_HOME || homePath(home, ".antigravity"));
      return unique([join(agHome, "skills")]);
    }
    case "gemini": {
      const geminiHome = resolve(env.GEMINI_HOME || homePath(home, ".gemini"));
      return unique([join(geminiHome, "skills")]);
    }
    case "opencode": {
      const fromEnv = env.OPENCODE_HOME ? join(resolve(env.OPENCODE_HOME), "skills") : null;
      return unique([
        ...(fromEnv ? [fromEnv] : []),
        homePath(home, ".opencode", "skills"),
        homePath(home, ".config", "opencode", "skills"),
      ]);
    }
  }
}

export function resolveSkillPath(
  tool: SkillTool,
  scope: ScopeMode,
  projectRoot: string,
  options: ToolDetectionOptions = {},
): ResolvedSkillPath {
  const candidates = skillPathCandidates(tool, scope, projectRoot, options);
  const writableCandidates = candidates.filter((c) => !isReadOnlySkillDir(c));
  const preferred = writableCandidates[0] ?? candidates[0]!;
  const existing = firstExisting(candidates);
  const candidateDetails: SkillPathCandidate[] = candidates.map((path) => ({
    path,
    exists: (() => {
      try {
        return existsSync(path);
      } catch {
        return false;
      }
    })(),
    writable: !isReadOnlySkillDir(path),
  }));
  return {
    tool,
    scope,
    preferred,
    candidates,
    candidateDetails,
    path: existing ?? preferred,
    exists: Boolean(existing),
  };
}

export function resolveAllSkillPaths(
  projectRoot: string,
  options: ToolDetectionOptions = {},
): Record<SkillTool, { project: ResolvedSkillPath; global: ResolvedSkillPath }> {
  const tools: SkillTool[] = [
    "claude-code",
    "codex",
    "cursor",
    "antigravity",
    "gemini",
    "opencode",
    "zed",
  ];
  return Object.fromEntries(
    tools.map((tool) => [
      tool,
      {
        project: resolveSkillPath(tool, "project", projectRoot, options),
        global: resolveSkillPath(tool, "global", projectRoot, options),
      },
    ]),
  ) as Record<SkillTool, { project: ResolvedSkillPath; global: ResolvedSkillPath }>;
}

/** Parent dirs that indicate a tool is configured inside a project. */
export function projectPresenceCandidates(tool: SkillTool, projectRoot: string): string[] {
  const root = resolve(projectRoot);
  switch (tool) {
    case "claude-code":
      return [join(root, ".claude"), join(root, ".claude", "skills")];
    case "cursor":
      return [
        join(root, ".cursor"),
        join(root, ".cursor", "skills"),
        join(root, ".cursor", "skills-cursor"),
      ];
    case "codex":
      return [
        join(root, ".agents"),
        join(root, ".agents", "skills"),
        join(root, ".codex"),
        join(root, ".codex", "skills"),
      ];
    case "zed":
      return [join(root, ".agents"), join(root, ".agents", "skills")];
    case "antigravity":
      return [join(root, ".antigravity"), join(root, ".antigravity", "skills")];
    case "gemini":
      return [join(root, ".gemini"), join(root, ".gemini", "skills")];
    case "opencode":
      return [join(root, ".opencode"), join(root, ".opencode", "skills")];
  }
}
