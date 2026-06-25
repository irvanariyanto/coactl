import { join } from "node:path";
import { capabilityFor } from "./capability-matrix.js";
import { renderManagedMarkdownBlock, renderSkillFile } from "./markdown.js";
import type { Adapter, AdapterContext, EmittedFile } from "./types.js";
import type { ResolvedAsset } from "../registry/types.js";
import type { AssetKind } from "../schema/index.js";

export class OpenCodeAdapter implements Adapter {
  target = "opencode" as const;

  capability(kind: AssetKind) {
    return capabilityFor("opencode", kind);
  }

  emit(asset: ResolvedAsset, context: AdapterContext = { scope: "project" }): EmittedFile[] {
    const id = asset.asset.id;
    const base = context.scope === "global" && context.opencodeHome ? context.opencodeHome : ".opencode";

    switch (asset.asset.kind) {
      case "skill":
        return [{ path: join(base, "skills", id, "SKILL.md"), contents: renderSkillFile(asset), assetId: id, target: this.target }];
      case "rule":
        return [{
          path: context.scope === "global" && context.opencodeHome ? join(context.opencodeHome, "AGENTS.md") : "AGENTS.md",
          contents: renderManagedMarkdownBlock(asset),
          assetId: id,
          target: this.target,
        }];
      case "command":
      case "workflow":
        return [];
    }
  }
}
