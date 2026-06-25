import { join } from "node:path";
import { capabilityFor } from "./capability-matrix.js";
import { renderManagedMarkdownBlock, renderSkillFile } from "./markdown.js";
import type { Adapter, AdapterContext, EmittedFile } from "./types.js";
import type { ResolvedAsset } from "../registry/types.js";
import type { AssetKind } from "../schema/index.js";

export class ZedAdapter implements Adapter {
  target = "zed" as const;

  capability(kind: AssetKind) {
    return capabilityFor("zed", kind);
  }

  emit(asset: ResolvedAsset, context: AdapterContext = { scope: "project" }): EmittedFile[] {
    const id = asset.asset.id;
    const skillBase = context.scope === "global" && context.zedHome ? join(context.zedHome, "skills") : join(".agents", "skills");

    switch (asset.asset.kind) {
      case "skill":
        return [{ path: join(skillBase, id, "SKILL.md"), contents: renderSkillFile(asset), assetId: id, target: this.target }];
      case "rule":
        return [{
          path: context.scope === "global" && context.zedHome ? join(context.zedHome, "AGENTS.md") : "AGENTS.md",
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
