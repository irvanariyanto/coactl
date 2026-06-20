import type { Adapter } from "../adapters/types.js";
import { ClaudeCodeAdapter } from "../adapters/claude-code.js";
import { CursorAdapter } from "../adapters/cursor.js";
import { WindsurfAdapter } from "../adapters/windsurf.js";
import { CopilotAdapter } from "../adapters/copilot.js";
import { capabilityFor } from "../adapters/capability-matrix.js";
import { degradedWarning, skipNotice, type Diagnostic } from "./diagnostics.js";
import type { Registry } from "../registry/types.js";
import type { Manifest } from "../schema/index.js";
import type { EmittedFile } from "../adapters/types.js";
import type { Target, AssetKind } from "../schema/index.js";

export interface TransformResult {
  files: EmittedFile[];
  diagnostics: Diagnostic[];
}

export interface TransformOptions {
  targets?: Target[];
  kinds?: AssetKind[];
}

// Adapter instances per target
function getAdapter(target: Target): Adapter {
  switch (target) {
    case "claude-code":
      return new ClaudeCodeAdapter();
    case "cursor":
      return new CursorAdapter();
    case "windsurf":
      return new WindsurfAdapter();
    case "copilot":
      return new CopilotAdapter();
  }
}

export function transform(registry: Registry, manifest: Manifest, options: TransformOptions = {}): TransformResult {
  const files: EmittedFile[] = [];
  const diagnostics: Diagnostic[] = [];

  const allAssets = registry.all();
  const filterKinds = options.kinds ? new Set(options.kinds) : null;
  const filterTargets = options.targets ? new Set(options.targets) : null;

  for (const resolved of allAssets) {
    if (filterKinds && !filterKinds.has(resolved.asset.kind)) {
      continue;
    }

    for (const target of resolved.asset.targets) {
      if (filterTargets && !filterTargets.has(target)) {
        continue;
      }

      const capability = capabilityFor(target, resolved.asset.kind);

      if (capability === "skip") {
        diagnostics.push(skipNotice(resolved.asset.id, target, resolved.asset.kind));
        continue;
      }

      try {
        const adapter = getAdapter(target);
        const emitted = adapter.emit(resolved);
        files.push(...emitted);

        if (capability === "degraded") {
          diagnostics.push(degradedWarning(resolved.asset.id, target, resolved.asset.kind));
        }
      } catch (err) {
        diagnostics.push({
          level: "warn",
          assetId: resolved.asset.id,
          target,
          kind: resolved.asset.kind,
          message: `Failed to emit: ${(err as Error).message}`,
        });
      }
    }
  }

  return { files, diagnostics };
}
