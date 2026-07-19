import { type KeyboardEvent } from "react";
import type {
  Rule,
  RuleImportPlan,
  RuleImportResult,
  RuleTool,
  ScopeMode,
  SkillTool,
  Workspace,
} from "../api";
import { DraftRecoveryBanner } from "../components/DraftRecoveryBanner";
import { ImportPanel } from "../components/ImportPanel";
import { buildRuleDestinations } from "../import-destinations";
import { formatRuleDestPath, toolLabel, type Mode } from "../nav";

interface Props {
  mode: Mode;
  tool: RuleTool;
  rule: Rule;
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
    targets: Array<{ tool: RuleTool; scope: "global" | "project" }>,
    overwrite: boolean,
  ) => Promise<RuleImportPlan>;
  onImport: (
    targets: Array<{ tool: RuleTool; scope: "global" | "project" }>,
    overwrite: boolean,
  ) => Promise<RuleImportResult>;
  onOpenWritten: (target: {
    id: string;
    tool: SkillTool;
    scope: ScopeMode;
    filePath: string;
  }) => void;
}

export function RuleDetailView({
  mode,
  tool,
  rule,
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
  const destinations = buildRuleDestinations(tool, mode, workspace, projectRootSet);
  const lineCount = rule.contents.split("\n").length;
  const fileLabel = `${rule.id}.${rule.extension}`;

  function handleEditorKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (!busy && !rule.readOnly) void onSave();
    }
  }

  return (
    <div className="detail-stack">
      <section className="panel editor-panel">
        <div className="editor-head">
          <div className="editor-title">
            <h2>
              {toolLabel(tool)} / {rule.id}
              <span className={`badge scope-${mode}`}>{mode}</span>
              <span className="badge info">.{rule.extension}</span>
              {dirty && <span className="badge warn">unsaved</span>}
            </h2>
            <code className="path-line" title={rule.filePath}>
              {rule.filePath}
            </code>
          </div>
          <div className="actions">
            <button
              className="primary"
              type="button"
              disabled={busy || rule.readOnly}
              title="⌘S / Ctrl+S"
              onClick={() => void onSave()}
            >
              Save
            </button>
            <button
              className="danger"
              type="button"
              disabled={busy || rule.readOnly}
              onClick={() => void onDelete()}
            >
              Delete
            </button>
          </div>
        </div>
        {pendingDraft && !rule.readOnly && (
          <DraftRecoveryBanner onRestore={onRestoreDraft} onDiscard={onDiscardDraft} />
        )}
        <textarea
          id="rule-contents"
          className="editor-textarea"
          aria-label={`${fileLabel} contents`}
          value={rule.contents}
          readOnly={rule.readOnly}
          onChange={(e) => onChangeContents(e.target.value)}
          onKeyDown={handleEditorKeyDown}
          spellCheck={false}
        />
        <div className="editor-foot">
          <span>{fileLabel}</span>
          <span>
            {lineCount} line{lineCount === 1 ? "" : "s"} · {rule.contents.length} chars
            {dirty && " · unsaved changes"}
            {!rule.readOnly && " · ⌘S to save"}
          </span>
        </div>
      </section>

      <section className="panel">
        <h2>Import to…</h2>
        <ImportPanel
          destinations={destinations}
          projectRootSet={projectRootSet}
          busy={busy}
          pathIdHint={rule.id}
          sourceTool={tool}
          sourceMode={mode}
          formatDestPath={(dir, idHint, t) =>
            formatRuleDestPath(dir, idHint, t, workspace.ruleLayoutsByTool[t])
          }
          blurb="Copy this rule to the other rule-capable tool and/or scope. Same-tool copies keep the raw file; cursor ↔ claude rewrites frontmatter for .mdc vs .md."
          incomingById={{ [rule.id]: rule.contents }}
          onPreview={async (targets, overwrite) => {
            const res = await onPreviewImport(
              targets as Array<{ tool: RuleTool; scope: "global" | "project" }>,
              overwrite,
            );
            return res.plan;
          }}
          onApply={async (targets, overwrite) => {
            const res = await onImport(
              targets as Array<{ tool: RuleTool; scope: "global" | "project" }>,
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
