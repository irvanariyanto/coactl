export type DraftKind = "skill" | "rule" | "command" | "workflow";

function key(kind: DraftKind, tool: string, scope: string, id: string, filePath: string): string {
  return `coactl.draft:${kind}:${tool}:${scope}:${id}:${filePath}`;
}

export function loadDraft(
  kind: DraftKind,
  tool: string,
  scope: string,
  id: string,
  filePath: string,
): string | null {
  try {
    return localStorage.getItem(key(kind, tool, scope, id, filePath));
  } catch {
    return null;
  }
}

export function saveDraft(
  kind: DraftKind,
  tool: string,
  scope: string,
  id: string,
  filePath: string,
  contents: string,
): void {
  try {
    localStorage.setItem(key(kind, tool, scope, id, filePath), contents);
  } catch {
    /* quota / private mode */
  }
}

export function clearDraft(
  kind: DraftKind,
  tool: string,
  scope: string,
  id: string,
  filePath: string,
): void {
  try {
    localStorage.removeItem(key(kind, tool, scope, id, filePath));
  } catch {
    /* ignore */
  }
}
