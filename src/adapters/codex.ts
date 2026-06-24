import { join } from "node:path";
import { contentHash, renderHeader } from "../transform/header.js";
import { capabilityFor } from "./capability-matrix.js";
import type { Adapter, AdapterContext, EmittedFile } from "./types.js";
import type { ResolvedAsset } from "../registry/types.js";
import type { AssetKind } from "../schema/index.js";

function renderSkill(asset: ResolvedAsset): string {
  const header = renderHeader({
    assetId: asset.asset.id,
    source: asset.sourceName,
    hash: contentHash(asset.bodyText),
    commentSyntax: "<!-- -->",
  });
  return `---\nname: ${asset.asset.id}\ndescription: ${JSON.stringify(asset.asset.description)}\n---\n\n${header}${asset.bodyText}`;
}

function renderManagedRule(asset: ResolvedAsset): string {
  const id = asset.asset.id;
  const header = renderHeader({
    assetId: id,
    source: asset.sourceName,
    hash: contentHash(asset.bodyText),
    commentSyntax: "<!-- -->",
  });
  return `<!-- BEGIN coactl:${id} -->\n${header}${asset.bodyText}\n<!-- END coactl:${id} -->`;
}

function renderPrompt(asset: ResolvedAsset): string {
  const header = renderHeader({
    assetId: asset.asset.id,
    source: asset.sourceName,
    hash: contentHash(asset.bodyText),
    commentSyntax: "<!-- -->",
  });
  return `---\ndescription: ${JSON.stringify(asset.asset.description)}\n---\n\n${header}${asset.bodyText}`;
}

export class CodexAdapter implements Adapter {
  target = "codex" as const;

  capability(kind: AssetKind) {
    return capabilityFor("codex", kind);
  }

  emit(asset: ResolvedAsset, context: AdapterContext = { scope: "project" }): EmittedFile[] {
    const id = asset.asset.id;

    switch (asset.asset.kind) {
      case "skill":
        return [{ path: `.agents/skills/${id}/SKILL.md`, contents: renderSkill(asset), assetId: id, target: this.target }];
      case "rule": {
        const path = context.scope === "global" && context.codexHome
          ? join(context.codexHome, "AGENTS.md")
          : "AGENTS.md";
        return [{ path, contents: renderManagedRule(asset), assetId: id, target: this.target }];
      }
      case "command": {
        if (context.scope === "project" || !context.codexHome) return [];
        return [{
          path: join(context.codexHome, "prompts", `${id}.md`),
          contents: renderPrompt(asset),
          assetId: id,
          target: this.target,
        }];
      }
      case "workflow":
        return [];
    }
  }
}
