import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { Panel } from "./Panel.js";
import { sourceHint } from "../../cli/commands/import.js";

const TOOLS = [
  { value: "claude-code" as const, label: "Claude Code" },
  { value: "codex" as const, label: "Codex" },
  { value: "antigravity" as const, label: "Antigravity" },
  { value: "gemini" as const, label: "Gemini CLI" },
  { value: "cline" as const, label: "Cline" },
  { value: "roo-code" as const, label: "Roo Code" },
  { value: "continue" as const, label: "Continue" },
  { value: "aider" as const, label: "Aider" },
  { value: "opencode" as const, label: "OpenCode" },
  { value: "zed" as const, label: "Zed" },
  { value: "jetbrains" as const, label: "JetBrains AI" },
  { value: "cursor" as const, label: "Cursor" },
  { value: "windsurf" as const, label: "Windsurf" },
  { value: "copilot" as const, label: "Copilot" },
];

export type ImportTool = typeof TOOLS[number]["value"];

export interface ImportCandidate {
  id: string;
  kind: string;
}

interface ImportViewProps {
  onCancel: () => void;
  onListAssets: (tool: ImportTool) => Promise<ImportCandidate[]>;
  onImport: (tool: ImportTool, ids: string[]) => Promise<{ imported: number; errors: string[] }>;
  tools?: ImportTool[];
  rows: number;
  columns: number;
  global: boolean;
}

type Step =
  | { kind: "tool-pick" }
  | { kind: "loading" }
  | { kind: "asset-pick"; tool: ImportTool; assets: ImportCandidate[] }
  | { kind: "importing" }
  | { kind: "done"; imported: number; errors: string[] }
  | { kind: "error"; message: string };

export function ImportView({ onCancel, onListAssets, onImport, tools, rows, columns, global }: ImportViewProps) {
  const visibleTools = tools ? TOOLS.filter((tool) => tools.includes(tool.value)) : TOOLS;
  const [step, setStep] = useState<Step>({ kind: "tool-pick" });
  const [toolIndex, setToolIndex] = useState(0);
  const [assetIndex, setAssetIndex] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useInput((input, key) => {
    if (step.kind === "loading" || step.kind === "importing") return;

    if (key.escape || input === "q") {
      if (step.kind === "asset-pick") {
        setStep({ kind: "tool-pick" });
        setSelected(new Set());
        return;
      }
      onCancel();
      return;
    }

    if (step.kind === "tool-pick") {
      if (input === "j" || key.downArrow) setToolIndex((i) => Math.min(i + 1, visibleTools.length - 1));
      if (input === "k" || key.upArrow) setToolIndex((i) => Math.max(i - 1, 0));
      if (key.return) {
        const tool = visibleTools[toolIndex]?.value;
        if (!tool) return;
        setStep({ kind: "loading" });
        onListAssets(tool)
          .then((assets) => {
            setAssetIndex(0);
            setSelected(new Set());
            setStep({ kind: "asset-pick", tool, assets });
          })
          .catch((err: Error) => setStep({ kind: "error", message: err.message }));
      }
    } else if (step.kind === "asset-pick") {
      if (input === "j" || key.downArrow) setAssetIndex((i) => Math.min(i + 1, step.assets.length - 1));
      if (input === "k" || key.upArrow) setAssetIndex((i) => Math.max(i - 1, 0));
      if (input === " ") {
        const id = step.assets[assetIndex]?.id;
        if (!id) return;
        setSelected((prev) => {
          const next = new Set(prev);
          next.has(id) ? next.delete(id) : next.add(id);
          return next;
        });
      }
      if (input === "a") {
        setSelected((prev) =>
          prev.size === step.assets.length ? new Set() : new Set(step.assets.map((a) => a.id)),
        );
      }
      if (key.return && step.assets.length > 0) {
        const highlighted = step.assets[assetIndex]?.id;
        const ids = selected.size > 0 ? [...selected] : highlighted ? [highlighted] : [];
        if (ids.length === 0) return;
        setStep({ kind: "importing" });
        onImport(step.tool, ids)
          .then((r) => setStep({ kind: "done", imported: r.imported, errors: r.errors }))
          .catch((err: Error) => setStep({ kind: "error", message: err.message }));
      }
    } else if (step.kind === "done" || step.kind === "error") {
      if (key.return || input === "q") onCancel();
    }
  });

  return (
    <Box flexDirection="column" width={columns} height={rows} overflow="hidden">
      <Panel title="Import assets" active width={columns} height={rows}>
        {step.kind === "tool-pick" && (
          <Box flexDirection="column" gap={1}>
            <Text dimColor>[j/k] nav  [Enter] select  [q] cancel</Text>
            {visibleTools.length === 0 && (
              <Text dimColor>No installed tools detected. Use the CLI with --from &lt;tool&gt; to force an import source.</Text>
            )}
            {visibleTools.map((t, i) => (
              <Box key={t.value} gap={2}>
                <Text color={i === toolIndex ? "cyan" : undefined}>{i === toolIndex ? "❯" : " "}</Text>
                <Text bold={i === toolIndex} color={i === toolIndex ? "cyan" : undefined}>
                  {t.label}
                </Text>
                <Text dimColor>{sourceHint(t.value, global)}</Text>
              </Box>
            ))}
          </Box>
        )}

        {step.kind === "loading" && <Text dimColor>Discovering assets...</Text>}

        {step.kind === "asset-pick" && (
          <Box flexDirection="column" gap={1}>
            <Text dimColor>
              {step.assets.length} asset{step.assets.length !== 1 ? "s" : ""} in {step.tool}
              {"  "}[j/k] nav  [Space] toggle  [a] all  [Enter] import selected/current ({selected.size} selected)  [q] back
            </Text>
            {step.assets.length === 0 && <Text dimColor>No importable assets found.</Text>}
            {step.assets.map((a, i) => (
              <Box key={a.id} gap={2}>
                <Text color={i === assetIndex ? "cyan" : undefined}>{i === assetIndex ? "❯" : " "}</Text>
                <Text color={selected.has(a.id) ? "green" : "gray"}>{selected.has(a.id) ? "◉" : "○"}</Text>
                <Text bold={i === assetIndex} color={i === assetIndex ? "cyan" : undefined}>
                  {a.id}
                </Text>
                <Text dimColor>[{a.kind}]</Text>
              </Box>
            ))}
          </Box>
        )}

        {step.kind === "importing" && <Text dimColor>Importing...</Text>}

        {step.kind === "done" && (
          <Box flexDirection="column" gap={1}>
            <Text color={step.errors.length > 0 ? "yellow" : "green"}>
              ✓ Imported {step.imported} asset{step.imported !== 1 ? "s" : ""}
              {step.errors.length > 0 ? `, ${step.errors.length} error(s)` : "  — run sync to write files"}
            </Text>
            {step.errors.map((e, i) => (
              <Text key={i} color="red" dimColor>
                {e}
              </Text>
            ))}
            <Text dimColor>Press Enter or q to return.</Text>
          </Box>
        )}

        {step.kind === "error" && (
          <Box flexDirection="column" gap={1}>
            <Text color="red">✗ {step.message}</Text>
            <Text dimColor>Press Enter or q to return.</Text>
          </Box>
        )}
      </Panel>
    </Box>
  );
}
