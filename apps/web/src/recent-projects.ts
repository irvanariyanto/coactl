const STORAGE_KEY = "coactl.recentRoots";
const MAX_RECENT = 8;

export function loadRecentProjects(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      .map((p) => p.trim());
  } catch {
    return [];
  }
}

export function rememberProject(path: string): string[] {
  const trimmed = path.trim();
  if (!trimmed) return loadRecentProjects();
  const next = [trimmed, ...loadRecentProjects().filter((p) => p !== trimmed)].slice(0, MAX_RECENT);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function forgetProject(path: string): string[] {
  const trimmed = path.trim();
  const next = loadRecentProjects().filter((p) => p !== trimmed);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function projectBasename(path: string): string {
  const parts = path.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || path;
}
