import { type KeyboardEvent } from "react";
import type { ImportPlan, ImportResult, ScopeMode, Skill, Workspace } from "../api";
import { DraftRecoveryBanner } from "../components/DraftRecoveryBanner";
import { ImportPanel } from "../components/ImportPanel";
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
  pendingDraft: string | null;
  onRestoreDraft: () => void;
  onDiscardDraft: () => void;
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
  onOpenWritten: (target: {
    id: string;
    tool: SkillTool;
    scope: ScopeMode;
    filePath: string;
  }) => void;
}

export function SkillDetailView({
  mode,
  tool,
  skill,
  workspace,
  projectRootSet,
  busy,
  dirty,
  pendingDraft,
  onRestoreDraft,
  onDiscardDraft,
  onChangeContents,
  onSave,
  onDelete,
  onPreviewImport,
  onImport,
  onOpenWritten,
}: Props) {
  const destinations = buildDestinations(tool, mode, workspace, projectRootSet);
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
        {pendingDraft && !skill.readOnly && (
          <DraftRecoveryBanner onRestore={onRestoreDraft} onDiscard={onDiscardDraft} />
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
        <ImportPanel
          destinations={destinations}
          projectRootSet={projectRootSet}
          busy={busy}
          pathIdHint={skill.id}
          sourceTool={tool}
          sourceMode={mode}
          blurb="Copy this skill to other tools and/or the other scope. Raw file contents are preserved — preview shows exactly what would happen before anything is written."
          incomingById={{ [skill.id]: skill.contents }}
          onPreview={async (targets, overwrite) => {
            const res = await onPreviewImport(targets, overwrite);
            return res.plan;
          }}
          onApply={async (targets, overwrite) => {
            const res = await onImport(targets, overwrite);
            return res.results;
          }}
          onOpenWritten={onOpenWritten}
        />
      </section>
    </div>
  );
}
