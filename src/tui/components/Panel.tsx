import { Box, Text } from "ink";
import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  active?: boolean;
  children: ReactNode;
  width?: string | number;
  height?: string | number;
  // Explicit growth along the parent's main axis (row: horizontal, column:
  // vertical). Callers must say this directly — inferring it from width/height
  // is ambiguous because the same props mean different axes depending on the
  // parent's flexDirection. Defaults to not growing.
  grow?: number;
}

export function Panel({ title, active = false, children, width, height, grow = 0 }: PanelProps) {
  const borderColor = active ? "cyan" : "gray";
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      width={width}
      height={height}
      flexGrow={grow}
      flexShrink={0}
      overflow="hidden"
    >
      <Box paddingX={1}>
        <Text bold color={active ? "cyan" : "white"}>
          {title}
        </Text>
      </Box>
      <Box flexDirection="column" paddingX={1} flexGrow={1} overflow="hidden">
        {children}
      </Box>
    </Box>
  );
}
