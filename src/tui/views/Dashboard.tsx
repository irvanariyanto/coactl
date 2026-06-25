import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useState } from "react";
import { Header } from "../components/Header.js";
import { Panel } from "../components/Panel.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { KeyHints } from "../components/KeyHints.js";
import { ImportView, type ImportCandidate, type ImportTool } from "../components/ImportView.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import type { StatusKind } from "../components/StatusBadge.js";
import { capabilityFor } from "../../adapters/capability-matrix.js";
import type { AssetKind, Target } from "../../schema/index.js";

type ScreenId = "dashboard" | "assets" | "tools" | "preview" | "conflicts" | "logs" | "settings";
type NavId = ScreenId | "import";
type FocusArea = "nav" | "main" | "details";
type ActionKind = "sync" | "update" | "refresh";
type Overlay = "help" | "palette" | "search" | "confirm-sync" | null;

export type DashboardScopeFilter = "all" | "global" | "project";
export type PreviewAction = "create" | "update" | "delete" | "skip" | "conflict";
export type DashboardLogLevel = "success" | "warning" | "error" | "info";
export type ToolState = "configured" | "available" | "inactive";

export interface DashboardOutput {
  path: string;
  target: Target;
  assetId: string;
  scope: "global" | "project";
  action: PreviewAction;
  reason: string;
}

export interface DashboardAsset {
  id: string;
  kind: AssetKind;
  status: StatusKind;
  version: string;
  description: string;
  targets: Target[];
  source: string;
  readOnly: boolean;
  scope: "global" | "project";
  sourcePath?: string;
  modifiedAt?: string;
  outputs?: DashboardOutput[];
  diagnostics?: string[];
}

export interface DashboardSource {
  name: string;
  type: string;
  count: number;
  scope: "global" | "project";
  path?: string;
}

export interface DashboardConflict {
  id: string;
  candidates: string[];
  scope: "global" | "project";
  winner?: string;
}

export interface DashboardTool {
  id: Target;
  label: string;
  state: ToolState;
  targetPath: string;
  installReason?: string;
  importableCount?: number;
  assetCount: number;
  compatibleAssetCount: number;
  nativeCount: number;
  degradedCount: number;
  skippedCount: number;
  scopes: Array<"global" | "project">;
  note?: string;
}

export interface DashboardWorkspace {
  scope: "global" | "project";
  root: string;
  manifestPath: string;
  manifestExists: boolean;
  assetCount: number;
  sourceCount: number;
  writable?: boolean;
}

export interface DashboardActivity {
  level: DashboardLogLevel;
  message: string;
  detail?: string;
  scope?: "global" | "project";
  time?: string;
}

export interface DashboardData {
  assets: DashboardAsset[];
  sources: DashboardSource[];
  conflicts: DashboardConflict[];
  scope: "project+global" | "global";
  outputs?: DashboardOutput[];
  tools?: DashboardTool[];
  workspaces?: DashboardWorkspace[];
  activity?: DashboardActivity[];
}

export interface SyncResult {
  written: number;
  unchanged: number;
  errors: Array<{ path: string; error: string }>;
}

type ActionState =
  | { status: "idle" }
  | { status: "running"; kind: ActionKind }
  | { status: "running-tool-toggle"; target: Target; enable: boolean; scope: DashboardScopeFilter }
  | { status: "sync-done"; scope: DashboardScopeFilter; written: number; unchanged: number; errors: SyncResult["errors"] }
  | { status: "update-done"; updated: number; errors: string[] }
  | { status: "tool-toggle-done"; target: Target; enable: boolean; updated: number; errors: string[] }
  | { status: "refresh-done" }
  | { status: "error"; kind: ActionKind; message: string };

export interface DashboardProps {
  version: string;
  data: DashboardData;
  onSync: (scope: DashboardScopeFilter) => Promise<SyncResult>;
  onRefresh: () => Promise<DashboardData>;
  onUpdate: () => Promise<{ updated: number; errors: string[] }>;
  onToggleTool: (target: Target, enable: boolean, scope: DashboardScopeFilter) => Promise<{ updated: number; errors: string[] }>;
  onListImportAssets: (tool: ImportTool, global: boolean) => Promise<ImportCandidate[]>;
  onImport: (tool: ImportTool, ids: string[], global: boolean) => Promise<{ imported: number; errors: string[] }>;
  importGlobal: boolean;
}

const SCREEN_ITEMS: Array<{ id: NavId; key: string; label: string; hint: string }> = [
  { id: "dashboard", key: "1", label: "Dashboard", hint: "status" },
  { id: "assets", key: "2", label: "Assets", hint: "inspect" },
  { id: "tools", key: "3", label: "Tools", hint: "targets" },
  { id: "preview", key: "4", label: "Preview", hint: "changes" },
  { id: "conflicts", key: "5", label: "Conflicts", hint: "resolve" },
  { id: "logs", key: "6", label: "Logs", hint: "debug" },
  { id: "settings", key: "7", label: "Settings", hint: "config" },
  { id: "import", key: "8", label: "Import", hint: "existing" },
];

const STATUS_PRIORITY: Record<StatusKind, number> = {
  error: 0,
  drifted: 1,
  missing: 2,
  unknown: 3,
  synced: 4,
};

const ACTION_PRIORITY: Record<PreviewAction, number> = {
  conflict: 0,
  update: 1,
  create: 2,
  delete: 3,
  skip: 4,
};

const CAPABILITY_COLOR = {
  native: "green",
  degraded: "yellow",
  skip: "gray",
} as const;

const TARGET_LABEL: Record<Target, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  antigravity: "Antigravity",
  gemini: "Gemini CLI",
  cline: "Cline",
  "roo-code": "Roo Code",
  continue: "Continue",
  aider: "Aider",
  opencode: "OpenCode",
  zed: "Zed",
  jetbrains: "JetBrains AI",
  cursor: "Cursor",
  windsurf: "Windsurf",
  copilot: "GitHub Copilot",
};

const ACTION_COLOR: Record<PreviewAction, string> = {
  create: "green",
  update: "yellow",
  delete: "red",
  skip: "gray",
  conflict: "red",
};

const LOG_COLOR: Record<DashboardLogLevel, string> = {
  success: "green",
  warning: "yellow",
  error: "red",
  info: "gray",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function truncate(value: string | undefined, width: number): string {
  if (!value) return "";
  if (width <= 0) return "";
  if (value.length <= width) return value;
  if (width === 1) return "…";
  return `${value.slice(0, width - 1)}…`;
}

function statusLabel(status: StatusKind): string {
  if (status === "drifted") return "outdated";
  return status;
}

function actionLabel(action: PreviewAction): string {
  if (action === "create") return "create";
  if (action === "update") return "update";
  if (action === "delete") return "delete";
  if (action === "conflict") return "conflict";
  return "skip";
}

function syncLabel(action: PreviewAction): string {
  if (action === "skip") return "synced";
  if (action === "create") return "missing";
  if (action === "update") return "outdated";
  if (action === "conflict") return "modified";
  return "remove";
}

function assetTargetSyncLabel(asset: DashboardAsset, target: Target, tools?: DashboardTool[]): { label: string; color: string } {
  const tool = tools?.find((candidate) => candidate.id === target);
  if (tool && tool.state !== "configured") return { label: "not installed", color: "gray" };

  const targetOutputs = (asset.outputs ?? []).filter((output) => output.target === target);
  if (targetOutputs.length === 0) return { label: "not emitted", color: "gray" };
  if (targetOutputs.some((output) => output.action === "conflict")) return { label: "modified", color: "red" };
  if (targetOutputs.some((output) => output.action === "update")) return { label: "outdated", color: "yellow" };
  if (targetOutputs.some((output) => output.action === "create")) return { label: "missing", color: "yellow" };
  return { label: "synced", color: "green" };
}

function toolEnableState(tool: DashboardTool): { label: "enabled" | "partial" | "disabled" | "unsupported"; color: string; nextEnable: boolean } {
  if (tool.compatibleAssetCount === 0) return { label: "unsupported", color: "gray", nextEnable: true };
  if (tool.assetCount === 0) return { label: "disabled", color: "gray", nextEnable: true };
  if (tool.assetCount >= tool.compatibleAssetCount) return { label: "enabled", color: "green", nextEnable: false };
  return { label: "partial", color: "yellow", nextEnable: true };
}

function formatCount(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function compactPath(path: string, width: number): string {
  if (path.length <= width) return path;
  const segments = path.split("/");
  if (segments.length <= 2) return truncate(path, width);
  const tail = segments.slice(-2).join("/");
  return truncate(`…/${tail}`, width);
}

function outputsForScope(data: DashboardData, scopeFilter: DashboardScopeFilter): DashboardOutput[] {
  const outputs = data.outputs ?? data.assets.flatMap((asset) => asset.outputs ?? []);
  return outputs.filter((output) => scopeFilter === "all" || output.scope === scopeFilter);
}

function visibleAssets(
  assets: DashboardAsset[],
  scopeFilter: DashboardScopeFilter,
  filterOutOfSync: boolean,
  searchQuery: string,
  sortMode: SortMode,
): DashboardAsset[] {
  const query = searchQuery.trim().toLowerCase();
  return [...assets]
    .filter((asset) => scopeFilter === "all" || asset.scope === scopeFilter)
    .filter((asset) => !filterOutOfSync || asset.status !== "synced")
    .filter((asset) => {
      if (!query) return true;
      return [
        asset.id,
        asset.kind,
        asset.description,
        asset.source,
        asset.sourcePath ?? "",
        asset.targets.join(" "),
        asset.status,
      ].some((value) => value.toLowerCase().includes(query));
    })
    .sort((a, b) => {
      if (sortMode === "kind") return `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`);
      if (sortMode === "path") return `${a.sourcePath ?? ""}:${a.id}`.localeCompare(`${b.sourcePath ?? ""}:${b.id}`);
      if (sortMode === "tool") return `${a.targets[0] ?? ""}:${a.id}`.localeCompare(`${b.targets[0] ?? ""}:${b.id}`);
      return STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] || a.id.localeCompare(b.id);
    });
}

