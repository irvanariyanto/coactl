import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GitSkillsInstallPlan,
  GitSkillsInstallResult,
  GitSkillsPreview,
  ImportPlan,
  ImportResult,
  PackSkillsPreview,
  ScopeMode,
  Skill,
  Workspace,
} from "../api";
import { EmptyResourceState } from "../components/EmptyResourceState";
import { GitInstallPanel } from "../components/GitInstallPanel";
import { ImportPanel } from "../components/ImportPanel";
import { PathCandidates } from "../components/PathCandidates";
import { useListHotkeys } from "../hooks/useListHotkeys";
import { buildDestinations } from "../import-destinations";
import { modeToScope, toolLabel, type Mode, type SkillTool } from "../nav";

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
  onPreviewGitRepo: (input: {
    url: string;
    branch?: string;
    subpath?: string;
  }) => Promise<GitSkillsPreview>;
  onPreviewPack: (
    input:
      | { kind: "npm"; install: string; registry?: string; subpath?: string }
      | { kind: "archive"; path?: string; url?: string; subpath?: string },
  ) => Promise<PackSkillsPreview>;
  onPickArchive: () => Promise<{ path: string } | { cancelled: true }>;
  onPreviewGitInstall: (
    skills: Array<{ id: string; contents: string }>,
    overwrite: boolean,
  ) => Promise<GitSkillsInstallPlan["plan"]>;
  onInstallGitSkills: (
    skills: Array<{ id: string; contents: string }>,
    overwrite: boolean,
  ) => Promise<GitSkillsInstallResult["results"]>;
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
  onPreviewGitRepo,
  onPreviewPack,
  onPickArchive,
  onPreviewGitInstall,
  onInstallGitSkills,
}: Props) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [fromGit, setFromGit] = useState(false);
  const idInputRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) idInputRef.current?.focus();
  }, [creating]);

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
  const selectedSources = [...new Map(selectedRows.map((s) => [s.id, s])).values()];
  const destinations = buildDestinations(tool, mode, workspace, projectRootSet);
  const incomingById = Object.fromEntries(selectedSources.map((s) => [s.id, s.contents]));

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
    enabled: !creating && !fromGit,
    filterRef,
    onNew: () => {
      setFromGit(false);
      setCreating(true);
    },
    onClearSelection: clearSelection,
    onClearFilter: () => setQuery(""),
    hasFilter: Boolean(query.trim()),
    hasSelection: selected.size > 0,
    onOpen: openHotkeyTarget,
  });

  return (
    <section className="panel">
      <div className="section-head">
        <h2>
          {toolLabel(tool)} skills
          <span className={`badge scope-${mode}`}>{mode}</span>
          <span className="muted" style={{ fontWeight: 400, fontSize: "0.85rem" }}>
            {skills.length} item{skills.length === 1 ? "" : "s"}
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
            aria-label="Filter skills"
            placeholder="Filter… (/)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className={fromGit ? undefined : "ghost"}
            onClick={() => {
              setFromGit((v) => !v);
              setCreating(false);
            }}
          >
            {fromGit ? "Hide remote install" : "Install remote…"}
          </button>
          {!creating && (
            <button
              className="primary"
              type="button"
              onClick={() => {
                setCreating(true);
                setFromGit(false);
              }}
            >
              + New skill
            </button>
          )}
        </div>
      </div>

      {folderInfo && <PathCandidates info={folderInfo} />}

      {fromGit && (
        <div className="create-panel">
          <div className="create-panel-head">
            <strong>Install remote skills</strong>
            <span className="muted" style={{ fontSize: "0.82rem" }}>
              Target: {toolLabel(tool)} · {mode} (
              <code>
                {createFolder ?? "…"}/&lt;id&gt;/SKILL.md
              </code>
              )
            </span>
          </div>
          <GitInstallPanel
            tool={tool}
            scope={modeToScope(mode)}
            busy={busy}
            onPreviewRepo={onPreviewGitRepo}
            onPreviewPack={onPreviewPack}
            onPickArchive={onPickArchive}
            onPreviewInstall={onPreviewGitInstall}
            onInstall={async (skills, overwrite) => {
              const results = await onInstallGitSkills(skills, overwrite);
              return results;
            }}
          />
        </div>
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
            sourceTool={tool}
            sourceMode={mode}
            pathIdHint="<id>"
            showSkillColumn
            blurb={`Copy ${selectedSources.length} skill${selectedSources.length === 1 ? "" : "s"} to other tools and/or the other scope. Preview shows exactly what would happen before anything is written.`}
            incomingById={incomingById}
            onPreview={(targets, overwrite) => onBulkPreview(selectedSources, targets, overwrite)}
            onApply={(targets, overwrite) => onBulkImport(selectedSources, targets, overwrite)}
          />
        </div>
      )}

      {skills.length === 0 ? (
        <EmptyResourceState
          title={`No ${toolLabel(tool)} skills in ${mode} yet`}
          blurb="Each skill is a folder with a SKILL.md file. Create one here, or install from a git repo that already has skills."
          path={
            createFolder
              ? `${createFolder}/<id>/SKILL.md`
              : undefined
          }
        >
          {!creating && (
            <button className="primary" type="button" onClick={() => setCreating(true)}>
              Create your first skill
            </button>
          )}
          {!fromGit && (
            <button type="button" onClick={() => setFromGit(true)}>
              Install from Git…
            </button>
          )}
        </EmptyResourceState>
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

function truncateStart(text: string, max: number): string {
  return text.length > max ? `…${text.slice(-(max - 1))}` : text;
}
