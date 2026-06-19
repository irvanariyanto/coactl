import { Box, Text } from "ink";
import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  active?: boolean;
  children: ReactNode;
  width?: string | number;
  height?: string | number;
}

export function Panel({ title, active = false, children, width, height }: PanelProps) {
  const borderColor = active ? "cyan" : "gray";
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={borderColor} width={width} height={height} flexGrow={width ? 0 : 1}>
      <Box paddingX={1}>
        <Text bold color={active ? "cyan" : "white"}>
          {title}
        </Text>
      </Box>
      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {children}
      </Box>
    </Box>
  );
}
