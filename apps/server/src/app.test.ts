import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app, normalizePickedArchivePath } from "./app.js";

const temps: string[] = [];
const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), "..", ".test-tmp");

/** Keep tests away from the developer's real ~/.coactl/auth.json */
beforeAll(() => {
  mkdirSync(fixtureRoot, { recursive: true });
  process.env.COACTL_AUTH_FILE = join(fixtureRoot, "auth-disabled.json");
  writeFileSync(
    process.env.COACTL_AUTH_FILE,
    JSON.stringify({ version: 1, enabled: false, salt: "", hash: "", sessionSecret: "" }),
  );
});

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

function cookieHeader(res: Response): string {
  const anyRes = res as Response & { headers: Headers & { getSetCookie?: () => string[] } };
  const many = anyRes.headers.getSetCookie?.() ?? [];
  if (many.length) {
    return many.map((c) => c.split(";")[0]!).join("; ");
  }
  const single = res.headers.get("set-cookie");
  return single ? single.split(";")[0]! : "";
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
    expect(body.focus).toBe("skills+rules+commands+workflows");
  });

  it("rejects unsupported tools with 400", async () => {
    const root = tempRoot();
    for (const req of [
      app.request(`/api/skills?root=${root}&tool=vscode&scope=project`),
      app.request(`/api/skills/vscode/some-skill?root=${root}&scope=project`),
      app.request(`/api/skills/vscode/some-skill?root=${root}&scope=project`, { method: "DELETE" }),
      app.request(`/api/rules?root=${root}&tool=vscode&scope=project`),
      app.request(`/api/rules/vscode/some-rule?root=${root}&scope=project`),
    ]) {
      expect((await req).status).toBe(400);
    }
  });

  it("includes rule metadata on workspace", async () => {
    const root = tempRoot();
    const res = await app.request(`/api/workspace?root=${root}&mode=project`);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ruleToolsAvailable).toEqual([
      "claude-code",
      "codex",
      "cursor",
      "antigravity",
      "gemini",
      "opencode",
      "zed",
    ]);
    expect(body.ruleLayoutsByTool.codex.shape).toBe("singleton");
    expect(body.ruleLayoutsByTool.cursor.shape).toBe("multi");
    expect(body.rulePathsByTool.cursor.project.preferred).toContain(join(".cursor", "rules"));
    expect(body.rulePathsByTool.codex.project.preferred).toContain("AGENTS.md");
    expect(body.toolRuleCounts.cursor.project).toBe(0);
  });
});

describe("archive picker", () => {
  it("accepts supported archive extensions case-insensitively", () => {
    expect(normalizePickedArchivePath("/tmp/skills.zip")).toBe("/tmp/skills.zip");
    expect(normalizePickedArchivePath("/tmp/skills.TGZ")).toBe("/tmp/skills.TGZ");
    expect(normalizePickedArchivePath("/tmp/skills.tar.gz")).toBe("/tmp/skills.tar.gz");
  });

  it("rejects non-archive selections", () => {
    expect(() => normalizePickedArchivePath("/tmp/skills.txt")).toThrow(".zip, .tgz, or .tar.gz");
  });
});

