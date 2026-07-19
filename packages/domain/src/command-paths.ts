import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { CommandTool, ScopeMode } from "./schema.js";
import { COMMAND_TOOLS } from "./schema.js";
import type { ToolDetectionOptions } from "./detect.js";
import type { SkillPathCandidate, ResolvedSkillPath } from "./skill-paths.js";

export type ResolvedCommandPath = Omit<ResolvedSkillPath, "tool"> & {
  tool: CommandTool;
  kind: "command" | "workflow";
};

export function commandKind(tool: CommandTool): "command" | "workflow" {
  return tool === "antigravity" ? "workflow" : "command";
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

/** Official / observed command (or workflow) directories. Preferred write first. */
export function commandPathCandidates(
  tool: CommandTool,
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
        return unique([join(root, ".claude", "commands")]);
      case "cursor":
        return unique([join(root, ".cursor", "commands")]);
      case "opencode":
        return unique([join(root, ".opencode", "commands")]);
      case "antigravity":
        return unique([join(root, ".agents", "workflows"), join(root, ".agent", "workflows")]);
    }
  }

  switch (tool) {
    case "claude-code":
      return unique([homePath(home, ".claude", "commands")]);
    case "cursor":
      return unique([homePath(home, ".cursor", "commands")]);
    case "opencode": {
      const fromEnv = env.OPENCODE_HOME ? join(resolve(env.OPENCODE_HOME), "commands") : null;
      return unique([
        ...(fromEnv ? [fromEnv] : []),
        homePath(home, ".config", "opencode", "commands"),
        homePath(home, ".opencode", "commands"),
      ]);
    }
    case "antigravity": {
      const agHome = resolve(env.ANTIGRAVITY_HOME || homePath(home, ".antigravity"));
      return unique([
        join(agHome, "workflows"),
        homePath(home, ".agents", "workflows"),
        homePath(home, ".agent", "workflows"),
      ]);
    }
  }
}

export function resolveCommandPath(
  tool: CommandTool,
  scope: ScopeMode,
  projectRoot: string,
  options: ToolDetectionOptions = {},
): ResolvedCommandPath {
  const candidates = commandPathCandidates(tool, scope, projectRoot, options);
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
    kind: commandKind(tool),
    preferred,
    candidates,
    candidateDetails,
    path: existing ?? preferred,
    exists: Boolean(existing),
  };
}

export function resolveAllCommandPaths(
  projectRoot: string,
  options: ToolDetectionOptions = {},
): Record<CommandTool, { project: ResolvedCommandPath; global: ResolvedCommandPath }> {
  return Object.fromEntries(
    COMMAND_TOOLS.map((tool) => [
      tool,
      {
        project: resolveCommandPath(tool, "project", projectRoot, options),
        global: resolveCommandPath(tool, "global", projectRoot, options),
      },
    ]),
  ) as Record<CommandTool, { project: ResolvedCommandPath; global: ResolvedCommandPath }>;
}

export function commandFilePath(dir: string, id: string): string {
  return join(dir, `${id}.md`);
}

export function supportsCommands(tool: string): tool is CommandTool {
  return (COMMAND_TOOLS as readonly string[]).includes(tool);
}
