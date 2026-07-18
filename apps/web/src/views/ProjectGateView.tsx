interface Props {
  root: string;
  onRootChange: (root: string) => void;
  onPickFolder: () => void;
  onContinue: () => void;
}

export function ProjectGateView({ root, onRootChange, onPickFolder, onContinue }: Props) {
  return (
    <section className="panel gate">
      <h2>Select a project</h2>
      <p className="panel-sub">
        Project mode scans a folder for tool configs (<code>.claude</code>, <code>.cursor</code>,{" "}
        <code>.agents</code>, …) and manages the skills inside it.
      </p>
      <div className="field">
        <label htmlFor="project-root">Project root</label>
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
            autoFocus
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
