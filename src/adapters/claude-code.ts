import { contentHash, renderHeader } from "../transform/header.js";
import { capabilityFor } from "./capability-matrix.js";
import { compileWorkflowSteps } from "../transform/workflow.js";
import type { Adapter, EmittedFile } from "./types.js";
import type { ResolvedAsset } from "../registry/types.js";
import type { AssetKind } from "../schema/index.js";

export class ClaudeCodeAdapter implements Adapter {
  target = "claude-code" as const;

  capability(kind: AssetKind) {
    return capabilityFor("claude-code", kind);
  }

  emit(asset: ResolvedAsset): EmittedFile[] {
    const id = asset.asset.id;

    switch (asset.asset.kind) {
      case "skill":
      case "command":
      case "workflow":
        // Source files live in .claude/ already — no emit needed
        return [];

      case "rule": {
        const hash = contentHash(asset.bodyText);
        const header = renderHeader({
          assetId: id,
          source: asset.sourceName,
          hash,
          commentSyntax: "<!-- -->",
        });
        const fenceStart = `<!-- BEGIN coactl:${id} -->`;
        const fenceEnd = `<!-- END coactl:${id} -->`;
        const contents = `${fenceStart}\n${header}${asset.bodyText}\n${fenceEnd}`;
        return [{ path: "CLAUDE.md", contents, assetId: id }];
      }
    }
  }
}
