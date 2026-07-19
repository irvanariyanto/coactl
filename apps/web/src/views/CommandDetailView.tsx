import { type KeyboardEvent } from "react";
import type { Command, CommandImportPlan, CommandImportResult, CommandTool, Workspace } from "../api";
import { ImportPanel } from "../components/ImportPanel";
import { buildCommandDestinations } from "../import-destinations";
import { formatCommandDestPath, toolLabel, type Mode } from "../nav";

interface Props {
  mode: Mode;
  tool: CommandTool;
  command: Command;
  workspace: Workspace;
  projectRootSet: boolean;
  busy: boolean;
  dirty: boolean;
  onChangeContents: (contents: string) => void;
  onSave: () => Promise<void>;
  onDelete: () => Promise<void>;
  onPreviewImport: (
    targets: Array<{ tool: CommandTool; scope: "global" | "project" }>,
    overwrite: boolean,
  ) => Promise<CommandImportPlan>;
  onImport: (
    targets: Array<{ tool: CommandTool; scope: "global" | "project" }>,
    overwrite: boolean,
  ) => Promise<CommandImportResult>;
}

export function CommandDetailView({
  mode,
  tool,
  command,
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
  const destinations = buildCommandDestinations(tool, mode, workspace, projectRootSet);
  const lineCount = command.contents.split("\n").length;
  const fileLabel = `${command.id}.${command.extension}`;
  const kindLabel = command.kind === "workflow" ? "workflow" : "command";

  function handleEditorKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (!busy && !command.readOnly) void onSave();
    }
  }

  return (
    <div className="detail-stack">
      <section className="panel editor-panel">
        <div className="editor-head">
          <div className="editor-title">
            <h2>
              {toolLabel(tool)} / {command.id}
              <span className={`badge scope-${mode}`}>{mode}</span>
              <span className="badge info">.{command.extension}</span>
              {command.kind === "workflow" && <span className="badge info">workflow</span>}
              {dirty && <span className="badge warn">unsaved</span>}
            </h2>
            <code className="path-line" title={command.filePath}>
              {command.filePath}
            </code>
          </div>
          <div className="actions">
            <button
              className="primary"
              type="button"
              disabled={busy || command.readOnly}
              title="⌘S / Ctrl+S"
              onClick={() => void onSave()}
            >
              Save
            </button>
            <button
              className="danger"
              type="button"
              disabled={busy || command.readOnly}
              onClick={() => void onDelete()}
            >
              Delete
            </button>
          </div>
        </div>
        <textarea
          id="command-contents"
          className="editor-textarea"
          aria-label={`${fileLabel} contents`}
          value={command.contents}
          readOnly={command.readOnly}
          onChange={(e) => onChangeContents(e.target.value)}
          onKeyDown={handleEditorKeyDown}
          spellCheck={false}
        />
        <div className="editor-foot">
          <span>{fileLabel}</span>
          <span>
            {lineCount} line{lineCount === 1 ? "" : "s"} · {command.contents.length} chars
            {dirty && " · unsaved changes"}
            {!command.readOnly && " · ⌘S to save"}
          </span>
        </div>
      </section>

      <section className="panel">
        <h2>Import to…</h2>
        <ImportPanel
          destinations={destinations}
          projectRootSet={projectRootSet}
          busy={busy}
          pathIdHint={command.id}
          formatDestPath={(dir, idHint) => formatCommandDestPath(dir, idHint)}
          blurb={`Copy this ${kindLabel} to other command-capable tools and/or scope.`}
          incomingById={{ [command.id]: command.contents }}
          onPreview={async (targets, overwrite) => {
            const res = await onPreviewImport(
              targets as Array<{ tool: CommandTool; scope: "global" | "project" }>,
              overwrite,
            );
            return res.plan;
          }}
          onApply={async (targets, overwrite) => {
            const res = await onImport(
              targets as Array<{ tool: CommandTool; scope: "global" | "project" }>,
              overwrite,
            );
            return res.results;
          }}
        />
      </section>
    </div>
  );
}
