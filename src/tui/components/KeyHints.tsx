import { Box, Text } from "ink";

interface KeyHint {
  key: string;
  label: string;
}

interface KeyHintsProps {
  hints?: KeyHint[];
}

const DEFAULT_HINTS: KeyHint[] = [
  { key: "Tab", label: "panel" },
  { key: "j/k", label: "nav" },
  { key: "Enter", label: "select" },
  { key: "q", label: "quit" },
];

export function KeyHints({ hints = DEFAULT_HINTS }: KeyHintsProps) {
  return (
    <Box paddingX={1} gap={2}>
      {hints.map((hint) => (
        <Box key={hint.key} gap={1}>
          <Text color="cyan" bold>
            [{hint.key}]
          </Text>
          <Text dimColor>{hint.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
