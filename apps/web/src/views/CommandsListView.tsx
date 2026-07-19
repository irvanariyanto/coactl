import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Command,
  CommandImportPlan,
  CommandImportResult,
  CommandTool,
  ScopeMode,
  Workspace,
} from "../api";
import { EmptyResourceState } from "../components/EmptyResourceState";
import { ImportPanel } from "../components/ImportPanel";
import { PathCandidates } from "../components/PathCandidates";
import { useListHotkeys } from "../hooks/useListHotkeys";
import { buildCommandDestinations } from "../import-destinations";
import { formatCommandDestPath, toolLabel, type Mode, type SkillTool } from "../nav";

interface Props {
  mode: Mode;
  tool: CommandTool;
  commands: Command[];
  workspace: Workspace;
  projectRootSet: boolean;
  busy: boolean;
  onOpen: (command: Command) => void;
  onCreate: (id: string) => Promise<void>;
  onBulkDelete: (rows: Command[]) => Promise<void>;
  onBulkPreview: (
    sources: Command[],
    targets: Array<{ tool: CommandTool; scope: ScopeMode }>,
    overwrite: boolean,
  ) => Promise<CommandImportPlan["plan"]>;
  onBulkImport: (
    sources: Command[],
    targets: Array<{ tool: CommandTool; scope: ScopeMode }>,
    overwrite: boolean,
  ) => Promise<CommandImportResult["results"]>;
}

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function resourceLabel(tool: CommandTool, plural = true): string {
  if (tool === "antigravity") return plural ? "workflows" : "workflow";
  return plural ? "commands" : "command";
}

export function CommandsListView({
  mode,
  tool,
  commands,
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
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) idInputRef.current?.focus();
  }, [creating]);

  useEffect(() => {
    setSelected((prev) => {
      const alive = new Set(commands.map((c) => c.filePath));
      const next = new Set([...prev].filter((p) => alive.has(p)));
      return next.size === prev.size ? prev : next;
    });
  }, [commands]);

  const folderInfo =
    mode === "global"
      ? workspace.commandPathsByTool[tool]?.global
      : workspace.commandPathsByTool[tool]?.project;
  const createPath = folderInfo?.preferred;
  const pathKind = folderInfo?.kind ?? "command";

  const q = query.trim().toLowerCase();
  const visible = q
    ? commands.filter(
        (c) =>
          c.id.toLowerCase().includes(q) ||
          (c.description ?? "").toLowerCase().includes(q) ||
          c.filePath.toLowerCase().includes(q),
      )
    : commands;

  const selectedRows = commands.filter((c) => selected.has(c.filePath));
  const selectedSources = [...new Map(selectedRows.map((c) => [c.id, c])).values()];
  const destinations = buildCommandDestinations(tool, mode, workspace, projectRootSet);
  const incomingById = Object.fromEntries(selectedSources.map((c) => [c.id, c.contents]));

  const trimmedId = newId.trim();
  const idValid = !trimmedId || KEBAB.test(trimmedId);
  const idTaken = Boolean(trimmedId) && commands.some((c) => c.id === trimmedId);
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

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setImporting(false);
  }, []);

  const openHotkeyTarget = useCallback(() => {
    const row = selectedRows[0] ?? visible[0];
    if (row) onOpen(row);
  }, [selectedRows, visible, onOpen]);

  useListHotkeys({
    enabled: !creating,
    filterRef,
    onNew: () => setCreating(true),
    onClearSelection: clearSelection,
    onClearFilter: () => setQuery(""),
    hasFilter: Boolean(query.trim()),
    hasSelection: selected.size > 0,
    onOpen: openHotkeyTarget,
  });

  const label = resourceLabel(tool);
  const pathLabel =
    pathKind === "workflow" ? "Active workflows path" : "Active commands path";

  return (
    <section className="panel">
      <div className="section-head">
        <h2>
          {toolLabel(tool)} {label}
          <span className={`badge scope-${mode}`}>{mode}</span>
          <span className="muted" style={{ fontWeight: 400, fontSize: "0.85rem" }}>
            {commands.length} item{commands.length === 1 ? "" : "s"}
            <span className="hotkey-hint" title="Keyboard shortcuts">
              {" "}
              · / filter · n new · ↵ open · esc clear
            </span>
          </span>
        </h2>
        <div className="list-tools">
          <input
            ref={filterRef}
            className="search-input"
            type="search"
            aria-label={`Filter ${label}`}
            placeholder="Filter… (/)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {!creating && (
            <button className="primary" type="button" onClick={() => setCreating(true)}>
              + New command
            </button>
          )}
        </div>
      </div>

      {folderInfo && <PathCandidates info={folderInfo} label={pathLabel} />}

      {creating && (
        <div className="create-panel">
          <div className="create-panel-head">
            <strong>New command</strong>
            <span className="muted" style={{ fontSize: "0.82rem" }}>
              Scaffolds a .md file in the native {mode}{" "}
              {pathKind === "workflow" ? "workflows" : "commands"} folder for {toolLabel(tool)}.
            </span>
          </div>
          <div className="create-panel-body">
            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <label htmlFor="new-command-id">Id (kebab-case)</label>
              <input
                id="new-command-id"
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
              {idTaken && (
                <span className="field-error">A command with this id already exists here.</span>
              )}
            </div>
            <div className="actions">
              <button className="primary" type="button" disabled={!canCreate} onClick={submitCreate}>
                Create command
              </button>
              <button className="ghost" type="button" onClick={cancelCreate}>
                Cancel
              </button>
            </div>
          </div>
          {createPath && (
            <code className="create-panel-path">
              {formatCommandDestPath(createPath, trimmedId && idValid ? trimmedId : "<id>")}
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
              onClick={() => setSelected(new Set(visible.map((c) => c.filePath)))}
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
            sourceTool={tool as SkillTool}
            sourceMode={mode}
            pathIdHint="<id>"
            formatDestPath={(dir, idHint) => formatCommandDestPath(dir, idHint)}
            showSkillColumn
            blurb={`Copy ${selectedSources.length} ${resourceLabel(tool, selectedSources.length === 1)} to other tools and/or the other scope.`}
            incomingById={incomingById}
            onPreview={(targets, overwrite) =>
              onBulkPreview(
                selectedSources,
                targets as Array<{ tool: CommandTool; scope: ScopeMode }>,
                overwrite,
              )
            }
            onApply={(targets, overwrite) =>
              onBulkImport(
                selectedSources,
                targets as Array<{ tool: CommandTool; scope: ScopeMode }>,
                overwrite,
              )
            }
          />
        </div>
      )}

      {commands.length === 0 ? (
        <EmptyResourceState
          title={`No ${toolLabel(tool)} ${label} in ${mode} yet`}
          blurb={
            pathKind === "workflow"
              ? "Antigravity slash workflows are markdown files under the workflows folder (managed here as commands)."
              : "Each slash command is a markdown file the tool can invoke by id."
          }
          path={createPath ? formatCommandDestPath(createPath, "<id>") : undefined}
        >
          {!creating && (
            <button className="primary" type="button" onClick={() => setCreating(true)}>
              Create your first command
            </button>
          )}
        </EmptyResourceState>
      ) : visible.length === 0 ? (
        <div className="empty">No {label} match “{query.trim()}”.</div>
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
                {row.kind === "workflow" && <span className="badge info">workflow</span>}
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
