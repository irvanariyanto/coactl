import { toolLabel, type Mode, type SkillTool } from "../nav";
import type { Workspace } from "../api";

interface Props {
  mode: Mode;
  tool: SkillTool;
  workspace: Workspace;
  onSelectSkills: () => void;
}

const KINDS = [
  { id: "skills", label: "Skills", enabled: true, blurb: "SKILL.md folders for this tool" },
  { id: "rules", label: "Rules", enabled: false, blurb: "Coming soon" },
  { id: "commands", label: "Commands", enabled: false, blurb: "Coming soon" },
  { id: "workflows", label: "Workflows", enabled: false, blurb: "Coming soon" },
] as const;

export function ResourcesView({ mode, tool, workspace, onSelectSkills }: Props) {
  const paths = workspace.skillPathsByTool[tool];
  const active = mode === "global" ? paths?.global : paths?.project;

  return (
    <section className="panel">
      <h2>
        {toolLabel(tool)} resources
        <span className={`badge scope-${mode}`}>{mode}</span>
      </h2>
      <p className="panel-sub">Choose a resource kind. Skills are available now.</p>
      {active && (
        <p className="path-banner">
          Active skills path{active.exists ? "" : " (not created yet)"}:{" "}
          <code>{active.path}</code>
        </p>
      )}
      {paths && (
        <div className="path-pair muted">
          <div>
            <span className={`badge scope-project ${paths.project.exists ? "" : ""}`}>project</span>{" "}
            <code className="path-line" style={{ display: "inline" }}>
              {paths.project.path}
            </code>
          </div>
          <div>
            <span className="badge scope-global">global</span>{" "}
            <code className="path-line" style={{ display: "inline" }}>
              {paths.global.path}
            </code>
          </div>
          {(paths.project.candidates.length > 1 || paths.global.candidates.length > 1) && (
            <div style={{ marginTop: "0.25rem", fontSize: "0.78rem" }}>
              <div>project candidates: {paths.project.candidates.join(" · ")}</div>
              <div>global candidates: {paths.global.candidates.join(" · ")}</div>
            </div>
          )}
        </div>
      )}
      <div className="tool-grid" style={{ marginTop: "1rem" }}>
        {KINDS.map((kind) => (
          <button
            key={kind.id}
            type="button"
            className="tool-card"
            disabled={!kind.enabled}
            onClick={() => {
              if (kind.id === "skills") onSelectSkills();
            }}
          >
            <span className="tool-card-head">
              <strong>{kind.label}</strong>
            </span>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {kind.blurb}
            </span>
            {kind.enabled && active && (
              <code className="path-line" title={active.path}>
                {active.path}
              </code>
            )}
            {!kind.enabled && (
              <span className="badge-row">
                <span className="badge">soon</span>
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
