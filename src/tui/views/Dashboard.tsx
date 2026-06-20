import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useState } from "react";
import { Header } from "../components/Header.js";
import { Panel } from "../components/Panel.js";
import { AssetList } from "../components/AssetList.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { KeyHints } from "../components/KeyHints.js";
import { useKeyboardNav } from "../hooks/useKeyboardNav.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import type { StatusKind } from "../components/StatusBadge.js";

// Row budget for chrome that isn't the two scrollable panels, so the
// dashboard's total height never exceeds the terminal and pushes the
// header off-screen (Ink doesn't clip overflow by default).
const HEADER_ROWS = 2;
const KEY_HINTS_ROWS = 1;
const PANEL_CHROME_ROWS = 3; // border-top + title + border-bottom
const MAX_SOURCES_ROWS = 4;

export interface DashboardAsset {
  id: string;
  kind: string;
  status: StatusKind;
  version: string;
  description: string;
  targets: string[];
  source: string;
  readOnly: boolean;
}

export interface DashboardSource {
  name: string;
  type: string;
  count: number;
}

export interface DashboardData {
  assets: DashboardAsset[];
  sources: DashboardSource[];
  conflicts: Array<{ id: string; candidates: string[] }>;
}

export interface SyncResult {
  written: number;
  unchanged: number;
  errors: Array<{ path: string; error: string }>;
}

type SyncState =
  | { status: "idle" }
  | { status: "syncing" }
  | { status: "done"; result: SyncResult }
  | { status: "error"; message: string };

const PANEL_NAMES = ["assets", "details", "sources"] as const;

interface DashboardProps {
  version: string;
  data: DashboardData;
  onSync: () => Promise<SyncResult>;
}

