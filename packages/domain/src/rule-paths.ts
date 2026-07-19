import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { RuleShape, RuleTool, ScopeMode } from "./schema.js";
import { RULE_TOOLS } from "./schema.js";
import type { ToolDetectionOptions } from "./detect.js";
import type { SkillPathCandidate, ResolvedSkillPath } from "./skill-paths.js";

export type ResolvedRulePath = Omit<ResolvedSkillPath, "tool"> & {
  tool: RuleTool;
  shape: RuleShape;
};

export function ruleShape(tool: RuleTool): RuleShape {
  switch (tool) {
    case "codex":
    case "zed":
    case "gemini":
      return "singleton";
    default:
      return "multi";
  }
}

/** Fixed id for singleton instruction files. */
export function singletonRuleId(tool: RuleTool): string {
  switch (tool) {
    case "gemini":
      return "gemini";
    case "codex":
    case "zed":
      return "agents";
    default:
      throw new Error(`Tool ${tool} is not a singleton rule tool`);
  }
}

/** Preferred write extension (without dot). */
export function ruleFileExtension(tool: RuleTool): "mdc" | "md" {
  return tool === "cursor" ? "mdc" : "md";
}

/** Extensions accepted when listing multi-file rule dirs. */
export function ruleListExtensions(tool: RuleTool): ReadonlyArray<"mdc" | "md"> {
  switch (tool) {
    case "cursor":
      return ["mdc"];
    case "claude-code":
      return ["md"];
    case "opencode":
    case "antigravity":
      return ["md", "mdc"];
    default:
      return ["md"];
  }
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
 * Rule locations per tool.
 * - multi: directory candidates (preferred write first)
 * - singleton: full file path candidates (AGENTS.md / GEMINI.md)
 */
export function rulePathCandidates(
  tool: RuleTool,
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
        return unique([join(root, ".claude", "rules")]);
      case "cursor":
        return unique([join(root, ".cursor", "rules")]);
      case "opencode":
        return unique([join(root, ".opencode", "rules")]);
      case "antigravity":
        // Preferred plural; legacy singular still scanned.
        return unique([join(root, ".agents", "rules"), join(root, ".agent", "rules")]);
      case "codex":
      case "zed":
        return unique([join(root, "AGENTS.md")]);
      case "gemini":
        return unique([join(root, "GEMINI.md")]);
    }
  }

  // global
  switch (tool) {
    case "claude-code":
      return unique([homePath(home, ".claude", "rules")]);
    case "cursor":
      return unique([homePath(home, ".cursor", "rules")]);
    case "opencode": {
      const fromEnv = env.OPENCODE_HOME ? join(resolve(env.OPENCODE_HOME), "rules") : null;
      return unique([
        ...(fromEnv ? [fromEnv] : []),
        homePath(home, ".config", "opencode", "rules"),
        homePath(home, ".opencode", "rules"),
      ]);
    }
    case "antigravity": {
      const agHome = resolve(env.ANTIGRAVITY_HOME || homePath(home, ".antigravity"));
      return unique([join(agHome, "rules"), homePath(home, ".agents", "rules")]);
    }
    case "codex": {
      const codexHome = resolve(env.CODEX_HOME || homePath(home, ".codex"));
      return unique([join(codexHome, "AGENTS.md")]);
    }
    case "zed": {
      const zedHome = resolve(env.ZED_HOME || homePath(home, ".config", "zed"));
      return unique([join(zedHome, "AGENTS.md")]);
    }
    case "gemini": {
      const geminiHome = resolve(env.GEMINI_HOME || homePath(home, ".gemini"));
      return unique([join(geminiHome, "GEMINI.md")]);
    }
  }
}

export function resolveRulePath(
  tool: RuleTool,
  scope: ScopeMode,
  projectRoot: string,
  options: ToolDetectionOptions = {},
): ResolvedRulePath {
  const candidates = rulePathCandidates(tool, scope, projectRoot, options);
  const preferred = candidates[0]!;
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
    writable: true,
  }));
  return {
    tool,
    scope,
    shape: ruleShape(tool),
    preferred,
    candidates,
    candidateDetails,
    path: existing ?? preferred,
    exists: Boolean(existing),
  };
}

export function resolveAllRulePaths(
  projectRoot: string,
  options: ToolDetectionOptions = {},
): Record<RuleTool, { project: ResolvedRulePath; global: ResolvedRulePath }> {
  return Object.fromEntries(
    RULE_TOOLS.map((tool) => [
      tool,
      {
        project: resolveRulePath(tool, "project", projectRoot, options),
        global: resolveRulePath(tool, "global", projectRoot, options),
      },
    ]),
  ) as Record<RuleTool, { project: ResolvedRulePath; global: ResolvedRulePath }>;
}

/** Absolute path for a rule write target. */
export function ruleFilePath(preferred: string, id: string, tool: RuleTool): string {
  if (ruleShape(tool) === "singleton") return preferred;
  return join(preferred, `${id}.${ruleFileExtension(tool)}`);
}

export function ruleLayoutInfo(tool: RuleTool): {
  shape: RuleShape;
  extension: "mdc" | "md";
  singletonId?: string;
  listExtensions: ReadonlyArray<"mdc" | "md">;
} {
  const shape = ruleShape(tool);
  return {
    shape,
    extension: ruleFileExtension(tool),
    singletonId: shape === "singleton" ? singletonRuleId(tool) : undefined,
    listExtensions: ruleListExtensions(tool),
  };
}