describe("remote pack preview", () => {
  it("rejects mismatched and incomplete pack sources", async () => {
    for (const body of [
      { kind: "npm", url: "https://example.com/skills.tgz" },
      { kind: "archive", path: "/tmp/a.zip", url: "https://example.com/a.zip" },
      { kind: "unknown", install: "skills" },
    ]) {
      const res = await app.request("/api/skills/remote/pack/preview", {
        method: "POST",
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);
    }
  });

  it("returns a clear validation error for unsafe npm specs", async () => {
    const res = await app.request("/api/skills/remote/pack/preview", {
      method: "POST",
      body: JSON.stringify({ kind: "npm", install: "pkg;whoami" }),
    });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toContain("package name");
  });
});

describe("smart remote preview", () => {
  it("requires a source and rejects command arguments", async () => {
    const missing = await app.request("/api/skills/remote/preview", {
      method: "POST",
      body: JSON.stringify({ source: "" }),
    });
    expect(missing.status).toBe(400);

    const unsafe = await app.request("/api/skills/remote/preview", {
      method: "POST",
      body: JSON.stringify({ source: "npx skills add org/repo && whoami" }),
    });
    expect(unsafe.status).toBe(400);
    expect((await json(unsafe)).error).toContain("npx skills add");
  });
});

describe("remote skill directory install", () => {
  it("accepts and writes supporting file manifests", async () => {
    const root = tempRoot();
    const contents = "---\nname: complete\ndescription: Complete\n---\n\nBody\n";
    const guide = "Supporting guide\n";
    const res = await app.request(`/api/skills/remote/git/install?root=${root}`, {
      method: "POST",
      body: JSON.stringify({
        tool: "claude-code",
        scope: "project",
        skills: [
          {
            id: "complete",
            contents,
            files: [
              {
                path: "SKILL.md",
                contentsBase64: Buffer.from(contents).toString("base64"),
                size: Buffer.byteLength(contents),
              },
              {
                path: "references/guide.md",
                contentsBase64: Buffer.from(guide).toString("base64"),
                size: Buffer.byteLength(guide),
              },
            ],
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    expect((await json(res)).results[0].status).toBe("written");
    expect(
      readFileSync(join(root, ".claude", "skills", "complete", "references", "guide.md"), "utf-8"),
    ).toBe(guide);
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

describe("rules crud + import", () => {
  it("creates, reads, updates, and deletes a cursor rule file", async () => {
    const root = tempRoot();

    const create = await app.request(`/api/rules?root=${root}`, {
      method: "POST",
      body: JSON.stringify({
        tool: "cursor",
        scope: "project",
        id: "react-patterns",
        description: "React patterns",
        body: "# React\n\nPrefer hooks.\n",
      }),
    });
    expect(create.status).toBe(201);
    const created = await json(create);
    expect(created.rule.filePath).toContain(join(".cursor", "rules", "react-patterns.mdc"));
    expect(created.rule.extension).toBe("mdc");

    const conflict = await app.request(`/api/rules?root=${root}`, {
      method: "POST",
      body: JSON.stringify({ tool: "cursor", scope: "project", id: "react-patterns", body: "x" }),
    });
    expect(conflict.status).toBe(409);

    const get = await app.request(`/api/rules/cursor/react-patterns?root=${root}&scope=project`);
    expect(get.status).toBe(200);
    expect((await json(get)).rule.description).toContain("React");

    const put = await app.request(`/api/rules/cursor/react-patterns?root=${root}`, {
      method: "PUT",
      body: JSON.stringify({
        scope: "project",
        contents:
          "---\ndescription: Updated\nalwaysApply: false\n---\n\n# Updated body\n",
      }),
    });
    expect(put.status).toBe(200);
    expect((await json(put)).rule.description).toBe("Updated");

    const del = await app.request(`/api/rules/cursor/react-patterns?root=${root}&scope=project`, {
      method: "DELETE",
    });
    expect(del.status).toBe(200);

    const gone = await app.request(`/api/rules/cursor/react-patterns?root=${root}&scope=project`);
    expect(gone.status).toBe(404);
  });

  it("imports across tools with dry-run preview", async () => {
    const root = tempRoot();
    await app.request(`/api/rules?root=${root}`, {
      method: "POST",
      body: JSON.stringify({
        tool: "claude-code",
        scope: "project",
        id: "api-style",
        description: "API style",
        body: "# API\n\nUse REST.\n",
      }),
    });

    const preview = await app.request(`/api/rules/import?root=${root}`, {
      method: "POST",
      body: JSON.stringify({
        source: { tool: "claude-code", scope: "project", id: "api-style" },
        targets: [
          { tool: "cursor", scope: "project" },
          { tool: "claude-code", scope: "project" },
        ],
        dryRun: true,
      }),
    });
    const { plan } = await json(preview);
    expect(plan[0].action).toBe("write");
    expect(plan[0].filePath).toContain(join(".cursor", "rules", "api-style.mdc"));
    expect(plan[1].action).toBe("skip");
    expect(existsSync(plan[0].filePath)).toBe(false);

    const apply = await app.request(`/api/rules/import?root=${root}`, {
      method: "POST",
      body: JSON.stringify({
        source: { tool: "claude-code", scope: "project", id: "api-style" },
        targets: [{ tool: "cursor", scope: "project" }],
      }),
    });
    const { results } = await json(apply);
    expect(results[0].status).toBe("written");
    expect(readFileSync(results[0].filePath, "utf-8")).toContain("Use REST");
  });
});

describe("commands crud + import", () => {
  it("creates and imports a slash command", async () => {
    const root = tempRoot();

    const create = await app.request(`/api/commands?root=${root}`, {
      method: "POST",
      body: JSON.stringify({
        tool: "claude-code",
        scope: "project",
        id: "review-pr",
        description: "Review a PR",
        body: "# Review\n\n$ARGUMENTS\n",
      }),
    });
    expect(create.status).toBe(201);
    const created = await json(create);
    expect(created.command.filePath).toContain(join(".claude", "commands", "review-pr.md"));
    expect(created.command.kind).toBe("command");

    const preview = await app.request(`/api/commands/import?root=${root}`, {
      method: "POST",
      body: JSON.stringify({
        source: { tool: "claude-code", scope: "project", id: "review-pr" },
        targets: [{ tool: "cursor", scope: "project" }],
        dryRun: true,
      }),
    });
    expect((await json(preview)).plan[0].action).toBe("write");

    const apply = await app.request(`/api/commands/import?root=${root}`, {
      method: "POST",
      body: JSON.stringify({
        source: { tool: "claude-code", scope: "project", id: "review-pr" },
        targets: [{ tool: "antigravity", scope: "project" }],
      }),
    });
    const { results } = await json(apply);
    expect(results[0].status).toBe("written");
    expect(results[0].filePath).toContain(join(".agents", "workflows", "review-pr.md"));
  });
});

describe("workflows crud", () => {
  it("creates a claude dynamic workflow script", async () => {
    const root = tempRoot();
    const create = await app.request(`/api/workflows?root=${root}`, {
      method: "POST",
      body: JSON.stringify({
        tool: "claude-code",
        scope: "project",
        id: "audit-routes",
        description: "Audit routes",
      }),
    });
    expect(create.status).toBe(201);
    const created = await json(create);
    expect(created.workflow.filePath).toContain(join(".claude", "workflows", "audit-routes.js"));
    expect(created.workflow.contents).toContain("export const meta");
    expect(created.workflow.extension).toBe("js");
  });
});

describe("optional login", () => {
  beforeEach(() => {
    const dir = tempRoot();
    process.env.COACTL_AUTH_FILE = join(dir, "auth.json");
  });

  it("gates api until unlocked and stores a scrypt hash on disk", async () => {
    const root = tempRoot();
    const enable = await app.request("/api/auth/enable", {
      method: "POST",
      body: JSON.stringify({ password: "correct-horse", confirm: "correct-horse" }),
    });
    expect(enable.status).toBe(200);
    const enabledBody = await json(enable);
    expect(enabledBody.enabled).toBe(true);
    expect(enabledBody.unlocked).toBe(true);

    const stored = JSON.parse(readFileSync(process.env.COACTL_AUTH_FILE!, "utf8"));
    expect(stored.enabled).toBe(true);
    expect(stored.hash).toMatch(/^[0-9a-f]+$/);
    expect(stored.hash).not.toContain("correct-horse");
    expect(stored.salt).toMatch(/^[0-9a-f]+$/);

    const locked = await app.request(`/api/workspace?root=${root}&mode=project`);
    expect(locked.status).toBe(401);

    const bad = await app.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "wrong-password" }),
    });
    expect(bad.status).toBe(401);

    const login = await app.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "correct-horse" }),
    });
    expect(login.status).toBe(200);
    const cookie = cookieHeader(login);
    expect(cookie).toContain("coactl_session=");

    const ok = await app.request(`/api/workspace?root=${root}&mode=project`, {
      headers: { Cookie: cookie },
    });
    expect(ok.status).toBe(200);

    const disable = await app.request("/api/auth/disable", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ password: "correct-horse" }),
    });
    expect(disable.status).toBe(200);
    expect((await json(disable)).enabled).toBe(false);

    const open = await app.request(`/api/workspace?root=${root}&mode=project`);
    expect(open.status).toBe(200);
  });
});
