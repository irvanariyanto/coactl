import { Text } from "ink";

export type StatusKind = "synced" | "drifted" | "error" | "unknown" | "missing";

const STATUS_CONFIG: Record<StatusKind, { symbol: string; color: string; label: string }> = {
  synced: { symbol: "✓", color: "green", label: "synced" },
  drifted: { symbol: "⚠", color: "yellow", label: "drifted" },
  error: { symbol: "✗", color: "red", label: "error" },
  missing: { symbol: "○", color: "gray", label: "missing" },
  unknown: { symbol: "?", color: "gray", label: "unknown" },
};

interface StatusBadgeProps {
  status: StatusKind;
  showLabel?: boolean;
}

export function StatusBadge({ status, showLabel = false }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status];
  return (
    <Text color={cfg.color}>
      {cfg.symbol}
      {showLabel ? ` ${cfg.label}` : ""}
    </Text>
  );
}
