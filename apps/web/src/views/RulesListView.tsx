import { useEffect, useRef, useState } from "react";
import type { Rule, RuleImportPlan, RuleImportResult, RuleTool, ScopeMode, Workspace } from "../api";
import { EmptyResourceState } from "../components/EmptyResourceState";
import { ImportPanel } from "../components/ImportPanel";
import { PathCandidates } from "../components/PathCandidates";
import { buildRuleDestinations } from "../import-destinations";
import { formatRuleDestPath, toolLabel, type Mode } from "../nav";

interface Props {
  mode: Mode;
  tool: RuleTool;
  rules: Rule[];
  workspace: Workspace;
  projectRootSet: boolean;
  busy: boolean;
  onOpen: (rule: Rule) => void;
  onCreate: (id: string) => Promise<void>;
  onBulkDelete: (rows: Rule[]) => Promise<void>;
  onBulkPreview: (
    sources: Rule[],
    targets: Array<{ tool: RuleTool; scope: ScopeMode }>,
    overwrite: boolean,
  ) => Promise<RuleImportPlan["plan"]>;
  onBulkImport: (
    sources: Rule[],
    targets: Array<{ tool: RuleTool; scope: ScopeMode }>,
    overwrite: boolean,
  ) => Promise<RuleImportResult["results"]>;
}

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function RulesListView({
  mode,
  tool,
  rules,
  workspace,
  projectRootSet,
  busy,
  onOpen,
  onCreate,
  onBulkDelete,
  onBulkPreview,
  onBulkImport,
}: Props) {
  const layout = workspace.ruleLayoutsByTool[tool];
  const singleton = layout?.shape === "singleton";
  const singletonId = layout?.singletonId ?? "agents";

  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const idInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating && !singleton) idInputRef.current?.focus();
  }, [creating, singleton]);

  useEffect(() => {
    setSelected((prev) => {
      const alive = new Set(rules.map((r) => r.filePath));
      const next = new Set([...prev].filter((p) => alive.has(p)));
      return next.size === prev.size ? prev : next;
    });
  }, [rules]);

  const folderInfo =
    mode === "global"
      ? workspace.rulePathsByTool[tool]?.global
      : workspace.rulePathsByTool[tool]?.project;
  const createPath = folderInfo?.preferred;

  const q = query.trim().toLowerCase();
  const visible = q
    ? rules.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          (r.description ?? "").toLowerCase().includes(q) ||
          r.filePath.toLowerCase().includes(q),
      )
    : rules;

  const selectedRows = rules.filter((r) => selected.has(r.filePath));
  const selectedSources = [...new Map(selectedRows.map((r) => [r.id, r])).values()];
  const destinations = buildRuleDestinations(tool, mode, workspace, projectRootSet);
  const incomingById = Object.fromEntries(selectedSources.map((r) => [r.id, r.contents]));

  const trimmedId = singleton ? singletonId : newId.trim();
  const idValid = singleton || !trimmedId || KEBAB.test(trimmedId);
  const idTaken = Boolean(trimmedId) && rules.some((r) => r.id === trimmedId);
  const canCreate = Boolean(trimmedId) && idValid && !idTaken && !busy;
  const singletonExists = singleton && rules.length > 0;

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
          {toolLabel(tool)} {singleton ? "instructions" : "rules"}
          <span className={`badge scope-${mode}`}>{mode}</span>
          <span className="muted" style={{ fontWeight: 400, fontSize: "0.85rem" }}>
            {rules.length} item{rules.length === 1 ? "" : "s"}
          </span>
        </h2>
        <div className="list-tools">
          {rules.length > 1 && (
            <input
              className="search-input"
              type="search"
              aria-label="Filter rules"
              placeholder="Filter…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          {!creating && !singletonExists && (
            <button className="primary" type="button" onClick={() => setCreating(true)}>
              {singleton ? "+ Create instruction file" : "+ New rule"}
            </button>
          )}
        </div>
      </div>

      {folderInfo && (
        <PathCandidates
          info={folderInfo}
          label={singleton ? "Active instruction file" : "Active rules path"}
        />
      )}

      {creating && (
        <div className="create-panel">
          <div className="create-panel-head">
            <strong>{singleton ? "New instruction file" : "New rule"}</strong>
            <span className="muted" style={{ fontSize: "0.82rem" }}>
              {singleton
                ? `Creates ${tool === "gemini" ? "GEMINI.md" : "AGENTS.md"} for ${toolLabel(tool)} (${mode}).`
                : `Scaffolds a .${layout?.extension ?? "md"} file in the native ${mode} rules folder for ${toolLabel(tool)}.`}
            </span>
          </div>
          <div className="create-panel-body">
            {!singleton && (
              <div className="field" style={{ flex: 1, minWidth: 220 }}>
                <label htmlFor="new-rule-id">Id (kebab-case)</label>
                <input
                  id="new-rule-id"
                  ref={idInputRef}
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitCreate();
                    if (e.key === "Escape") cancelCreate();
                  }}
                  placeholder="react-patterns"
                />
                {!idValid && (
                  <span className="field-error">
                    Use lowercase letters, digits, and dashes (e.g. <code>react-patterns</code>).
                  </span>
                )}
                {idTaken && (
                  <span className="field-error">A rule with this id already exists here.</span>
                )}
              </div>
            )}
            <div className="actions">
              <button className="primary" type="button" disabled={!canCreate} onClick={submitCreate}>
                {singleton ? "Create file" : "Create rule"}
              </button>
              <button className="ghost" type="button" onClick={cancelCreate}>
                Cancel
              </button>
            </div>
          </div>
          {createPath && (
            <code className="create-panel-path">
              {formatRuleDestPath(createPath, trimmedId && idValid ? trimmedId : "<id>", tool, layout)}
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
              onClick={() => setSelected(new Set(visible.map((r) => r.filePath)))}
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
            formatDestPath={(dir, idHint, t) =>
              formatRuleDestPath(dir, idHint, t, workspace.ruleLayoutsByTool[t])
            }
            showSkillColumn
            blurb={`Copy ${selectedSources.length} rule${selectedSources.length === 1 ? "" : "s"} to other tools and/or the other scope. Multi-file ↔ instruction-file imports map ids automatically.`}
            incomingById={incomingById}
            onPreview={(targets, overwrite) =>
              onBulkPreview(selectedSources, targets as Array<{ tool: RuleTool; scope: ScopeMode }>, overwrite)
            }
            onApply={(targets, overwrite) =>
              onBulkImport(selectedSources, targets as Array<{ tool: RuleTool; scope: ScopeMode }>, overwrite)
            }
          />
        </div>
      )}

      {rules.length === 0 ? (
        <EmptyResourceState
          title={
            singleton
              ? `No ${toolLabel(tool)} instruction file in ${mode} yet`
              : `No ${toolLabel(tool)} rules in ${mode} yet`
          }
          blurb={
            singleton
              ? tool === "gemini"
                ? "Gemini uses a single GEMINI.md instruction file for this scope."
                : "This tool uses a single AGENTS.md instruction file for this scope (not a rules folder)."
              : `Each rule is a .${layout?.extension ?? "md"} file in the native rules folder for ${toolLabel(tool)}.`
          }
          path={
            createPath
              ? formatRuleDestPath(
                  createPath,
                  singleton ? singletonId : "<id>",
                  tool,
                  layout,
                )
              : undefined
          }
        >
          {!creating && (
            <button className="primary" type="button" onClick={() => setCreating(true)}>
              {singleton ? "Create instruction file" : "Create your first rule"}
            </button>
          )}
        </EmptyResourceState>
      ) : visible.length === 0 ? (
        <div className="empty">No rules match “{query.trim()}”.</div>
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
                <span className="badge info">
                  {row.shape === "singleton" ? "file" : `.${row.extension}`}
                </span>
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
