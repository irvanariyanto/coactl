import { useInput } from "ink";
import { useState } from "react";

interface UseKeyboardNavOptions {
  panelCount: number;
  itemCounts: number[];
  onQuit: () => void;
  onSelect?: (panelIndex: number, itemIndex: number) => void;
}

interface KeyboardNavState {
  activePanel: number;
  selectedIndices: number[];
}

export function useKeyboardNav({ panelCount, itemCounts, onQuit, onSelect }: UseKeyboardNavOptions): KeyboardNavState {
  const [activePanel, setActivePanel] = useState(0);
  const [selectedIndices, setSelectedIndices] = useState<number[]>(() => new Array(panelCount).fill(0) as number[]);

  useInput((input, key) => {
    if (input === "q") {
      onQuit();
      return;
    }

    if (key.tab) {
      setActivePanel((prev) => (prev + 1) % panelCount);
      return;
    }

    const maxIndex = (itemCounts[activePanel] ?? 1) - 1;

    if (input === "j" || key.downArrow) {
      setSelectedIndices((prev) => {
        const next = [...prev];
        next[activePanel] = Math.min((next[activePanel] ?? 0) + 1, maxIndex);
        return next;
      });
      return;
    }

    if (input === "k" || key.upArrow) {
      setSelectedIndices((prev) => {
        const next = [...prev];
        next[activePanel] = Math.max((next[activePanel] ?? 0) - 1, 0);
        return next;
      });
      return;
    }

    if (key.return && onSelect) {
      onSelect(activePanel, selectedIndices[activePanel] ?? 0);
    }
  });

  return { activePanel, selectedIndices };
}