type SortMode = "status" | "kind" | "tool" | "path";
function countByStatus(assets: DashboardAsset[]) {
  return assets.reduce(
    (acc, asset) => {
      acc[asset.status]++;
      return acc;
    },
    { synced: 0, drifted: 0, missing: 0, error: 0, unknown: 0 } as Record<StatusKind, number>,
  );
}

function previewSummary(outputs: DashboardOutput[]) {
  return outputs.reduce(
    (acc, output) => {
      acc[output.action]++;
      return acc;
    },
    { create: 0, update: 0, delete: 0, skip: 0, conflict: 0 } as Record<PreviewAction, number>,
  );
}

function suggestedAction(data: DashboardData, outputs: DashboardOutput[]): { color: string; message: string } {
  const missingConfig = (data.workspaces ?? []).find((workspace) => !workspace.manifestExists);
  if (missingConfig && data.assets.length === 0) {
    return {
      color: "yellow",
      message: `Run setup or create ${missingConfig.scope} manifest at ${missingConfig.manifestPath}.`,
    };
  }
  if (data.conflicts.length > 0) {
    return {
      color: "red",
      message: "Review conflicts before syncing. Press 5 to inspect resolution choices.",
    };
  }
  const summary = previewSummary(outputs);
  if (summary.conflict > 0) {
    return { color: "red", message: "Preview contains modified target files. Open Preview before applying changes." };
  }
  const pending = summary.create + summary.update + summary.delete;
  if (pending > 0) {
    return { color: "yellow", message: `Preview ${formatCount(pending, "pending change")} and press s to sync.` };
  }
  if (data.assets.length === 0) {
    return { color: "gray", message: "No assets found yet. Add assets to your shared assets directory or run import." };
  }
  return { color: "green", message: "Everything is synced. No action needed right now." };
}

function actionMessage(action: ActionState): DashboardActivity | null {
  if (action.status === "sync-done") {
    if (action.errors.length > 0) {
      return {
        level: "error",
        message: `Sync failed: ${action.errors[0]?.path ?? "target path"} could not be written.`,
        detail: action.errors[0]?.error ?? "Check permissions or update the configured path.",
      };
    }
    return {
      level: "success",
      message: `Sync complete for ${action.scope}.`,
      detail: `${action.written} written, ${action.unchanged} unchanged.`,
    };
  }
  if (action.status === "update-done") {
    if (action.errors.length > 0) {
      return {
        level: "error",
        message: "Update failed while refreshing lockfile entries.",
        detail: action.errors[0],
      };
    }
    return {
      level: "success",
      message: action.updated === 0 ? "Lockfiles are already current." : `Updated ${formatCount(action.updated, "lockfile entry", "lockfile entries")}.`,
    };
  }
  if (action.status === "tool-toggle-done") {
    if (action.errors.length > 0) {
      return {
        level: "error",
        message: `${action.enable ? "Enable" : "Disable"} ${TARGET_LABEL[action.target]} failed.`,
        detail: action.errors[0],
      };
    }
    return {
      level: "success",
      message: `${action.enable ? "Enabled" : "Disabled"} ${TARGET_LABEL[action.target]}.`,
      detail: `${action.updated} asset${action.updated === 1 ? "" : "s"} updated.`,
    };
  }
  if (action.status === "refresh-done") {
    return { level: "success", message: "Dashboard refreshed from disk." };
  }
  if (action.status === "error") {
    return {
      level: "error",
      message: `${action.kind} failed.`,
      detail: action.message,
    };
  }
  return null;
}

function rowWindow<T>(items: T[], selected: number, limit: number): { visible: T[]; start: number; above: number; below: number } {
  if (items.length <= limit) return { visible: items, start: 0, above: 0, below: 0 };
  const reserved = 2;
  const capacity = Math.max(1, limit - reserved);
  const start = clamp(selected - Math.floor(capacity / 2), 0, Math.max(0, items.length - capacity));
  const end = Math.min(items.length, start + capacity);
  return { visible: items.slice(start, end), start, above: start, below: items.length - end };
}

function useBoundedSelection(selected: number, setSelected: (next: number) => void, count: number) {
  useEffect(() => {
    if (count === 0 && selected !== 0) setSelected(0);
    if (count > 0 && selected > count - 1) setSelected(count - 1);
  }, [count, selected, setSelected]);
}

