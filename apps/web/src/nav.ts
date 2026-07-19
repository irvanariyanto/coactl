export type Mode = "global" | "project";
export type SkillTool =
  | "claude-code"
  | "codex"
  | "cursor"
  | "antigravity"
  | "gemini"
  | "opencode"
  | "zed";

export type RuleTool = SkillTool;

export type CommandTool = "claude-code" | "cursor" | "opencode" | "antigravity";

export type WorkflowTool = "claude-code";

/** Top-level resource kinds shown in the Resources hub / kind switcher. */
export type ResourceKind = "skills" | "rules" | "commands" | "workflows";

export type View =
  | { screen: "mode" }
  | { screen: "project-gate" }
  | { screen: "tools"; mode: Mode }
  | { screen: "resources"; mode: Mode; tool: SkillTool }
  | { screen: "skills"; mode: Mode; tool: SkillTool }
  | { screen: "skill"; mode: Mode; tool: SkillTool; id: string; path?: string }
  | { screen: "rules"; mode: Mode; tool: RuleTool }
  | { screen: "rule"; mode: Mode; tool: RuleTool; id: string; path?: string }
  | { screen: "commands"; mode: Mode; tool: CommandTool }
  | { screen: "command"; mode: Mode; tool: CommandTool; id: string; path?: string }
  | { screen: "workflows"; mode: Mode; tool: WorkflowTool }
  | { screen: "workflow"; mode: Mode; tool: WorkflowTool; id: string; path?: string };

export function modeToScope(mode: Mode): "global" | "project" {
  return mode;
}

const TOOLS: readonly SkillTool[] = [
  "claude-code",
  "codex",
  "cursor",
  "antigravity",
  "gemini",
  "opencode",
  "zed",
];

/** Every skill-capable tool has a native rules / instructions location. */
export function supportsRules(tool: SkillTool): tool is RuleTool {
  return TOOLS.includes(tool);
}

const COMMAND_TOOLS: readonly CommandTool[] = ["claude-code", "cursor", "opencode", "antigravity"];

/** Tools with native slash-command (or workflow) markdown files. */
export function supportsCommands(tool: SkillTool): tool is CommandTool {
  return COMMAND_TOOLS.includes(tool as CommandTool);
}

/** Tools with Claude Code dynamic workflow scripts (.js under .claude/workflows/). */
export function supportsWorkflows(tool: SkillTool): tool is WorkflowTool {
  return tool === "claude-code";
}

export function availableResourceKinds(tool: SkillTool): ResourceKind[] {
  const kinds: ResourceKind[] = ["skills", "rules"];
  if (supportsCommands(tool)) kinds.push("commands");
  if (supportsWorkflows(tool)) kinds.push("workflows");
  return kinds;
}

export function resourceKindLabel(kind: ResourceKind): string {
  switch (kind) {
    case "skills":
      return "Skills";
    case "rules":
      return "Rules";
    case "commands":
      return "Commands";
    case "workflows":
      return "Workflows";
  }
}

/** List-screen View for a resource kind (never a detail screen). */
export function resourceKindListView(mode: Mode, tool: SkillTool, kind: ResourceKind): View {
  switch (kind) {
    case "skills":
      return { screen: "skills", mode, tool };
    case "rules":
      return { screen: "rules", mode, tool };
    case "commands":
      return { screen: "commands", mode, tool: tool as CommandTool };
    case "workflows":
      return { screen: "workflows", mode, tool: tool as WorkflowTool };
  }
}

export function viewResourceKind(view: View): ResourceKind | null {
  switch (view.screen) {
    case "skills":
    case "skill":
      return "skills";
    case "rules":
    case "rule":
      return "rules";
    case "commands":
    case "command":
      return "commands";
    case "workflows":
    case "workflow":
      return "workflows";
    case "resources":
      return null;
    default:
      return null;
  }
}

