import { type KeyboardEvent } from "react";
import type {
  ScopeMode,
  SkillTool,
  Workflow,
  WorkflowImportPlan,
  WorkflowImportResult,
  WorkflowTool,
  Workspace,
} from "../api";
import { DraftRecoveryBanner } from "../components/DraftRecoveryBanner";
import { ImportPanel } from "../components/ImportPanel";
import { buildWorkflowDestinations } from "../import-destinations";
import { formatWorkflowDestPath, toolLabel, type Mode } from "../nav";

interface Props {
  mode: Mode;
  tool: WorkflowTool;
  workflow: Workflow;
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
    targets: Array<{ tool: WorkflowTool; scope: "global" | "project" }>,
    overwrite: boolean,
  ) => Promise<WorkflowImportPlan>;
  onImport: (
    targets: Array<{ tool: WorkflowTool; scope: "global" | "project" }>,
    overwrite: boolean,
  ) => Promise<WorkflowImportResult>;
  onOpenWritten: (target: {
    id: string;
    tool: SkillTool;
    scope: ScopeMode;
    filePath: string;
  }) => void;
}

export function WorkflowDetailView({
  mode,
  tool,
  workflow,
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
  const destinations = buildWorkflowDestinations(tool, mode, workspace, projectRootSet);
  const lineCount = workflow.contents.split("\n").length;
  const fileLabel = `${workflow.id}.${workflow.extension}`;

  function handleEditorKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (!busy && !workflow.readOnly) void onSave();
    }
  }

  return (
    <div className="detail-stack">
      <section className="panel editor-panel">
        <div className="editor-head">
          <div className="editor-title">
            <h2>
              {toolLabel(tool)} / {workflow.id}
              <span className={`badge scope-${mode}`}>{mode}</span>
              <span className="badge info">.{workflow.extension}</span>
              {dirty && <span className="badge warn">unsaved</span>}
            </h2>
            <code className="path-line" title={workflow.filePath}>
              {workflow.filePath}
            </code>
          </div>
          <div className="actions">
            <button
              className="primary"
              type="button"
              disabled={busy || workflow.readOnly}
              title="⌘S / Ctrl+S"
              onClick={() => void onSave()}
            >
              Save
            </button>
            <button
              className="danger"
              type="button"
              disabled={busy || workflow.readOnly}
              onClick={() => void onDelete()}
            >
              Delete
            </button>
          </div>
        </div>
        {pendingDraft && !workflow.readOnly && (
          <DraftRecoveryBanner onRestore={onRestoreDraft} onDiscard={onDiscardDraft} />
        )}
        <textarea
          id="workflow-contents"
          className="editor-textarea"
          aria-label={`${fileLabel} workflow script`}
          value={workflow.contents}
          readOnly={workflow.readOnly}
          onChange={(e) => onChangeContents(e.target.value)}
          onKeyDown={handleEditorKeyDown}
          spellCheck={false}
        />
        <div className="editor-foot">
          <span>{fileLabel}</span>
          <span>
            {lineCount} line{lineCount === 1 ? "" : "s"} · {workflow.contents.length} chars
            {dirty && " · unsaved changes"}
            {!workflow.readOnly && " · ⌘S to save"}
          </span>
        </div>
      </section>

      <section className="panel">
        <h2>Import to…</h2>
        <ImportPanel
          destinations={destinations}
          projectRootSet={projectRootSet}
          busy={busy}
          pathIdHint={workflow.id}
          sourceTool={tool}
          sourceMode={mode}
          formatDestPath={(dir, idHint) => formatWorkflowDestPath(dir, idHint)}
          blurb="Copy this dynamic workflow script to the other scope (global ↔ project)."
          incomingById={{ [workflow.id]: workflow.contents }}
          onPreview={async (targets, overwrite) => {
            const res = await onPreviewImport(
              targets as Array<{ tool: WorkflowTool; scope: "global" | "project" }>,
              overwrite,
            );
            return res.plan;
          }}
          onApply={async (targets, overwrite) => {
            const res = await onImport(
              targets as Array<{ tool: WorkflowTool; scope: "global" | "project" }>,
              overwrite,
            );
            return res.results;
          }}
          onOpenWritten={onOpenWritten}
        />
      </section>
    </div>
  );
}
