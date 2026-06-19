import type { AssetKind } from "../schema/index.js";

export interface ScaffoldOptions {
  id: string;
  kind: AssetKind;
}

function toTitleCase(id: string): string {
  return id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

export function renderAssetYaml({ id, kind }: ScaffoldOptions): string {
  const name = toTitleCase(id);
  const lines: string[] = [
    `id: ${id}`,
    `kind: ${kind}`,
    `name: ${name}`,
    `version: 0.1.0`,
    `description: "Describe what ${name} does."`,
  ];

  switch (kind) {
    case "skill":
      lines.push(`activation: agent-requested`);
      lines.push(`triggers:`);
      lines.push(`  - type: glob`);
      lines.push(`    pattern: "**/*.ts"`);
      lines.push(`targets:`);
      lines.push(`  - claude-code`);
      lines.push(`  - cursor`);
      lines.push(`  - windsurf`);
      lines.push(`  - copilot`);
      break;
    case "command":
      lines.push(`activation: manual`);
      lines.push(`invocation: /${id}`);
      lines.push(`targets:`);
      lines.push(`  - claude-code`);
      lines.push(`  - cursor`);
      break;
    case "rule":
      lines.push(`activation: auto`);
      lines.push(`targets:`);
      lines.push(`  - claude-code`);
      lines.push(`  - cursor`);
      lines.push(`  - windsurf`);
      lines.push(`  - copilot`);
      break;
    case "workflow":
      lines.push(`activation: manual`);
      lines.push(`steps:`);
      lines.push(`  - run: "skill:plan"`);
      lines.push(`  - loop:`);
      lines.push(`      until: done`);
      lines.push(`      do:`);
      lines.push(`        - run: "command:test"`);
      lines.push(`targets:`);
      lines.push(`  - claude-code`);
      break;
  }

  lines.push(`body: body.md`);
  return lines.join("\n") + "\n";
}

export function renderBodyMd({ id, kind }: ScaffoldOptions): string {
  return `# ${toTitleCase(id)}\n\nDescribe what this ${kind} does and how to use it.\n`;
}