export function Dashboard({
  version,
  data: initialData,
  onSync,
  onRefresh,
  onUpdate,
  onToggleTool,
  onListImportAssets,
  onImport,
  importGlobal,
}: DashboardProps) {
  const { exit } = useApp();
  const { rows, columns } = useTerminalSize();
  const [liveData, setLiveData] = useState(initialData);
  const [screen, setScreen] = useState<ScreenId>("dashboard");
  const [focus, setFocus] = useState<FocusArea>("main");
  const [selectedNav, setSelectedNav] = useState(0);
  const [selectedRow, setSelectedRow] = useState(0);
  const [selectedAssetTool, setSelectedAssetTool] = useState(0);
  const [selectedAssetRow, setSelectedAssetRow] = useState(0);
  const [selectedConflictAction, setSelectedConflictAction] = useState(0);
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [scopeFilter, setScopeFilter] = useState<DashboardScopeFilter>("all");
  const [filterOutOfSync, setFilterOutOfSync] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("status");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [importMode, setImportMode] = useState(false);
  const [action, setAction] = useState<ActionState>({ status: "idle" });

  const isRunning = action.status === "running" || action.status === "running-tool-toggle";
  const compact = columns < 92;
  const verySmall = rows < 22 || columns < 72;
  const outputs = outputsForScope(liveData, scopeFilter);
  const assets = visibleAssets(liveData.assets, scopeFilter, filterOutOfSync, searchQuery, sortMode);
  const tools = (liveData.tools ?? []).filter((tool) => scopeFilter === "all" || tool.scopes.includes(scopeFilter));
  const conflicts = liveData.conflicts.filter((conflict) => scopeFilter === "all" || conflict.scope === scopeFilter);
  const assetTool = tools[selectedAssetTool];
  const toolAssets = assetTool
    ? assets.filter((asset) => asset.targets.includes(assetTool.id))
    : assets;
  const selectedAsset = screen === "assets" ? toolAssets[selectedAssetRow] : assets[selectedRow];
  const selectedOutput = [...outputs].sort((a, b) => ACTION_PRIORITY[a.action] - ACTION_PRIORITY[b.action] || a.assetId.localeCompare(b.assetId))[selectedRow];
  const selectedTool = tools[selectedRow];
  const selectedConflict = conflicts[selectedRow];
  const actionLog = actionMessage(action);
  const activity = actionLog ? [actionLog, ...(liveData.activity ?? [])] : liveData.activity ?? [];
  const currentScreen = SCREEN_ITEMS.find((item) => item.id === screen) ?? SCREEN_ITEMS[0];
  const navWidth = compact ? 18 : 24;
  const detailsWidth = compact ? 0 : Math.max(28, Math.floor(columns * 0.31));
  const mainWidth = Math.max(30, columns - navWidth - detailsWidth);
  const bodyHeight = Math.max(8, rows - (verySmall ? 5 : 4) - (actionLog ? 1 : 0));
  const listHeight = Math.max(4, bodyHeight - 4);

  const rowCount =
    screen === "assets" ? tools.length
    : screen === "tools" ? tools.length
    : screen === "preview" ? outputs.length
    : screen === "conflicts" ? conflicts.length
    : screen === "logs" ? activity.length
    : screen === "settings" ? Math.max(liveData.workspaces?.length ?? 0, 1)
    : 1;

  useBoundedSelection(selectedRow, setSelectedRow, rowCount);
  useBoundedSelection(selectedAssetTool, setSelectedAssetTool, tools.length);
  useBoundedSelection(selectedAssetRow, setSelectedAssetRow, toolAssets.length);

  const effectiveImportGlobal =
    scopeFilter === "global" ? true : scopeFilter === "project" ? false : importGlobal;

  const paletteCommands: Array<{ label: string; detail: string; run: () => void }> = [
    { label: "Open Dashboard", detail: "Go to sync summary", run: () => setScreen("dashboard") },
    { label: "Find Assets", detail: "Search by id, path, kind, tool, or status", run: () => openSearch() },
    { label: "Preview Sync", detail: "Review files before writing", run: () => setScreen("preview") },
    { label: "Run Sync", detail: "Open confirmation dialog", run: () => setOverlay("confirm-sync") },
    { label: "Refresh", detail: "Reload manifests and target files", run: () => setAction({ status: "running", kind: "refresh" }) },
    { label: "Update Lockfiles", detail: "Refresh installed source integrity", run: () => setAction({ status: "running", kind: "update" }) },
    { label: "Import Existing Assets", detail: "Import from a supported AI tool", run: () => setImportMode(true) },
    { label: "Show Help", detail: "Keyboard shortcuts and concepts", run: () => setOverlay("help") },
  ];

  function setActiveScreen(next: NavId) {
    if (next === "import") {
      setImportMode(true);
      return;
    }
    setScreen(next);
    setSelectedNav(SCREEN_ITEMS.findIndex((item) => item.id === next));
    setSelectedRow(0);
    setFocus("main");
  }

  function cycleScope() {
    if (liveData.scope !== "project+global") return;
    setScopeFilter((prev) => (prev === "all" ? "global" : prev === "global" ? "project" : "all"));
    setSelectedRow(0);
  }

  function cycleSort() {
    setSortMode((prev) => prev === "status" ? "kind" : prev === "kind" ? "tool" : prev === "tool" ? "path" : "status");
    setSelectedRow(0);
  }

  function openSearch() {
    setSearchDraft(searchQuery);
    setOverlay("search");
  }

  function closeOverlay() {
    setOverlay(null);
    setSearchDraft("");
  }

  function runPaletteCommand() {
    const command = paletteCommands[paletteIndex];
    setOverlay(null);
    command?.run();
  }

  function move(delta: number) {
    if (overlay === "palette") {
      setPaletteIndex((prev) => clamp(prev + delta, 0, paletteCommands.length - 1));
      return;
    }
    if (screen === "conflicts" && focus === "details") {
      setSelectedConflictAction((prev) => clamp(prev + delta, 0, 3));
      return;
    }
    if (focus === "nav") {
      setSelectedNav((prev) => {
        const next = clamp(prev + delta, 0, SCREEN_ITEMS.length - 1);
        const navItem = SCREEN_ITEMS[next];
        if (navItem.id !== "import") setScreen(navItem.id);
        setSelectedRow(0);
        return next;
      });
      return;
    }
    if (screen === "dashboard") {
      return;
    }
    if (screen === "assets") {
      if (focus === "details") {
        setSelectedAssetRow((prev) => clamp(prev + delta, 0, Math.max(toolAssets.length - 1, 0)));
      } else {
        setSelectedAssetTool((prev) => clamp(prev + delta, 0, Math.max(tools.length - 1, 0)));
        setSelectedAssetRow(0);
      }
      return;
    }
    setSelectedRow((prev) => clamp(prev + delta, 0, Math.max(rowCount - 1, 0)));
  }

  useInput((input, key) => {
    if (importMode) return;

    if (overlay === "search") {
      if (key.escape) {
        closeOverlay();
        return;
      }
      if (key.return) {
        setSearchQuery(searchDraft);
        setSelectedRow(0);
        setOverlay(null);
        setScreen("assets");
        return;
      }
      if (key.backspace || key.delete) {
        setSearchDraft((prev) => prev.slice(0, -1));
        return;
      }
      if (input && input.length > 0 && !key.ctrl) {
        setSearchDraft((prev) => prev + input);
      }
      return;
    }

    if (overlay === "help") {
      if (input === "q" || input === "?" || key.escape || key.return) closeOverlay();
      return;
    }

    if (overlay === "palette") {
      if (key.escape) {
        closeOverlay();
        return;
      }
      if (key.return) {
        runPaletteCommand();
        return;
      }
      if (key.upArrow || input === "k") move(-1);
      if (key.downArrow || input === "j") move(1);
      return;
    }

    if (overlay === "confirm-sync") {
      if (key.escape || input === "n" || input === "q") {
        closeOverlay();
        return;
      }
      if (key.return || input === "y") {
        setOverlay(null);
        setAction({ status: "running", kind: "sync" });
      }
      return;
    }

    if (isRunning) return;

    if (input === "q") {
      exit();
      return;
    }
    if (input === "?") {
      setOverlay("help");
      return;
    }
    if (input === ":") {
      setPaletteIndex(0);
      setOverlay("palette");
      return;
    }
    if (input === "/") {
      openSearch();
      return;
    }
    if (input >= "1" && input <= "8") {
      setActiveScreen(SCREEN_ITEMS[Number(input) - 1].id);
      return;
    }
    if (key.tab) {
      setFocus((prev) => prev === "nav" ? "main" : prev === "main" && !compact ? "details" : "nav");
      return;
    }
    if (key.escape) {
      if (searchQuery) setSearchQuery("");
      else setActiveScreen("dashboard");
      return;
    }
    if (key.upArrow || input === "k") {
      move(-1);
      return;
    }
    if (key.downArrow || input === "j") {
      move(1);
      return;
    }
    if (input === "g") {
      cycleScope();
      return;
    }
    if (input === "f") {
      setFilterOutOfSync((prev) => !prev);
      setSelectedRow(0);
      return;
    }
    if (input === "t") {
      cycleSort();
      return;
    }
    if (input === "r") {
      setAction({ status: "running", kind: "refresh" });
      return;
    }
    if (input === "u") {
      setAction({ status: "running", kind: "update" });
      return;
    }
    if (input === "i") {
      setImportMode(true);
      return;
    }
    if (input === "e" && screen === "tools" && selectedTool) {
      const next = toolEnableState(selectedTool);
      if (next.label === "unsupported") return;
      setAction({ status: "running-tool-toggle", target: selectedTool.id, enable: next.nextEnable, scope: scopeFilter });
      return;
    }
    if (input === "p") {
      setActiveScreen("preview");
      return;
    }
    if (input === "s") {
      setOverlay("confirm-sync");
      return;
    }
    if (key.return) {
      if (focus === "nav") {
        setActiveScreen(SCREEN_ITEMS[selectedNav].id);
      } else if (screen === "dashboard") {
        setActiveScreen(outputs.some((output) => output.action !== "skip") ? "preview" : "assets");
      } else if (screen === "assets") {
        setFocus("details");
      } else if (screen === "preview") {
        setOverlay("confirm-sync");
      } else if (screen === "tools") {
        setFocus("details");
      } else if (screen === "conflicts") {
        setFocus("details");
      }
    }
  });

  useEffect(() => {
    if (action.status === "running-tool-toggle") {
      onToggleTool(action.target, action.enable, action.scope)
        .then(async (result) => {
          setAction({ status: "tool-toggle-done", target: action.target, enable: action.enable, updated: result.updated, errors: result.errors });
          try {
            setLiveData(await onRefresh());
          } catch {
            // Keep the toggle result visible even if refresh fails; explicit refresh can retry.
          }
        })
        .catch((err: Error) => setAction({ status: "error", kind: "refresh", message: err.message }));
      return;
    }

    if (action.status !== "running") return;
    const { kind } = action;

    if (kind === "sync") {
      onSync(scopeFilter)
        .then(async (result) => {
          setAction({ status: "sync-done", scope: scopeFilter, written: result.written, unchanged: result.unchanged, errors: result.errors });
          try {
            const refreshed = await onRefresh();
            setLiveData(refreshed);
          } catch {
            // Keep the sync result visible even if refresh fails; explicit refresh can retry.
          }
        })
        .catch((err: Error) => setAction({ status: "error", kind, message: err.message }));
      return;
    }

    if (kind === "update") {
      onUpdate()
        .then((result) => setAction({ status: "update-done", updated: result.updated, errors: result.errors }))
        .catch((err: Error) => setAction({ status: "error", kind, message: err.message }));
      return;
    }

    onRefresh()
      .then((newData) => {
        setLiveData(newData);
        setAction({ status: "refresh-done" });
      })
      .catch((err: Error) => setAction({ status: "error", kind, message: err.message }));
  }, [action.status]);

  if (importMode) {
    return (
      <ImportView
        onCancel={() => {
          setImportMode(false);
          setSelectedNav(SCREEN_ITEMS.findIndex((item) => item.id === screen));
        }}
        onListAssets={(tool) => onListImportAssets(tool, effectiveImportGlobal)}
        onImport={async (tool, ids) => {
          const result = await onImport(tool, ids, effectiveImportGlobal);
          try {
            setLiveData(await onRefresh());
          } catch {
            // Import result should remain visible even if the dashboard refresh fails.
          }
          return result;
        }}
        tools={tools.filter((tool) => tool.state === "configured").map((tool) => tool.id as ImportTool)}
        rows={rows}
        columns={columns}
        global={effectiveImportGlobal}
      />
    );
  }

  const subtitle = `${currentScreen.label.toLowerCase()} · ${scopeFilter === "all" ? liveData.scope : scopeFilter}`;
  const pendingWrites = outputs.filter((output) => output.action !== "skip").length;
  const headerStatus = isRunning
    ? action.status === "running" ? `${action.kind} running` : `${action.enable ? "enable" : "disable"} ${TARGET_LABEL[action.target]}`
    : compact
      ? pendingWrites > 0 ? `${pendingWrites} pending` : "synced"
      : suggestedAction(liveData, outputs).message;
  const keyHints = isRunning
    ? [{ key: "...", label: action.status === "running" ? `${action.kind} running` : "tool toggle running" }]
    : compact
      ? [
          { key: "1-8", label: "nav" },
          { key: "j/k", label: "move" },
          { key: "/", label: "search" },
          { key: "i", label: "import" },
          { key: "e", label: "toggle tool" },
          { key: "s", label: "sync" },
          { key: "?", label: "help" },
          { key: "q", label: "quit" },
        ]
      : [
          { key: "1-8", label: "nav" },
          { key: "Tab", label: "panel" },
          { key: "j/k", label: "move" },
          { key: "/", label: "search" },
          { key: "i", label: "import" },
          { key: "p", label: "preview" },
          { key: "e", label: "enable/disable tool" },
          { key: "s", label: "sync" },
          { key: "?", label: "help" },
          { key: "q", label: "quit" },
        ];
  const overlayNode =
    overlay === "help" ? <HelpOverlay /> :
    overlay === "palette" ? <PaletteOverlay commands={paletteCommands} selectedIndex={paletteIndex} /> :
    overlay === "search" ? <SearchOverlay draft={searchDraft} current={searchQuery} /> :
    overlay === "confirm-sync" ? <ConfirmSyncOverlay outputs={outputs} conflicts={conflicts} scopeFilter={scopeFilter} /> :
    null;

  return (
    <Box flexDirection="column" width="100%" height={rows} overflow="hidden">
      <Header subtitle={subtitle} version={version} status={headerStatus} />
      {verySmall && (
        <Box paddingX={1}>
          <Text color="yellow">Terminal is compact. Some detail panels are hidden; use Tab and Enter for details.</Text>
        </Box>
      )}
      {overlayNode ? (
        <Box flexGrow={1} height={bodyHeight} alignItems="center" justifyContent="center" overflow="hidden">
          {overlayNode}
        </Box>
      ) : (
        <Box flexDirection="row" flexGrow={1} height={bodyHeight} overflow="hidden">
          <Sidebar
            width={navWidth}
            active={focus === "nav"}
            selected={selectedNav}
            data={liveData}
            outputs={outputs}
            scopeFilter={scopeFilter}
          />
          <Box flexDirection="column" width={mainWidth} height={bodyHeight} overflow="hidden">
            {screen === "dashboard" && (
              <DashboardHome
                data={liveData}
                assets={assets}
                outputs={outputs}
                activity={activity}
                active={focus === "main"}
                height={bodyHeight}
                width={mainWidth}
                scopeFilter={scopeFilter}
              />
            )}
            {screen === "assets" && (
              <AssetsScreen
                assets={assets}
                tools={tools}
                selectedToolIndex={selectedAssetTool}
                selectedAssetIndex={selectedAssetRow}
                active={focus === "main"}
                assetListActive={focus === "details"}
                height={bodyHeight}
                width={mainWidth}
                showScope={liveData.scope === "project+global"}
                searchQuery={searchQuery}
                filterOutOfSync={filterOutOfSync}
                sortMode={sortMode}
              />
            )}
            {screen === "tools" && (
              <ToolsScreen tools={tools} selectedIndex={selectedRow} active={focus === "main"} height={bodyHeight} width={mainWidth} />
            )}
            {screen === "preview" && (
              <PreviewScreen outputs={outputs} selectedIndex={selectedRow} active={focus === "main"} height={bodyHeight} width={mainWidth} />
            )}
            {screen === "conflicts" && (
              <ConflictsScreen conflicts={conflicts} selectedIndex={selectedRow} active={focus === "main"} height={bodyHeight} width={mainWidth} />
            )}
            {screen === "logs" && (
              <LogsScreen activity={activity} selectedIndex={selectedRow} active={focus === "main"} height={bodyHeight} width={mainWidth} />
            )}
            {screen === "settings" && (
              <SettingsScreen data={liveData} selectedIndex={selectedRow} active={focus === "main"} height={bodyHeight} width={mainWidth} scopeFilter={scopeFilter} />
            )}
          </Box>
          {!compact && (
            <DetailsPanel
              screen={screen}
              active={focus === "details"}
              width={detailsWidth}
              height={bodyHeight}
              asset={screen === "assets" ? selectedAsset : undefined}
              output={selectedOutput}
              tool={selectedTool}
              conflict={selectedConflict}
              conflictActionIndex={selectedConflictAction}
              activity={activity[selectedRow]}
              data={liveData}
              scopeFilter={scopeFilter}
            />
          )}
        </Box>
      )}
      {actionLog && (
        <Box paddingX={1}>
          <Text color={LOG_COLOR[actionLog.level]}>
            {actionLog.message}{actionLog.detail ? ` ${actionLog.detail}` : ""}
          </Text>
        </Box>
      )}
      <KeyHints hints={keyHints} />
    </Box>
  );
}

