import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  countCommandsByTool,
  deleteCommand,
  importCommand,
  listCommands,
  planImportCommand,
  resolveCommandPath,
  saveCommand,
  scaffoldCommand,
  supportsCommands,
} from "./index.js";

const temps: string[] = [];
const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), "..", ".test-tmp");

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempRoot(): string {
  mkdirSync(fixtureRoot, { recursive: true });
  const dir = mkdtempSync(join(fixtureRoot, "commands-"));
  temps.push(dir);
  return dir;
}

describe("native commands", () => {
  it("saves claude and cursor commands as .md", () => {
    const root = tempRoot();
    const scaffold = scaffoldCommand("claude-code", "review-pr");
    const saved = saveCommand({
      projectRoot: root,
      tool: "claude-code",
      scope: "project",
      id: scaffold.id,
      contents: scaffold.contents,
    });
    expect(saved.filePath).toContain(join(".claude", "commands", "review-pr.md"));
    expect(saved.kind).toBe("command");

    const cursor = saveCommand({
      projectRoot: root,
      tool: "cursor",
      scope: "project",
      id: "fix-todos",
      body: "# Fix todos\n\n$ARGUMENTS\n",
    });
    expect(cursor.filePath).toContain(join(".cursor", "commands", "fix-todos.md"));
  });

  it("saves antigravity slash workflows under .agents/workflows", () => {
    const root = tempRoot();
    const saved = saveCommand({
      projectRoot: root,
      tool: "antigravity",
      scope: "project",
      id: "deploy",
      description: "Deploy workflow",
      body: "1. Build\n2. Deploy\n",
    });
    expect(saved.kind).toBe("workflow");
    expect(saved.filePath).toContain(join(".agents", "workflows", "deploy.md"));
    expect(resolveCommandPath("antigravity", "project", root).preferred).toContain(
      join(".agents", "workflows"),
    );
  });

  it("imports across tools with dry-run", () => {
    const root = tempRoot();
    saveCommand({
      projectRoot: root,
      tool: "opencode",
      scope: "project",
      id: "shared-cmd",
      body: "# Shared\n\n$ARGUMENTS\n",
    });

    const { plan } = planImportCommand({
      projectRoot: root,
      source: { tool: "opencode", scope: "project", id: "shared-cmd" },
      targets: [
        { tool: "cursor", scope: "project" },
        { tool: "opencode", scope: "project" },
      ],
    });
    expect(plan[0]!.action).toBe("write");
    expect(plan[1]!.action).toBe("skip");
    expect(existsSync(join(root, ".cursor", "commands", "shared-cmd.md"))).toBe(false);

    const { results } = importCommand({
      projectRoot: root,
      source: { tool: "opencode", scope: "project", id: "shared-cmd" },
      targets: [{ tool: "cursor", scope: "project" }],
    });
    expect(results[0]!.status).toBe("written");
    expect(readFileSync(results[0]!.filePath!, "utf-8")).toContain("$ARGUMENTS");
  });

  it("deletes command files and counts by tool", () => {
    const root = tempRoot();
    const saved = saveCommand({
      projectRoot: root,
      tool: "claude-code",
      scope: "project",
      id: "temp-cmd",
      body: "# Temp\n",
    });
    expect(deleteCommand(root, "claude-code", "temp-cmd", "project")).toBe(true);
    expect(existsSync(saved.filePath)).toBe(false);
    expect(listCommands({ projectRoot: root, tool: "claude-code", scope: "project" })).toHaveLength(0);

    saveCommand({ projectRoot: root, tool: "cursor", scope: "project", id: "a", body: "# A\n" });
    expect(countCommandsByTool(root).cursor.project).toBe(1);
  });

  it("supportsCommands only for tools with command dirs", () => {
    expect(supportsCommands("claude-code")).toBe(true);
    expect(supportsCommands("codex")).toBe(false);
    expect(supportsCommands("gemini")).toBe(false);
  });
});
