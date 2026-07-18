import { useEffect, useRef, useState } from "react";
import type { Skill, Workspace } from "../api";
import { toolLabel, type Mode, type SkillTool } from "../nav";

interface Props {
  mode: Mode;
  tool: SkillTool;
  skills: Skill[];
  workspace: Workspace;
  busy: boolean;
  onOpen: (skill: Skill) => void;
  onCreate: (id: string) => Promise<void>;
}

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function SkillsListView({
  mode,
  tool,
  skills,
  workspace,
  busy,
  onOpen,
  onCreate,
}: Props) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState("");
  const idInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) idInputRef.current?.focus();
  }, [creating]);

  const folderInfo =
    mode === "global"
      ? workspace.skillPathsByTool[tool]?.global
      : workspace.skillPathsByTool[tool]?.project;
  const folder = folderInfo?.path;
  const createFolder = folderInfo?.preferred;

  const duplicateIds = new Set(
    skills.filter((s, i) => skills.some((o, j) => j !== i && o.id === s.id)).map((s) => s.id),
  );

  const q = query.trim().toLowerCase();
  const visible = q
    ? skills.filter(
        (s) =>
          s.id.toLowerCase().includes(q) ||
          (s.description ?? "").toLowerCase().includes(q) ||
          s.filePath.toLowerCase().includes(q),
      )
    : skills;

  const trimmedId = newId.trim();
  const idValid = !trimmedId || KEBAB.test(trimmedId);
  const idTaken = Boolean(trimmedId) && skills.some((s) => s.id === trimmedId && !s.readOnly);
  const canCreate = Boolean(trimmedId) && idValid && !idTaken && !busy;

  function submitCreate() {
    if (!canCreate) return;
    void onCreate(trimmedId).then(() => {
      setNewId("");
      setCreating(false);
    });
  }

  function cancelCreate() {
    setCreating(false);
    setNewId("");
  }

  return (
    <section className="panel">
      <div className="section-head">
        <h2>
          {toolLabel(tool)} skills
          <span className={`badge scope-${mode}`}>{mode}</span>
          <span className="muted" style={{ fontWeight: 400, fontSize: "0.85rem" }}>
            {skills.length} item{skills.length === 1 ? "" : "s"}
          </span>
        </h2>
        <div className="list-tools">
          {skills.length > 0 && (
            <input
              className="search-input"
              type="search"
              aria-label="Filter skills"
              placeholder="Filter…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          {!creating && (
            <button className="primary" type="button" onClick={() => setCreating(true)}>
              + New skill
            </button>
          )}
        </div>
      </div>

      {folder && (
        <p className="path-banner">
          Folder{folderInfo?.exists ? "" : " (will be created)"}: <code>{folder}</code>
        </p>
      )}
      {folderInfo && folderInfo.candidates.length > 1 && (
        <p className="muted" style={{ fontSize: "0.78rem", margin: "-0.5rem 0 0.9rem" }}>
          Scanned:{" "}
          {(folderInfo.candidateDetails ?? folderInfo.candidates.map((path) => ({ path, writable: true })))
            .map((c) => `${c.path}${c.writable ? "" : " (read-only)"}`)
            .join(" · ")}
        </p>
      )}

      {creating && (
        <div className="create-panel">
          <div className="create-panel-head">
            <strong>New skill</strong>
            <span className="muted" style={{ fontSize: "0.82rem" }}>
              Scaffolds <code>SKILL.md</code> in the native {mode} folder for {toolLabel(tool)}.
            </span>
          </div>
          <div className="create-panel-body">
            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <label htmlFor="new-skill-id">Id (kebab-case)</label>
              <input
                id="new-skill-id"
                ref={idInputRef}
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitCreate();
                  if (e.key === "Escape") cancelCreate();
                }}
                placeholder="review-pr"
              />
              {!idValid && (
                <span className="field-error">
                  Use lowercase letters, digits, and dashes (e.g. <code>review-pr</code>).
                </span>
              )}
              {idTaken && <span className="field-error">A skill with this id already exists here.</span>}
            </div>
            <div className="actions">
              <button className="primary" type="button" disabled={!canCreate} onClick={submitCreate}>
                Create skill
              </button>
              <button className="ghost" type="button" onClick={cancelCreate}>
                Cancel
              </button>
            </div>
          </div>
          {createFolder && (
            <code className="create-panel-path">
              {createFolder}/{trimmedId && idValid ? trimmedId : "<id>"}/SKILL.md
            </code>
          )}
        </div>
      )}

      {skills.length === 0 ? (
        <div className="empty">
          No skills yet for {toolLabel(tool)} in {mode} scope.
          <br />
          {!creating && (
            <button
              className="primary"
              type="button"
              style={{ marginTop: "0.9rem" }}
              onClick={() => setCreating(true)}
            >
              Create your first skill
            </button>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="empty">No skills match “{query.trim()}”.</div>
      ) : (
        <div className="skill-grid">
          {visible.map((row) => (
            <button
              key={row.filePath}
              type="button"
              className="skill-card"
              onClick={() => onOpen(row)}
            >
              <div className="skill-card-head">
                <strong>{row.id}</strong>
                {row.readOnly && <span className="badge warn">read-only</span>}
                {duplicateIds.has(row.id) && <span className="badge info">duplicate</span>}
              </div>
              <span className="skill-card-desc">{row.description || "No description."}</span>
              <code className="skill-card-path" title={row.filePath}>
                {truncateStart(row.filePath, 44)}
              </code>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Keep the informative tail of a path: "…agents/skills/foo/SKILL.md". */
function truncateStart(text: string, max: number): string {
  return text.length > max ? `…${text.slice(-(max - 1))}` : text;
}
