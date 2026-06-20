import { Box, Text } from "ink";
import type { StatusKind } from "./StatusBadge.js";

interface DriftSummaryProps {
  assets: Array<{ status: StatusKind }>;
  filterActive: boolean;
}

export function DriftSummary({ assets, filterActive }: DriftSummaryProps) {
  const counts: Record<StatusKind, number> = { synced: 0, drifted: 0, missing: 0, error: 0, unknown: 0 };
  for (const a of assets) counts[a.status]++;
  const outOfSync = assets.length - counts.synced;

  return (
    <Box paddingX={1} gap={2}>
      {outOfSync === 0 ? (
        <Text color="green">✓ all synced ({counts.synced})</Text>
      ) : (
        <>
          <Text color="green">✓ {counts.synced}</Text>
          {counts.drifted > 0 && <Text color="yellow">⚠ {counts.drifted} drifted</Text>}
          {counts.missing > 0 && <Text color="gray">○ {counts.missing} missing</Text>}
          {counts.error > 0 && <Text color="red">✗ {counts.error} error</Text>}
          {counts.unknown > 0 && <Text dimColor>? {counts.unknown} unknown</Text>}
        </>
      )}
      {filterActive && <Text color="cyan">  [not-synced only — f to clear]</Text>}
    </Box>
  );
}
