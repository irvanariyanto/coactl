import type { LoadedAsset } from "../sources/types.js";
import type { Manifest } from "../schema/index.js";
import type { Registry, ResolvedAsset } from "./types.js";

// Seam for AC-015: picks winning asset when multiple sources provide the same id.
// Currently returns first candidate; AC-015 will implement precedence ordering.
function pickWinner(candidates: LoadedAsset[]): LoadedAsset {
  return candidates[0];
}

// Seam for AC-016: applies manifest overrides on top of a resolved asset.
// Currently a no-op; AC-016 will implement the override layer.
function applyOverrides(resolved: ResolvedAsset, _manifest: Manifest): ResolvedAsset {
  return resolved;
}

export function resolveRegistry(loadedAssets: LoadedAsset[], manifest: Manifest): Registry {
  const byId = new Map<string, LoadedAsset[]>();
  for (const loaded of loadedAssets) {
    const group = byId.get(loaded.asset.id) ?? [];
    group.push(loaded);
    byId.set(loaded.asset.id, group);
  }

  const conflicts: Registry["conflicts"] = [];
  const resolved = new Map<string, ResolvedAsset>();

  for (const [id, candidates] of byId.entries()) {
    if (candidates.length > 1) {
      conflicts.push({ id, candidates: candidates.map((c) => c.sourceName) });
    }
    const winner = pickWinner(candidates);
    const raw: ResolvedAsset = {
      asset: winner.asset,
      sourceName: winner.sourceName,
      readOnly: winner.readOnly,
      provenance: {
        winningSource: winner.sourceName,
        candidates: candidates.map((c) => ({ sourceName: c.sourceName, readOnly: c.readOnly })),
      },
    };
    resolved.set(id, applyOverrides(raw, manifest));
  }

  const sorted = [...resolved.values()].sort((a, b) => a.asset.id.localeCompare(b.asset.id));

  return {
    get: (id) => resolved.get(id),
    all: () => sorted,
    conflicts,
  };
}
