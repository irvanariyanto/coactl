import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useState } from "react";
import { Header } from "../components/Header.js";
import { Panel } from "../components/Panel.js";
import { AssetList } from "../components/AssetList.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { KeyHints } from "../components/KeyHints.js";
import { DriftSummary } from "../components/DriftSummary.js";
import { useKeyboardNav } from "../hooks/useKeyboardNav.js";
import { ImportView, type ImportCandidate, type ImportTool } from "../components/ImportView.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import type { StatusKind } from "../components/StatusBadge.js";

const HEADER_ROWS = 2;
const KEY_HINTS_ROWS = 1;
const PANEL_CHROME_ROWS = 3;
const MAX_SOURCES_ROWS = 4;
const DRIFT_SUMMARY_ROWS = 1;

const STATUS_PRIORITY: Record<StatusKind, number> = {
  error: 0,
  missing: 1,
  drifted: 2,
  unknown: 3,
  synced: 4,
};

export interface DashboardAsset {
  id: string;
  kind: string;
  status: StatusKind;
  version: string;
  description: string;
  targets: string[];
  source: string;
  readOnly: boolean;
  scope: "global" | "project";
}

export interface DashboardSource {
  name: string;
  type: string;
  count: number;
  scope: "global" | "project";
}

export interface DashboardData {
  assets: DashboardAsset[];
  sources: DashboardSource[];
  conflicts: Array<{ id: string; candidates: string[] }>;
  scope: "project+global" | "global";
}

export interface SyncResult {
  written: number;
  unchanged: number;
  errors: Array<{ path: string; error: string }>;
}

type ActionKind = "sync" | "update" | "refresh";

type ActionState =
  | { status: "idle" }
  | { status: "running"; kind: ActionKind }
  | { status: "sync-done"; written: number; unchanged: number; errors: SyncResult["errors"] }
  | { status: "update-done"; updated: number; errors: string[] }
  | { status: "refresh-done" }
  | { status: "error"; kind: ActionKind; message: string };

type ScopeFilter = "all" | "global" | "project";

const PANEL_NAMES = ["assets", "details", "sources"] as const;

interface DashboardProps {
  version: string;
  data: DashboardData;
  onSync: () => Promise<SyncResult>;
  onRefresh: () => Promise<DashboardData>;
  onUpdate: () => Promise<{ updated: number; errors: string[] }>;
  onListImportAssets: (tool: ImportTool) => Promise<ImportCandidate[]>;
  onImport: (tool: ImportTool, ids: string[]) => Promise<{ imported: number; errors: string[] }>;
}

