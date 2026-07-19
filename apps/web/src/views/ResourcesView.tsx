import { toolLabel, type Mode, type SkillTool } from "../nav";
import type { Workspace } from "../api";
import { PathCandidates } from "../components/PathCandidates";

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

/** Kept for Phase B deep links (`#/{mode}/{tool}`); primary flow soft-skips to Skills. */
export function ResourcesView({ mode, tool, workspace, onSelectSkills }: Props) {
  const paths = workspace.skillPathsByTool[tool];
  const active = mode === "global" ? paths?.global : paths?.project;

  return (
    <section className="panel">
      <h2>
        {toolLabel(tool)} resources
        <span className={`badge scope-${mode}`}>{mode}</span>
      </h2>
      <p className="panel-sub">
        Skills are available now. Other resource kinds will land here in a later phase — for daily
        use, open Skills directly from the tools list.
      </p>
      {active && <PathCandidates info={active} label="Active skills path" />}
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
