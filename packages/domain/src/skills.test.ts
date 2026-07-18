import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  countSkillsByTool,
  deleteSkill,
  detectSkillTools,
  importSkill,
  listSkills,
  planImportSkill,
  resolveSkillPath,
  saveSkill,
  scaffoldSkill,
  skillRootsForTool,
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
  const dir = mkdtempSync(join(fixtureRoot, "coactl-"));
  temps.push(dir);
  return dir;
}

describe("native skills", () => {
  it("lists and saves skills in tool-native directories (no .coactl)", () => {
    const root = tempRoot();
    const scaffold = scaffoldSkill("review-pr", "Review PR");
    const saved = saveSkill({
      projectRoot: root,
      tool: "claude-code",
      scope: "project",
      id: scaffold.id,
      contents: scaffold.contents,
    });

    expect(saved.filePath).toContain(".claude/skills/review-pr/SKILL.md");
    expect(saved.filePath.includes(".coactl")).toBe(false);

    const listed = listSkills({
      projectRoot: root,
      tool: "claude-code",
      scope: "project",
      installedOnly: false,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe("review-pr");

    expect(deleteSkill(root, "claude-code", "review-pr", "project")).toBe(true);
  });

  it("detects tools present in a project", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".claude", "skills"), { recursive: true });
    mkdirSync(join(root, ".cursor"), { recursive: true });

    const tools = detectSkillTools(root);
    expect(tools.find((t) => t.target === "claude-code")?.presentInProject).toBe(true);
    expect(tools.find((t) => t.target === "cursor")?.presentInProject).toBe(true);
    expect(tools.find((t) => t.target === "gemini")?.presentInProject).toBe(false);
  });

  it("imports across tools and skips without overwrite", () => {
    const root = tempRoot();
    const scaffold = scaffoldSkill("shared-skill", "Shared");
    saveSkill({
      projectRoot: root,
      tool: "claude-code",
      scope: "project",
      id: scaffold.id,
      contents: scaffold.contents,
    });

    const first = importSkill({
      projectRoot: root,
      source: { tool: "claude-code", scope: "project", id: "shared-skill" },
      targets: [{ tool: "cursor", scope: "project" }],
    });
    expect(first.results[0]!.status).toBe("written");
    expect(
      listSkills({
        projectRoot: root,
        tool: "cursor",
        scope: "project",
        installedOnly: false,
      }),
    ).toHaveLength(1);

    const second = importSkill({
      projectRoot: root,
      source: { tool: "claude-code", scope: "project", id: "shared-skill" },
      targets: [{ tool: "cursor", scope: "project" }],
      overwrite: false,
    });
    expect(second.results[0]!.status).toBe("skipped");
  });

  it("counts skills by tool and scope", () => {
    const root = tempRoot();
    const scaffold = scaffoldSkill("one");
    saveSkill({
      projectRoot: root,
      tool: "claude-code",
      scope: "project",
      id: scaffold.id,
      contents: scaffold.contents,
    });
    const counts = countSkillsByTool(root);
    expect(counts["claude-code"].project).toBe(1);
  });

  it("resolves Codex/OpenCode global paths from valid sources", () => {
    const root = tempRoot();
    const fakeHome = join(root, "home");
    mkdirSync(join(fakeHome, ".codex", "skills"), { recursive: true });
    mkdirSync(join(fakeHome, ".opencode", "skills"), { recursive: true });

    const codex = resolveSkillPath("codex", "global", root, { home: fakeHome });
    expect(codex.path).toBe(join(fakeHome, ".codex", "skills"));
    expect(codex.exists).toBe(true);
    expect(codex.preferred).toContain(".codex/skills");

    const opencode = resolveSkillPath("opencode", "global", root, { home: fakeHome });
    expect(opencode.path).toBe(join(fakeHome, ".opencode", "skills"));
    expect(opencode.exists).toBe(true);

    const cursor = skillRootsForTool("cursor", root);
    expect(cursor.some((r) => r.dir.endsWith(join(".cursor", "skills")))).toBe(true);
    const codexProject = skillRootsForTool("codex", root);
    expect(codexProject.some((r) => r.scope === "project" && r.dir.endsWith(join(".agents", "skills")))).toBe(
      true,
    );
  });

  it("reads existing SKILL.md without requiring coactl frontmatter", () => {
    const root = tempRoot();
    const dir = join(root, ".agents", "skills", "plain-skill");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "# Plain\n\nNo frontmatter.\n", "utf-8");

    const listed = listSkills({
      projectRoot: root,
      tool: "codex",
      scope: "project",
      installedOnly: false,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe("plain-skill");
  });

  it("marks skills-cursor as read-only and blocks writes/deletes (A3)", () => {
    const root = tempRoot();
    const vendorDir = join(root, ".cursor", "skills-cursor", "vendor-skill");
    mkdirSync(vendorDir, { recursive: true });
    writeFileSync(join(vendorDir, "SKILL.md"), "# Vendor\n", "utf-8");

    const listed = listSkills({
      projectRoot: root,
      tool: "cursor",
      scope: "project",
      installedOnly: false,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]!.readOnly).toBe(true);

    expect(() =>
      saveSkill({
        projectRoot: root,
        tool: "cursor",
        scope: "project",
        id: "vendor-skill",
        contents: "# Changed\n",
      }),
    ).toThrow(/read-only/i);
    expect(readFileSync(join(vendorDir, "SKILL.md"), "utf-8")).toBe("# Vendor\n");

    expect(() => deleteSkill(root, "cursor", "vendor-skill", "project")).toThrow(/read-only/i);
    expect(existsSync(join(vendorDir, "SKILL.md"))).toBe(true);
  });

  it("resolves preferred write path past read-only candidates", () => {
    const root = tempRoot();
    const resolved = resolveSkillPath("cursor", "project", root);
    expect(resolved.preferred.endsWith(join(".cursor", "skills"))).toBe(true);
    expect(resolved.candidateDetails.some((c) => !c.writable)).toBe(true);
  });

  it("lists duplicate ids once per physical path and creates in preferred dir (A4)", () => {
    const root = tempRoot();
    for (const dir of [join(root, ".agents", "skills"), join(root, ".codex", "skills")]) {
      mkdirSync(join(dir, "dup-skill"), { recursive: true });
      writeFileSync(join(dir, "dup-skill", "SKILL.md"), `# From ${dir}\n`, "utf-8");
    }

    const listed = listSkills({
      projectRoot: root,
      tool: "codex",
      scope: "project",
      installedOnly: false,
    });
    expect(listed).toHaveLength(2);
    expect(new Set(listed.map((s) => s.filePath)).size).toBe(2);

    // Updating a specific location touches only that file
    const target = listed.find((s) => s.filePath.includes(".codex"))!;
    saveSkill({
      projectRoot: root,
      tool: "codex",
      scope: "project",
      id: "dup-skill",
      contents: "# Updated\n",
      filePath: target.filePath,
    });
    expect(readFileSync(target.filePath, "utf-8")).toBe("# Updated\n");
    expect(
      readFileSync(join(root, ".agents", "skills", "dup-skill", "SKILL.md"), "utf-8"),
    ).not.toBe("# Updated\n");

    // New ids always go to the preferred write target (.agents/skills)
    const created = saveSkill({
      projectRoot: root,
      tool: "codex",
      scope: "project",
      id: "brand-new",
      contents: "# New\n",
    });
    expect(created.filePath).toContain(join(".agents", "skills"));
  });

  it("previews imports without writing (A5)", () => {
    const root = tempRoot();
    const scaffold = scaffoldSkill("preview-skill");
    saveSkill({
      projectRoot: root,
      tool: "claude-code",
      scope: "project",
      id: scaffold.id,
      contents: scaffold.contents,
    });

    const plan = planImportSkill({
      projectRoot: root,
      source: { tool: "claude-code", scope: "project", id: "preview-skill" },
      targets: [
        { tool: "cursor", scope: "project" },
        { tool: "claude-code", scope: "project" },
      ],
    }).plan;

    expect(plan[0]!.action).toBe("write");
    expect(plan[0]!.exists).toBe(false);
    expect(plan[1]!.action).toBe("skip");
    expect(plan[1]!.reason).toBe("same as source");
    // Nothing written by the preview
    expect(existsSync(join(root, ".cursor", "skills", "preview-skill"))).toBe(false);

    // Existing target: skip without overwrite, overwrite (with old contents) when requested
    importSkill({
      projectRoot: root,
      source: { tool: "claude-code", scope: "project", id: "preview-skill" },
      targets: [{ tool: "cursor", scope: "project" }],
    });
    const planNoOverwrite = planImportSkill({
      projectRoot: root,
      source: { tool: "claude-code", scope: "project", id: "preview-skill" },
      targets: [{ tool: "cursor", scope: "project" }],
    }).plan;
    expect(planNoOverwrite[0]!.action).toBe("skip");

    const planOverwrite = planImportSkill({
      projectRoot: root,
      source: { tool: "claude-code", scope: "project", id: "preview-skill" },
      targets: [{ tool: "cursor", scope: "project" }],
      overwrite: true,
    }).plan;
    expect(planOverwrite[0]!.action).toBe("overwrite");
    expect(planOverwrite[0]!.existingContents).toContain("Preview Skill");
  });

  it("errors instead of overwriting a read-only import target", () => {
    const root = tempRoot();
    const scaffold = scaffoldSkill("locked-skill");
    saveSkill({
      projectRoot: root,
      tool: "claude-code",
      scope: "project",
      id: scaffold.id,
      contents: scaffold.contents,
    });
    const vendorDir = join(root, ".cursor", "skills-cursor", "locked-skill");
    mkdirSync(vendorDir, { recursive: true });
    writeFileSync(join(vendorDir, "SKILL.md"), "# Vendor copy\n", "utf-8");

    const result = importSkill({
      projectRoot: root,
      source: { tool: "claude-code", scope: "project", id: "locked-skill" },
      targets: [{ tool: "cursor", scope: "project" }],
      overwrite: true,
    });
    expect(result.results[0]!.status).toBe("error");
    expect(result.results[0]!.error).toMatch(/read-only/i);
    expect(readFileSync(join(vendorDir, "SKILL.md"), "utf-8")).toBe("# Vendor copy\n");
  });
});
