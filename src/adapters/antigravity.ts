import { join } from "node:path";
import { stringify } from "yaml";
import { contentHash, renderHeader } from "../transform/header.js";
import { capabilityFor } from "./capability-matrix.js";
import type { Adapter, AdapterContext, EmittedFile } from "./types.js";
import type { ResolvedAsset } from "../registry/types.js";
import type { Asset, AssetKind } from "../schema/index.js";

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

function renderFrontmatter(asset: Asset): string {
  const fm: Record<string, unknown> = {
    name: asset.name,
    version: asset.version,
    description: asset.description,
    activation: asset.activation,
    targets: asset.targets,
  };
  if (asset.invocation !== undefined) fm.invocation = asset.invocation;
  if (asset.scope !== undefined) fm.scope = asset.scope;
  if (asset.triggers !== undefined) fm.triggers = asset.triggers;
  if (asset.priority !== undefined) fm.priority = asset.priority;
  return `---\n${stringify(fm).trimEnd()}\n---\n\n`;
}

export class AntigravityAdapter implements Adapter {
  target = "antigravity" as const;

  capability(kind: AssetKind, scope?: AdapterContext["scope"]) {
    return capabilityFor("antigravity", kind, scope);
  }

  emit(asset: ResolvedAsset, context: AdapterContext = { scope: "project" }): EmittedFile[] {
    const id = asset.asset.id;
    const base = context.scope === "global" && context.antigravityHome
      ? context.antigravityHome
      : ".antigravity";

    switch (asset.asset.kind) {
      case "skill":
        return [{ path: join(base, "skills", id, "SKILL.md"), contents: renderSkill(asset), assetId: id, target: this.target }];
      case "rule":
        return [{
          path: context.scope === "global" && context.antigravityHome
            ? join(context.antigravityHome, "AGENTS.md")
            : "AGENTS.md",
          contents: renderManagedRule(asset),
          assetId: id,
          target: this.target,
        }];
      case "command": {
        const header = renderHeader({
          assetId: id,
          source: asset.sourceName,
          hash: contentHash(asset.bodyText),
          commentSyntax: "<!-- -->",
        });
        return [{
          path: join(base, "commands", `${id}.md`),
          contents: renderFrontmatter(asset.asset) + header + asset.bodyText,
          assetId: id,
          target: this.target,
        }];
      }
      case "workflow":
        return [];
    }
  }
}