export function Dashboard({ version, data: initialData, onSync, onRefresh, onUpdate, onListImportAssets, onImport }: DashboardProps) {
  const { exit } = useApp();
  const { rows, columns } = useTerminalSize();
  const [liveData, setLiveData] = useState(initialData);
  const [action, setAction] = useState<ActionState>({ status: "idle" });
  const [filterOutOfSync, setFilterOutOfSync] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [importMode, setImportMode] = useState(false);

  const isRunning = action.status === "running";

  const displayAssets = [...liveData.assets]
    .filter((a) => scopeFilter === "all" || a.scope === scopeFilter)
    .sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status])
    .filter((a) => !filterOutOfSync || a.status !== "synced");

  const displaySources = liveData.sources.filter(
    (s) => scopeFilter === "all" || s.scope === scopeFilter,
  );

  const { activePanel, selectedIndices } = useKeyboardNav({
    panelCount: PANEL_NAMES.length,
    itemCounts: [Math.max(displayAssets.length, 1), 1, Math.max(displaySources.length, 1)],
    onQuit: () => exit(),
    enabled: !importMode,
  });

  const selectedAsset = displayAssets[selectedIndices[0] ?? 0];

  useInput((input) => {
    if (importMode || isRunning) return;
    if (input === "s") setAction({ status: "running", kind: "sync" });
    if (input === "u") setAction({ status: "running", kind: "update" });
    if (input === "r") setAction({ status: "running", kind: "refresh" });
    if (input === "f") setFilterOutOfSync((prev) => !prev);
    if (input === "i") setImportMode(true);
    if (input === "g" && liveData.scope === "project+global") {
      setScopeFilter((prev) =>
        prev === "all" ? "global" : prev === "global" ? "project" : "all",
      );
    }
  });

  useEffect(() => {
    if (action.status !== "running") return;
    const { kind } = action;

    if (kind === "sync") {
      onSync()
        .then((r) => setAction({ status: "sync-done", written: r.written, unchanged: r.unchanged, errors: r.errors }))
        .catch((err: Error) => setAction({ status: "error", kind, message: err.message }));
    } else if (kind === "update") {
      onUpdate()
        .then((r) => setAction({ status: "update-done", updated: r.updated, errors: r.errors }))
        .catch((err: Error) => setAction({ status: "error", kind, message: err.message }));
    } else if (kind === "refresh") {
      onRefresh()
        .then((newData) => {
          setLiveData(newData);
          setAction({ status: "refresh-done" });
        })
        .catch((err: Error) => setAction({ status: "error", kind, message: err.message }));
    }
  }, [action.status]);

  const scopeLabel: ScopeFilter = scopeFilter;

  const keyHints = isRunning
    ? [{ key: "...", label: "working" }]
    : [
        { key: "Tab", label: "panel" },
        { key: "j/k", label: "nav" },
        { key: "s", label: "sync" },
        { key: "u", label: "update" },
        { key: "r", label: "refresh" },
        { key: "i", label: "import" },
        { key: "f", label: filterOutOfSync ? "show all" : "not-synced" },
        ...(liveData.scope === "project+global"
          ? [{ key: "g", label: `scope:${scopeLabel}` }]
          : []),
        { key: "q", label: "quit" },
      ];

  const conflictsRows = liveData.conflicts.length > 0 ? 1 : 0;
  const actionStatusRows =
    action.status !== "idle" && action.status !== "running" && action.status !== "refresh-done"
      ? 1
      : 0;
  const sourcesContentRows = Math.max(1, Math.min(displaySources.length, MAX_SOURCES_ROWS));
  const sourcesPanelHeight = sourcesContentRows + PANEL_CHROME_ROWS;
  const reservedRows =
    HEADER_ROWS + DRIFT_SUMMARY_ROWS + conflictsRows + sourcesPanelHeight + actionStatusRows + KEY_HINTS_ROWS;
  const mainRowHeight = Math.max(rows - reservedRows, 5);
  const assetListMaxVisible = Math.max(mainRowHeight - PANEL_CHROME_ROWS, 1);

  const assetsPanelWidth = Math.max(Math.floor(columns / 2), 20);
  const detailsPanelWidth = Math.max(columns - assetsPanelWidth, 20);
  const detailsContentWidth = detailsPanelWidth - 4;
  const truncate = (label: string, value: string): string => {
    const budget = detailsContentWidth - label.length - 1;
    if (budget <= 0) return "";
    if (value.length <= budget) return value;
    return budget === 1 ? "…" : `${value.slice(0, budget - 1)}…`;
  };

  const assetsPanelTitle = filterOutOfSync
    ? `Assets (${displayAssets.length}/${liveData.assets.length} not synced)`
    : scopeFilter !== "all"
    ? `Assets [${scopeFilter}] (${displayAssets.length})`
    : `Assets (${displayAssets.length})`;

  const headerSubtitle =
    liveData.scope === "project+global" ? "project + global" : "global";

  if (importMode) {
    return (
      <ImportView
        onCancel={() => setImportMode(false)}
        onListAssets={onListImportAssets}
        onImport={onImport}
        rows={rows}
        columns={columns}
        global={liveData.scope === "global"}
      />
    );
  }

  return (
    <Box flexDirection="column" width="100%" height={rows} overflow="hidden">
      <Header subtitle={`dashboard — ${headerSubtitle}`} version={version} />

      {liveData.conflicts.length > 0 && (
        <Box paddingX={1}>
          <Text color="yellow">⚠ {liveData.conflicts.length} conflict(s) resolved by precedence</Text>
        </Box>
      )}

      <DriftSummary assets={liveData.assets} filterActive={filterOutOfSync} />

      <Box flexGrow={1} width={columns} height={mainRowHeight} overflow="hidden">
        <Panel title={assetsPanelTitle} active={activePanel === 0} width={assetsPanelWidth} height={mainRowHeight}>
          <AssetList
            items={displayAssets}
            selectedIndex={selectedIndices[0] ?? 0}
            active={activePanel === 0}
            maxVisible={assetListMaxVisible}
            showScope={liveData.scope === "project+global"}
          />
        </Panel>

        <Panel title="Details" active={activePanel === 1} width={detailsPanelWidth} height={mainRowHeight}>
          {selectedAsset ? (
            <Box flexDirection="column" gap={0}>
              <Box gap={1}>
                <Text dimColor>Kind:</Text>
                <Text>{truncate("Kind:", selectedAsset.kind)}</Text>
              </Box>
              <Box gap={1}>
                <Text dimColor>ID:</Text>
                <Text bold>{truncate("ID:", selectedAsset.id)}</Text>
              </Box>
              <Box gap={1}>
                <Text dimColor>Version:</Text>
                <Text>{truncate("Version:", selectedAsset.version)}</Text>
              </Box>
              {liveData.scope === "project+global" && (
                <Box gap={1}>
                  <Text dimColor>Scope:</Text>
                  <Text color={selectedAsset.scope === "project" ? "cyan" : "magenta"}>
                    {selectedAsset.scope}
                  </Text>
                </Box>
              )}
              <Box gap={1}>
                <Text dimColor>Source:</Text>
                <Text>
                  {truncate("Source:", `${selectedAsset.source}${selectedAsset.readOnly ? " (read-only)" : ""}`)}
                </Text>
              </Box>
              <Box gap={1}>
                <Text dimColor>Status:</Text>
                <StatusBadge status={selectedAsset.status} showLabel />
              </Box>
              <Box gap={1}>
                <Text dimColor>Targets:</Text>
                <Text>{truncate("Targets:", selectedAsset.targets.join(", ") || "none")}</Text>
              </Box>
              {selectedAsset.description && (
                <Box marginTop={1}>
                  <Text dimColor>{truncate("", selectedAsset.description)}</Text>
                </Box>
              )}
            </Box>
          ) : (
            <Text dimColor>No asset selected</Text>
          )}
        </Panel>
      </Box>

      <Panel
        title={`Sources${scopeFilter !== "all" ? ` [${scopeFilter}]` : ""}`}
        active={activePanel === 2}
        height={sourcesPanelHeight}
      >
        <Box flexDirection="column">
          {displaySources.length === 0 ? (
            <Text dimColor>No sources configured.</Text>
          ) : (
            displaySources.map((src) => (
              <Box key={`${src.scope}:${src.name}`} gap={2}>
                <Text color={src.scope === "project" ? "cyan" : "magenta"} bold>
                  {src.scope === "project" ? "P" : "G"}
                </Text>
                <Text color="cyan">{src.name}</Text>
                <Text dimColor>[{src.type}]</Text>
                <Text>
                  {src.count} asset{src.count !== 1 ? "s" : ""}
                </Text>
              </Box>
            ))
          )}
        </Box>
      </Panel>

      {action.status === "sync-done" && (
        <Box paddingX={1}>
          <Text color={action.errors.length > 0 ? "red" : "green"}>
            {action.errors.length > 0
              ? `✗ sync failed: ${action.errors[0]?.error}`
              : `✓ synced — ${action.written} written, ${action.unchanged} unchanged`}
          </Text>
        </Box>
      )}
      {action.status === "update-done" && (
        <Box paddingX={1}>
          <Text color={action.errors.length > 0 ? "red" : "green"}>
            {action.errors.length > 0
              ? `✗ update failed: ${action.errors[0]}`
              : action.updated === 0
              ? `✓ all entries up to date`
              : `✓ updated ${action.updated} entry/entries`}
          </Text>
        </Box>
      )}
      {action.status === "error" && (
        <Box paddingX={1}>
          <Text color="red">
            ✗ {action.kind} error: {action.message}
          </Text>
        </Box>
      )}

      <KeyHints hints={keyHints} />
    </Box>
  );
}
