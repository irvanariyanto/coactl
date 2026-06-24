import { Box, Text } from "ink";
import { BRAND } from "../theme.js";

interface HeaderProps {
  subtitle?: string;
  version?: string;
  status?: string;
}

export function Header({ subtitle, version, status }: HeaderProps) {
  return (
    <Box borderStyle="single" borderBottom={true} borderLeft={false} borderRight={false} borderTop={false} paddingX={1} justifyContent="space-between">
      <Box gap={1}>
        <Text bold color="magenta">{BRAND}</Text>
        {subtitle && <Text color="white">{subtitle}</Text>}
      </Box>
      <Box gap={2}>
        {status && <Text dimColor>{status}</Text>}
        {version && <Text color="gray">v{version}</Text>}
      </Box>
    </Box>
  );
}
