import { join } from "node:path";
import { capabilityFor } from "./capability-matrix.js";
import { renderManagedMarkdownBlock } from "./markdown.js";
import type { Adapter, AdapterContext, EmittedFile } from "./types.js";
import type { ResolvedAsset } from "../registry/types.js";
import type { AssetKind } from "../schema/index.js";

export class AiderAdapter implements Adapter {
  target = "aider" as const;

  capability(kind: AssetKind) {
    return capabilityFor("aider", kind);
  }

  emit(asset: ResolvedAsset, context: AdapterContext = { scope: "project" }): EmittedFile[] {
    if (asset.asset.kind !== "rule") return [];
    const path = context.scope === "global" && context.aiderHome ? join(context.aiderHome, "CONVENTIONS.md") : "CONVENTIONS.md";
    return [{ path, contents: renderManagedMarkdownBlock(asset), assetId: asset.asset.id, target: this.target }];
  }
}
