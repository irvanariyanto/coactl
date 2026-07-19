import { useEffect, useRef, useState } from "react";
import type {
  ScopeMode,
  Workflow,
  WorkflowImportPlan,
  WorkflowImportResult,
  WorkflowTool,
  Workspace,
} from "../api";
import { EmptyResourceState } from "../components/EmptyResourceState";
import { ImportPanel } from "../components/ImportPanel";
import { PathCandidates } from "../components/PathCandidates";
import { buildWorkflowDestinations } from "../import-destinations";
import { formatWorkflowDestPath, toolLabel, type Mode } from "../nav";

interface Props {
  mode: Mode;
  tool: WorkflowTool;
  workflows: Workflow[];
  workspace: Workspace;
  projectRootSet: boolean;
  busy: boolean;
  onOpen: (workflow: Workflow) => void;
  onCreate: (id: string) => Promise<void>;
  onBulkDelete: (rows: Workflow[]) => Promise<void>;
  onBulkPreview: (
    sources: Workflow[],
    targets: Array<{ tool: WorkflowTool; scope: ScopeMode }>,
    overwrite: boolean,
  ) => Promise<WorkflowImportPlan["plan"]>;
  onBulkImport: (
    sources: Workflow[],
    targets: Array<{ tool: WorkflowTool; scope: ScopeMode }>,
    overwrite: boolean,
  ) => Promise<WorkflowImportResult["results"]>;
}

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function WorkflowsListView({
  mode,
  tool,
  workflows,
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
  const idInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) idInputRef.current?.focus();
  }, [creating]);

  useEffect(() => {
    setSelected((prev) => {
      const alive = new Set(workflows.map((w) => w.filePath));
      const next = new Set([...prev].filter((p) => alive.has(p)));
      return next.size === prev.size ? prev : next;
    });
  }, [workflows]);

  const folderInfo =
    mode === "global"
      ? workspace.workflowPathsByTool[tool]?.global
      : workspace.workflowPathsByTool[tool]?.project;
  const createPath = folderInfo?.preferred;

  const q = query.trim().toLowerCase();
  const visible = q
    ? workflows.filter(
        (w) =>
          w.id.toLowerCase().includes(q) ||
          (w.description ?? "").toLowerCase().includes(q) ||
          w.filePath.toLowerCase().includes(q),
      )
    : workflows;

  const selectedRows = workflows.filter((w) => selected.has(w.filePath));
  const selectedSources = [...new Map(selectedRows.map((w) => [w.id, w])).values()];
  const destinations = buildWorkflowDestinations(tool, mode, workspace, projectRootSet);
  const incomingById = Object.fromEntries(selectedSources.map((w) => [w.id, w.contents]));

  const trimmedId = newId.trim();
  const idValid = !trimmedId || KEBAB.test(trimmedId);
  const idTaken = Boolean(trimmedId) && workflows.some((w) => w.id === trimmedId);
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
  }

  function clearSelection() {
    setSelected(new Set());
    setImporting(false);
  }

  return (
    <section className="panel">
      <div className="section-head">
        <h2>
          {toolLabel(tool)} workflows
          <span className={`badge scope-${mode}`}>{mode}</span>
          <span className="muted" style={{ fontWeight: 400, fontSize: "0.85rem" }}>
            {workflows.length} item{workflows.length === 1 ? "" : "s"}
          </span>
        </h2>
        <div className="list-tools">
          {workflows.length > 1 && (
            <input
              className="search-input"
              type="search"
              aria-label="Filter workflows"
              placeholder="Filter…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          {!creating && (
            <button className="primary" type="button" onClick={() => setCreating(true)}>
              + New workflow
            </button>
          )}
        </div>
      </div>

      {folderInfo && <PathCandidates info={folderInfo} label="Active workflows path" />}

      {creating && (
        <div className="create-panel">
          <div className="create-panel-head">
            <strong>New workflow</strong>
            <span className="muted" style={{ fontSize: "0.82rem" }}>
              Scaffolds a .js dynamic workflow script in the native {mode} workflows folder for{" "}
              {toolLabel(tool)}.
            </span>
          </div>
          <div className="create-panel-body">
            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <label htmlFor="new-workflow-id">Id (kebab-case)</label>
              <input
                id="new-workflow-id"
                ref={idInputRef}
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitCreate();
                  if (e.key === "Escape") cancelCreate();
                }}
                placeholder="audit-routes"
              />
              {!idValid && (
                <span className="field-error">
                  Use lowercase letters, digits, and dashes (e.g. <code>audit-routes</code>).
                </span>
              )}
              {idTaken && (
                <span className="field-error">A workflow with this id already exists here.</span>
              )}
            </div>
            <div className="actions">
              <button className="primary" type="button" disabled={!canCreate} onClick={submitCreate}>
                Create workflow
              </button>
              <button className="ghost" type="button" onClick={cancelCreate}>
                Cancel
              </button>
            </div>
          </div>
          {createPath && (
            <code className="create-panel-path">
              {formatWorkflowDestPath(createPath, trimmedId && idValid ? trimmedId : "<id>")}
            </code>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div className="bulk-bar">
          <strong>{selected.size} selected</strong>
          {visible.length > selected.size && (
            <button
              className="ghost"
              type="button"
              onClick={() => setSelected(new Set(visible.map((w) => w.filePath)))}
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
            onClick={() => setImporting((v) => !v)}
          >
            {importing ? "Hide import" : "Import to…"}
          </button>
        </div>
      )}

      {selected.size > 0 && importing && (
        <div className="bulk-import">
          <ImportPanel
            destinations={destinations}
            projectRootSet={projectRootSet}
            busy={busy}
            pathIdHint="<id>"
            formatDestPath={(dir, idHint) => formatWorkflowDestPath(dir, idHint)}
            showSkillColumn={false}
            blurb={`Copy ${selectedSources.length} workflow script${selectedSources.length === 1 ? "" : "s"} to the other scope (global ↔ project).`}
            incomingById={incomingById}
            onPreview={(targets, overwrite) =>
              onBulkPreview(
                selectedSources,
                targets as Array<{ tool: WorkflowTool; scope: ScopeMode }>,
                overwrite,
              )
            }
            onApply={(targets, overwrite) =>
              onBulkImport(
                selectedSources,
                targets as Array<{ tool: WorkflowTool; scope: ScopeMode }>,
                overwrite,
              )
            }
          />
        </div>
      )}

      {workflows.length === 0 ? (
        <EmptyResourceState
          title={`No ${toolLabel(tool)} workflows in ${mode} yet`}
          blurb="Claude Code dynamic workflows are JavaScript files with export const meta — not the markdown workflows under Commands."
          path={createPath ? formatWorkflowDestPath(createPath, "<id>") : undefined}
        >
          {!creating && (
            <button className="primary" type="button" onClick={() => setCreating(true)}>
              Create your first workflow
            </button>
          )}
        </EmptyResourceState>
      ) : visible.length === 0 ? (
        <div className="empty">No workflows match “{query.trim()}”.</div>
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
                <span className="badge info">.{row.extension}</span>
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

function truncateStart(text: string, max: number): string {
  return text.length > max ? `…${text.slice(-(max - 1))}` : text;
}
