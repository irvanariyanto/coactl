import { Box, Text, useApp } from "ink";
import { Header } from "../components/Header.js";
import { Panel } from "../components/Panel.js";
import { AssetList, type AssetItem } from "../components/AssetList.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { KeyHints } from "../components/KeyHints.js";
import { useKeyboardNav } from "../hooks/useKeyboardNav.js";

const STUB_ASSETS: AssetItem[] = [
  { id: "review", kind: "skill", status: "synced" },
  { id: "test", kind: "command", status: "synced" },
  { id: "format", kind: "rule", status: "drifted" },
  { id: "deploy-pipeline", kind: "workflow", status: "missing" },
];

const STUB_SOURCES = [{ name: "local", path: "./assets", count: 4 }];

interface DashboardProps {
  version: string;
}

const PANEL_NAMES = ["assets", "details", "sources"] as const;

export function Dashboard({ version }: DashboardProps) {
  const { exit } = useApp();

  const { activePanel, selectedIndices } = useKeyboardNav({
    panelCount: PANEL_NAMES.length,
    itemCounts: [STUB_ASSETS.length, 1, STUB_SOURCES.length],
    onQuit: () => exit(),
  });

  const selectedAsset = STUB_ASSETS[selectedIndices[0] ?? 0];

  return (
    <Box flexDirection="column" width="100%">
      <Header subtitle="Dashboard" version={version} />

      <Box flexGrow={1}>
        <Panel title="Assets" active={activePanel === 0} width="50%">
          <AssetList items={STUB_ASSETS} selectedIndex={selectedIndices[0] ?? 0} active={activePanel === 0} />
        </Panel>

        <Panel title="Details" active={activePanel === 1}>
          {selectedAsset ? (
            <Box flexDirection="column" gap={0}>
              <Box gap={1}>
                <Text dimColor>Kind:</Text>
                <Text>{selectedAsset.kind}</Text>
              </Box>
              <Box gap={1}>
                <Text dimColor>ID:</Text>
                <Text bold>{selectedAsset.id}</Text>
              </Box>
              <Box gap={1}>
                <Text dimColor>Version:</Text>
                <Text>0.1.0</Text>
              </Box>
              <Box gap={1}>
                <Text dimColor>Source:</Text>
                <Text>local</Text>
              </Box>
              <Box gap={1}>
                <Text dimColor>Status:</Text>
                <StatusBadge status={selectedAsset.status} showLabel />
              </Box>
              <Box gap={1}>
                <Text dimColor>Targets:</Text>
                <Text>claude-code, cursor</Text>
              </Box>
              <Box marginTop={1}>
                <Text dimColor italic>
                  (stub data)
                </Text>
              </Box>
            </Box>
          ) : (
            <Text dimColor>No asset selected</Text>
          )}
        </Panel>
      </Box>

      <Panel title="Sources" active={activePanel === 2} height={5}>
        <Box flexDirection="column">
          {STUB_SOURCES.map((src) => (
            <Box key={src.name} gap={2}>
              <Text color="cyan">{src.name}</Text>
              <Text dimColor>{src.path}</Text>
              <Text>
                {src.count} asset{src.count !== 1 ? "s" : ""}
              </Text>
            </Box>
          ))}
        </Box>
      </Panel>

      <KeyHints />
    </Box>
  );
}
