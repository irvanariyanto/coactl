import { Box, Text } from "ink";
import { StatusBadge, type StatusKind } from "./StatusBadge.js";

export interface AssetItem {
  id: string;
  kind: string;
  status: StatusKind;
  scope?: "global" | "project";
}

interface AssetListProps {
  items: AssetItem[];
  selectedIndex: number;
  active: boolean;
  maxVisible?: number;
  showScope?: boolean;
}

// Plain single-width glyphs only — emoji (⚡📏🔄) measure as double-width in
// string-width but many terminals (tmux included) render them as single-width,
// and that mismatch made Yoga miscompute row height, inserting a blank line
// per row and pushing the header off-screen on long lists.
const KIND_ICONS: Record<string, string> = {
  skill: "◆",
  command: "▶",
  rule: "§",
  workflow: "↻",
};

function computeWindow(total: number, selected: number, limit: number) {
  if (limit <= 0 || total <= limit) {
    return { start: 0, end: total, showAbove: false, showBelow: false };
  }

  let capacity = limit;
  let start = Math.max(0, Math.min(selected - Math.floor((capacity - 1) / 2), total - capacity));
  let end = start + capacity;
  let showAbove = start > 0;
  let showBelow = end < total;

  const reserve = (showAbove ? 1 : 0) + (showBelow ? 1 : 0);
  if (reserve > 0) {
    capacity = Math.max(limit - reserve, 1);
    start = Math.max(0, Math.min(selected - Math.floor((capacity - 1) / 2), total - capacity));
    end = start + capacity;
    showAbove = start > 0;
    showBelow = end < total;
  }

  return { start, end, showAbove, showBelow };
}

export function AssetList({ items, selectedIndex, active, maxVisible, showScope }: AssetListProps) {
  if (items.length === 0) {
    return <Text dimColor>No assets found. Run `coactl add` to create one.</Text>;
  }

  const limit = maxVisible ?? items.length;
  const { start, end, showAbove, showBelow } = computeWindow(items.length, selectedIndex, limit);
  const visible = items.slice(start, end);

  return (
    <Box flexDirection="column">
      {showAbove && <Text dimColor>▲ {start} more above</Text>}
      {visible.map((item, i) => {
        const realIndex = start + i;
        const isSelected = active && realIndex === selectedIndex;
        const icon = KIND_ICONS[item.kind] ?? "·";
        const idColor = isSelected ? "cyan"
          : item.status === "error" ? "red"
          : item.status === "drifted" ? "yellow"
          : item.status === "missing" ? "gray"
          : undefined;
        return (
          <Box key={item.id} gap={1}>
            <Text color={isSelected ? "cyan" : undefined}>{isSelected ? "❯" : " "}</Text>
            <Text>{icon}</Text>
            <Text bold={isSelected} color={idColor} wrap="truncate-end">
              {item.id}
            </Text>
            <StatusBadge status={item.status} />
            {showScope && item.scope && (
              <Text color={item.scope === "project" ? "cyan" : "magenta"} dimColor={!isSelected}>
                {item.scope === "project" ? "P" : "G"}
              </Text>
            )}
          </Box>
        );
      })}
      {showBelow && <Text dimColor>▼ {items.length - end} more below</Text>}
    </Box>
  );
}
