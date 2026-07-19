import { projectBasename } from "../recent-projects";

interface Props {
  root: string;
  recent: string[];
  onRootChange: (root: string) => void;
  onPickFolder: () => void;
  onSelectRecent: (path: string) => void;
  onForgetRecent: (path: string) => void;
  onContinue: () => void;
}

export function ProjectGateView({
  root,
  recent,
  onRootChange,
  onPickFolder,
  onSelectRecent,
  onForgetRecent,
  onContinue,
}: Props) {
  const others = recent.filter((p) => p !== root.trim());

  return (
    <section className="panel gate">
      <h2>Select a project</h2>
      <p className="panel-sub">
        Project mode scans a folder for tool configs (<code>.claude</code>, <code>.cursor</code>,{" "}
        <code>.agents</code>, …) and manages the skills inside it. Recent projects are remembered on
        this machine.
      </p>

      {recent.length > 0 && (
        <div className="recent-list" role="list" aria-label="Recent projects">
          {recent.map((path) => {
            const active = path === root.trim();
            return (
              <div key={path} className={`recent-row${active ? " active" : ""}`} role="listitem">
                <button
                  type="button"
                  className="recent-row-main"
                  onClick={() => onSelectRecent(path)}
                  title={path}
                >
                  <strong>{projectBasename(path)}</strong>
                  <code className="path-line">{path}</code>
                </button>
                <button
                  type="button"
                  className="ghost recent-forget"
                  aria-label={`Remove ${projectBasename(path)} from recent`}
                  title="Remove from recent"
                  onClick={() => onForgetRecent(path)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {others.length === 0 && recent.length > 0 && (
        <p className="muted" style={{ fontSize: "0.82rem", margin: "0 0 0.9rem" }}>
          Click a recent project to open it, or pick a new folder below.
        </p>
      )}

      <div className="field">
        <label htmlFor="project-root">{recent.length ? "Or enter another path" : "Project root"}</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id="project-root"
            value={root}
            onChange={(e) => onRootChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && root.trim()) onContinue();
            }}
            placeholder="/path/to/your/project"
            style={{ flex: 1 }}
            autoFocus={recent.length === 0}
          />
          <button type="button" onClick={onPickFolder}>
            Browse…
          </button>
        </div>
      </div>
      <div className="actions" style={{ marginTop: "1rem" }}>
        <button className="primary" type="button" disabled={!root.trim()} onClick={onContinue}>
          Continue to tools
        </button>
      </div>
    </section>
  );
}
