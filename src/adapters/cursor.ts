import { contentHash, renderHeader } from "../transform/header.js";
import { capabilityFor } from "./capability-matrix.js";
import type { Adapter, EmittedFile } from "./types.js";
import type { ResolvedAsset } from "../registry/types.js";
import type { AssetKind } from "../schema/index.js";

export class CursorAdapter implements Adapter {
  target = "cursor" as const;

  capability(kind: AssetKind) {
    return capabilityFor("cursor", kind);
  }

  emit(asset: ResolvedAsset): EmittedFile[] {
    const bodyText = asset.bodyText;
    const hash = contentHash(bodyText);
    const header = renderHeader({
      assetId: asset.asset.id,
      source: asset.sourceName,
      hash,
      commentSyntax: "<!-- -->",
    });

    const id = asset.asset.id;
    const description = asset.asset.description || `Rule: ${id}`;
    const globs = asset.asset.scope?.paths ?? ["**"];
    const globsYaml = globs.map((g) => `  - ${g}`).join("\n");
    const alwaysApply = asset.asset.activation === "auto" ? "true" : "false";

    switch (asset.asset.kind) {
      case "rule": {
        const frontMatter = `---\ndescription: ${description}\nglobs:\n${globsYaml}\nalwaysApply: ${alwaysApply}\n---\n\n`;
        const contents = frontMatter + header + bodyText;
        return [{ path: `.cursor/rules/${id}.mdc`, contents, assetId: id }];
      }
      case "skill": {
        // Degraded: emit as scoped rule
        const frontMatter = `---\ndescription: "${description} (skill, scoped)"\nglobs:\n${globsYaml}\nalwaysApply: false\n---\n\n`;
        const contents = frontMatter + header + bodyText;
        return [{ path: `.cursor/rules/${id}.mdc`, contents, assetId: id }];
      }
      case "command": {
        // Degraded: emit as manual rule with invocation hint
        const invocation = asset.asset.invocation ?? `/${id}`;
        const frontMatter = `---\ndescription: "${description} (command: ${invocation})"\nglobs:\n${globsYaml}\nalwaysApply: false\n---\n\n`;
        const contents = frontMatter + header + bodyText;
        return [{ path: `.cursor/rules/${id}.mdc`, contents, assetId: id }];
      }
      case "workflow": {
        // Skip: emit nothing
        return [];
      }
    }
  }
}
