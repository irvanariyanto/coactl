import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  countRulesByTool,
  deleteRule,
  importRule,
  listRules,
  planImportRule,
  resolveRulePath,
  ruleShape,
  saveRule,
  scaffoldRule,
  singletonRuleId,
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
  const dir = mkdtempSync(join(fixtureRoot, "rules-"));
  temps.push(dir);
  return dir;
}

describe("native rules", () => {
  it("saves cursor rules as .mdc under .cursor/rules", () => {
    const root = tempRoot();
    const scaffold = scaffoldRule("cursor", "react-patterns");
    const saved = saveRule({
      projectRoot: root,
      tool: "cursor",
      scope: "project",
      id: scaffold.id,
      contents: scaffold.contents,
    });

    expect(saved.filePath).toContain(join(".cursor", "rules", "react-patterns.mdc"));
    expect(saved.extension).toBe("mdc");
    expect(saved.shape).toBe("multi");
    expect(listRules({ projectRoot: root, tool: "cursor", scope: "project" })).toHaveLength(1);
  });

  it("saves claude / opencode / antigravity multi-file rules", () => {
    const root = tempRoot();
    for (const tool of ["claude-code", "opencode", "antigravity"] as const) {
      const saved = saveRule({
        projectRoot: root,
        tool,
        scope: "project",
        id: "api-style",
        description: "API style guide",
        body: "# API style\n\nUse REST.\n",
      });
      expect(saved.extension).toBe("md");
      expect(saved.shape).toBe("multi");
      expect(existsSync(saved.filePath)).toBe(true);
    }
    expect(resolveRulePath("antigravity", "project", root).preferred).toContain(
      join(".agents", "rules"),
    );
    expect(resolveRulePath("opencode", "project", root).preferred).toContain(
      join(".opencode", "rules"),
    );
  });

  it("manages codex/zed AGENTS.md and gemini GEMINI.md singletons", () => {
    const root = tempRoot();
    const agents = saveRule({
      projectRoot: root,
      tool: "codex",
      scope: "project",
      id: "agents",
      body: "# Codex agents\n",
    });
    expect(agents.filePath).toBe(join(root, "AGENTS.md"));
    expect(agents.shape).toBe("singleton");
    expect(singletonRuleId("codex")).toBe("agents");

    const zed = listRules({ projectRoot: root, tool: "zed", scope: "project" });
    expect(zed).toHaveLength(1);
    expect(zed[0]!.filePath).toBe(join(root, "AGENTS.md"));

    const gemini = saveRule({
      projectRoot: root,
      tool: "gemini",
      scope: "project",
      id: "gemini",
      body: "# Gemini context\n",
    });
    expect(gemini.filePath).toBe(join(root, "GEMINI.md"));
  });

  it("imports multi → singleton and singleton → multi", () => {
    const root = tempRoot();
    saveRule({
      projectRoot: root,
      tool: "cursor",
      scope: "project",
      id: "shared-rule",
      description: "Shared",
      body: "# Shared\n\nBody.\n",
    });

    const toCodex = importRule({
      projectRoot: root,
      source: { tool: "cursor", scope: "project", id: "shared-rule" },
      targets: [{ tool: "codex", scope: "project" }],
    });
    expect(toCodex.results[0]!.status).toBe("written");
    expect(toCodex.results[0]!.id).toBe("agents");
    expect(readFileSync(join(root, "AGENTS.md"), "utf-8")).toContain("Body");

    const toOpen = importRule({
      projectRoot: root,
      source: { tool: "codex", scope: "project", id: "agents" },
      targets: [{ tool: "opencode", scope: "project" }],
    });
    expect(toOpen.results[0]!.status).toBe("written");
    expect(toOpen.results[0]!.id).toBe("agents-md");
    expect(toOpen.results[0]!.filePath).toContain(join(".opencode", "rules", "agents-md.md"));
  });

  it("skips import when codex and zed share the same AGENTS.md", () => {
    const root = tempRoot();
    saveRule({
      projectRoot: root,
      tool: "codex",
      scope: "project",
      id: "agents",
      body: "# Shared agents\n",
    });
    const { plan } = planImportRule({
      projectRoot: root,
      source: { tool: "codex", scope: "project", id: "agents" },
      targets: [{ tool: "zed", scope: "project" }],
    });
    expect(plan[0]!.action).toBe("skip");
    expect(plan[0]!.reason).toBe("same file as source");
  });

  it("previews imports without writing", () => {
    const root = tempRoot();
    saveRule({
      projectRoot: root,
      tool: "claude-code",
      scope: "project",
      id: "preview-rule",
      body: "# Preview\n",
    });

    const { plan } = planImportRule({
      projectRoot: root,
      source: { tool: "claude-code", scope: "project", id: "preview-rule" },
      targets: [
        { tool: "cursor", scope: "project" },
        { tool: "claude-code", scope: "project" },
      ],
    });

    expect(plan[0]!.action).toBe("write");
    expect(plan[1]!.action).toBe("skip");
    expect(existsSync(join(root, ".cursor", "rules", "preview-rule.mdc"))).toBe(false);
  });

  it("deletes the rule file only", () => {
    const root = tempRoot();
    const saved = saveRule({
      projectRoot: root,
      tool: "cursor",
      scope: "project",
      id: "temp-rule",
      body: "# Temp\n",
    });
    expect(deleteRule(root, "cursor", "temp-rule", "project")).toBe(true);
    expect(existsSync(saved.filePath)).toBe(false);
    expect(existsSync(dirname(saved.filePath))).toBe(true);
  });

  it("counts rules by tool and scope", () => {
    const root = tempRoot();
    saveRule({ projectRoot: root, tool: "cursor", scope: "project", id: "a", body: "# A\n" });
    saveRule({ projectRoot: root, tool: "claude-code", scope: "project", id: "b", body: "# B\n" });
    saveRule({ projectRoot: root, tool: "codex", scope: "project", id: "agents", body: "# C\n" });
    const counts = countRulesByTool(root);
    expect(counts.cursor.project).toBe(1);
    expect(counts["claude-code"].project).toBe(1);
    expect(counts.codex.project).toBe(1);
  });

  it("lists both .md and .mdc for opencode", () => {
    const root = tempRoot();
    const dir = join(root, ".opencode", "rules");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "plain.md"), "# Plain\n");
    writeFileSync(join(dir, "fancy.mdc"), "---\ndescription: Fancy\n---\n\n# Fancy\n");
    const listed = listRules({ projectRoot: root, tool: "opencode", scope: "project" });
    expect(listed.map((r) => r.id).sort()).toEqual(["fancy", "plain"]);
  });

  it("exposes shapes for every skill tool", () => {
    expect(ruleShape("cursor")).toBe("multi");
    expect(ruleShape("opencode")).toBe("multi");
    expect(ruleShape("codex")).toBe("singleton");
    expect(ruleShape("gemini")).toBe("singleton");
    expect(ruleShape("zed")).toBe("singleton");
  });
});
