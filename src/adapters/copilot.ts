import { contentHash, renderHeader } from "../transform/header.js";
import { capabilityFor } from "./capability-matrix.js";
import type { Adapter, EmittedFile } from "./types.js";
import type { ResolvedAsset } from "../registry/types.js";
import type { AssetKind } from "../schema/index.js";

// TODO: .github/copilot-instructions.md format assumption — Copilot reads this as
// plain Markdown instructions. scope.paths/scope.languages have no native field;
// we fold them into a prose note in the block. Update if GitHub adds structured scoping.
export class CopilotAdapter implements Adapter {
  target = "copilot" as const;

  capability(kind: AssetKind) {
    return capabilityFor("copilot", kind);
  }

  emit(asset: ResolvedAsset): EmittedFile[] {
    const id = asset.asset.id;

    if (asset.asset.kind === "command" || asset.asset.kind === "workflow") {
      return [];
    }

    const bodyText = asset.bodyText;
    const hash = contentHash(bodyText);
    const header = renderHeader({ assetId: id, source: asset.sourceName, hash, commentSyntax: "<!-- -->" });

    const scopeNote = asset.asset.scope
      ? `\n<!-- scope: paths=${JSON.stringify(asset.asset.scope.paths ?? [])} languages=${JSON.stringify(asset.asset.scope.languages ?? [])} -->\n`
      : "";

    const fenceStart = `<!-- BEGIN coactl:${id} -->`;
    const fenceEnd = `<!-- END coactl:${id} -->`;
    const contents = `${fenceStart}\n${header}${scopeNote}${bodyText}\n${fenceEnd}`;

    return [{ path: ".github/copilot-instructions.md", contents, assetId: id, target: this.target }];
  }
}
