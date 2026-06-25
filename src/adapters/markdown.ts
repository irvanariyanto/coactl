import { stringify } from "yaml";
import { contentHash, renderHeader } from "../transform/header.js";
import type { ResolvedAsset } from "../registry/types.js";
import type { Asset } from "../schema/index.js";

export function renderSkillFile(asset: ResolvedAsset): string {
  const header = renderHeader({
    assetId: asset.asset.id,
    source: asset.sourceName,
    hash: contentHash(asset.bodyText),
    commentSyntax: "<!-- -->",
  });
  return `---\nname: ${asset.asset.id}\ndescription: ${JSON.stringify(asset.asset.description)}\n---\n\n${header}${asset.bodyText}`;
}

export function renderManagedMarkdownBlock(asset: ResolvedAsset, extra = ""): string {
  const id = asset.asset.id;
  const header = renderHeader({
    assetId: id,
    source: asset.sourceName,
    hash: contentHash(asset.bodyText),
    commentSyntax: "<!-- -->",
  });
  return `<!-- BEGIN coactl:${id} -->\n${header}${extra}${asset.bodyText}\n<!-- END coactl:${id} -->`;
}

export function renderRuleFile(asset: ResolvedAsset, frontmatter?: Record<string, unknown>): string {
  const header = renderHeader({
    assetId: asset.asset.id,
    source: asset.sourceName,
    hash: contentHash(asset.bodyText),
    commentSyntax: "<!-- -->",
  });
  const fm = frontmatter ? `---\n${stringify(frontmatter).trimEnd()}\n---\n\n` : "";
  return `${fm}${header}${asset.bodyText}`;
}

export function renderAssetFrontmatter(asset: Asset): string {
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
