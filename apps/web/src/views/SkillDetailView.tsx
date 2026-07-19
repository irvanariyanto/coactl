import { useMemo, useState, type KeyboardEvent } from "react";
import type { ImportPlan, ImportResult, Skill, Workspace } from "../api";
import { buildDestinations } from "../import-destinations";
import { toolLabel, type Mode, type SkillTool } from "../nav";

interface Props {
  mode: Mode;
  tool: SkillTool;
  skill: Skill;
  workspace: Workspace;
  projectRootSet: boolean;
  busy: boolean;
  dirty: boolean;
  onChangeContents: (contents: string) => void;
  onSave: () => Promise<void>;
  onDelete: () => Promise<void>;
  onPreviewImport: (
    targets: Array<{ tool: SkillTool; scope: "global" | "project" }>,
    overwrite: boolean,
  ) => Promise<ImportPlan>;
  onImport: (
    targets: Array<{ tool: SkillTool; scope: "global" | "project" }>,
    overwrite: boolean,
  ) => Promise<ImportResult>;
}

type DestKey = string;

export function SkillDetailView({
  mode,
  tool,
  skill,
  workspace,
  projectRootSet,
  busy,
  dirty,
  onChangeContents,
  onSave,
  onDelete,
  onPreviewImport,
  onImport,
}: Props) {
  const [selected, setSelected] = useState<Set<DestKey>>(new Set());
  const [overwrite, setOverwrite] = useState(false);
  const [plan, setPlan] = useState<ImportPlan["plan"] | null>(null);
  const [results, setResults] = useState<ImportResult["results"] | null>(null);
  const [diffKey, setDiffKey] = useState<string | null>(null);

  const destinations = useMemo(
    () => buildDestinations(tool, mode, workspace, projectRootSet),
    [tool, mode, workspace, projectRootSet],
  );

  function toggle(key: DestKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setPlan(null);
    setResults(null);
  }

  function selectedTargets() {
    return destinations
      .filter((d) => selected.has(d.key))
      .map((d) => ({ tool: d.tool, scope: d.scope }));
  }

  async function runPreview() {
    const targets = selectedTargets();
    if (!targets.length) return;
    setResults(null);
    setDiffKey(null);
    const result = await onPreviewImport(targets, overwrite);
    setPlan(result.plan);
  }

  async function runImport() {
    const targets = selectedTargets();
    if (!targets.length) return;
    const result = await onImport(targets, overwrite);
    setPlan(null);
    setDiffKey(null);
    setResults(result.results);
  }

  const lineCount = skill.contents.split("\n").length;

  function handleEditorKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (!busy && !skill.readOnly) void onSave();
    }
  }

  return (
    <div className="detail-stack">
      <section className="panel editor-panel">
        <div className="editor-head">
          <div className="editor-title">
            <h2>
              {toolLabel(tool)} / {skill.id}
              <span className={`badge scope-${mode}`}>{mode}</span>
              {skill.readOnly && <span className="badge warn">read-only</span>}
              {dirty && <span className="badge warn">unsaved</span>}
            </h2>
            <code className="path-line" title={skill.filePath}>
              {skill.filePath}
            </code>
          </div>
          <div className="actions">
            <button
              className="primary"
              type="button"
              disabled={busy || skill.readOnly}
              title="⌘S / Ctrl+S"
              onClick={() => void onSave()}
            >
              Save
            </button>
            <button
              className="danger"
              type="button"
              disabled={busy || skill.readOnly}
              onClick={() => void onDelete()}
            >
              Delete
            </button>
          </div>
        </div>
        {skill.readOnly && (
          <div className="callout warn" style={{ marginBottom: "0.75rem" }}>
            This skill lives in a vendor-managed folder. You can view it and import it elsewhere,
            but edits and deletes are blocked.
          </div>
        )}
        <textarea
          id="skill-contents"
          className="editor-textarea"
          aria-label="SKILL.md contents"
          value={skill.contents}
          readOnly={skill.readOnly}
          onChange={(e) => onChangeContents(e.target.value)}
          onKeyDown={handleEditorKeyDown}
          spellCheck={false}
        />
        <div className="editor-foot">
          <span>SKILL.md</span>
          <span>
            {lineCount} line{lineCount === 1 ? "" : "s"} · {skill.contents.length} chars
            {dirty && " · unsaved changes"}
            {!skill.readOnly && " · ⌘S to save"}
          </span>
        </div>
      </section>

      <section className="panel">
        <h2>Import to…</h2>
        <p className="panel-sub">
          Copy this skill to other tools and/or the other scope. Raw file contents are preserved —
          preview shows exactly what would happen before anything is written.
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
              <input type="checkbox" checked={selected.has(d.key)} onChange={() => toggle(d.key)} />
              <span style={{ fontWeight: 550 }}>{toolLabel(d.tool)}</span>
              <span className={`badge scope-${d.scope}`}>{d.scope}</span>
              {d.installed && <span className="badge clean">installed</span>}
              {d.path && (
                <code className="path-line" title={d.path}>
                  {d.path}/{skill.id}/SKILL.md
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
              disabled={busy || selected.size === 0}
              onClick={() => void runPreview()}
            >
              Preview
            </button>
            <button
              className="primary"
              type="button"
              disabled={busy || selected.size === 0 || !plan}
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
                  <th>Target</th>
                  <th>Action</th>
                  <th>Path</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((p) => {
                  const key = `${p.tool}:${p.scope}`;
                  const canDiff = p.action === "overwrite" && p.existingContents !== undefined;
                  const diffOpen = diffKey === key;
                  return [
                    <tr key={key}>
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
                        {canDiff && (
                          <button
                            type="button"
                            className="ghost"
                            style={{ marginLeft: 8, padding: "0.1rem 0.5rem", fontSize: "0.78rem" }}
                            onClick={() => setDiffKey(diffOpen ? null : key)}
                          >
                            {diffOpen ? "Hide diff" : "View diff"}
                          </button>
                        )}
                      </td>
                      <td>
                        <code className="path-line" title={p.filePath}>
                          {p.filePath}
                          {p.exists ? " (exists)" : ""}
                        </code>
                      </td>
                    </tr>,
                    canDiff && diffOpen && (
                      <tr key={`${key}:diff`}>
                        <td colSpan={3} style={{ padding: 0 }}>
                          <ContentsDiff current={p.existingContents!} incoming={skill.contents} />
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}

        {results && (
          <div className="table-wrap" style={{ marginTop: "0.9rem" }}>
            <table>
              <thead>
                <tr>
                  <th>Target</th>
                  <th>Result</th>
                  <th>Path</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={`${r.tool}:${r.scope}`}>
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
      </section>
    </div>
  );
}

/** Unified line diff: what would change at the target if the import overwrites it. */
function ContentsDiff({ current, incoming }: { current: string; incoming: string }) {
  const rows = useMemo(() => diffLines(current.split("\n"), incoming.split("\n")), [current, incoming]);
  const changed = rows.some((r) => r.kind !== "ctx");
  return (
    <div className="diff-block">
      <div className="diff-head">
        <span className="badge danger">− current on disk</span>
        <span className="badge clean">+ incoming (this skill)</span>
        {!changed && <span className="muted">contents are identical</span>}
      </div>
      <pre className="diff-body">
        {rows.map((r, i) => (
          <span key={i} className={`diff-line ${r.kind}`}>
            {r.kind === "del" ? "− " : r.kind === "add" ? "+ " : "  "}
            {r.text}
            {"\n"}
          </span>
        ))}
      </pre>
    </div>
  );
}

type DiffRow = { kind: "ctx" | "del" | "add"; text: string };

/** LCS-based line diff; SKILL.md files are small so O(n·m) is fine. */
function diffLines(a: string[], b: string[]): DiffRow[] {
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ kind: "ctx", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      rows.push({ kind: "del", text: a[i]! });
      i++;
    } else {
      rows.push({ kind: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) rows.push({ kind: "del", text: a[i++]! });
  while (j < m) rows.push({ kind: "add", text: b[j++]! });
  return rows;
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

