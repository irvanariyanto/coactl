export type Mode = "global" | "project";
export type SkillTool =
  | "claude-code"
  | "codex"
  | "cursor"
  | "antigravity"
  | "gemini"
  | "opencode"
  | "zed";

export type View =
  | { screen: "mode" }
  | { screen: "project-gate" }
  | { screen: "tools"; mode: Mode }
  | { screen: "resources"; mode: Mode; tool: SkillTool }
  | { screen: "skills"; mode: Mode; tool: SkillTool }
  | { screen: "skill"; mode: Mode; tool: SkillTool; id: string; path?: string };

export function modeToScope(mode: Mode): "global" | "project" {
  return mode;
}

export function toolLabel(tool: string): string {
  return tool
    .split("-")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}
