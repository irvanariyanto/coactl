import { Box, Text } from "ink";
import { StatusBadge, type StatusKind } from "./StatusBadge.js";

export interface AssetItem {
  id: string;
  kind: string;
  status: StatusKind;
}

interface AssetListProps {
  items: AssetItem[];
  selectedIndex: number;
  active: boolean;
}

const KIND_ICONS: Record<string, string> = {
  skill: "⚡",
  command: "▶",
  rule: "📏",
  workflow: "🔄",
};

export function AssetList({ items, selectedIndex, active }: AssetListProps) {
  if (items.length === 0) {
    return <Text dimColor>No assets found. Run `coactl add` to create one.</Text>;
  }

  return (
    <Box flexDirection="column">
      {items.map((item, i) => {
        const isSelected = active && i === selectedIndex;
        const icon = KIND_ICONS[item.kind] ?? "·";
        return (
          <Box key={item.id} gap={1}>
            <Text color={isSelected ? "cyan" : undefined}>{isSelected ? "❯" : " "}</Text>
            <Text>{icon}</Text>
            <Text bold={isSelected} color={isSelected ? "cyan" : undefined}>
              {item.id}
            </Text>
            <StatusBadge status={item.status} />
          </Box>
        );
      })}
    </Box>
  );
}
