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

/**
 * Tools with native slash-command (or workflow-as-command) markdown files.
 * Codex / Gemini / Zed have no first-class commands dir in our matrix.
 */
export const COMMAND_TOOLS = ["claude-code", "cursor", "opencode", "antigravity"] as const;
export type CommandTool = (typeof COMMAND_TOOLS)[number];

export interface CommandRecord {
  id: string;
  tool: CommandTool;
  scope: ScopeMode;
  name: string;
  description: string;
  filePath: string;
  contents: string;
  body: string;
  /** Always md for slash commands / workflows. */
  extension: "md";
  /** Antigravity stores these under workflows/; others under commands/. */
  kind: "command" | "workflow";
  readOnly: boolean;
}

/**
 * Tools with Claude-style dynamic workflow scripts (JS orchestration).
 * Antigravity markdown workflows stay under Commands.
 */
export const WORKFLOW_TOOLS = ["claude-code"] as const;
export type WorkflowTool = (typeof WORKFLOW_TOOLS)[number];

export interface WorkflowRecord {
  id: string;
  tool: WorkflowTool;
  scope: ScopeMode;
  name: string;
  description: string;
  filePath: string;
  contents: string;
  /** Script body without the leading meta export (best-effort). */
  body: string;
  extension: "js";
  readOnly: boolean;
}
