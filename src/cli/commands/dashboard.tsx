import { withFullScreen } from "fullscreen-ink";
import chalk from "chalk";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Dashboard, type DashboardData, type DashboardAsset, type SyncResult, type DashboardProps } from "../../tui/views/Dashboard.js";
import { loadManifest } from "../../schema/load.js";
import { buildSourceLoaders } from "../../sources/registry-of-sources.js";
import { resolveRegistry } from "../../registry/resolve.js";
import { transform } from "../../transform/engine.js";
import { checkDrift } from "../../registry/drift.js";
import { writeFiles } from "../../io/write-files.js";
import { globalManifestPath, globalRootDir, globalConfigDir, findProjectManifest, lockfilePathForManifest } from "../../io/global-paths.js";
import { computeIntegrity } from "../../registry/integrity.js";
import { readLockfile, writeLockfile, upsertLockEntry } from "../../registry/lockfile.js";
import type { StatusKind } from "../../tui/components/StatusBadge.js";
import { listAssets, assetPath, type ToolSource } from "./import.js";
import { renderClaudeAssetFrontmatter } from "../../scaffold/templates.js";
import type { ImportTool, ImportCandidate } from "../../tui/components/ImportView.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadScopeData(
  manifestPath: string,
  assetScope: "global" | "project",
  rootDir: string,
): Promise<Pick<DashboardData, "assets" | "sources" | "conflicts">> {
  const manifest = loadManifest(manifestPath);
  const loaders = buildSourceLoaders(manifestPath);
  const allLoaded = [];
  const sourceAssetCounts = new Map<string, number>();

  for (const loader of loaders) {
    const result = await loader.load();
    allLoaded.push(...result.assets);
    for (const a of result.assets) {
      sourceAssetCounts.set(a.sourceName, (sourceAssetCounts.get(a.sourceName) ?? 0) + 1);
    }
  }

  const registry = resolveRegistry(allLoaded, manifest);
  const { files: emittedFiles } = transform(registry, manifest);
  const driftEntries = checkDrift(emittedFiles, rootDir);

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
    };
  });

  const sources = manifest.sources.map((s) => ({
    name: s.name,
    type: s.type,
    count: sourceAssetCounts.get(s.name) ?? 0,
    scope: assetScope,
  }));

  return { assets, sources, conflicts: registry.conflicts };
}

async function syncScope(manifestPath: string, rootDir: string): Promise<SyncResult> {
  const manifest = loadManifest(manifestPath);
  const loaders = buildSourceLoaders(manifestPath);
  const allLoaded = [];
  for (const loader of loaders) {
    const result = await loader.load();
    allLoaded.push(...result.assets);
  }
  const registry = resolveRegistry(allLoaded, manifest);
  const { files } = transform(registry, manifest);
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
  globalData: Pick<DashboardData, "assets" | "sources" | "conflicts">,
  projectData: Pick<DashboardData, "assets" | "sources" | "conflicts"> | null,
  scope: DashboardData["scope"],
): DashboardData {
  return {
    assets: [...(projectData?.assets ?? []), ...globalData.assets],
    sources: [...(projectData?.sources ?? []), ...globalData.sources],
    conflicts: [...(projectData?.conflicts ?? []), ...globalData.conflicts],
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
    loadScopeData(globalPath, "global", globalRoot).catch(() => ({
      assets: [] as DashboardAsset[],
      sources: [],
      conflicts: [],
    })),
    isProject
      ? loadScopeData(projectManifestFound!, "project", projectRoot!)
      : Promise.resolve(null),
  ]);
  const data = mergeData(globalData, projectData, dataScope);

  const onSync = async (): Promise<SyncResult> => {
    const [globalResult, projectResult] = await Promise.all([
      syncScope(globalPath, globalRoot),
      isProject ? syncScope(projectManifestFound!, projectRoot!) : Promise.resolve(null),
    ]);
    return {
      written: globalResult.written + (projectResult?.written ?? 0),
      unchanged: globalResult.unchanged + (projectResult?.unchanged ?? 0),
      errors: [...globalResult.errors, ...(projectResult?.errors ?? [])],
    };
  };

  const onRefresh = async (): Promise<DashboardData> => {
    const [globalData, projectData] = await Promise.all([
      loadScopeData(globalPath, "global", globalRoot).catch(() => ({
        assets: [] as DashboardAsset[],
        sources: [],
        conflicts: [],
      })),
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

  // Mirrors the CLI's import command: project-relative (cwd) unless --global, independent
  // of whether a .coactl manifest exists yet — importing is valid before `coactl init`.
  const importGlobal = !!options.global;

  const onListImportAssets = async (tool: ImportTool): Promise<ImportCandidate[]> => {
    const assets = listAssets(tool as ToolSource, importGlobal);
    return assets.map((a) => ({ id: a.id, kind: a.kind }));
  };

  const onImport = async (tool: ImportTool, ids: string[]): Promise<{ imported: number; errors: string[] }> => {
    const assets = listAssets(tool as ToolSource, importGlobal);
    const root = importGlobal ? globalConfigDir() : join(process.cwd(), ".coactl");
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
        writeFileSync(fullPath, renderClaudeAssetFrontmatter({ id: asset.id, kind: asset.kind, description: asset.description }) + asset.body);
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
