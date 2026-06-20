import type { AssetKind } from "../schema/index.js";

export interface ScaffoldOptions {
  id: string;
  kind: AssetKind;
  description?: string;
}

function toTitleCase(id: string): string {
  return id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

export function renderClaudeAssetFrontmatter({ id, kind, description }: ScaffoldOptions): string {
  const name = toTitleCase(id);
  // JSON.stringify gives a YAML-safe double-quoted scalar (same escaping rules) — used so
  // a real imported description with quotes/backslashes doesn't break the frontmatter.
  const desc = JSON.stringify(description ?? `Describe what ${name} does.`);

  switch (kind) {
    case "skill":
      return [
        "---",
        `name: ${name}`,
        "version: 0.1.0",
        `description: ${desc}`,
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
        `description: ${desc}`,
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
        `description: ${desc}`,
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
        `description: ${desc}`,
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
