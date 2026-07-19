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

export type View =
  | { screen: "mode" }
  | { screen: "project-gate" }
  | { screen: "tools"; mode: Mode }
  | { screen: "resources"; mode: Mode; tool: SkillTool }
  | { screen: "skills"; mode: Mode; tool: SkillTool }
  | { screen: "skill"; mode: Mode; tool: SkillTool; id: string; path?: string }
  | { screen: "rules"; mode: Mode; tool: RuleTool }
  | { screen: "rule"; mode: Mode; tool: RuleTool; id: string; path?: string };

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
