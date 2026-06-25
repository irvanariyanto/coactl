import { withFullScreen } from "fullscreen-ink";
import chalk from "chalk";
import { constants, accessSync, existsSync, readFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Dashboard, type DashboardData, type DashboardAsset, type DashboardScopeFilter, type SyncResult, type DashboardProps, type DashboardOutput, type DashboardTool, type DashboardWorkspace, type DashboardActivity, type DashboardConflict, type PreviewAction } from "../../tui/views/Dashboard.js";
import { loadManifest } from "../../schema/load.js";
import { buildSourceLoaders } from "../../sources/registry-of-sources.js";
import { resolveRegistry } from "../../registry/resolve.js";
import { transform } from "../../transform/engine.js";
import { checkDrift } from "../../registry/drift.js";
import { writeFiles } from "../../io/write-files.js";
import { capabilityFor } from "../../adapters/capability-matrix.js";
import { globalManifestPath, globalRootDir, globalConfigDir, findProjectManifest, lockfilePathForManifest, globalBasePath, codexConfigDir } from "../../io/global-paths.js";
import { computeIntegrity } from "../../registry/integrity.js";
import { readLockfile, writeLockfile, upsertLockEntry } from "../../registry/lockfile.js";
import type { StatusKind } from "../../tui/components/StatusBadge.js";
import { listAssets, assetPath, type ToolSource } from "./import.js";
import { renderClaudeAssetFrontmatter } from "../../scaffold/templates.js";
import type { ImportTool, ImportCandidate } from "../../tui/components/ImportView.js";
import { SUPPORTED_TARGETS, type Target } from "../../schema/index.js";
import type { SourceConfig } from "../../schema/manifest.js";
import { detectInstalledTargets, toolInstallInfo } from "../../tools/detect.js";
import { updateLocalAssetTargets } from "../../registry/target-updates.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

type ScopeData = Pick<DashboardData, "assets" | "sources" | "conflicts" | "outputs" | "tools" | "workspaces" | "activity">;

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

function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function sourcePathFor(manifestPath: string, source: SourceConfig): string {
  if (source.type === "local") {
    return isAbsolute(source.path) ? source.path : resolve(dirname(manifestPath), source.path);
  }
  if (source.type === "git") {
    return `${source.url}${source.ref ? `#${source.ref}` : ""}${source.subdir ? `/${source.subdir}` : ""}`;
  }
  if (source.type === "package") return `${source.registry}:${source.install}`;
  if (source.type === "url") return source.url;
  return source.org;
}

