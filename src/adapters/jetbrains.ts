import { join } from "node:path";
import { capabilityFor } from "./capability-matrix.js";
import { renderRuleFile } from "./markdown.js";
import type { Adapter, AdapterContext, EmittedFile } from "./types.js";
import type { ResolvedAsset } from "../registry/types.js";
import type { AssetKind } from "../schema/index.js";

export class JetBrainsAdapter implements Adapter {
  target = "jetbrains" as const;

  capability(kind: AssetKind) {
    return capabilityFor("jetbrains", kind);
  }

  emit(asset: ResolvedAsset, context: AdapterContext = { scope: "project" }): EmittedFile[] {
    if (asset.asset.kind === "command" || asset.asset.kind === "workflow") return [];
    const base = context.scope === "global" && context.jetbrainsHome ? join(context.jetbrainsHome, "rules") : join(".aiassistant", "rules");
    const id = asset.asset.id;
    return [{ path: join(base, `${id}.md`), contents: renderRuleFile(asset), assetId: id, target: this.target }];
  }
}
