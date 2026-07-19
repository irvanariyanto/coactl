import { useState } from "react";
import type { ImportPlan, ImportResult, ScopeMode } from "../api";
import type { ImportDestination } from "../import-destinations";
import { toolLabel, type SkillTool } from "../nav";
import { ContentsDiff } from "./ContentsDiff";

export interface ImportPanelProps {
  destinations: ImportDestination[];
  projectRootSet: boolean;
  busy: boolean;
  /** Path suffix shown on each dest (e.g. "review-pr" or "<id>"). */
  pathIdHint: string;
  /** How to append id onto a destination folder. Defaults to skill folders. */
  formatDestPath?: (dir: string, idHint: string, tool: SkillTool) => string;
  blurb: string;
  showSkillColumn?: boolean;
  /** Incoming contents by skill id — used for overwrite diffs. */
  incomingById: Record<string, string>;
  onPreview: (
    targets: Array<{ tool: SkillTool; scope: ScopeMode }>,
    overwrite: boolean,
  ) => Promise<ImportPlan["plan"]>;
  onApply: (
    targets: Array<{ tool: SkillTool; scope: ScopeMode }>,
    overwrite: boolean,
  ) => Promise<ImportResult["results"]>;
}

function defaultDestPath(dir: string, idHint: string): string {
  return `${dir}/${idHint}/SKILL.md`;
}

export function ImportPanel({
  destinations,
  projectRootSet,
  busy,
  pathIdHint,
  formatDestPath = (dir, idHint) => defaultDestPath(dir, idHint),
  blurb,
  showSkillColumn = false,
  incomingById,
  onPreview,
  onApply,
}: ImportPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overwrite, setOverwrite] = useState(false);
  const [plan, setPlan] = useState<ImportPlan["plan"] | null>(null);
  const [results, setResults] = useState<ImportResult["results"] | null>(null);
  const [diffKey, setDiffKey] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setPlan(null);
    setResults(null);
    setDiffKey(null);
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
    setPlan(await onPreview(targets, overwrite));
  }

  async function runApply() {
    const targets = selectedTargets();
    if (!targets.length) return;
    const res = await onApply(targets, overwrite);
    setPlan(null);
    setDiffKey(null);
    setResults(res);
  }

  const colCount = showSkillColumn ? 4 : 3;

  return (
    <div className="import-panel">
      <p className="panel-sub" style={{ marginBottom: "0.6rem" }}>
        {blurb}
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
              <code className="path-line" title={formatDestPath(d.path, pathIdHint, d.tool)}>
                {formatDestPath(d.path, pathIdHint, d.tool)}
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
              setDiffKey(null);
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
            onClick={() => void runApply()}
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
                {showSkillColumn && <th>Skill</th>}
                <th>Target</th>
                <th>Action</th>
                <th>Path</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((p) => {
                const key = `${p.id}:${p.tool}:${p.scope}`;
                const canDiff = p.action === "overwrite" && p.existingContents !== undefined;
                const incoming = incomingById[p.id];
                const diffOpen = diffKey === key;
                return [
                  <tr key={key}>
                    {showSkillColumn && (
                      <td>
                        <strong>{p.id}</strong>
                      </td>
                    )}
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
                      {canDiff && incoming !== undefined && (
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
                  canDiff && diffOpen && incoming !== undefined && (
                    <tr key={`${key}:diff`}>
                      <td colSpan={colCount} style={{ padding: 0 }}>
                        <ContentsDiff current={p.existingContents!} incoming={incoming} />
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
                {showSkillColumn && <th>Skill</th>}
                <th>Target</th>
                <th>Result</th>
                <th>Path</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={`${r.id}:${r.tool}:${r.scope}`}>
                  {showSkillColumn && (
                    <td>
                      <strong>{r.id}</strong>
                    </td>
                  )}
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
