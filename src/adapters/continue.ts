import { join } from "node:path";
import { capabilityFor } from "./capability-matrix.js";
import { renderRuleFile } from "./markdown.js";
import type { Adapter, AdapterContext, EmittedFile } from "./types.js";
import type { ResolvedAsset } from "../registry/types.js";
import type { AssetKind } from "../schema/index.js";

export class ContinueAdapter implements Adapter {
  target = "continue" as const;

  capability(kind: AssetKind) {
    return capabilityFor("continue", kind);
  }

  emit(asset: ResolvedAsset, context: AdapterContext = { scope: "project" }): EmittedFile[] {
    if (asset.asset.kind === "command" || asset.asset.kind === "workflow") return [];
    const base = context.scope === "global" && context.continueHome ? join(context.continueHome, "rules") : join(".continue", "rules");
    const id = asset.asset.id;
    const frontmatter = {
      name: asset.asset.name,
      alwaysApply: asset.asset.activation === "auto",
    };
    return [{ path: join(base, `${id}.md`), contents: renderRuleFile(asset, frontmatter), assetId: id, target: this.target }];
  }
}
