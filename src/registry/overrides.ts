import type { ResolvedAsset } from "./types.js";
import type { Manifest, Scope } from "../schema/index.js";

// v1 assumption: `patch` is a replacement body file path, not a unified diff.
function deepMergeScope(base: Scope | undefined, over: Scope | undefined): Scope | undefined {
  if (!over) return base;
  return {
    languages: over.languages ?? base?.languages,
    paths: over.paths ?? base?.paths,
  };
}

export function applyOverrides(resolved: ResolvedAsset, manifest: Manifest): ResolvedAsset {
  const entry = manifest.overrides?.[resolved.asset.id];
  if (!entry) return resolved;

  const asset = { ...resolved.asset };
  if (entry.targets) asset.targets = entry.targets as typeof asset.targets;
  if (entry.scope) asset.scope = deepMergeScope(resolved.asset.scope, entry.scope);
  if (entry.patch) asset.body = entry.patch;

  return { ...resolved, asset };
}
