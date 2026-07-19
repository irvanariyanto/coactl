import { useEffect, useRef, useState } from "react";
import type { ImportPlan, ImportResult, ScopeMode, Skill, Workspace } from "../api";
import { buildDestinations } from "../import-destinations";
import { toolLabel, type Mode, type SkillTool } from "../nav";

interface Props {
  mode: Mode;
  tool: SkillTool;
  skills: Skill[];
  workspace: Workspace;
  projectRootSet: boolean;
  busy: boolean;
  onOpen: (skill: Skill) => void;
  onCreate: (id: string) => Promise<void>;
  onBulkDelete: (rows: Skill[]) => Promise<void>;
  onBulkPreview: (
    sources: Skill[],
    targets: Array<{ tool: SkillTool; scope: ScopeMode }>,
    overwrite: boolean,
  ) => Promise<ImportPlan["plan"]>;
  onBulkImport: (
    sources: Skill[],
    targets: Array<{ tool: SkillTool; scope: ScopeMode }>,
    overwrite: boolean,
  ) => Promise<ImportResult["results"]>;
}

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function SkillsListView({
  mode,
  tool,
  skills,
  workspace,
  projectRootSet,
  busy,
  onOpen,
  onCreate,
  onBulkDelete,
  onBulkPreview,
  onBulkImport,
}: Props) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [destSelected, setDestSelected] = useState<Set<string>>(new Set());
  const [overwrite, setOverwrite] = useState(false);
  const [plan, setPlan] = useState<ImportPlan["plan"] | null>(null);
  const [results, setResults] = useState<ImportResult["results"] | null>(null);
  const idInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) idInputRef.current?.focus();
  }, [creating]);

  // Drop selections that no longer exist (e.g. after a bulk delete reload).
  useEffect(() => {
    setSelected((prev) => {
      const alive = new Set(skills.map((s) => s.filePath));
      const next = new Set([...prev].filter((p) => alive.has(p)));
      return next.size === prev.size ? prev : next;
    });
  }, [skills]);

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

  const selectedRows = skills.filter((s) => selected.has(s.filePath));
  // Import sources are tool+scope+id; duplicates of the same id resolve to one source.
  const selectedSources = [...new Map(selectedRows.map((s) => [s.id, s])).values()];
  const destinations = buildDestinations(tool, mode, workspace, projectRootSet);
  const selectedTargets = destinations
    .filter((d) => destSelected.has(d.key))
    .map((d) => ({ tool: d.tool, scope: d.scope }));

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

  function toggleRow(filePath: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
    setPlan(null);
    setResults(null);
  }

  function clearSelection() {
    setSelected(new Set());
    setImporting(false);
    setPlan(null);
    setResults(null);
  }

  function toggleDest(key: string) {
    setDestSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setPlan(null);
    setResults(null);
  }

  async function runPreview() {
    if (!selectedSources.length || !selectedTargets.length) return;
    setResults(null);
    setPlan(await onBulkPreview(selectedSources, selectedTargets, overwrite));
  }

  async function runImport() {
    if (!selectedSources.length || !selectedTargets.length) return;
    const res = await onBulkImport(selectedSources, selectedTargets, overwrite);
    setPlan(null);
    setResults(res);
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

      {selected.size > 0 && (
        <div className="bulk-bar">
          <strong>
            {selected.size} selected
            {selectedRows.some((r) => r.readOnly) && (
              <span className="badge warn" style={{ marginLeft: 8 }}>
                includes read-only
              </span>
            )}
          </strong>
          {visible.length > selected.size && (
            <button
              className="ghost"
              type="button"
              onClick={() => setSelected(new Set(visible.map((s) => s.filePath)))}
            >
              Select all ({visible.length})
            </button>
          )}
          <button className="ghost" type="button" onClick={clearSelection}>
            Clear
          </button>
          <div className="bulk-bar-spacer" />
          <button
            className="danger"
            type="button"
            disabled={busy}
            onClick={() => void onBulkDelete(selectedRows).then(clearSelection)}
          >
            Delete…
          </button>
          <button
            type="button"
            disabled={destinations.length === 0}
            onClick={() => {
              setImporting((v) => !v);
              setPlan(null);
              setResults(null);
            }}
          >
            {importing ? "Hide import" : "Import to…"}
          </button>
        </div>
      )}

      {selected.size > 0 && importing && (
        <div className="bulk-import">
          <p className="panel-sub" style={{ marginBottom: "0.6rem" }}>
            Copy {selectedSources.length} skill{selectedSources.length === 1 ? "" : "s"} to other
            tools and/or the other scope. Preview shows exactly what would happen before anything is
            written.
          </p>
          {!projectRootSet && (
            <div className="callout" style={{ marginBottom: "0.75rem" }}>
              Project destinations are hidden — set a project root in the top bar to import into a
              project.
            </div>
          )}
          <div className="dest-grid">
            {destinations.map((d) => (
              <label key={d.key} className="dest-row">
                <input
                  type="checkbox"
                  checked={destSelected.has(d.key)}
                  onChange={() => toggleDest(d.key)}
                />
                <span style={{ fontWeight: 550 }}>{toolLabel(d.tool)}</span>
                <span className={`badge scope-${d.scope}`}>{d.scope}</span>
                {d.installed && <span className="badge clean">installed</span>}
                {d.path && (
                  <code className="path-line" title={d.path}>
                    {d.path}/&lt;id&gt;/SKILL.md
                  </code>
                )}
              </label>
            ))}
          </div>
          <div className="import-bar">
            <label className="check-line">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => {
                  setOverwrite(e.target.checked);
                  setPlan(null);
                }}
              />
              Overwrite if target already exists
            </label>
            <div className="actions">
              <button
                type="button"
                disabled={busy || selectedTargets.length === 0}
                onClick={() => void runPreview()}
              >
                Preview
              </button>
              <button
                className="primary"
                type="button"
                disabled={busy || selectedTargets.length === 0 || !plan}
                title={plan ? "" : "Preview first"}
                onClick={() => void runImport()}
              >
                Apply import
              </button>
            </div>
          </div>

          {plan && (
            <div className="table-wrap" style={{ marginTop: "0.9rem" }}>
              <table>
                <thead>
                  <tr>
                    <th>Skill</th>
                    <th>Target</th>
                    <th>Action</th>
                    <th>Path</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((p) => (
                    <tr key={`${p.id}:${p.tool}:${p.scope}`}>
                      <td>
                        <strong>{p.id}</strong>
                      </td>
                      <td>
                        {toolLabel(p.tool)}
                        <span className={`badge scope-${p.scope}`} style={{ marginLeft: 6 }}>
                          {p.scope}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${actionTone(p.action)}`}>{p.action}</span>
                        {p.reason && (
                          <span className="muted" style={{ display: "block", fontSize: "0.78rem" }}>
                            {p.reason}
                          </span>
                        )}
                      </td>
                      <td>
                        <code className="path-line" title={p.filePath}>
                          {p.filePath}
                          {p.exists ? " (exists)" : ""}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {results && (
            <div className="table-wrap" style={{ marginTop: "0.9rem" }}>
              <table>
                <thead>
                  <tr>
                    <th>Skill</th>
                    <th>Target</th>
                    <th>Result</th>
                    <th>Path</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={`${r.id}:${r.tool}:${r.scope}`}>
                      <td>
                        <strong>{r.id}</strong>
                      </td>
                      <td>
                        {toolLabel(r.tool)}
                        <span className={`badge scope-${r.scope}`} style={{ marginLeft: 6 }}>
                          {r.scope}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${statusTone(r.status)}`}>{r.status}</span>
                        {r.error && (
                          <span className="muted" style={{ display: "block", fontSize: "0.78rem" }}>
                            {r.error}
                          </span>
                        )}
                      </td>
                      <td>
                        {r.filePath && (
                          <code className="path-line" title={r.filePath}>
                            {r.filePath}
                          </code>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
            <div
              key={row.filePath}
              role="button"
              tabIndex={0}
              className={`skill-card${selected.has(row.filePath) ? " selected" : ""}`}
              onClick={() => onOpen(row)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onOpen(row);
              }}
            >
              <div className="skill-card-head">
                <input
                  type="checkbox"
                  className="skill-card-check"
                  aria-label={`Select ${row.id}`}
                  checked={selected.has(row.filePath)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleRow(row.filePath)}
                />
                <strong>{row.id}</strong>
                {row.readOnly && <span className="badge warn">read-only</span>}
                {duplicateIds.has(row.id) && <span className="badge info">duplicate</span>}
              </div>
              <span className="skill-card-desc">{row.description || "No description."}</span>
              <code className="skill-card-path" title={row.filePath}>
                {truncateStart(row.filePath, 44)}
              </code>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function actionTone(action: "write" | "overwrite" | "skip" | "error"): string {
  switch (action) {
    case "write":
      return "clean";
    case "overwrite":
      return "warn";
    case "error":
      return "danger";
    default:
      return "";
  }
}

function statusTone(status: "written" | "skipped" | "error"): string {
  switch (status) {
    case "written":
      return "clean";
    case "error":
      return "danger";
    default:
      return "";
  }
}

/** Keep the informative tail of a path: "…agents/skills/foo/SKILL.md". */
function truncateStart(text: string, max: number): string {
  return text.length > max ? `…${text.slice(-(max - 1))}` : text;
}