/** Serialize a view into a shareable URL hash (deep links survive refresh). */
export function viewToHash(view: View): string {
  switch (view.screen) {
    case "mode":
      return "#/";
    case "project-gate":
      return "#/project-setup";
    case "tools":
      return `#/${view.mode}`;
    case "resources":
      return `#/${view.mode}/${view.tool}`;
    case "skills":
      return `#/${view.mode}/${view.tool}/skills`;
    case "skill": {
      const base = `#/${view.mode}/${view.tool}/skills/${encodeURIComponent(view.id)}`;
      return view.path ? `${base}?path=${encodeURIComponent(view.path)}` : base;
    }
    case "rules":
      return `#/${view.mode}/${view.tool}/rules`;
    case "rule": {
      const base = `#/${view.mode}/${view.tool}/rules/${encodeURIComponent(view.id)}`;
      return view.path ? `${base}?path=${encodeURIComponent(view.path)}` : base;
    }
    case "commands":
      return `#/${view.mode}/${view.tool}/commands`;
    case "command": {
      const base = `#/${view.mode}/${view.tool}/commands/${encodeURIComponent(view.id)}`;
      return view.path ? `${base}?path=${encodeURIComponent(view.path)}` : base;
    }
    case "workflows":
      return `#/${view.mode}/${view.tool}/workflows`;
    case "workflow": {
      const base = `#/${view.mode}/${view.tool}/workflows/${encodeURIComponent(view.id)}`;
      return view.path ? `${base}?path=${encodeURIComponent(view.path)}` : base;
    }
  }
}

export function parseHash(hash: string): View | null {
  const raw = hash.replace(/^#/, "");
  if (!raw || raw === "/") return { screen: "mode" };
  const [pathPart = "", queryPart] = raw.split("?");
  const segs = pathPart.split("/").filter(Boolean);
  if (segs[0] === "project-setup") return { screen: "project-gate" };
  const mode = segs[0];
  if (mode !== "global" && mode !== "project") return null;
  if (segs.length === 1) return { screen: "tools", mode };
  const tool = segs[1] as SkillTool;
  if (!TOOLS.includes(tool)) return null;
  if (segs.length === 2) return { screen: "resources", mode, tool };
  const kind = segs[2];
  if (kind === "skills") {
    if (segs.length === 3) return { screen: "skills", mode, tool };
    const id = decodeURIComponent(segs[3]!);
    const path = new URLSearchParams(queryPart ?? "").get("path") ?? undefined;
    return { screen: "skill", mode, tool, id, path };
  }
  if (kind === "rules") {
    if (segs.length === 3) return { screen: "rules", mode, tool };
    const id = decodeURIComponent(segs[3]!);
    const path = new URLSearchParams(queryPart ?? "").get("path") ?? undefined;
    return { screen: "rule", mode, tool, id, path };
  }
  if (kind === "commands") {
    if (!supportsCommands(tool)) return null;
    if (segs.length === 3) return { screen: "commands", mode, tool };
    const id = decodeURIComponent(segs[3]!);
    const path = new URLSearchParams(queryPart ?? "").get("path") ?? undefined;
    return { screen: "command", mode, tool, id, path };
  }
  if (kind === "workflows") {
    if (!supportsWorkflows(tool)) return null;
    if (segs.length === 3) return { screen: "workflows", mode, tool };
    const id = decodeURIComponent(segs[3]!);
    const path = new URLSearchParams(queryPart ?? "").get("path") ?? undefined;
    return { screen: "workflow", mode, tool, id, path };
  }
  return null;
}

export function toolLabel(tool: string): string {
  return tool
    .split("-")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

export function formatRuleDestPath(
  dirOrFile: string,
  idHint: string,
  tool: SkillTool,
  layout?: { shape: "multi" | "singleton"; extension: "mdc" | "md" },
): string {
  if (layout?.shape === "singleton" || dirOrFile.endsWith(".md")) {
    return dirOrFile;
  }
  const ext = layout?.extension ?? (tool === "cursor" ? "mdc" : "md");
  return `${dirOrFile}/${idHint}.${ext}`;
}

export function formatCommandDestPath(dir: string, idHint: string): string {
  return `${dir}/${idHint}.md`;
}

export function formatWorkflowDestPath(dir: string, idHint: string): string {
  return `${dir}/${idHint}.js`;
}