function Sidebar({
  width,
  active,
  selected,
  data,
  outputs,
  scopeFilter,
}: {
  width: number;
  active: boolean;
  selected: number;
  data: DashboardData;
  outputs: DashboardOutput[];
  scopeFilter: DashboardScopeFilter;
}) {
  const status = countByStatus(data.assets);
  const pending = outputs.filter((output) => output.action !== "skip").length;
  return (
    <Panel title="coactl" active={active} width={width} height="100%">
      <Box flexDirection="column">
        <Text color="magenta" bold>AI assets</Text>
        <Text color="magenta" bold>synced</Text>
        <Box marginTop={1} />
        {SCREEN_ITEMS.map((item, index) => {
          const isSelected = active && selected === index;
          const badge =
            item.id === "preview" && pending > 0 ? `${pending}`
            : item.id === "conflicts" && data.conflicts.length > 0 ? `${data.conflicts.length}`
            : "";
          return (
            <Box key={item.id} gap={1}>
              <Text color={isSelected ? "magenta" : "gray"}>{isSelected ? ">" : " "}</Text>
              <Text color={isSelected ? "magenta" : undefined} bold={isSelected}>
                {item.key}
              </Text>
              <Text color={isSelected ? "white" : undefined}>{truncate(item.label, width - 8)}</Text>
              {badge && <Text color={item.id === "conflicts" ? "red" : "yellow"}>{badge}</Text>}
            </Box>
          );
        })}
        <Box marginTop={1} />
        <Text dimColor>Scope</Text>
        <Text color="magenta">{scopeFilter}</Text>
        <Box marginTop={1} />
        <Text dimColor>Health</Text>
        <Text color="green">{status.synced} synced</Text>
        <Text color="yellow">{status.drifted + status.missing} pending</Text>
        {status.error > 0 && <Text color="red">{status.error} errors</Text>}
      </Box>
    </Panel>
  );
}

