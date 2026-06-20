import { withFullScreen } from "fullscreen-ink";
import chalk from "chalk";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Dashboard, type DashboardData, type DashboardAsset, type SyncResult } from "../../tui/views/Dashboard.js";
import { loadManifest } from "../../schema/load.js";
import { buildSourceLoaders } from "../../sources/registry-of-sources.js";
import { resolveRegistry } from "../../registry/resolve.js";
import { transform } from "../../transform/engine.js";
import { checkDrift } from "../../registry/drift.js";
import { writeFiles } from "../../io/write-files.js";
import { resolveScope, globalRootDir } from "../../io/global-paths.js";
import type { StatusKind } from "../../tui/components/StatusBadge.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadDashboardData(manifestPath: string): Promise<DashboardData> {
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
  const driftEntries = checkDrift(emittedFiles);

  const assets: DashboardAsset[] = registry.all().map((ra) => {
    const assetDrift = driftEntries.filter((d) => d.assetId === ra.asset.id);
    let status: StatusKind;
    if (assetDrift.length === 0) {
      status = "missing";
    } else if (assetDrift.some((d) => d.status === "modified" || d.status === "stale")) {
      status = "drifted";
    } else if (assetDrift.every((d) => d.status === "missing")) {
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
    };
  });

  const sources = manifest.sources.map((s) => ({
    name: s.name,
    type: s.type,
    count: sourceAssetCounts.get(s.name) ?? 0,
  }));

  return { assets, sources, conflicts: registry.conflicts };
}

export async function dashboardAction(options: { global?: boolean; project?: boolean } = {}): Promise<void> {
  const { path: manifestPath, scope } = resolveScope(options);
  const rootDir = scope === "global" ? globalRootDir() : dirname(manifestPath);

  let data: DashboardData;
  try {
    data = await loadDashboardData(manifestPath);
  } catch (err) {
    console.error(chalk.red(`Dashboard: ${(err as Error).message}`));
    process.exitCode = 1;
    return;
  }

  const onSync = async (): Promise<SyncResult> => {
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
  };

  const pkg = JSON.parse(
    readFileSync(join(__dirname, "..", "..", "..", "package.json"), "utf-8"),
  ) as { version: string };

  const app = withFullScreen(<Dashboard version={pkg.version} data={data} onSync={onSync} />);
  app.start();
  await app.waitUntilExit();
}
