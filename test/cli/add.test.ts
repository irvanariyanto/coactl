import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadClaudeFormat } from "../../src/schema/load.js";

const cliPath = join(process.cwd(), "dist/cli/index.js");

function run(args: string[], cwd: string): string {
  try {
    return execFileSync("node", [cliPath, ...args], {
      encoding: "utf-8",
      cwd,
      env: { ...process.env, FORCE_COLOR: "0" },
    });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string };
    return (e.stdout ?? "") + (e.stderr ?? "");
  }
}

describe("add command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(process.cwd(), `.tmp-add-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("scaffolds a valid skill asset", () => {
    run(["add", "--kind", "skill", "test-skill"], tmpDir);
    const filePath = join(tmpDir, ".claude/skills/test-skill/SKILL.md");
    expect(existsSync(filePath)).toBe(true);
    const result = loadClaudeFormat(filePath, "test-skill", "skill");
    expect(result?.asset.id).toBe("test-skill");
    expect(result?.asset.kind).toBe("skill");
  });

  it("scaffolds a valid command asset", () => {
    run(["add", "--kind", "command", "test-command"], tmpDir);
    const filePath = join(tmpDir, ".claude/commands/test-command.md");
    expect(existsSync(filePath)).toBe(true);
    const result = loadClaudeFormat(filePath, "test-command", "command");
    expect(result?.asset.id).toBe("test-command");
    expect(result?.asset.kind).toBe("command");
  });

  it("scaffolds a valid rule asset", () => {
    run(["add", "--kind", "rule", "test-rule"], tmpDir);
    const filePath = join(tmpDir, ".claude/rules/test-rule.md");
    expect(existsSync(filePath)).toBe(true);
    const result = loadClaudeFormat(filePath, "test-rule", "rule");
    expect(result?.asset.id).toBe("test-rule");
    expect(result?.asset.kind).toBe("rule");
  });

  it("scaffolds a valid workflow asset", () => {
    run(["add", "--kind", "workflow", "test-workflow"], tmpDir);
    const filePath = join(tmpDir, ".claude/commands/test-workflow.md");
    expect(existsSync(filePath)).toBe(true);
    const result = loadClaudeFormat(filePath, "test-workflow", "command");
    expect(result?.asset.id).toBe("test-workflow");
    expect(result?.asset.kind).toBe("workflow");
  });

  it("command kind includes invocation field", () => {
    run(["add", "--kind", "command", "my-cmd"], tmpDir);
    const content = readFileSync(join(tmpDir, ".claude/commands/my-cmd.md"), "utf-8");
    expect(content).toContain("invocation: /my-cmd");
  });

  it("workflow kind includes steps with loop", () => {
    run(["add", "--kind", "workflow", "my-flow"], tmpDir);
    const content = readFileSync(join(tmpDir, ".claude/commands/my-flow.md"), "utf-8");
    expect(content).toContain("steps:");
    expect(content).toContain("loop:");
  });

  it("errors without --force when asset already exists", () => {
    run(["add", "--kind", "skill", "my-skill"], tmpDir);
    const output = run(["add", "--kind", "skill", "my-skill"], tmpDir);
    expect(output).toContain("already exists");
  });

  it("overwrites with --force", () => {
    run(["add", "--kind", "skill", "my-skill"], tmpDir);
    run(["add", "--kind", "skill", "my-skill", "--force"], tmpDir);
    expect(existsSync(join(tmpDir, ".claude/skills/my-skill/SKILL.md"))).toBe(true);
  });

  it("rejects non-kebab-case id without writing files", () => {
    const output = run(["add", "--kind", "skill", "Invalid_ID"], tmpDir);
    expect(existsSync(join(tmpDir, ".claude/skills/Invalid_ID"))).toBe(false);
    expect(output).toContain("kebab-case");
  });

  it("rejects unknown kind without writing files", () => {
    const output = run(["add", "--kind", "unknown", "my-asset"], tmpDir);
    expect(existsSync(join(tmpDir, ".claude"))).toBe(false);
    expect(output).toContain("unknown");
  });
});
