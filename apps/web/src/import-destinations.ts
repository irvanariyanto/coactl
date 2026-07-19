import type { CommandTool, RuleTool, ScopeMode, SkillTool, WorkflowTool, Workspace } from "./api";
import type { Mode } from "./nav";

export interface ImportDestination {
  key: string;
  tool: SkillTool;
  scope: ScopeMode;
  installed: boolean;
  path: string;
}

/**
 * All tools+scopes a skill can be imported into, excluding the source
 * tool+scope. Project destinations are hidden until a real project root is
 * set: their paths would resolve against the server cwd and mislead (A2).
 */
export function buildDestinations(
  sourceTool: SkillTool,
  sourceMode: Mode,
  workspace: Workspace,
  projectRootSet: boolean,
): ImportDestination[] {
  const scopes: ScopeMode[] = projectRootSet ? ["global", "project"] : ["global"];
  const out: ImportDestination[] = [];
  for (const t of workspace.skillTools.filter((x) => x.supportsSkills)) {
    for (const scope of scopes) {
      if (t.target === sourceTool && scope === sourceMode) continue;
      const info =
        scope === "project"
          ? workspace.skillPathsByTool[t.target]?.project
          : workspace.skillPathsByTool[t.target]?.global;
      out.push({
        key: `${t.target}:${scope}`,
        tool: t.target,
        scope,
        installed: t.installed,
        // Imports write to the preferred (always writable) location.
        path: info?.preferred ?? "",
      });
    }
  }
  return out;
}

/** Rule import targets are limited to tools with native rule dirs (cursor, claude-code). */
export function buildRuleDestinations(
  sourceTool: RuleTool,
  sourceMode: Mode,
  workspace: Workspace,
  projectRootSet: boolean,
): ImportDestination[] {
  const scopes: ScopeMode[] = projectRootSet ? ["global", "project"] : ["global"];
  const out: ImportDestination[] = [];
  for (const tool of workspace.ruleToolsAvailable) {
    for (const scope of scopes) {
      if (tool === sourceTool && scope === sourceMode) continue;
      const info =
        scope === "project"
          ? workspace.rulePathsByTool[tool]?.project
          : workspace.rulePathsByTool[tool]?.global;
      const skillInfo = workspace.skillTools.find((t) => t.target === tool);
      out.push({
        key: `${tool}:${scope}`,
        tool,
        scope,
        installed: skillInfo?.installed ?? false,
        path: info?.preferred ?? "",
      });
    }
  }
  return out;
}

/** Command import targets are limited to tools with native command dirs. */
export function buildCommandDestinations(
  sourceTool: CommandTool,
  sourceMode: Mode,
  workspace: Workspace,
  projectRootSet: boolean,
): ImportDestination[] {
  const scopes: ScopeMode[] = projectRootSet ? ["global", "project"] : ["global"];
  const out: ImportDestination[] = [];
  for (const tool of workspace.commandToolsAvailable) {
    for (const scope of scopes) {
      if (tool === sourceTool && scope === sourceMode) continue;
      const info =
        scope === "project"
          ? workspace.commandPathsByTool[tool]?.project
          : workspace.commandPathsByTool[tool]?.global;
      const skillInfo = workspace.skillTools.find((t) => t.target === tool);
      out.push({
        key: `${tool}:${scope}`,
        tool,
        scope,
        installed: skillInfo?.installed ?? false,
        path: info?.preferred ?? "",
      });
    }
  }
  return out;
}

/** Workflow import targets — claude-code only, so destinations are mainly cross-scope. */
export function buildWorkflowDestinations(
  sourceTool: WorkflowTool,
  sourceMode: Mode,
  workspace: Workspace,
  projectRootSet: boolean,
): ImportDestination[] {
  const scopes: ScopeMode[] = projectRootSet ? ["global", "project"] : ["global"];
  const out: ImportDestination[] = [];
  for (const tool of workspace.workflowToolsAvailable) {
    for (const scope of scopes) {
      if (tool === sourceTool && scope === sourceMode) continue;
      const info =
        scope === "project"
          ? workspace.workflowPathsByTool[tool]?.project
          : workspace.workflowPathsByTool[tool]?.global;
      const skillInfo = workspace.skillTools.find((t) => t.target === tool);
      out.push({
        key: `${tool}:${scope}`,
        tool,
        scope,
        installed: skillInfo?.installed ?? false,
        path: info?.preferred ?? "",
      });
    }
  }
  return out;
}
