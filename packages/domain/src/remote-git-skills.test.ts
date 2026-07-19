import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
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

  it("includes nested supporting files and rejects symlinks", () => {
    const root = tempDir();
    writeSkill(root, "skills", "complete", "Complete skill");
    const skillDir = join(root, "skills", "complete");
    mkdirSync(join(skillDir, "references"));
    writeFileSync(join(skillDir, "references", "guide.md"), "Guide");

    const found = scanSkillsInDirectory(root);
    expect(found[0]!.files.map((file) => file.path)).toEqual([
      "references/guide.md",
      "SKILL.md",
    ]);

    symlinkSync(join(skillDir, "references", "guide.md"), join(skillDir, "linked-guide.md"));
    expect(() => scanSkillsInDirectory(root)).toThrow("symbolic link");
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

  it("installs a complete tree and atomically replaces stale supporting files", () => {
    const project = tempDir();
    const contents = "---\nname: demo\ndescription: Demo\n---\n\nBody\n";
    const files = [
      {
        path: "SKILL.md",
        contentsBase64: Buffer.from(contents).toString("base64"),
        size: Buffer.byteLength(contents),
      },
      {
        path: "references/guide.md",
        contentsBase64: Buffer.from("First guide").toString("base64"),
        size: Buffer.byteLength("First guide"),
      },
    ];
    const first = installRemoteSkills({
      projectRoot: project,
      tool: "claude-code",
      scope: "project",
      skills: [{ id: "demo", contents, files }],
    });
    const skillDir = join(first.results[0]!.filePath!, "..");
    expect(readFileSync(join(skillDir, "references", "guide.md"), "utf-8")).toBe("First guide");
    writeFileSync(join(skillDir, "stale.txt"), "remove me");

    const replacement = [
      files[0]!,
      {
        path: "scripts/check.sh",
        contentsBase64: Buffer.from("#!/bin/sh\n").toString("base64"),
        size: Buffer.byteLength("#!/bin/sh\n"),
        mode: 0o755,
      },
    ];
    const plan = planInstallRemoteSkills({
      projectRoot: project,
      tool: "claude-code",
      scope: "project",
      overwrite: true,
      skills: [{ id: "demo", contents, files: replacement }],
    }).plan[0]!;
    expect(plan.removedFiles).toEqual(["references/guide.md", "stale.txt"]);
    expect(plan.files.find((file) => file.path === "scripts/check.sh")?.action).toBe("write");

    expect(
      installRemoteSkills({
        projectRoot: project,
        tool: "claude-code",
        scope: "project",
        overwrite: true,
        skills: [{ id: "demo", contents, files: replacement }],
      }).results[0]!.status,
    ).toBe("written");
    expect(existsSync(join(skillDir, "references", "guide.md"))).toBe(false);
    expect(existsSync(join(skillDir, "stale.txt"))).toBe(false);
    expect(readFileSync(join(skillDir, "scripts", "check.sh"), "utf-8")).toContain("#!/bin/sh");
    expect(statSync(join(skillDir, "scripts", "check.sh")).mode & 0o777).toBe(0o755);
  });

  it("rejects unsafe or inconsistent file manifests without writing", () => {
    const project = tempDir();
    const contents = "---\nname: demo\n---\n";
    for (const files of [
      [{ path: "../outside", contentsBase64: "eA==", size: 1 }],
      [{ path: "SKILL.md", contentsBase64: "eA==", size: 1 }],
      [
        { path: "SKILL.md", contentsBase64: Buffer.from(contents).toString("base64"), size: 999 },
      ],
    ]) {
      const result = installRemoteSkills({
        projectRoot: project,
        tool: "claude-code",
        scope: "project",
        skills: [{ id: "demo", contents, files }],
      });
      expect(result.results[0]!.status).toBe("error");
    }
    expect(existsSync(join(project, ".claude", "skills", "demo"))).toBe(false);
    expect(existsSync(join(project, ".claude", "skills", "outside"))).toBe(false);
  });
});
