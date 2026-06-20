import { contentHash, renderHeader } from "../transform/header.js";
import { capabilityFor } from "./capability-matrix.js";
import type { Adapter, EmittedFile } from "./types.js";
import type { ResolvedAsset } from "../registry/types.js";
import type { AssetKind } from "../schema/index.js";

// TODO: Windsurf rules file format assumption — .windsurfrules is a plain Markdown
// file with no official spec as of this writing. We emit per-asset managed blocks
// using <!-- BEGIN coactl:id --> / <!-- END coactl:id --> markers (same as CLAUDE.md).
// Update if Windsurf publishes a structured format.
export class WindsurfAdapter implements Adapter {
  target = "windsurf" as const;

  capability(kind: AssetKind) {
    return capabilityFor("windsurf", kind);
  }

  emit(asset: ResolvedAsset): EmittedFile[] {
    const id = asset.asset.id;

    if (asset.asset.kind === "command" || asset.asset.kind === "workflow") {
      return [];
    }

    const bodyText = asset.bodyText;
    const hash = contentHash(bodyText);
    const header = renderHeader({
      assetId: id,
      source: asset.sourceName,
      hash,
      commentSyntax: "<!-- -->",
    });

    const fenceStart = `<!-- BEGIN coactl:${id} -->`;
    const fenceEnd = `<!-- END coactl:${id} -->`;
    const contents = `${fenceStart}\n${header}${bodyText}\n${fenceEnd}`;

    return [{ path: ".windsurfrules", contents, assetId: id }];
  }
}
