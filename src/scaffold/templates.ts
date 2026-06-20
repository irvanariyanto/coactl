import type { AssetKind } from "../schema/index.js";

export interface ScaffoldOptions {
  id: string;
  kind: AssetKind;
}

function toTitleCase(id: string): string {
  return id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

export function renderClaudeAssetFrontmatter({ id, kind }: ScaffoldOptions): string {
  const name = toTitleCase(id);

  switch (kind) {
    case "skill":
      return [
        "---",
        `name: ${name}`,
        "version: 0.1.0",
        `description: "Describe what ${name} does."`,
        "activation: agent-requested",
        "triggers:",
        '  - type: glob',
        '    pattern: "**/*.ts"',
        "targets:",
        "  - claude-code",
        "  - cursor",
        "  - windsurf",
        "  - copilot",
        "---",
        "",
      ].join("\n");

    case "command":
      return [
        "---",
        `description: "Describe what ${name} does."`,
        `invocation: /${id}`,
        `name: ${name}`,
        "version: 0.1.0",
        "activation: manual",
        "targets:",
        "  - claude-code",
        "  - cursor",
        "---",
        "",
      ].join("\n");

    case "rule":
      return [
        "---",
        `name: ${name}`,
        "version: 0.1.0",
        `description: "Describe what ${name} does."`,
        "activation: auto",
        "targets:",
        "  - claude-code",
        "  - cursor",
        "  - windsurf",
        "  - copilot",
        "---",
        "",
      ].join("\n");

    case "workflow":
      return [
        "---",
        `description: "Describe what ${name} does."`,
        `invocation: /${id}`,
        `name: ${name}`,
        "version: 0.1.0",
        "kind: workflow",
        "activation: manual",
        "steps:",
        '  - run: "skill:plan"',
        "  - loop:",
        "      until: done",
        "      do:",
        '        - run: "command:test"',
        "targets:",
        "  - claude-code",
        "---",
        "",
      ].join("\n");
  }
}

export function renderClaudeAssetMd(opts: ScaffoldOptions): string {
  const body = `# ${toTitleCase(opts.id)}\n\nDescribe what this ${opts.kind} does and how to use it.\n`;
  return renderClaudeAssetFrontmatter(opts) + body;
}
