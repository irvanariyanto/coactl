import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { ScopeMode, WorkflowTool } from "./schema.js";
import { WORKFLOW_TOOLS } from "./schema.js";
import type { ToolDetectionOptions } from "./detect.js";
import type { SkillPathCandidate, ResolvedSkillPath } from "./skill-paths.js";

export type ResolvedWorkflowPath = Omit<ResolvedSkillPath, "tool"> & { tool: WorkflowTool };

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
 * Claude Code dynamic workflows:
 * - Project: `<root>/.claude/workflows/`
 * - Global: `$CLAUDE_CONFIG_DIR/workflows` or `~/.claude/workflows`
 */
export function workflowPathCandidates(
  tool: WorkflowTool,
  scope: ScopeMode,
  projectRoot: string,
  options: ToolDetectionOptions = {},
): string[] {
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const root = resolve(projectRoot);

  if (tool !== "claude-code") return [];

  if (scope === "project") {
    return unique([join(root, ".claude", "workflows")]);
  }

  const configDir = env.CLAUDE_CONFIG_DIR
    ? resolve(env.CLAUDE_CONFIG_DIR)
    : homePath(home, ".claude");
  return unique([join(configDir, "workflows"), homePath(home, ".claude", "workflows")]);
}

export function resolveWorkflowPath(
  tool: WorkflowTool,
  scope: ScopeMode,
  projectRoot: string,
  options: ToolDetectionOptions = {},
): ResolvedWorkflowPath {
  const candidates = workflowPathCandidates(tool, scope, projectRoot, options);
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
    preferred,
    candidates,
    candidateDetails,
    path: existing ?? preferred,
    exists: Boolean(existing),
  };
}

export function resolveAllWorkflowPaths(
  projectRoot: string,
  options: ToolDetectionOptions = {},
): Record<WorkflowTool, { project: ResolvedWorkflowPath; global: ResolvedWorkflowPath }> {
  return Object.fromEntries(
    WORKFLOW_TOOLS.map((tool) => [
      tool,
      {
        project: resolveWorkflowPath(tool, "project", projectRoot, options),
        global: resolveWorkflowPath(tool, "global", projectRoot, options),
      },
    ]),
  ) as Record<WorkflowTool, { project: ResolvedWorkflowPath; global: ResolvedWorkflowPath }>;
}

export function workflowFilePath(dir: string, id: string): string {
  return join(dir, `${id}.js`);
}

export function supportsWorkflows(tool: string): tool is WorkflowTool {
  return (WORKFLOW_TOOLS as readonly string[]).includes(tool);
}