function DashboardHome({
  data,
  assets,
  outputs,
  activity,
  active,
  height,
  width,
  scopeFilter,
}: {
  data: DashboardData;
  assets: DashboardAsset[];
  outputs: DashboardOutput[];
  activity: DashboardActivity[];
  active: boolean;
  height: number;
  width: number;
  scopeFilter: DashboardScopeFilter;
}) {
  const status = countByStatus(assets);
  const summary = previewSummary(outputs);
  const recommendation = suggestedAction(data, outputs);
  const connectedTools = (data.tools ?? [])
    .filter((tool) => scopeFilter === "all" || tool.scopes.includes(scopeFilter))
    .filter((tool) => tool.state === "configured");
  const compact = width < 72;
  return (
    <Panel title="Dashboard" active={active} width={width} height={height}>
      <Box flexDirection="column">
        {compact ? (
          <Box gap={2}>
            <Text color="green">Synced {status.synced}</Text>
            <Text color="yellow">Pending {status.drifted + status.missing}</Text>
            <Text color={data.conflicts.length + summary.conflict > 0 ? "red" : "gray"}>Conflicts {data.conflicts.length + summary.conflict}</Text>
            <Text color="magenta">Connected {connectedTools.length}</Text>
          </Box>
        ) : (
          <Box gap={1} flexWrap="wrap">
            <StatCard label="Synced" value={status.synced} color="green" width={14} />
            <StatCard label="Pending" value={status.drifted + status.missing} color="yellow" width={14} />
            <StatCard label="Conflicts" value={data.conflicts.length + summary.conflict} color={data.conflicts.length + summary.conflict > 0 ? "red" : "gray"} width={14} />
            <StatCard label="Connected" value={connectedTools.length} color="magenta" width={14} />
          </Box>
        )}
        <Box marginTop={1} flexDirection="column">
          <Text bold>Suggested next action</Text>
          <Text color={recommendation.color}>{recommendation.message}</Text>
          <Text dimColor>Press 8 or i to import existing assets from an AI tool.</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text bold>How coactl works</Text>
          <FlowLine
            width={width - 4}
            segments={[
              { text: "Tool files", color: "gray" },
              { text: "import", color: "yellow" },
              { text: "coactl assets", color: "magenta" },
              { text: "resolve + override", color: "cyan" },
              { text: "sync", color: "yellow" },
              { text: "tool files", color: "green" },
            ]}
          />
          <Text dimColor>coactl is the source of truth. Native Claude, Codex, Cursor, and Windsurf files do not compete during sync.</Text>
        </Box>
        <Box marginTop={1} gap={2}>
          <Box flexDirection="column" width={compact ? Math.max(22, Math.floor(width / 2) - 1) : Math.max(28, Math.floor(width / 2) - 2)}>
            <Text bold>Sync Status</Text>
            <Text color="green">synced    {status.synced}</Text>
            <Text color="yellow">outdated  {status.drifted}</Text>
            <Text color="gray">missing   {status.missing}</Text>
            <Text color={summary.conflict > 0 ? "red" : "gray"}>conflict  {summary.conflict}</Text>
          </Box>
          <Box flexDirection="column" width={compact ? Math.max(22, Math.floor(width / 2) - 1) : Math.max(28, Math.floor(width / 2) - 2)}>
            <Text bold>Preview</Text>
            <Text color="green">create    {summary.create}</Text>
            <Text color="yellow">update    {summary.update}</Text>
            <Text color="gray">skip      {summary.skip}</Text>
            <Text color="red">conflict  {summary.conflict}</Text>
          </Box>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text bold>Connected Tools</Text>
          <Text dimColor>Installed tools detected on this device. Asset counts show current target usage.</Text>
          {connectedTools.length === 0 ? (
            <Text dimColor>No installed tools detected. Use explicit CLI --target/--from flags to force a tool.</Text>
          ) : (
            connectedTools.slice(0, Math.max(1, height - 18)).map((tool) => (
              <Box key={tool.id} gap={1}>
                <Text color={tool.state === "configured" ? "green" : "gray"}>{tool.state === "configured" ? "●" : "○"}</Text>
                <Text>{truncate(tool.label, 16)}</Text>
                <Text dimColor>{formatCount(tool.assetCount, "asset")}</Text>
                <Text color="gray">{compactPath(tool.targetPath, Math.max(16, width - 42))}</Text>
              </Box>
            ))
          )}
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text bold>Recent Activity</Text>
          {activity.length === 0 ? (
            <Text dimColor>No activity yet. Run preview or sync to populate this feed.</Text>
          ) : (
            activity.slice(0, Math.max(2, height - 18)).map((entry, index) => (
              <Box key={`${entry.message}:${index}`} gap={1}>
                <Text color={LOG_COLOR[entry.level]}>●</Text>
                <Text>{truncate(entry.message, width - 8)}</Text>
              </Box>
            ))
          )}
        </Box>
      </Box>
    </Panel>
  );
}

function StatCard({ label, value, color, width }: { label: string; value: number; color: string; width: number }) {
  return (
    <Box borderStyle="round" borderColor={color} paddingX={1} width={width} flexDirection="column">
      <Text dimColor>{label}</Text>
      <Text color={color} bold>{value}</Text>
    </Box>
  );
}

function FlowLine({
  segments,
  width,
}: {
  segments: Array<{ text: string; color?: string }>;
  width: number;
}) {
  return (
    <Box flexWrap="wrap">
      {segments.map((segment, index) => (
        <Box key={`${segment.text}:${index}`}>
          <Text color={segment.color}>{truncate(segment.text, Math.max(4, width - 4))}</Text>
          {index < segments.length - 1 && <Text dimColor>{"  ->  "}</Text>}
        </Box>
      ))}
    </Box>
  );
}

function AssetsScreen({
  assets,
  tools,
  selectedToolIndex,
  selectedAssetIndex,
  active,
  assetListActive,
  height,
  width,
  showScope,
  searchQuery,
  filterOutOfSync,
  sortMode,
}: {
  assets: DashboardAsset[];
  tools: DashboardTool[];
  selectedToolIndex: number;
  selectedAssetIndex: number;
  active: boolean;
  assetListActive: boolean;
  height: number;
  width: number;
  showScope: boolean;
  searchQuery: string;
  filterOutOfSync: boolean;
  sortMode: SortMode;
}) {
  const selectedTool = tools[selectedToolIndex];
  const selectedToolAssets = selectedTool
    ? assets.filter((asset) => asset.targets.includes(selectedTool.id))
    : [];
  const toolWindow = rowWindow(tools, selectedToolIndex, Math.max(1, height - 5));
  const assetWindow = rowWindow(selectedToolAssets, selectedAssetIndex, Math.max(1, height - 5));
  const toolWidth = Math.max(22, Math.min(34, Math.floor(width * 0.36)));
  const assetWidth = Math.max(28, width - toolWidth - 2);
  const titleParts = [`Assets by Tool (${assets.length})`, `sort:${sortMode}`];
  if (filterOutOfSync) titleParts.push("not-synced");
  if (searchQuery) titleParts.push(`search:${searchQuery}`);
  return (
    <Panel title={titleParts.join(" · ")} active={active} width={width} height={height}>
      <Box gap={1} height="100%">
        <Box flexDirection="column" width={toolWidth}>
          <Text dimColor>{active ? "Select tool" : "Tools"} · Enter opens assets</Text>
          {tools.length === 0 ? (
            <Text dimColor>No tools detected for this scope.</Text>
          ) : (
            <>
              {toolWindow.above > 0 && <Text dimColor>↑ {toolWindow.above} more</Text>}
              {toolWindow.visible.map((tool, index) => {
                const realIndex = toolWindow.start + index;
                const selected = active && realIndex === selectedToolIndex;
                const count = assets.filter((asset) => asset.targets.includes(tool.id)).length;
                const color = tool.state === "configured" ? "green" : "gray";
                return (
                  <Box key={tool.id} gap={1}>
                    <Text color={selected ? "magenta" : color}>{selected ? ">" : tool.state === "configured" ? "●" : "○"}</Text>
                    <Text color={selected ? "magenta" : undefined} bold={selected}>{truncate(tool.label, toolWidth - 10)}</Text>
                    <Text dimColor>{count}</Text>
                  </Box>
                );
              })}
              {toolWindow.below > 0 && <Text dimColor>↓ {toolWindow.below} more</Text>}
            </>
          )}
        </Box>
        <Box flexDirection="column" width={assetWidth}>
          <Text dimColor>{selectedTool ? `${selectedTool.label} assets` : "Assets"} · Tab/Enter details</Text>
          <Box gap={1}>
            <Text dimColor>{showScope ? "Sc" : ""}</Text>
            <Text dimColor>{truncate("Asset", Math.max(12, assetWidth - 40))}</Text>
            <Text dimColor>Kind</Text>
            <Text dimColor>Sync</Text>
          </Box>
          {selectedToolAssets.length === 0 ? (
            <EmptyState
              title={selectedTool ? `No assets target ${selectedTool.label}.` : "No tool selected."}
              detail={selectedTool ? "Add this target to assets or import existing tool files." : "Select a tool on the left."}
            />
          ) : (
            <>
              {assetWindow.above > 0 && <Text dimColor>↑ {assetWindow.above} more</Text>}
              {assetWindow.visible.map((asset, index) => {
                const realIndex = assetWindow.start + index;
                const selected = assetListActive && realIndex === selectedAssetIndex;
                const sync = selectedTool ? assetTargetSyncLabel(asset, selectedTool.id, tools) : { label: "unknown", color: "gray" };
                return (
                  <Box key={`${asset.scope}:${asset.id}`} gap={1}>
                    <Text color={selected ? "magenta" : "gray"}>{selected ? ">" : " "}</Text>
                    {showScope && <Text color={asset.scope === "project" ? "cyan" : "magenta"}>{asset.scope === "project" ? "P" : "G"}</Text>}
                    <Text color={selected ? "magenta" : undefined} bold={selected}>
                      {truncate(asset.id, Math.max(10, assetWidth - 42))}
                    </Text>
                    <Text color="gray">{truncate(asset.kind, 8)}</Text>
                    <Text color={sync.color}>{sync.label}</Text>
                  </Box>
                );
              })}
              {assetWindow.below > 0 && <Text dimColor>↓ {assetWindow.below} more</Text>}
            </>
          )}
        </Box>
      </Box>
    </Panel>
  );
}

