import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contentHash, renderHeader } from "../transform/header.js";
import { capabilityFor } from "./capability-matrix.js";
import type { Adapter, EmittedFile } from "./types.js";
import type { ResolvedAsset } from "../registry/types.js";
import type { AssetKind } from "../schema/index.js";

export class ClaudeCodeAdapter implements Adapter {
  target = "claude-code" as const;

  capability(kind: AssetKind) {
    return capabilityFor("claude-code", kind);
  }

  emit(asset: ResolvedAsset): EmittedFile[] {
    const bodyPath = join(asset.origin.dir, asset.asset.body);
    const bodyText = readFileSync(bodyPath, "utf-8");
    const hash = contentHash(bodyText);
    const header = renderHeader({
      assetId: asset.asset.id,
      source: asset.sourceName,
      hash,
      commentSyntax: "<!-- -->",
    });

    const id = asset.asset.id;

    switch (asset.asset.kind) {
      case "skill": {
        const contents = header + bodyText;
        return [{ path: `.claude/skills/${id}/SKILL.md`, contents, assetId: id }];
      }
      case "command": {
        const invocation = asset.asset.invocation ?? `/${id}`;
        const frontMatter = `---\ndescription: ${asset.asset.description}\ninvocation: ${invocation}\n---\n\n`;
        const contents = header + frontMatter + bodyText;
        return [{ path: `.claude/commands/${id}.md`, contents, assetId: id }];
      }
      case "rule": {
        const fenceStart = `<!-- BEGIN coactl:${id} -->`;
        const fenceEnd = `<!-- END coactl:${id} -->`;
        const contents = `${fenceStart}\n${header}${bodyText}\n${fenceEnd}`;
        return [{ path: "CLAUDE.md", contents, assetId: id }];
      }
      case "workflow": {
        const note = `\n\n<!-- TODO(AC-021): expand workflow steps into commands + subagent orchestration -->\n`;
        const contents = header + `# ${asset.asset.name} (workflow)\n\n${bodyText}${note}`;
        return [{ path: `.claude/commands/${id}.md`, contents, assetId: id }];
      }
    }
  }
}
