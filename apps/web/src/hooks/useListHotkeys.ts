import { useEffect, type RefObject } from "react";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export interface ListHotkeysOptions {
  enabled?: boolean;
  filterRef: RefObject<HTMLInputElement | null>;
  /** Open create / new flow. */
  onNew: () => void;
  /** Clear multi-select (and related panels). */
  onClearSelection: () => void;
  /** Clear the filter query. */
  onClearFilter: () => void;
  hasFilter: boolean;
  hasSelection: boolean;
  /** Open the primary row (first selected, else first visible). */
  onOpen: () => void;
}

/** `/` filter, `n` new, Enter open, Esc clear — when not typing in a field. */
export function useListHotkeys({
  enabled = true,
  filterRef,
  onNew,
  onClearSelection,
  onClearFilter,
  hasFilter,
  hasSelection,
  onOpen,
}: ListHotkeysOptions): void {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const typing = isTypingTarget(e.target);

      if (e.key === "Escape") {
        if (typing && e.target instanceof HTMLInputElement && e.target === filterRef.current) {
          e.preventDefault();
          onClearFilter();
          filterRef.current?.blur();
          return;
        }
        if (!typing && (hasSelection || hasFilter)) {
          e.preventDefault();
          onClearSelection();
          onClearFilter();
        }
        return;
      }

      if (typing) return;

      if (e.key === "/") {
        e.preventDefault();
        filterRef.current?.focus();
        filterRef.current?.select();
        return;
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        onNew();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        onOpen();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    enabled,
    filterRef,
    onNew,
    onClearSelection,
    onClearFilter,
    hasFilter,
    hasSelection,
    onOpen,
  ]);
}
