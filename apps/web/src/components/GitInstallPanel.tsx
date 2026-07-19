import { useState } from "react";
import type {
  GitSkillsInstallPlan,
  GitSkillsInstallResult,
  GitSkillsPreview,
  RemoteSkillCandidate,
  ScopeMode,
  SkillTool,
} from "../api";
import { toolLabel } from "../nav";
import { ContentsDiff } from "./ContentsDiff";

interface Props {
  tool: SkillTool;
  scope: ScopeMode;
  busy: boolean;
  onPreviewRepo: (input: {
    url: string;
    branch?: string;
    subpath?: string;
  }) => Promise<GitSkillsPreview>;
  onPreviewInstall: (
    skills: Array<{ id: string; contents: string }>,
    overwrite: boolean,
  ) => Promise<GitSkillsInstallPlan["plan"]>;
  onInstall: (
    skills: Array<{ id: string; contents: string }>,
    overwrite: boolean,
  ) => Promise<GitSkillsInstallResult["results"]>;
}

export function GitInstallPanel({
  tool,
  scope,
  busy,
  onPreviewRepo,
  onPreviewInstall,
  onInstall,
}: Props) {
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [subpath, setSubpath] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [candidates, setCandidates] = useState<RemoteSkillCandidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [plan, setPlan] = useState<GitSkillsInstallPlan["plan"] | null>(null);
  const [results, setResults] = useState<GitSkillsInstallResult["results"] | null>(null);
  const [diffKey, setDiffKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  function selectedSkills(): Array<{ id: string; contents: string }> {
    if (!candidates) return [];
    return candidates
      .filter((s) => selected.has(s.repoPath))
      .map((s) => ({ id: s.id, contents: s.contents }));
  }

  async function scanRepo() {
    setWorking(true);
    setError(null);
    setPlan(null);
    setResults(null);
    setDiffKey(null);
    try {
      const preview = await onPreviewRepo({
        url: url.trim(),
        branch: branch.trim() || undefined,
        subpath: subpath.trim() || undefined,
      });
      setCandidates(preview.skills);
      setSelected(new Set(preview.skills.map((s) => s.repoPath)));
      if (preview.skills.length === 0) {
        setError("No SKILL.md files found in that repo (try a subpath like skills/).");
      }
    } catch (err) {
      setCandidates(null);
      setSelected(new Set());
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function runPreviewInstall() {
    const skills = selectedSkills();
    if (!skills.length) return;
    setWorking(true);
    setError(null);
    setResults(null);
    setDiffKey(null);
    try {
      setPlan(await onPreviewInstall(skills, overwrite));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function runInstall() {
    const skills = selectedSkills();
    if (!skills.length) return;
    setWorking(true);
    setError(null);
    try {
      const res = await onInstall(skills, overwrite);
      setResults(res);
      setPlan(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  }

  const disabled = busy || working;

  return (
    <div className="git-install-panel">
      <p className="panel-sub" style={{ marginBottom: "0.6rem" }}>
        Shallow-clone a public git repo, find <code>SKILL.md</code> folders, and write selected
        skills into {toolLabel(tool)} ({scope}).
      </p>
      <div className="git-install-fields">
        <label className="field" style={{ flex: 2, minWidth: 240 }}>
          <span>Git URL</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/org/skills-repo"
            disabled={disabled}
          />
        </label>
        <label className="field" style={{ flex: 1, minWidth: 120 }}>
          <span>Branch (optional)</span>
          <input
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
            disabled={disabled}
          />
        </label>
        <label className="field" style={{ flex: 1, minWidth: 140 }}>
          <span>Subpath (optional)</span>
          <input
            value={subpath}
            onChange={(e) => setSubpath(e.target.value)}
            placeholder="skills"
            disabled={disabled}
          />
        </label>
      </div>
      <div className="actions" style={{ marginTop: "0.65rem" }}>
        <button
          className="primary"
          type="button"
          disabled={disabled || !url.trim()}
          onClick={() => void scanRepo()}
        >
          {working && !candidates ? "Scanning…" : "Scan repo"}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}

      {candidates && candidates.length > 0 && (
        <>
          <div className="table-wrap" style={{ marginTop: "0.9rem" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }} />
                  <th>Id</th>
                  <th>Description</th>
                  <th>Path in repo</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((s) => (
                  <tr key={s.repoPath}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(s.repoPath)}
                        disabled={disabled}
                        onChange={() => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(s.repoPath)) next.delete(s.repoPath);
                            else next.add(s.repoPath);
                            return next;
                          });
                          setPlan(null);
                          setResults(null);
                        }}
                      />
                    </td>
                    <td>
                      <strong>{s.id}</strong>
                      {s.name !== s.id && (
                        <span className="muted" style={{ display: "block", fontSize: "0.78rem" }}>
                          {s.name}
                        </span>
                      )}
                    </td>
                    <td className="muted">{s.description || "—"}</td>
                    <td>
                      <code className="path-line">{s.repoPath}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="import-bar">
            <label className="check-line">
              <input
                type="checkbox"
                checked={overwrite}
                disabled={disabled}
                onChange={(e) => {
                  setOverwrite(e.target.checked);
                  setPlan(null);
                  setResults(null);
                }}
              />
              Overwrite if target already exists
            </label>
            <div className="actions">
              <button
                type="button"
                disabled={disabled || selected.size === 0}
                onClick={() => void runPreviewInstall()}
              >
                Preview install
              </button>
              <button
                className="primary"
                type="button"
                disabled={disabled || selected.size === 0 || !plan}
                title={plan ? "" : "Preview first"}
                onClick={() => void runInstall()}
              >
                Install selected
              </button>
            </div>
          </div>
        </>
      )}

      {plan && (
        <div className="table-wrap" style={{ marginTop: "0.9rem" }}>
          <table>
            <thead>
              <tr>
                <th>Skill</th>
                <th>Action</th>
                <th>Path</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((p) => {
                const key = p.id;
                const incoming = selectedSkills().find((s) => s.id === p.id)?.contents;
                const canDiff = p.action === "overwrite" && p.existingContents !== undefined;
                const open = diffKey === key;
                return [
                  <tr key={key}>
                    <td>
                      <strong>{p.id}</strong>
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
                          onClick={() => setDiffKey(open ? null : key)}
                        >
                          {open ? "Hide diff" : "View diff"}
                        </button>
                      )}
                    </td>
                    <td>
                      <code className="path-line">{p.filePath}</code>
                    </td>
                  </tr>,
                  canDiff && open && incoming !== undefined && (
                    <tr key={`${key}:diff`}>
                      <td colSpan={3} style={{ padding: 0 }}>
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
                <th>Skill</th>
                <th>Result</th>
                <th>Path</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.id}</strong>
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
                    {r.filePath && <code className="path-line">{r.filePath}</code>}
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
