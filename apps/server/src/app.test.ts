import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "./app.js";

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

function writeSkillFile(dir: string, id: string, description: string): string {
  const skillDir = join(dir, id);
  mkdirSync(skillDir, { recursive: true });
  const filePath = join(skillDir, "SKILL.md");
  writeFileSync(filePath, `---\nname: ${id}\ndescription: ${description}\n---\n\nBody of ${id}.\n`);
  return filePath;
}

async function json(res: Response): Promise<any> {
  return (await res.json()) as any;
}

describe("api basics", () => {
  it("reports health with version", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.focus).toBe("skills");
  });

  it("rejects unsupported tools with 400", async () => {
    const root = tempRoot();
    for (const req of [
      app.request(`/api/skills?root=${root}&tool=vscode&scope=project`),
      app.request(`/api/skills/vscode/some-skill?root=${root}&scope=project`),
      app.request(`/api/skills/vscode/some-skill?root=${root}&scope=project`, { method: "DELETE" }),
    ]) {
      expect((await req).status).toBe(400);
    }
  });
});

describe("skills crud", () => {
  it("creates, reads, updates, and deletes a project skill", async () => {
    const root = tempRoot();

    const create = await app.request(`/api/skills?root=${root}`, {
      method: "POST",
      body: JSON.stringify({
        tool: "claude-code",
        scope: "project",
        id: "review-pr",
        contents: "---\nname: Review PR\ndescription: Review a PR\n---\n\nSteps.\n",
      }),
    });
    expect(create.status).toBe(201);
    const created = await json(create);
    expect(created.skill.filePath).toContain(join(".claude", "skills", "review-pr"));
    expect(created.skill.readOnly).toBe(false);

    const conflict = await app.request(`/api/skills?root=${root}`, {
      method: "POST",
      body: JSON.stringify({ tool: "claude-code", scope: "project", id: "review-pr", body: "x" }),
    });
    expect(conflict.status).toBe(409);

    const get = await app.request(`/api/skills/claude-code/review-pr?root=${root}&scope=project`);
    expect(get.status).toBe(200);
    expect((await json(get)).skill.name).toBe("Review PR");

    const put = await app.request(`/api/skills/claude-code/review-pr?root=${root}`, {
      method: "PUT",
      body: JSON.stringify({
        scope: "project",
        contents: "---\nname: Review PR\ndescription: Updated\n---\n\nNew steps.\n",
      }),
    });
    expect(put.status).toBe(200);
    expect((await json(put)).skill.description).toBe("Updated");

    const del = await app.request(`/api/skills/claude-code/review-pr?root=${root}&scope=project`, {
      method: "DELETE",
    });
    expect(del.status).toBe(200);

    const gone = await app.request(`/api/skills/claude-code/review-pr?root=${root}&scope=project`);
    expect(gone.status).toBe(404);
  });

  it("404s when deleting a missing skill", async () => {
    const root = tempRoot();
    const res = await app.request(`/api/skills/gemini/nope?root=${root}&scope=project`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});

describe("read-only vendor dirs (A3)", () => {
  function rootWithVendorSkill(): { root: string; filePath: string } {
    const root = tempRoot();
    const filePath = writeSkillFile(join(root, ".cursor", "skills-cursor"), "vendor-skill", "Vendor managed");
    return { root, filePath };
  }

  it("lists vendor skills with readOnly: true", async () => {
    const { root } = rootWithVendorSkill();
    const res = await app.request(`/api/skills?root=${root}&tool=cursor&scope=project`);
    const { skills } = await json(res);
    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe("vendor-skill");
    expect(skills[0].readOnly).toBe(true);
  });

  it("rejects updates into a vendor dir with 403", async () => {
    const { root, filePath } = rootWithVendorSkill();
    const res = await app.request(`/api/skills/cursor/vendor-skill?root=${root}`, {
      method: "PUT",
      body: JSON.stringify({ scope: "project", contents: "tampered", filePath }),
    });
    expect(res.status).toBe(403);
    expect(readFileSync(filePath, "utf-8")).not.toContain("tampered");
  });

  it("rejects deletes from a vendor dir with 403", async () => {
    const { root, filePath } = rootWithVendorSkill();
    const res = await app.request(
      `/api/skills/cursor/vendor-skill?root=${root}&scope=project&path=${encodeURIComponent(filePath)}`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(403);
    expect(existsSync(filePath)).toBe(true);
  });

  it("marks skills-cursor candidates as not writable in the workspace", async () => {
    const { root } = rootWithVendorSkill();
    const res = await app.request(`/api/workspace?root=${root}&mode=project`);
    const body = await json(res);
    const details = body.skillPathsByTool.cursor.project.candidateDetails;
    const vendor = details.find((d: { path: string }) => d.path.endsWith("skills-cursor"));
    expect(vendor.writable).toBe(false);
    expect(body.skillPathsByTool.cursor.project.preferred.endsWith("skills-cursor")).toBe(false);
  });
});

describe("duplicate id disambiguation (A4)", () => {
  function rootWithDuplicates(): { root: string; agentsPath: string; codexPath: string } {
    const root = tempRoot();
    const agentsPath = writeSkillFile(join(root, ".agents", "skills"), "dup-skill", "Agents copy");
    const codexPath = writeSkillFile(join(root, ".codex", "skills"), "dup-skill", "Codex copy");
    return { root, agentsPath, codexPath };
  }

  it("lists one row per physical path", async () => {
    const { root } = rootWithDuplicates();
    const res = await app.request(`/api/skills?root=${root}&tool=codex&scope=project`);
    const { skills } = await json(res);
    const dups = skills.filter((s: { id: string }) => s.id === "dup-skill");
    expect(dups).toHaveLength(2);
    expect(new Set(dups.map((s: { filePath: string }) => s.filePath)).size).toBe(2);
  });

  it("reads and updates the exact location given by path", async () => {
    const { root, codexPath } = rootWithDuplicates();

    const get = await app.request(
      `/api/skills/codex/dup-skill?root=${root}&scope=project&path=${encodeURIComponent(codexPath)}`,
    );
    expect((await json(get)).skill.description).toBe("Codex copy");

    const put = await app.request(`/api/skills/codex/dup-skill?root=${root}`, {
      method: "PUT",
      body: JSON.stringify({
        scope: "project",
        contents: "---\nname: dup-skill\ndescription: Codex updated\n---\n\nBody.\n",
        filePath: codexPath,
      }),
    });
    expect(put.status).toBe(200);
    expect(readFileSync(codexPath, "utf-8")).toContain("Codex updated");
  });

  it("deletes only the location given by path", async () => {
    const { root, agentsPath, codexPath } = rootWithDuplicates();
    const del = await app.request(
      `/api/skills/codex/dup-skill?root=${root}&scope=project&path=${encodeURIComponent(codexPath)}`,
      { method: "DELETE" },
    );
    expect(del.status).toBe(200);
    expect(existsSync(codexPath)).toBe(false);
    expect(existsSync(agentsPath)).toBe(true);
  });
});

describe("import (A5)", () => {
  function rootWithSource(): string {
    const root = tempRoot();
    writeSkillFile(join(root, ".claude", "skills"), "shared-skill", "Source skill");
    return root;
  }

  it("dryRun returns a plan without writing", async () => {
    const root = rootWithSource();
    const res = await app.request(`/api/skills/import?root=${root}`, {
      method: "POST",
      body: JSON.stringify({
        source: { tool: "claude-code", scope: "project", id: "shared-skill" },
        targets: [
          { tool: "gemini", scope: "project" },
          { tool: "claude-code", scope: "project" },
        ],
        dryRun: true,
      }),
    });
    expect(res.status).toBe(200);
    const { plan } = await json(res);

    const gemini = plan.find((p: { tool: string }) => p.tool === "gemini");
    expect(gemini.action).toBe("write");
    expect(existsSync(gemini.filePath)).toBe(false);

    const self = plan.find((p: { tool: string }) => p.tool === "claude-code");
    expect(self.action).toBe("skip");
    expect(self.reason).toBe("same as source");
  });

  it("previews overwrite with existing contents, then applies", async () => {
    const root = rootWithSource();
    writeSkillFile(join(root, ".gemini", "skills"), "shared-skill", "Old gemini copy");

    const preview = await app.request(`/api/skills/import?root=${root}`, {
      method: "POST",
      body: JSON.stringify({
        source: { tool: "claude-code", scope: "project", id: "shared-skill" },
        targets: [{ tool: "gemini", scope: "project" }],
        overwrite: true,
        dryRun: true,
      }),
    });
    const { plan } = await json(preview);
    expect(plan[0].action).toBe("overwrite");
    expect(plan[0].existingContents).toContain("Old gemini copy");

    const apply = await app.request(`/api/skills/import?root=${root}`, {
      method: "POST",
      body: JSON.stringify({
        source: { tool: "claude-code", scope: "project", id: "shared-skill" },
        targets: [{ tool: "gemini", scope: "project" }],
        overwrite: true,
      }),
    });
    const { results } = await json(apply);
    expect(results[0].status).toBe("written");
    expect(readFileSync(results[0].filePath, "utf-8")).toContain("Source skill");
  });

  it("errors instead of overwriting a read-only target", async () => {
    const root = rootWithSource();
    const vendorPath = writeSkillFile(
      join(root, ".cursor", "skills-cursor"),
      "shared-skill",
      "Vendor copy",
    );

    const apply = await app.request(`/api/skills/import?root=${root}`, {
      method: "POST",
      body: JSON.stringify({
        source: { tool: "claude-code", scope: "project", id: "shared-skill" },
        targets: [{ tool: "cursor", scope: "project" }],
        overwrite: true,
      }),
    });
    const { results } = await json(apply);
    expect(results[0].status).toBe("error");
    expect(results[0].error).toContain("read-only");
    expect(readFileSync(vendorPath, "utf-8")).toContain("Vendor copy");
  });

  it("404s when the source skill does not exist", async () => {
    const root = tempRoot();
    const res = await app.request(`/api/skills/import?root=${root}`, {
      method: "POST",
      body: JSON.stringify({
        source: { tool: "claude-code", scope: "project", id: "ghost" },
        targets: [{ tool: "gemini", scope: "project" }],
      }),
    });
    expect(res.status).toBe(404);
  });
});
