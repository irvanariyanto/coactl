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
  const current = root.trim();
  const others = recent.filter((p) => p !== current);

  return (
    <section className="panel gate">
      <h2>Select a project</h2>
      <p className="panel-sub">
        Project mode scans a folder for tool configs (<code>.claude</code>, <code>.cursor</code>,{" "}
        <code>.agents</code>, …) and manages the skills inside it.
      </p>

      {current ? (
        <div className="continue-card">
          <div className="continue-card-body">
            <span className="muted" style={{ fontSize: "0.78rem", fontWeight: 550 }}>
              Current project
            </span>
            <strong>{projectBasename(current)}</strong>
            <code className="path-line" title={current}>
              {current}
            </code>
          </div>
          <button className="primary" type="button" onClick={onContinue}>
            Continue
          </button>
        </div>
      ) : null}

      {others.length > 0 && (
        <>
          <h3 className="gate-section-label">Recent</h3>
          <div className="recent-list" role="list" aria-label="Recent projects">
            {others.map((path) => (
              <div key={path} className="recent-row" role="listitem">
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
            ))}
          </div>
        </>
      )}

      {!current && recent.length > 0 && (
        <div className="recent-list" role="list" aria-label="Recent projects">
          {recent.map((path) => (
            <div key={path} className="recent-row" role="listitem">
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
          ))}
        </div>
      )}

      <div className="field">
        <label htmlFor="project-root">{current || recent.length ? "Or choose another folder" : "Project root"}</label>
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
            autoFocus={!current}
          />
          <button type="button" onClick={onPickFolder}>
            Browse…
          </button>
        </div>
      </div>
      {!current && (
        <div className="actions" style={{ marginTop: "1rem" }}>
          <button className="primary" type="button" disabled={!root.trim()} onClick={onContinue}>
            Continue to tools
          </button>
        </div>
      )}
    </section>
  );
}