function ToolsScreen({ tools, selectedIndex, active, height, width }: { tools: DashboardTool[]; selectedIndex: number; active: boolean; height: number; width: number }) {
  const { visible, start, above, below } = rowWindow(tools, selectedIndex, Math.max(1, height - 5));
  const installedCount = tools.filter((tool) => tool.state === "configured").length;
  return (
    <Panel title={`Tools & Integrations · ${installedCount} installed · ${tools.length - installedCount} not installed · ${tools.length} supported`} active={active} width={width} height={height}>
      <Box flexDirection="column">
        <Box gap={1}>
          <Text dimColor>Install</Text>
          <Text dimColor>Enabled</Text>
          <Text dimColor>Tool</Text>
          <Text dimColor>Assets</Text>
          <Text dimColor>Import</Text>
          <Text dimColor>Detected by / target path</Text>
        </Box>
        {tools.length === 0 ? (
          <EmptyState title="No tools are configured for this scope." detail="Add targets to assets in your manifest or import existing tool files with i." />
        ) : (
          <>
            {above > 0 && <Text dimColor>↑ {above} more</Text>}
            {visible.map((tool, index) => {
              const realIndex = start + index;
              const selected = active && realIndex === selectedIndex;
              const color = tool.state === "configured" ? "green" : tool.state === "available" ? "yellow" : "gray";
              const installLabel = tool.state === "configured" ? "installed" : "missing";
              const enabled = toolEnableState(tool);
              const detail = tool.installReason ?? tool.targetPath;
              return (
                <Box key={tool.id} gap={1}>
                  <Text color={selected ? "magenta" : color}>{selected ? ">" : tool.state === "configured" ? "●" : "○"}</Text>
                  <Text color={color}>{installLabel.padEnd(9)}</Text>
                  <Text color={enabled.color}>{enabled.label.padEnd(8)}</Text>
                  <Text color={selected ? "magenta" : undefined} bold={selected}>{truncate(tool.label, 18)}</Text>
                  <Text>{tool.assetCount}</Text>
                  <Text color={(tool.importableCount ?? 0) > 0 ? "green" : "gray"}>{tool.importableCount ?? 0}</Text>
                  <Text dimColor>{compactPath(detail, Math.max(18, width - 64))}</Text>
                </Box>
              );
            })}
            {below > 0 && <Text dimColor>↓ {below} more</Text>}
          </>
        )}
      </Box>
    </Panel>
  );
}

function PreviewScreen({ outputs, selectedIndex, active, height, width }: { outputs: DashboardOutput[]; selectedIndex: number; active: boolean; height: number; width: number }) {
  const sorted = [...outputs].sort((a, b) => ACTION_PRIORITY[a.action] - ACTION_PRIORITY[b.action] || a.assetId.localeCompare(b.assetId));
  const summary = previewSummary(sorted);
  const { visible, start, above, below } = rowWindow(sorted, selectedIndex, Math.max(1, height - 6));
  return (
    <Panel title={`Sync Preview · ${summary.create} create · ${summary.update} update · ${summary.conflict} conflict · ${summary.skip} skip`} active={active} width={width} height={height}>
      <Box flexDirection="column">
        <Text dimColor>Review this plan before applying. Press s to open confirmation.</Text>
        {sorted.length === 0 ? (
          <EmptyState title="Nothing to preview." detail="No target files are emitted for the current scope. Check asset targets or adapter support." />
        ) : (
          <>
            {above > 0 && <Text dimColor>↑ {above} more</Text>}
            {visible.map((output, index) => {
              const realIndex = start + index;
              const selected = active && realIndex === selectedIndex;
              return (
                <Box key={`${output.scope}:${output.path}:${output.assetId}:${index}`} gap={1}>
                  <Text color={selected ? "magenta" : ACTION_COLOR[output.action]}>{selected ? ">" : "•"}</Text>
                  <Text color={ACTION_COLOR[output.action]}>{actionLabel(output.action).padEnd(8)}</Text>
                  <Text>{truncate(output.assetId, 20)}</Text>
                  <Text dimColor>{TARGET_LABEL[output.target]}</Text>
                  <Text dimColor>{compactPath(output.path, Math.max(18, width - 56))}</Text>
                </Box>
              );
            })}
            {below > 0 && <Text dimColor>↓ {below} more</Text>}
          </>
        )}
      </Box>
    </Panel>
  );
}

function ConflictsScreen({ conflicts, selectedIndex, active, height, width }: { conflicts: DashboardConflict[]; selectedIndex: number; active: boolean; height: number; width: number }) {
  const { visible, start, above, below } = rowWindow(conflicts, selectedIndex, Math.max(1, height - 5));
  return (
    <Panel title={`Conflict Resolution (${conflicts.length})`} active={active} width={width} height={height}>
      <Box flexDirection="column">
        <Text dimColor>Conflicts happen when multiple sources define the same asset or a target file was modified by hand.</Text>
        {conflicts.length === 0 ? (
          <EmptyState title="No conflicts detected." detail="The registry resolved cleanly for the current scope." />
        ) : (
          <>
            {above > 0 && <Text dimColor>↑ {above} more</Text>}
            {visible.map((conflict, index) => {
              const realIndex = start + index;
              const selected = active && realIndex === selectedIndex;
              return (
                <Box key={`${conflict.scope}:${conflict.id}`} gap={1}>
                  <Text color={selected ? "magenta" : "red"}>{selected ? ">" : "!"}</Text>
                  <Text color={selected ? "magenta" : undefined} bold={selected}>{truncate(conflict.id, Math.max(12, width - 40))}</Text>
                  <Text dimColor>{conflict.scope}</Text>
                  <Text color="yellow">{formatCount(conflict.candidates.length, "candidate")}</Text>
                  {conflict.winner && <Text color="green">winner: {truncate(conflict.winner, 18)}</Text>}
                </Box>
              );
            })}
            {below > 0 && <Text dimColor>↓ {below} more</Text>}
          </>
        )}
      </Box>
    </Panel>
  );
}

function LogsScreen({ activity, selectedIndex, active, height, width }: { activity: DashboardActivity[]; selectedIndex: number; active: boolean; height: number; width: number }) {
  const { visible, start, above, below } = rowWindow(activity, selectedIndex, Math.max(1, height - 4));
  return (
    <Panel title="Logs & Diagnostics" active={active} width={width} height={height}>
      <Box flexDirection="column">
        {activity.length === 0 ? (
          <EmptyState title="No logs yet." detail="Run refresh, preview, update, import, or sync to see activity here." />
        ) : (
          <>
            {above > 0 && <Text dimColor>↑ {above} more</Text>}
            {visible.map((entry, index) => {
              const realIndex = start + index;
              const selected = active && realIndex === selectedIndex;
              return (
                <Box key={`${entry.message}:${entry.detail ?? ""}:${index}`} gap={1}>
                  <Text color={selected ? "magenta" : LOG_COLOR[entry.level]}>{selected ? ">" : "●"}</Text>
                  <Text color={LOG_COLOR[entry.level]}>{entry.level.padEnd(7)}</Text>
                  <Text>{truncate(entry.message, Math.max(16, width - 28))}</Text>
                </Box>
              );
            })}
            {below > 0 && <Text dimColor>↓ {below} more</Text>}
          </>
        )}
      </Box>
    </Panel>
  );
}

