import { Box, Text } from "ink";
import { BRAND } from "../theme.js";

interface HeaderProps {
  subtitle?: string;
  version?: string;
}

export function Header({ subtitle, version }: HeaderProps) {
  return (
    <Box borderStyle="single" borderBottom={true} borderLeft={false} borderRight={false} borderTop={false} paddingX={1} justifyContent="space-between">
      <Text bold color="cyan">
        {BRAND}
        {subtitle ? ` — ${subtitle}` : ""}
      </Text>
      {version && <Text dimColor>v{version}</Text>}
    </Box>
  );
}
