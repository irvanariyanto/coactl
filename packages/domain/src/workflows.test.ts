import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  countWorkflowsByTool,
  deleteWorkflow,
  importWorkflow,
  listWorkflows,
  planImportWorkflow,
  resolveWorkflowPath,
  saveWorkflow,
  scaffoldWorkflow,
  supportsWorkflows,
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
  const dir = mkdtempSync(join(fixtureRoot, "workflows-"));
  temps.push(dir);
  return dir;
}

describe("claude dynamic workflows", () => {
  it("saves JS workflows under .claude/workflows", () => {
    const root = tempRoot();
    const scaffold = scaffoldWorkflow("claude-code", "audit-routes");
    const saved = saveWorkflow({
      projectRoot: root,
      tool: "claude-code",
      scope: "project",
      id: scaffold.id,
      contents: scaffold.contents,
    });

    expect(saved.filePath).toContain(join(".claude", "workflows", "audit-routes.js"));
    expect(saved.extension).toBe("js");
    expect(saved.contents).toContain("export const meta");
    expect(saved.contents).toContain("await agent");
    expect(resolveWorkflowPath("claude-code", "project", root).preferred).toContain(
      join(".claude", "workflows"),
    );
  });

  it("lists .js and .mjs and parses meta", () => {
    const root = tempRoot();
    const dir = join(root, ".claude", "workflows");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "deep-check.js"),
      `export const meta = {\n  name: 'deep-check',\n  description: 'Cross-check findings',\n}\n\nreturn true\n`,
    );
    writeFileSync(join(dir, "legacy.mjs"), `export const meta = { name: 'legacy', description: 'Old' }\n\nreturn 1\n`);

    const listed = listWorkflows({ projectRoot: root, tool: "claude-code", scope: "project" });
    expect(listed.map((w) => w.id).sort()).toEqual(["deep-check", "legacy"]);
    expect(listed.find((w) => w.id === "deep-check")!.description).toBe("Cross-check findings");
  });

  it("imports across scopes with dry-run", () => {
    const root = tempRoot();
    const home = join(root, "home");
    mkdirSync(home, { recursive: true });

    saveWorkflow({
      projectRoot: root,
      tool: "claude-code",
      scope: "project",
      id: "shared-wf",
      body: "return await agent('hi')\n",
    });

    const { plan } = planImportWorkflow({
      projectRoot: root,
      source: { tool: "claude-code", scope: "project", id: "shared-wf" },
      targets: [
        { tool: "claude-code", scope: "global" },
        { tool: "claude-code", scope: "project" },
      ],
      detection: { home },
    });
    expect(plan[0]!.action).toBe("write");
    expect(plan[1]!.action).toBe("skip");

    const { results } = importWorkflow({
      projectRoot: root,
      source: { tool: "claude-code", scope: "project", id: "shared-wf" },
      targets: [{ tool: "claude-code", scope: "global" }],
      detection: { home },
    });
    expect(results[0]!.status).toBe("written");
    expect(results[0]!.filePath).toContain(join(home, ".claude", "workflows", "shared-wf.js"));
    expect(readFileSync(results[0]!.filePath!, "utf-8")).toContain("await agent");
  });

  it("deletes and counts", () => {
    const root = tempRoot();
    const saved = saveWorkflow({
      projectRoot: root,
      tool: "claude-code",
      scope: "project",
      id: "temp-wf",
      body: "return 1\n",
    });
    expect(deleteWorkflow(root, "claude-code", "temp-wf", "project")).toBe(true);
    expect(existsSync(saved.filePath)).toBe(false);
    expect(countWorkflowsByTool(root)["claude-code"].project).toBe(0);
    expect(supportsWorkflows("claude-code")).toBe(true);
    expect(supportsWorkflows("cursor")).toBe(false);
  });
});
