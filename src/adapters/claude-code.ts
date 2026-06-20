import { stringify } from "yaml";
import { capabilityFor } from "./capability-matrix.js";
import type { Adapter, EmittedFile } from "./types.js";
import type { ResolvedAsset } from "../registry/types.js";
import type { Asset, AssetKind } from "../schema/index.js";

function renderFrontmatter(asset: Asset): string {
  const fm: Record<string, unknown> = {
    name: asset.name,
    version: asset.version,
    description: asset.description,
    activation: asset.activation,
    targets: asset.targets,
  };
  if (asset.kind === "workflow") fm.kind = "workflow";
  if (asset.invocation !== undefined) fm.invocation = asset.invocation;
  if (asset.scope !== undefined) fm.scope = asset.scope;
  if (asset.triggers !== undefined) fm.triggers = asset.triggers;
  if (asset.steps !== undefined) fm.steps = asset.steps;
  if (asset.priority !== undefined) fm.priority = asset.priority;
  return `---\n${stringify(fm).trimEnd()}\n---\n\n`;
}

export class ClaudeCodeAdapter implements Adapter {
  target = "claude-code" as const;

  capability(kind: AssetKind) {
    return capabilityFor("claude-code", kind);
  }

  emit(asset: ResolvedAsset): EmittedFile[] {
    const id = asset.asset.id;
    const contents = renderFrontmatter(asset.asset) + asset.bodyText;

    switch (asset.asset.kind) {
      case "skill":
        return [{ path: `.claude/skills/${id}/SKILL.md`, contents, assetId: id, target: this.target }];
      case "command":
      case "workflow":
        return [{ path: `.claude/commands/${id}.md`, contents, assetId: id, target: this.target }];
      case "rule":
        return [{ path: `.claude/rules/${id}.md`, contents, assetId: id, target: this.target }];
    }
  }
}
