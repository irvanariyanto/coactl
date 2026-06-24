import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadClaudeFormat } from "../../src/schema/load.js";

const tsxPath = join(process.cwd(), "node_modules", ".bin", "tsx");
const cliPath = join(process.cwd(), "src/cli/index.ts");

function run(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): string {
  try {
    return execFileSync(tsxPath, [cliPath, ...args], {
      encoding: "utf-8",
      cwd,
      env: { ...process.env, FORCE_COLOR: "0", ...env },
    });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string };
    return (e.stdout ?? "") + (e.stderr ?? "");
  }
}

function writeAsset(root: string, kind: "skill" | "command" | "rule" | "workflow", id: string, targets: string[]): void {
  const defs = {
    skill: { subdir: "skills", file: "SKILL.md", body: "# Skill\n" },
    command: { subdir: "commands", file: "COMMAND.md", body: "# Command\n" },
    rule: { subdir: "rules", file: "RULE.md", body: "# Rule\n" },
    workflow: { subdir: "workflows", file: "WORKFLOW.md", body: "# Workflow\n" },
  }[kind];

  const dir = join(root, defs.subdir, id);
  mkdirSync(dir, { recursive: true });

  const frontmatter = [
    "---",
    `name: ${id}`,
    "version: 0.1.0",
    `description: "${id} description"`,
    `activation: ${kind === "rule" ? "auto" : "manual"}`,
    ...(kind === "command" || kind === "workflow" ? [`invocation: /${id}`] : []),
    ...(kind === "workflow" ? ["kind: workflow", "steps:", '  - run: "command:test"'] : []),
    "targets:",
    ...targets.map((target) => `  - ${target}`),
    "---",
    "",
    defs.body,
  ].join("\n");

  writeFileSync(join(dir, defs.file), frontmatter, "utf-8");
}

describe("enable-codex command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `coactl-enable-codex-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("adds codex to compatible project assets only", () => {
    const manifestDir = join(tmpDir, ".coactl");
    mkdirSync(manifestDir, { recursive: true });
    writeFileSync(
      join(manifestDir, "agent.manifest.yaml"),
      ["sources:", "  - name: local", "    type: local", "    path: .", "resolution:", "  precedence:", "    - local", ""].join("\n"),
      "utf-8",
    );

    writeAsset(manifestDir, "skill", "project-skill", ["claude-code", "cursor"]);
    writeAsset(manifestDir, "rule", "project-rule", ["claude-code"]);
    writeAsset(manifestDir, "command", "project-command", ["claude-code", "cursor"]);
    writeAsset(manifestDir, "workflow", "project-workflow", ["claude-code"]);

    const output = run(["enable-codex", "--project"], tmpDir);
    expect(output).toContain("Enabled Codex for 2 compatible assets");

    expect(loadClaudeFormat(join(manifestDir, "skills", "project-skill", "SKILL.md"), "project-skill", "skill")?.asset.targets).toContain("codex");
    expect(loadClaudeFormat(join(manifestDir, "rules", "project-rule", "RULE.md"), "project-rule", "rule")?.asset.targets).toContain("codex");
    expect(loadClaudeFormat(join(manifestDir, "commands", "project-command", "COMMAND.md"), "project-command", "command")?.asset.targets).not.toContain("codex");
    expect(loadClaudeFormat(join(manifestDir, "workflows", "project-workflow", "WORKFLOW.md"), "project-workflow", "command")?.asset.targets).not.toContain("codex");
  });

  it("adds codex to global commands because Codex prompts are global-only", () => {
    const fakeHome = join(tmpDir, "home");
    const globalDir = join(fakeHome, ".config", "coactl");
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(
      join(globalDir, "agent.manifest.yaml"),
      ["sources:", "  - name: local", "    type: local", "    path: .", "resolution:", "  precedence:", "    - local", ""].join("\n"),
      "utf-8",
    );
    writeAsset(globalDir, "command", "global-command", ["claude-code", "cursor"]);

    const output = run(["enable-codex", "--global"], tmpDir, { HOME: fakeHome });
    expect(output).toContain("Enabled Codex for 1 compatible asset");

    const result = loadClaudeFormat(join(globalDir, "commands", "global-command", "COMMAND.md"), "global-command", "command");
    expect(result?.asset.targets).toContain("codex");
    expect(existsSync(join(globalDir, "commands", "global-command", "COMMAND.md"))).toBe(true);
    expect(readFileSync(join(globalDir, "commands", "global-command", "COMMAND.md"), "utf-8")).toContain("  - codex");
  });
});