function SettingsScreen({
  data,
  selectedIndex,
  active,
  height,
  width,
  scopeFilter,
}: {
  data: DashboardData;
  selectedIndex: number;
  active: boolean;
  height: number;
  width: number;
  scopeFilter: DashboardScopeFilter;
}) {
  const workspaces = (data.workspaces ?? []).filter((workspace) => scopeFilter === "all" || workspace.scope === scopeFilter);
  const { visible, start } = rowWindow(workspaces, selectedIndex, Math.max(1, height - 7));
  return (
    <Panel title="Settings & Configuration" active={active} width={width} height={height}>
      <Box flexDirection="column">
        <Text dimColor>Configuration is file-backed. This screen shows what the TUI is reading and where sync writes target files.</Text>
        <Box marginTop={1} />
        {workspaces.length === 0 ? (
          <EmptyState title="No workspace configuration found." detail="Run coactl init or create .coactl/agent.manifest.yaml to start syncing project assets." />
        ) : (
          visible.map((workspace, index) => {
            const realIndex = start + index;
            const selected = active && realIndex === selectedIndex;
            return (
              <Box key={workspace.scope} flexDirection="column" marginBottom={1}>
                <Box gap={1}>
                  <Text color={selected ? "magenta" : workspace.manifestExists ? "green" : "yellow"}>{selected ? ">" : workspace.manifestExists ? "●" : "○"}</Text>
                  <Text bold>{workspace.scope}</Text>
                  <Text color={workspace.manifestExists ? "green" : "yellow"}>{workspace.manifestExists ? "configured" : "missing manifest"}</Text>
                </Box>
                <Text dimColor>manifest: {compactPath(workspace.manifestPath, Math.max(20, width - 12))}</Text>
                <Text dimColor>root:     {compactPath(workspace.root, Math.max(20, width - 12))}</Text>
                <Text dimColor>{workspace.assetCount} assets · {workspace.sourceCount} sources</Text>
              </Box>
            );
          })
        )}
        <Box marginTop={1} flexDirection="column">
          <Text bold>Default behavior</Text>
          <Text>Sync writes managed target files only after confirmation in the TUI.</Text>
          <Text>Modified target files are shown as conflicts in preview.</Text>
          <Text>Unsupported target/kind combinations are skipped with diagnostics.</Text>
        </Box>
      </Box>
    </Panel>
  );
}

function DetailsPanel({
  screen,
  active,
  width,
  height,
  asset,
  output,
  tool,
  conflict,
  conflictActionIndex,
  activity,
  data,
  scopeFilter,
}: {
  screen: ScreenId;
  active: boolean;
  width: number;
  height: number;
  asset?: DashboardAsset;
  output?: DashboardOutput;
  tool?: DashboardTool;
  conflict?: DashboardConflict;
  conflictActionIndex: number;
  activity?: DashboardActivity;
  data: DashboardData;
  scopeFilter: DashboardScopeFilter;
}) {
  return (
    <Panel title="Details" active={active} width={width} height={height}>
      {screen === "dashboard" ? <DashboardDetails data={data} scopeFilter={scopeFilter} width={width} /> :
        screen === "tools" && tool ? <ToolDetails tool={tool} width={width} /> :
        screen === "preview" && output ? <OutputDetails output={output} width={width} /> :
        screen === "conflicts" && conflict ? <ConflictDetails conflict={conflict} selectedAction={conflictActionIndex} width={width} /> :
        screen === "logs" && activity ? <ActivityDetails entry={activity} width={width} /> :
        screen === "settings" ? <SettingsDetails data={data} scopeFilter={scopeFilter} width={width} /> :
        asset ? <AssetDetails asset={asset} tools={data.tools ?? []} width={width} /> :
        <Text dimColor>Select an item to inspect metadata, target files, and next actions.</Text>}
    </Panel>
  );
}

function DashboardDetails({ data, scopeFilter, width }: { data: DashboardData; scopeFilter: DashboardScopeFilter; width: number }) {
  const scopedAssets = data.assets.filter((asset) => scopeFilter === "all" || asset.scope === scopeFilter);
  const scopedOutputs = outputsForScope(data, scopeFilter);
  const status = countByStatus(scopedAssets);
  const summary = previewSummary(scopedOutputs);
  const recommendation = suggestedAction(data, scopedOutputs);
  const pending = summary.create + summary.update + summary.delete + summary.conflict;

  return (
    <Box flexDirection="column">
      <Text color="magenta" bold>Workspace Overview</Text>
      <Text dimColor>{scopeFilter === "all" ? data.scope : scopeFilter}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Suggested next action</Text>
        <Text color={recommendation.color}>{truncate(recommendation.message, width - 4)}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Sync health</Text>
        <Text color="green">{status.synced} synced</Text>
        <Text color="yellow">{status.drifted} outdated</Text>
        <Text color="gray">{status.missing} missing</Text>
        <Text color={status.error > 0 ? "red" : "gray"}>{status.error} errors</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Preview plan</Text>
        <Text color={pending > 0 ? "yellow" : "green"}>{pending} pending writes</Text>
        <Text color="green">{summary.create} create</Text>
        <Text color="yellow">{summary.update} update</Text>
        <Text color="red">{summary.conflict} conflicts</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Navigation</Text>
        <Text>Use 2 for Assets when you want row selection and asset details.</Text>
        <Text dimColor>Dashboard is an overview, so up/down does not select hidden assets.</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Architecture</Text>
        <FlowLine
          width={width - 4}
          segments={[
            { text: "import from tools", color: "yellow" },
            { text: "store in coactl", color: "magenta" },
            { text: "pick winner by precedence", color: "cyan" },
            { text: "sync to targets", color: "green" },
          ]}
        />
        <Text dimColor>If skill-a exists in Claude and Codex, sync still uses the coactl asset selected by manifest precedence.</Text>
      </Box>
    </Box>
  );
}

