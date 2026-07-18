import { useState } from "react";
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
  const [newId, setNewId] = useState("");
  const folderInfo =
    mode === "global"
      ? workspace.skillPathsByTool[tool]?.global
      : workspace.skillPathsByTool[tool]?.project;
  const folder = folderInfo?.path;
  const createFolder = folderInfo?.preferred;
  const duplicateIds = new Set(
    skills.filter((s, i) => skills.some((o, j) => j !== i && o.id === s.id)).map((s) => s.id),
  );
  const idValid = !newId.trim() || KEBAB.test(newId.trim());

  return (
    <div className="grid-2">
      <section className="panel">
        <h2>
          {toolLabel(tool)} skills
          <span className={`badge scope-${mode}`}>{mode}</span>
          <span className="muted" style={{ fontWeight: 400, fontSize: "0.85rem" }}>
            {skills.length} item{skills.length === 1 ? "" : "s"}
          </span>
        </h2>
        {folder && (
          <p className="path-banner">
            Folder{folderInfo?.exists ? "" : " (will be created)"}: <code>{folder}</code>
          </p>
        )}
        {folderInfo && folderInfo.candidates.length > 1 && (
          <p className="muted" style={{ fontSize: "0.78rem", marginTop: "-0.5rem" }}>
            Scanned:{" "}
            {(folderInfo.candidateDetails ?? folderInfo.candidates.map((path) => ({ path, writable: true })))
              .map((c) => `${c.path}${c.writable ? "" : " (read-only)"}`)
              .join(" · ")}
          </p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Skill</th>
                <th>Path</th>
              </tr>
            </thead>
            <tbody>
              {skills.map((row) => (
                <tr key={row.filePath} className="row-link" onClick={() => onOpen(row)}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                      <strong>{row.id}</strong>
                      {row.readOnly && <span className="badge warn">read-only</span>}
                      {duplicateIds.has(row.id) && <span className="badge info">duplicate</span>}
                    </div>
                    {row.description && (
                      <span className="muted" style={{ fontSize: "0.8rem" }}>
                        {truncate(row.description, 90)}
                      </span>
                    )}
                  </td>
                  <td>
                    <code className="path-line" title={row.filePath}>
                      {row.filePath}
                    </code>
                  </td>
                </tr>
              ))}
              {skills.length === 0 && (
                <tr>
                  <td colSpan={2}>
                    <div className="empty">
                      No skills yet for {toolLabel(tool)} in {mode} scope.
                      <br />
                      Create one on the right — it lands in the folder shown above.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>New skill</h2>
        <p className="panel-sub">
          Scaffolds <code>SKILL.md</code> in the native {mode} folder for {toolLabel(tool)}.
        </p>
        {createFolder && (
          <p className="path-banner">
            Will create: <code>{createFolder}/&lt;id&gt;/SKILL.md</code>
          </p>
        )}
        <div className="field">
          <label htmlFor="new-skill-id">Id (kebab-case)</label>
          <input
            id="new-skill-id"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newId.trim() && idValid && !busy) {
                void onCreate(newId.trim()).then(() => setNewId(""));
              }
            }}
            placeholder="review-pr"
          />
          {!idValid && (
            <span style={{ color: "var(--danger)", fontSize: "0.78rem" }}>
              Use lowercase letters, digits, and dashes (e.g. <code>review-pr</code>).
            </span>
          )}
        </div>
        <div className="actions" style={{ marginTop: "0.9rem" }}>
          <button
            className="primary"
            type="button"
            disabled={busy || !newId.trim() || !idValid}
            onClick={() => void onCreate(newId.trim()).then(() => setNewId(""))}
          >
            Create skill
          </button>
        </div>
      </section>
    </div>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
