import type { Mode, SkillTool } from "../nav";
import { toolLabel } from "../nav";
import type { SkillPathInfo, SkillToolInfo, Workspace } from "../api";

interface Props {
  mode: Mode;
  workspace: Workspace;
  showAllInstalled: boolean;
  onShowAllInstalled: (value: boolean) => void;
  onSelectTool: (tool: SkillTool) => void;
}

const TOOL_INITIALS: Record<SkillTool, string> = {
  "claude-code": "CC",
  codex: "Cx",
  cursor: "Cu",
  antigravity: "Ag",
  gemini: "Ge",
  opencode: "Oc",
  zed: "Zd",
};

export function ToolsView({
  mode,
  workspace,
  showAllInstalled,
  onShowAllInstalled,
  onSelectTool,
}: Props) {
  const tools = visibleTools(mode, workspace, showAllInstalled);

  return (
    <section className="panel">
      <div className="section-head">
        <h2>{mode === "global" ? "Installed tools" : "Tools in this project"}</h2>
        {mode === "project" && (
          <label className="check-line">
            <input
              type="checkbox"
              checked={showAllInstalled}
              onChange={(e) => onShowAllInstalled(e.target.checked)}
            />
            Show all installed
          </label>
        )}
      </div>
      <p className="panel-sub">
        Paths are resolved from each tool&apos;s real skill directories — the existing location is
        preferred.
      </p>
      <div className="tool-grid">
        {tools.map((tool) => {
          const count =
            mode === "global"
              ? workspace.toolSkillCounts[tool.target]?.global ?? 0
              : workspace.toolSkillCounts[tool.target]?.project ?? 0;
          const info =
            mode === "global"
              ? workspace.skillPathsByTool[tool.target]?.global
              : workspace.skillPathsByTool[tool.target]?.project;
          return (
            <button
              key={tool.target}
              type="button"
              className="tool-card"
              onClick={() => onSelectTool(tool.target)}
            >
              <span className="tool-card-head">
                <span className="tool-avatar" aria-hidden="true">
                  {TOOL_INITIALS[tool.target]}
                </span>
                <span>
                  <strong>{toolLabel(tool.target)}</strong>
                  <span className="tool-count" style={{ display: "block" }}>
                    {count} skill{count === 1 ? "" : "s"} · {mode}
                  </span>
                </span>
              </span>
              {info && <PathBlock info={info} />}
              <span className="badge-row">
                {tool.installed && <span className="badge clean">installed</span>}
                {tool.presentInProject && <span className="badge info">in project</span>}
                {info?.exists ? (
                  <span className="badge clean">path ok</span>
                ) : (
                  <span className="badge">path missing</span>
                )}
              </span>
            </button>
          );
        })}
        {tools.length === 0 && (
          <p className="empty">
            {mode === "project"
              ? "No tool folders found. Enable “Show all installed” or add .claude / .cursor in the project."
              : "No skill-capable tools detected on this machine."}
          </p>
        )}
      </div>
    </section>
  );
}

function PathBlock({ info }: { info: SkillPathInfo }) {
  return (
    <>
      <code className="path-line" title={info.path}>
        {info.path}
      </code>
      {info.candidates.length > 1 && (
        <span className="muted" style={{ fontSize: "0.72rem" }}>
          also checks: {info.candidates.filter((c) => c !== info.path).join(" · ")}
        </span>
      )}
    </>
  );
}

function visibleTools(
  mode: Mode,
  workspace: Workspace,
  showAllInstalled: boolean,
): SkillToolInfo[] {
  if (mode === "global") {
    return workspace.skillTools.filter((t) => t.installed);
  }
  if (showAllInstalled) {
    return workspace.skillTools.filter((t) => t.installed || t.presentInProject);
  }
  const present = workspace.skillTools.filter((t) => t.presentInProject);
  return present.length ? present : workspace.skillTools.filter((t) => t.installed);
}