function AssetDetails({ asset, tools, width }: { asset: DashboardAsset; tools: DashboardTool[]; width: number }) {
  return (
    <Box flexDirection="column">
      <Text color="magenta" bold>{truncate(asset.id, width - 4)}</Text>
      <Text dimColor>{asset.kind} · v{asset.version} · {asset.scope}</Text>
      <Box marginTop={1}><StatusBadge status={asset.status} showLabel /></Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Source</Text>
        <Text>{asset.source}{asset.readOnly ? " (read-only)" : ""}</Text>
        {asset.sourcePath && <Text dimColor>{compactPath(asset.sourcePath, width - 4)}</Text>}
        {asset.modifiedAt && <Text dimColor>modified {asset.modifiedAt}</Text>}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Tool Sync Status</Text>
        {asset.targets.map((target) => {
          const capability = capabilityFor(target, asset.kind, asset.scope);
          const sync = assetTargetSyncLabel(asset, target, tools);
          return (
            <Text key={target} color={sync.color}>
              {TARGET_LABEL[target]} · {sync.label} · {capability}
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Outputs</Text>
        {(asset.outputs ?? []).length === 0 ? (
          <Text dimColor>No files emitted for this asset in the current scope.</Text>
        ) : (
          (asset.outputs ?? []).slice(0, 6).map((output) => (
            <Text key={`${output.path}:${output.target}`} color={ACTION_COLOR[output.action]}>
              {actionLabel(output.action)} {compactPath(output.path, width - 14)}
            </Text>
          ))
        )}
      </Box>
      {asset.description && (
        <Box marginTop={1}>
          <Text dimColor>{truncate(asset.description, width - 4)}</Text>
        </Box>
      )}
      {(asset.diagnostics ?? []).length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Diagnostics</Text>
          {asset.diagnostics?.slice(0, 4).map((diagnostic, index) => (
            <Text key={`${diagnostic}:${index}`} color="yellow">{truncate(diagnostic, width - 4)}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

function ToolDetails({ tool, width }: { tool: DashboardTool; width: number }) {
  const color = tool.state === "configured" ? "green" : tool.state === "available" ? "yellow" : "gray";
  const installed = tool.state === "configured";
  const enabled = toolEnableState(tool);
  return (
    <Box flexDirection="column">
      <Text color="magenta" bold>{tool.label}</Text>
      <Text color={color}>{installed ? "installed on this device" : "not detected on this device"}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Detection</Text>
        <Text dimColor>{tool.installReason ? compactPath(tool.installReason, width - 4) : "No known command or config path found."}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Enabled in coactl</Text>
        <Text color={enabled.color}>{enabled.label} · {tool.assetCount}/{tool.compatibleAssetCount} compatible assets target this tool</Text>
        <Text dimColor>{enabled.label === "unsupported" ? "No current asset kind can emit to this target." : "Press e on the Tools page to enable or disable this tool for compatible local assets."}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Target path</Text>
        <Text dimColor>{compactPath(tool.targetPath, width - 4)}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Coverage</Text>
        <Text color="green">{tool.nativeCount} native</Text>
        <Text color="yellow">{tool.degradedCount} degraded</Text>
        <Text color="gray">{tool.skippedCount} skipped</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Import to coactl</Text>
        <Text color={(tool.importableCount ?? 0) > 0 ? "green" : "gray"}>
          {(tool.importableCount ?? 0) > 0
            ? `${tool.importableCount} importable asset${tool.importableCount === 1 ? "" : "s"} found`
            : installed ? "No importable assets found for this tool." : "Install this tool before importing from it."}
        </Text>
        <Text dimColor>{installed ? `Press i, then select ${tool.label}.` : "CLI override: coactl import --from <tool>"}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>How to configure</Text>
        <Text>{installed ? tool.assetCount > 0 ? "Assets already target this tool." : "Add this target to an asset's targets list." : "Install the tool or use explicit CLI --target/--from flags to force it."}</Text>
        <Text dimColor>{truncate(tool.note ?? "Persistent enable/disable is manifest-driven to keep CLI behavior compatible.", width - 4)}</Text>
      </Box>
    </Box>
  );
}

function OutputDetails({ output, width }: { output: DashboardOutput; width: number }) {
  return (
    <Box flexDirection="column">
      <Text color={ACTION_COLOR[output.action]} bold>{actionLabel(output.action)} {output.assetId}</Text>
      <Text dimColor>{output.scope} · {TARGET_LABEL[output.target]}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Target file</Text>
        <Text>{compactPath(output.path, width - 4)}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Why</Text>
        <Text>{truncate(output.reason, width - 4)}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={output.action === "conflict" ? "red" : "gray"}>
          {output.action === "conflict"
            ? "This target appears manually modified. Review before overwriting."
            : "Press s to confirm and apply the full preview plan."}
        </Text>
      </Box>
    </Box>
  );
}

function ConflictDetails({ conflict, selectedAction, width }: { conflict: DashboardConflict; selectedAction: number; width: number }) {
  const actions = [
    { label: "Keep source", detail: "Apply the winning registry asset to targets." },
    { label: "Keep target", detail: "Leave the current target file unchanged." },
    { label: "Merge manually", detail: "Open the source and target files outside the TUI, then refresh." },
    { label: "Skip", detail: "Do not write this asset during the next sync." },
  ];
  return (
    <Box flexDirection="column">
      <Text color="red" bold>{truncate(conflict.id, width - 4)}</Text>
      <Text dimColor>{conflict.scope}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Candidates</Text>
        {conflict.candidates.map((candidate) => (
          <Text key={candidate} color={candidate === conflict.winner ? "green" : "gray"}>
            {candidate === conflict.winner ? "winner " : "       "}{truncate(candidate, width - 12)}
          </Text>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Resolution choices</Text>
        {actions.map((action, index) => (
          <Box key={action.label} gap={1}>
            <Text color={selectedAction === index ? "magenta" : "gray"}>{selectedAction === index ? ">" : " "}</Text>
            <Text>{action.label}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color="yellow">{truncate(actions[selectedAction].detail, width - 4)}</Text>
      </Box>
    </Box>
  );
}

function ActivityDetails({ entry, width }: { entry: DashboardActivity; width: number }) {
  return (
    <Box flexDirection="column">
      <Text color={LOG_COLOR[entry.level]} bold>{entry.level}</Text>
      {entry.time && <Text dimColor>{entry.time}</Text>}
      {entry.scope && <Text dimColor>{entry.scope}</Text>}
      <Box marginTop={1}>
        <Text>{truncate(entry.message, width - 4)}</Text>
      </Box>
      {entry.detail && (
        <Box marginTop={1}>
          <Text dimColor>{truncate(entry.detail, width - 4)}</Text>
        </Box>
      )}
    </Box>
  );
}

function SettingsDetails({ data, scopeFilter, width }: { data: DashboardData; scopeFilter: DashboardScopeFilter; width: number }) {
  const workspaces = (data.workspaces ?? []).filter((workspace) => scopeFilter === "all" || workspace.scope === scopeFilter);
  return (
    <Box flexDirection="column">
      <Text color="magenta" bold>Workspace configuration</Text>
      <Box marginTop={1} flexDirection="column">
        {workspaces.map((workspace) => (
          <Box key={workspace.scope} flexDirection="column" marginBottom={1}>
            <Text bold>{workspace.scope}</Text>
            <Text color={workspace.manifestExists ? "green" : "yellow"}>
              {workspace.manifestExists ? "manifest found" : "manifest missing"}
            </Text>
            <Text dimColor>{compactPath(workspace.manifestPath, width - 4)}</Text>
          </Box>
        ))}
      </Box>
      <Text dimColor>Ignore patterns and validation rules are currently managed in manifest/source files, not in an interactive editor.</Text>
    </Box>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">{title}</Text>
      <Text dimColor>{detail}</Text>
    </Box>
  );
}

function HelpOverlay() {
  return (
    <OverlayBox title="Help">
      <Text bold>Core concepts</Text>
      <Text>Assets are reusable AI instructions, rules, commands, skills, and workflows.</Text>
      <Text>Tools are AI coding assistants that receive generated target files.</Text>
      <Text>{"Flow: tool files -> import -> coactl assets -> resolve -> sync -> tool files."}</Text>
      <Text>Preview shows exactly what sync plans to create, update, skip, or flag.</Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Shortcuts</Text>
        <Text>1-8 nav · Tab panel · j/k move · Enter select</Text>
        <Text>/ search · f not-synced · t sort · g scope</Text>
        <Text>p preview · s sync confirmation · r refresh · u update</Text>
        <Text>i import · : command palette · Esc back · q quit</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press ?, Enter, Esc, or q to close.</Text>
      </Box>
    </OverlayBox>
  );
}

function PaletteOverlay({ commands, selectedIndex }: { commands: Array<{ label: string; detail: string }>; selectedIndex: number }) {
  return (
    <OverlayBox title="Command Palette">
      {commands.map((command, index) => (
        <Box key={command.label} gap={1}>
          <Text color={selectedIndex === index ? "magenta" : "gray"}>{selectedIndex === index ? ">" : " "}</Text>
          <Text bold={selectedIndex === index}>{command.label}</Text>
          <Text dimColor>{command.detail}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>Use j/k and Enter. Esc cancels.</Text>
      </Box>
    </OverlayBox>
  );
}

function SearchOverlay({ draft, current }: { draft: string; current: string }) {
  return (
    <OverlayBox title="Search Assets">
      <Text dimColor>Search by id, source path, kind, tool, or status.</Text>
      <Box marginTop={1} gap={1}>
        <Text color="magenta">/</Text>
        <Text>{draft}</Text>
        <Text color="magenta">_</Text>
      </Box>
      {current && <Text dimColor>Current filter: {current}</Text>}
      <Box marginTop={1}>
        <Text dimColor>Enter applies. Esc cancels. Backspace edits.</Text>
      </Box>
    </OverlayBox>
  );
}

function ConfirmSyncOverlay({ outputs, conflicts, scopeFilter }: { outputs: DashboardOutput[]; conflicts: DashboardConflict[]; scopeFilter: DashboardScopeFilter }) {
  const summary = previewSummary(outputs);
  const pending = summary.create + summary.update + summary.delete + summary.conflict;
  return (
    <OverlayBox title="Confirm Sync">
      <Text bold>Apply sync for scope: {scopeFilter}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text color="green">create: {summary.create}</Text>
        <Text color="yellow">update: {summary.update}</Text>
        <Text color="red">conflict/modified: {summary.conflict}</Text>
        <Text color="gray">skip: {summary.skip}</Text>
      </Box>
      {conflicts.length > 0 && (
        <Box marginTop={1}>
          <Text color="red">{formatCount(conflicts.length, "registry conflict")} will use manifest precedence unless you edit sources first.</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={pending > 0 ? "yellow" : "green"}>
          {pending > 0 ? "This will write managed target files. Press y or Enter to continue." : "No pending writes. Press y or Enter to refresh sync state."}
        </Text>
      </Box>
      <Text dimColor>Press n, Esc, or q to cancel.</Text>
    </OverlayBox>
  );
}

function OverlayBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box width={72} flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1} paddingY={1}>
      <Text color="magenta" bold>{title}</Text>
      <Box marginTop={1} flexDirection="column">
        {children}
      </Box>
    </Box>
  );
}