export function Dashboard({ version, data, onSync }: DashboardProps) {
  const { exit } = useApp();
  const { rows, columns } = useTerminalSize();
  const [syncState, setSyncState] = useState<SyncState>({ status: "idle" });

  const { activePanel, selectedIndices } = useKeyboardNav({
    panelCount: PANEL_NAMES.length,
    itemCounts: [Math.max(data.assets.length, 1), 1, Math.max(data.sources.length, 1)],
    onQuit: () => exit(),
  });

  const selectedAsset = data.assets[selectedIndices[0] ?? 0];

  useInput((input) => {
    if (input === "s" && syncState.status !== "syncing") {
      setSyncState({ status: "syncing" });
    }
  });

  useEffect(() => {
    if (syncState.status !== "syncing") return;
    onSync()
      .then((result) => setSyncState({ status: "done", result }))
      .catch((err: Error) => setSyncState({ status: "error", message: err.message }));
  }, [syncState.status]);

  const keyHints =
    syncState.status === "syncing"
      ? [{ key: "...", label: "syncing" }]
      : [
          { key: "Tab", label: "panel" },
          { key: "j/k", label: "nav" },
          { key: "s", label: "sync" },
          { key: "q", label: "quit" },
        ];

  const conflictsRows = data.conflicts.length > 0 ? 1 : 0;
  const syncStatusRows = syncState.status === "done" || syncState.status === "error" ? 1 : 0;
  const sourcesContentRows = Math.max(1, Math.min(data.sources.length, MAX_SOURCES_ROWS));
  const sourcesPanelHeight = sourcesContentRows + PANEL_CHROME_ROWS;

  const reservedRows = HEADER_ROWS + conflictsRows + sourcesPanelHeight + syncStatusRows + KEY_HINTS_ROWS;
  const mainRowHeight = Math.max(rows - reservedRows, 5);
  const assetListMaxVisible = Math.max(mainRowHeight - PANEL_CHROME_ROWS, 1);

  // Pin both side-by-side panels to explicit column counts. A "50%" width or
  // bare flexGrow only *stretches* a panel to fill space — it doesn't clamp
  // it, so a long unbreakable value (e.g. the Targets line) can still force
  // the panel wider than its share and push its border past the terminal
  // edge, wrapping the whole row at the raw-terminal level.
  const assetsPanelWidth = Math.max(Math.floor(columns / 2), 20);
  const detailsPanelWidth = Math.max(columns - assetsPanelWidth, 20);
  // Pre-truncate detail values to an exact column budget instead of relying on
  // Ink's wrap="truncate-end" inside a flex row — nested flex+text wrapping
  // has its own edge cases (see panel width fix above) and a plain string
  // truncation is simpler to reason about and pixel-exact.
  const detailsContentWidth = detailsPanelWidth - 4; // border (2) + paddingX (2)
  const truncateValue = (label: string, value: string): string => {
    const budget = detailsContentWidth - label.length - 1; // -1 for the gap
    if (budget <= 0) return "";
    if (value.length <= budget) return value;
    return budget === 1 ? "…" : `${value.slice(0, budget - 1)}…`;
  };

  return (
    <Box flexDirection="column" width="100%" height={rows} overflow="hidden">
      <Header subtitle="Dashboard" version={version} />

      {data.conflicts.length > 0 && (
        <Box paddingX={1}>
          <Text color="yellow">⚠ {data.conflicts.length} conflict(s) resolved by precedence</Text>
        </Box>
      )}

      <Box flexGrow={1} width={columns} height={mainRowHeight} overflow="hidden">
        <Panel
          title={`Assets (${data.assets.length})`}
          active={activePanel === 0}
          width={assetsPanelWidth}
          height={mainRowHeight}
        >
          <AssetList
            items={data.assets}
            selectedIndex={selectedIndices[0] ?? 0}
            active={activePanel === 0}
            maxVisible={assetListMaxVisible}
          />
        </Panel>

        <Panel title="Details" active={activePanel === 1} width={detailsPanelWidth} height={mainRowHeight}>
          {selectedAsset ? (
            <Box flexDirection="column" gap={0}>
              <Box gap={1}>
                <Text dimColor>Kind:</Text>
                <Text>{truncateValue("Kind:", selectedAsset.kind)}</Text>
              </Box>
              <Box gap={1}>
                <Text dimColor>ID:</Text>
                <Text bold>{truncateValue("ID:", selectedAsset.id)}</Text>
              </Box>
              <Box gap={1}>
                <Text dimColor>Version:</Text>
                <Text>{truncateValue("Version:", selectedAsset.version)}</Text>
              </Box>
              <Box gap={1}>
                <Text dimColor>Source:</Text>
                <Text>
                  {truncateValue(
                    "Source:",
                    `${selectedAsset.source}${selectedAsset.readOnly ? " (read-only)" : ""}`,
                  )}
                </Text>
              </Box>
              <Box gap={1}>
                <Text dimColor>Status:</Text>
                <StatusBadge status={selectedAsset.status} showLabel />
              </Box>
              <Box gap={1}>
                <Text dimColor>Targets:</Text>
                <Text>{truncateValue("Targets:", selectedAsset.targets.join(", ") || "none")}</Text>
              </Box>
              {selectedAsset.description && (
                <Box marginTop={1}>
                  <Text dimColor>{truncateValue("", selectedAsset.description)}</Text>
                </Box>
              )}
            </Box>
          ) : (
            <Text dimColor>No asset selected</Text>
          )}
        </Panel>
      </Box>

      <Panel title="Sources" active={activePanel === 2} height={sourcesPanelHeight}>
        <Box flexDirection="column">
          {data.sources.length === 0 ? (
            <Text dimColor>No sources configured.</Text>
          ) : (
            data.sources.map((src) => (
              <Box key={src.name} gap={2}>
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

      {syncState.status === "done" && (
        <Box paddingX={1}>
          <Text color={syncState.result.errors.length > 0 ? "red" : "green"}>
            {syncState.result.errors.length > 0
              ? `✗ Sync failed: ${syncState.result.errors[0]?.error}`
              : `✓ Synced — ${syncState.result.written} written, ${syncState.result.unchanged} unchanged`}
          </Text>
        </Box>
      )}
      {syncState.status === "error" && (
        <Box paddingX={1}>
          <Text color="red">✗ Sync error: {syncState.message}</Text>
        </Box>
      )}

      <KeyHints hints={keyHints} />
    </Box>
  );
}
