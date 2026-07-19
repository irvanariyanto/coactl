import type { ScopeMode, Workspace } from "./api";
import type { Mode, SkillTool } from "./nav";

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