function workspaceWritable(rootDir: string): boolean {
  try {
    accessSync(rootDir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function targetBasePath(target: Target, scope: "global" | "project", rootDir: string): string {
  if (scope === "global") {
    if (target === "codex") return `${join(homedir(), ".agents")} + ${codexConfigDir()}`;
    return globalBasePath(target);
  }
  switch (target) {
    case "claude-code": return join(rootDir, ".claude");
    case "codex": return rootDir;
    case "antigravity": return join(rootDir, ".antigravity");
    case "gemini": return join(rootDir, ".gemini");
    case "cline": return join(rootDir, ".clinerules");
    case "roo-code": return join(rootDir, ".roo");
    case "continue": return join(rootDir, ".continue");
    case "aider": return join(rootDir, "CONVENTIONS.md");
    case "opencode": return join(rootDir, ".opencode");
    case "zed": return join(rootDir, ".agents");
    case "jetbrains": return join(rootDir, ".aiassistant");
    case "cursor": return join(rootDir, ".cursor");
    case "windsurf": return join(rootDir, ".windsurfrules");
    case "copilot": return join(rootDir, ".github");
  }
}

function previewAction(status: "clean" | "modified" | "stale" | "missing" | undefined): PreviewAction {
  if (status === "missing") return "create";
  if (status === "stale") return "update";
  if (status === "modified") return "conflict";
  return "skip";
}

function previewReason(action: PreviewAction): string {
  switch (action) {
    case "create": return "Target file does not exist yet.";
    case "update": return "Target file is managed by coactl but has older generated content.";
    case "conflict": return "Target file appears manually modified or has an invalid managed header.";
    case "delete": return "Target file is no longer produced by the registry.";
    case "skip": return "Target file already matches the generated output.";
  }
}

function emptyScopeData(
  scope: "global" | "project",
  rootDir: string,
  manifestPath: string,
  message: string,
): ScopeData {
  return {
    assets: [],
    sources: [],
    conflicts: [],
    outputs: [],
    tools: buildTools([], scope, rootDir),
    workspaces: [buildWorkspace(scope, rootDir, manifestPath, false, 0, 0)],
    activity: [{
      level: "warning",
      message,
      detail: `Expected manifest: ${manifestPath}`,
      scope,
      time: nowLabel(),
    }],
  };
}

function buildWorkspace(
  scope: "global" | "project",
  rootDir: string,
  manifestPath: string,
  manifestExists: boolean,
  assetCount: number,
  sourceCount: number,
): DashboardWorkspace {
  return {
    scope,
    root: rootDir,
    manifestPath,
    manifestExists,
    assetCount,
    sourceCount,
    writable: workspaceWritable(rootDir),
  };
}

function buildTools(assets: DashboardAsset[], scope: "global" | "project", rootDir: string): DashboardTool[] {
  return SUPPORTED_TARGETS.map((target) => {
    const targeted = assets.filter((asset) => asset.targets.includes(target));
    const compatibleAssets = assets.filter((asset) => capabilityFor(target, asset.kind, scope) !== "skip");
    const installInfo = toolInstallInfo(target);
    const installed = installInfo.installed;
    let importableCount = 0;
    if (installed) {
      try {
        importableCount = listAssets(target as ToolSource, scope === "global").length;
      } catch {
        importableCount = 0;
      }
    }
    let nativeCount = 0;
    let degradedCount = 0;
    let skippedCount = 0;
    for (const asset of targeted) {
      const capability = capabilityFor(target, asset.kind, scope);
      if (capability === "native") nativeCount++;
      else if (capability === "degraded") degradedCount++;
      else skippedCount++;
    }
    return {
      id: target,
      label: TARGET_LABEL[target],
      state: installed ? "configured" : "available",
      targetPath: targetBasePath(target, scope, rootDir),
      installReason: installInfo.reason,
      importableCount,
      assetCount: targeted.length,
      compatibleAssetCount: compatibleAssets.length,
      nativeCount,
      degradedCount,
      skippedCount,
      scopes: [scope],
      note: installed
        ? targeted.length > 0
          ? "This installed tool is referenced by one or more asset targets."
          : "This tool is installed. Add this target to an asset to generate files for it."
        : "This supported tool was not detected on this device.",
    };
  });
}

function mergeTools(globalTools: DashboardTool[], projectTools: DashboardTool[] = []): DashboardTool[] {
  return SUPPORTED_TARGETS.map((target) => {
    const matches = [...globalTools, ...projectTools].filter((tool) => tool.id === target);
    const first = matches[0]!;
    const scopes = matches.flatMap((tool) => tool.scopes);
    const assetCount = matches.reduce((sum, tool) => sum + tool.assetCount, 0);
    return {
      ...first,
      state: matches.some((tool) => tool.state === "configured") ? "configured" : "available",
      targetPath: matches.map((tool) => `${tool.scopes[0]}:${tool.targetPath}`).join(" | "),
      installReason: matches.find((tool) => tool.installReason)?.installReason,
      importableCount: matches.reduce((sum, tool) => sum + (tool.importableCount ?? 0), 0),
      assetCount,
      compatibleAssetCount: matches.reduce((sum, tool) => sum + tool.compatibleAssetCount, 0),
      nativeCount: matches.reduce((sum, tool) => sum + tool.nativeCount, 0),
      degradedCount: matches.reduce((sum, tool) => sum + tool.degradedCount, 0),
      skippedCount: matches.reduce((sum, tool) => sum + tool.skippedCount, 0),
      scopes: [...new Set(scopes)],
    };
  });
}

async function loadScopeData(
  manifestPath: string,
  assetScope: "global" | "project",
  rootDir: string,
): Promise<ScopeData> {
  if (!existsSync(manifestPath)) {
    return emptyScopeData(
      assetScope,
      rootDir,
      manifestPath,
      assetScope === "global"
        ? "Global config is not initialized yet."
        : "Project config is not initialized yet.",
    );
  }

  const manifest = loadManifest(manifestPath);
  const loaders = buildSourceLoaders(manifestPath);
  const allLoaded = [];
  const sourceAssetCounts = new Map<string, number>();
  const activity: DashboardActivity[] = [];

  for (const [index, loader] of loaders.entries()) {
    const sourceName = manifest.sources[index]?.name ?? `source-${index + 1}`;
    try {
      const result = await loader.load();
      allLoaded.push(...result.assets);
      for (const a of result.assets) {
        sourceAssetCounts.set(a.sourceName, (sourceAssetCounts.get(a.sourceName) ?? 0) + 1);
      }
      activity.push({
        level: "success",
        message: `Loaded ${result.assets.length} asset${result.assets.length === 1 ? "" : "s"} from ${sourceName}.`,
        scope: assetScope,
        time: nowLabel(),
      });
      for (const sourceError of result.errors) {
        activity.push({
          level: "warning",
          message: `Skipped an invalid asset from ${sourceName}.`,
          detail: `${sourceError.dir}: ${sourceError.error.message}`,
          scope: assetScope,
          time: nowLabel(),
        });
      }
    } catch (err) {
      activity.push({
        level: "error",
        message: `Could not load source ${sourceName}.`,
        detail: (err as Error).message,
        scope: assetScope,
        time: nowLabel(),
      });
    }
  }

  const registry = resolveRegistry(allLoaded, manifest);
  const installedTargets = detectInstalledTargets();
  const { files: emittedFiles, diagnostics } = transform(registry, manifest, { targets: installedTargets, scope: assetScope });
  const driftEntries = checkDrift(emittedFiles, rootDir);
  const outputs: DashboardOutput[] = emittedFiles.map((file) => {
    const drift = driftEntries.find((entry) => entry.assetId === file.assetId && entry.path === file.path);
    const action = previewAction(drift?.status);
    return {
      path: file.path,
      target: file.target,
      assetId: file.assetId,
      scope: assetScope,
      action,
      reason: previewReason(action),
    };
  });
  const outputsByAsset = new Map<string, DashboardOutput[]>();
  for (const output of outputs) {
    outputsByAsset.set(output.assetId, [...(outputsByAsset.get(output.assetId) ?? []), output]);
  }
  const diagnosticsByAsset = new Map<string, string[]>();
  for (const diagnostic of diagnostics) {
    diagnosticsByAsset.set(diagnostic.assetId, [
      ...(diagnosticsByAsset.get(diagnostic.assetId) ?? []),
      `${diagnostic.level}: ${diagnostic.message}`,
    ]);
    activity.push({
      level: diagnostic.level === "warn" ? "warning" : "info",
      message: diagnostic.message,
      detail: `${diagnostic.assetId} -> ${diagnostic.target}`,
      scope: assetScope,
      time: nowLabel(),
    });
  }

  const assets: DashboardAsset[] = registry.all().map((ra) => {
    const assetDrift = driftEntries.filter((d) => d.assetId === ra.asset.id);
    let status: StatusKind;
    if (assetDrift.length === 0) {
      // No files emitted (all targets skip this kind) — nothing to be out of sync with.
      status = "synced";
    } else if (assetDrift.some((d) => d.status === "modified" || d.status === "stale")) {
      status = "drifted";
    } else if (assetDrift.some((d) => d.status === "missing")) {
      status = "missing";
    } else {
      status = "synced";
    }
    let modifiedAt: string | undefined;
    try {
      modifiedAt = statSync(ra.origin.dir).mtime.toLocaleString();
    } catch {
      modifiedAt = undefined;
    }
    return {
      id: ra.asset.id,
      kind: ra.asset.kind,
      status,
      version: ra.asset.version,
      description: ra.asset.description,
      targets: ra.asset.targets,
      source: ra.sourceName,
      readOnly: ra.readOnly,
      scope: assetScope,
      sourcePath: ra.origin.dir,
      modifiedAt,
      outputs: outputsByAsset.get(ra.asset.id) ?? [],
      diagnostics: diagnosticsByAsset.get(ra.asset.id) ?? [],
    };
  });

  const sources = manifest.sources.map((s) => ({
    name: s.name,
    type: s.type,
    count: sourceAssetCounts.get(s.name) ?? 0,
    scope: assetScope,
    path: sourcePathFor(manifestPath, s),
  }));

  const conflicts: DashboardConflict[] = registry.conflicts.map((conflict) => ({
    ...conflict,
    scope: assetScope,
    winner: registry.get(conflict.id)?.sourceName,
  }));

  return {
    assets,
    sources,
    conflicts,
    outputs,
    tools: buildTools(assets, assetScope, rootDir),
    workspaces: [buildWorkspace(assetScope, rootDir, manifestPath, true, assets.length, manifest.sources.length)],
    activity,
  };
}

async function syncScope(
  manifestPath: string,
  rootDir: string,
  scope: "global" | "project",
): Promise<SyncResult> {
  const manifest = loadManifest(manifestPath);
  const loaders = buildSourceLoaders(manifestPath);
  const allLoaded = [];
  for (const loader of loaders) {
    const result = await loader.load();
    allLoaded.push(...result.assets);
  }
  const registry = resolveRegistry(allLoaded, manifest);
  const installedTargets = detectInstalledTargets();
  const { files } = transform(registry, manifest, { targets: installedTargets, scope });
  return writeFiles(files, rootDir);
}

async function updateScope(manifestPath: string): Promise<{ updated: number; errors: string[] }> {
  try {
    const lockfilePath = lockfilePathForManifest(manifestPath);
    const lockfile = readLockfile(lockfilePath);
    const ids = Object.keys(lockfile.assets);
    if (ids.length === 0) return { updated: 0, errors: [] };

    const loaders = buildSourceLoaders(manifestPath);
    let changed = 0;
    let updated = lockfile;

    for (const id of ids) {
      const old = lockfile.assets[id];
      for (const loader of loaders) {
        const result = await loader.load();
        const match = result.assets.find((a) => a.asset.id === id);
        if (!match) continue;
        const newIntegrity = computeIntegrity(match.origin.dir);
        const newVersion = match.asset.version;
        if (newIntegrity !== old.integrity || newVersion !== old.version) {
          updated = upsertLockEntry(updated, id, {
            source: match.sourceName,
            version: newVersion,
            integrity: newIntegrity,
          });
          changed++;
        }
        break;
      }
    }

    writeLockfile(updated, lockfilePath);
    return { updated: changed, errors: [] };
  } catch (err) {
    return { updated: 0, errors: [(err as Error).message] };
  }
}

function mergeData(
  globalData: ScopeData,
  projectData: ScopeData | null,
  scope: DashboardData["scope"],
): DashboardData {
  const globalTools = globalData.tools ?? [];
  const projectTools = projectData?.tools ?? [];
  return {
    assets: [...(projectData?.assets ?? []), ...globalData.assets],
    sources: [...(projectData?.sources ?? []), ...globalData.sources],
    conflicts: [...(projectData?.conflicts ?? []), ...globalData.conflicts],
    outputs: [...(projectData?.outputs ?? []), ...(globalData.outputs ?? [])],
    tools: scope === "project+global" ? mergeTools(globalTools, projectTools) : globalTools,
    workspaces: [...(projectData?.workspaces ?? []), ...(globalData.workspaces ?? [])],
    activity: [...(projectData?.activity ?? []), ...(globalData.activity ?? [])],
    scope,
  };
}

// Builds the data + handlers Dashboard needs, without touching the terminal — split out
// from dashboardAction so the real wiring (scope resolution, lockfile paths, import
// scope) can be exercised in tests via ink-testing-library, instead of only by eye
// through the fullscreen TUI.
export async function buildDashboardProps(options: { global?: boolean; project?: boolean } = {}): Promise<DashboardProps> {
  const globalRoot = globalRootDir();
  const globalPath = globalManifestPath();
  const projectManifestFound = !options.global ? findProjectManifest() : undefined;
  const isProject = !!projectManifestFound;
  // Native files (.claude/, .cursor/, …) live at the project root — the parent of the
  // .coactl/ dir that holds the manifest. This must match CLI sync (dirname(dirname(manifest))).
  const projectManifestDir = isProject ? dirname(projectManifestFound!) : undefined;
  const projectRoot = isProject ? dirname(projectManifestDir!) : undefined;
  const dataScope: DashboardData["scope"] = isProject ? "project+global" : "global";

  const [globalData, projectData] = await Promise.all([
    loadScopeData(globalPath, "global", globalRoot),
    isProject
      ? loadScopeData(projectManifestFound!, "project", projectRoot!)
      : Promise.resolve(null),
  ]);
  const data = mergeData(globalData, projectData, dataScope);

  const onSync = async (scope: DashboardScopeFilter): Promise<SyncResult> => {
    const [globalResult, projectResult] = await Promise.all([
      scope !== "project" ? syncScope(globalPath, globalRoot, "global") : Promise.resolve(null),
      isProject && scope !== "global"
        ? syncScope(projectManifestFound!, projectRoot!, "project")
        : Promise.resolve(null),
    ]);
    return {
      written: (globalResult?.written ?? 0) + (projectResult?.written ?? 0),
      unchanged: (globalResult?.unchanged ?? 0) + (projectResult?.unchanged ?? 0),
      errors: [...(globalResult?.errors ?? []), ...(projectResult?.errors ?? [])],
    };
  };

  const onRefresh = async (): Promise<DashboardData> => {
    const [globalData, projectData] = await Promise.all([
      loadScopeData(globalPath, "global", globalRoot),
      isProject
        ? loadScopeData(projectManifestFound!, "project", projectRoot!)
        : Promise.resolve(null),
    ]);
    return mergeData(globalData, projectData, dataScope);
  };

  const onUpdate = async (): Promise<{ updated: number; errors: string[] }> => {
    const [globalResult, projectResult] = await Promise.all([
      updateScope(globalPath),
      isProject ? updateScope(projectManifestFound!) : Promise.resolve({ updated: 0, errors: [] }),
    ]);
    return {
      updated: globalResult.updated + projectResult.updated,
      errors: [...globalResult.errors, ...projectResult.errors],
    };
  };

  const onToggleTool = async (target: Target, enable: boolean, scopeFilter: DashboardScopeFilter): Promise<{ updated: number; errors: string[] }> => {
    const jobs: Array<Promise<{ updated: number; errors: string[] }>> = [];
    if (scopeFilter !== "project") {
      jobs.push((async () => {
        try {
          const manifest = loadManifest(globalPath);
          const result = updateLocalAssetTargets({ manifestPath: globalPath, manifest, scope: "global", targets: [target], enable });
          return { updated: result.updated, errors: [] };
        } catch (err) {
          return { updated: 0, errors: [(err as Error).message] };
        }
      })());
    }
    if (isProject && scopeFilter !== "global") {
      jobs.push((async () => {
        try {
          const manifest = loadManifest(projectManifestFound!);
          const result = updateLocalAssetTargets({ manifestPath: projectManifestFound!, manifest, scope: "project", targets: [target], enable });
          return { updated: result.updated, errors: [] };
        } catch (err) {
          return { updated: 0, errors: [(err as Error).message] };
        }
      })());
    }
    const results = await Promise.all(jobs);
    return {
      updated: results.reduce((sum, result) => sum + result.updated, 0),
      errors: results.flatMap((result) => result.errors),
    };
  };

  // Default when the dashboard's scope filter is "all": mirrors the CLI's import command
  // (project-relative unless --global). When the filter is set to "global" or "project",
  // Dashboard passes that choice through explicitly instead — see effectiveImportGlobal.
  const importGlobal = !!options.global;

  const onListImportAssets = async (tool: ImportTool, global: boolean): Promise<ImportCandidate[]> => {
    const assets = listAssets(tool as ToolSource, global);
    return assets.map((a) => ({ id: a.id, kind: a.kind }));
  };

  const onImport = async (tool: ImportTool, ids: string[], global: boolean): Promise<{ imported: number; errors: string[] }> => {
    const assets = listAssets(tool as ToolSource, global);
    const root = global ? globalConfigDir() : join(process.cwd(), ".coactl");
    let imported = 0;
    const errors: string[] = [];
    for (const id of ids) {
      const asset = assets.find((a) => a.id === id);
      if (!asset) { errors.push(`${id}: not found`); continue; }
      try {
        const { dir, file } = assetPath(asset.kind, id, root);
        const fullPath = join(dir, file);
        // Guard against clobbering an existing authored asset (CLI import requires --force).
        if (existsSync(fullPath)) { errors.push(`${id}: already exists (skipped)`); continue; }
        mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, renderClaudeAssetFrontmatter({
          id: asset.id,
          kind: asset.kind,
          description: asset.description,
          includeCodexCommand: global,
        }) + asset.body);
        imported++;
      } catch (err) {
        errors.push(`${id}: ${(err as Error).message}`);
      }
    }
    return { imported, errors };
  };

  const pkg = JSON.parse(
    readFileSync(join(__dirname, "..", "..", "..", "package.json"), "utf-8"),
  ) as { version: string };

  return {
    version: pkg.version,
    data,
    onSync,
    onRefresh,
    onUpdate,
    onToggleTool,
    onListImportAssets,
    onImport,
    importGlobal,
  };
}

export async function dashboardAction(options: { global?: boolean; project?: boolean } = {}): Promise<void> {
  let props: DashboardProps;
  try {
    props = await buildDashboardProps(options);
  } catch (err) {
    console.error(chalk.red(`Dashboard: ${(err as Error).message}`));
    process.exitCode = 1;
    return;
  }

  const app = withFullScreen(<Dashboard {...props} />);
  app.start();
  await app.waitUntilExit();
}
