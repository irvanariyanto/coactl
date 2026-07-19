import type { Mode, ResourceKind, SkillTool } from "./nav";
import { availableResourceKinds } from "./nav";

const STORAGE_KEY = "coactl.lastResourceNav";

export interface LastResourceNav {
  tool: SkillTool;
  kind: ResourceKind;
}

type Store = Partial<Record<Mode, LastResourceNav>>;

function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Store;
  } catch {
    return {};
  }
}

export function loadLastResourceNav(mode: Mode): LastResourceNav | null {
  const entry = loadStore()[mode];
  if (!entry?.tool || !entry?.kind) return null;
  return entry;
}

export function rememberResourceNav(mode: Mode, tool: SkillTool, kind: ResourceKind): void {
  const store = loadStore();
  store[mode] = { tool, kind };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/** Prefer last kind for this mode if the tool supports it; else skills. */
export function preferredResourceKind(mode: Mode, tool: SkillTool): ResourceKind {
  const last = loadLastResourceNav(mode);
  const available = availableResourceKinds(tool);
  if (last && available.includes(last.kind)) return last.kind;
  return "skills";
}
