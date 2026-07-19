import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertSafeGitUrl,
  installRemoteSkills,
  planInstallRemoteSkills,
  previewSkillsFromGit,
  scanSkillsInDirectory,
} from "./remote-git-skills.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "coactl-remote-"));
  temps.push(dir);
  return dir;
}

function writeSkill(root: string, relDir: string, id: string, description: string): void {
  const dir = join(root, relDir, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${id}\ndescription: ${description}\n---\n\n# ${id}\n`,
  );
}

describe("assertSafeGitUrl", () => {
  it("accepts https and ssh forms", () => {
    expect(assertSafeGitUrl("https://github.com/acme/skills.git")).toContain("github.com");
    expect(assertSafeGitUrl("git@github.com:acme/skills.git")).toContain("git@github.com");
  });

  it("rejects unsafe schemes", () => {
    expect(() => assertSafeGitUrl("file:///tmp/repo")).toThrow(/https/);
    expect(() => assertSafeGitUrl("http://example.com/repo")).toThrow(/https/);
  });
});

describe("scanSkillsInDirectory", () => {
  it("finds skills under skills/ and tool folders, skips node_modules", () => {
    const root = tempDir();
    writeSkill(root, "skills", "review-pr", "Review PRs");
    writeSkill(root, join(".claude", "skills"), "commit", "Write commits");
    writeSkill(root, join("node_modules", "pkg", "skills"), "ignored", "Should skip");

    const found = scanSkillsInDirectory(root);
    expect(found.map((s) => s.id).sort()).toEqual(["commit", "review-pr"]);
    expect(found[0]!.repoPath).toBe("skills/review-pr/SKILL.md");
    expect(found.find((s) => s.id === "commit")!.description).toBe("Write commits");
  });

  it("respects subpath", () => {
    const root = tempDir();
    writeSkill(root, "packs/frontend/skills", "ui-review", "UI review");
    writeSkill(root, "skills", "other", "Other");

    const found = scanSkillsInDirectory(root, "packs/frontend");
    expect(found.map((s) => s.id)).toEqual(["ui-review"]);
  });
});

describe("previewSkillsFromGit", () => {
  it("clones via injected runner then scans", async () => {
    const fixture = tempDir();
    writeSkill(fixture, "skills", "from-git", "From git");

    const preview = await previewSkillsFromGit({
      url: "https://github.com/example/skills.git",
      tmpParent: tempDir(),
      runGit: async (args) => {
        // git clone ... dest  → last arg is destination
        const dest = args[args.length - 1]!;
        writeSkill(dest, "skills", "from-git", "From git");
      },
    });

    expect(preview.skills).toHaveLength(1);
    expect(preview.skills[0]!.id).toBe("from-git");
    expect(preview.skills[0]!.contents).toContain("From git");
  });
});

describe("installRemoteSkills", () => {
  it("plans and writes into the preferred native dir", () => {
    const project = tempDir();
    const contents = "---\nname: demo\ndescription: Demo\n---\n\nBody\n";
    const plan = planInstallRemoteSkills({
      projectRoot: project,
      tool: "claude-code",
      scope: "project",
      skills: [{ id: "demo", contents }],
    });
    expect(plan.plan[0]!.action).toBe("write");

    const { results } = installRemoteSkills({
      projectRoot: project,
      tool: "claude-code",
      scope: "project",
      skills: [{ id: "demo", contents }],
    });
    expect(results[0]!.status).toBe("written");
    expect(readFileSync(results[0]!.filePath!, "utf-8")).toContain("Body");
  });

  it("skips existing without overwrite", () => {
    const project = tempDir();
    const contents = "---\nname: demo\ndescription: Demo\n---\n\nBody\n";
    installRemoteSkills({
      projectRoot: project,
      tool: "claude-code",
      scope: "project",
      skills: [{ id: "demo", contents }],
    });
    const again = installRemoteSkills({
      projectRoot: project,
      tool: "claude-code",
      scope: "project",
      skills: [{ id: "demo", contents: contents + "x" }],
      overwrite: false,
    });
    expect(again.results[0]!.status).toBe("skipped");
  });
});
