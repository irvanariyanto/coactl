export const SKILL_TOOLS = [
  "claude-code",
  "codex",
  "cursor",
  "antigravity",
  "gemini",
  "opencode",
  "zed",
] as const;

export type SkillTool = (typeof SKILL_TOOLS)[number];

export const SUPPORTED_TARGETS = [
  "claude-code",
  "codex",
  "antigravity",
  "gemini",
  "cline",
  "roo-code",
  "continue",
  "aider",
  "opencode",
  "zed",
  "jetbrains",
  "cursor",
  "windsurf",
  "copilot",
] as const;
export type Target = (typeof SUPPORTED_TARGETS)[number];

export type ScopeMode = "project" | "global";

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
}

export interface SkillRecord extends SkillMeta {
  tool: SkillTool;
  scope: ScopeMode;
  filePath: string;
  contents: string;
  body: string;
  /** True when the skill lives in a vendor-managed dir (list/import-from only). */
  readOnly: boolean;
}

/**
 * Tools with native rules / instruction files.
 * Same set as skill tools — each has a documented rules or AGENTS/GEMINI path.
 */
export const RULE_TOOLS = SKILL_TOOLS;
export type RuleTool = SkillTool;

/** Multi-file rule dirs vs single instruction files (AGENTS.md / GEMINI.md). */
export type RuleShape = "multi" | "singleton";

export interface RuleRecord {
  id: string;
  tool: RuleTool;
  scope: ScopeMode;
  /** Display title (from frontmatter description/name or id). */
  name: string;
  description: string;
  filePath: string;
  contents: string;
  body: string;
  /** File extension without dot: mdc | md */
  extension: "mdc" | "md";
  shape: RuleShape;
  readOnly: boolean;
}
