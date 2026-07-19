import { Hono } from "hono";
import { cors } from "hono/cors";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import {
  RULE_TOOLS,
  SKILL_TOOLS,
  countRulesByTool,
  countSkillsByTool,
  deleteRule,
  deleteSkill,
  detectSkillTools,
  getRule,
  getSkill,
  importRule,
  importSkill,
  listRules,
  listSkills,
  planImportRule,
  planImportSkill,
  resolveAllRulePaths,
  resolveAllSkillPaths,
  ruleLayoutInfo,
  saveRule,
  saveSkill,
  scaffoldRule,
  scaffoldSkill,
  type RuleTool,
  type ScopeMode,
  type SkillTool,
} from "@coactl/domain";
import { z } from "zod";

type Variables = {
  projectRoot: string;
};

export const app = new Hono<{ Variables: Variables }>();

app.use(
  "*",
  cors({
    origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
  }),
);

app.use("/api/*", async (c, next) => {
  const rootParam = c.req.query("root") ?? process.env.COACTL_ROOT;
  c.set("projectRoot", resolve(rootParam || process.cwd()));
  await next();
});

app.get("/api/health", (c) => c.json({ ok: true, version: "0.2.1", focus: "skills+rules" }));

app.get("/api/workspace", (c) => {
  const projectRoot = c.get("projectRoot");
  const mode = (c.req.query("mode") === "project" ? "project" : "global") as ScopeMode;
  const skillTools = detectSkillTools(projectRoot);
  const counts = countSkillsByTool(projectRoot);
  const ruleCounts = countRulesByTool(projectRoot);
  const resolved = resolveAllSkillPaths(projectRoot);
  const ruleResolved = resolveAllRulePaths(projectRoot);

  const skillPathsByTool = Object.fromEntries(
    SKILL_TOOLS.map((tool) => [
      tool,
      {
        project: {
          path: resolved[tool].project.path,
          preferred: resolved[tool].project.preferred,
          exists: resolved[tool].project.exists,
          candidates: resolved[tool].project.candidates,
          candidateDetails: resolved[tool].project.candidateDetails,
        },
        global: {
          path: resolved[tool].global.path,
          preferred: resolved[tool].global.preferred,
          exists: resolved[tool].global.exists,
          candidates: resolved[tool].global.candidates,
          candidateDetails: resolved[tool].global.candidateDetails,
        },
      },
    ]),
  );

  const rulePathsByTool = Object.fromEntries(
    RULE_TOOLS.map((tool) => [
      tool,
      {
        project: {
          path: ruleResolved[tool].project.path,
          preferred: ruleResolved[tool].project.preferred,
          exists: ruleResolved[tool].project.exists,
          candidates: ruleResolved[tool].project.candidates,
          candidateDetails: ruleResolved[tool].project.candidateDetails,
        },
        global: {
          path: ruleResolved[tool].global.path,
          preferred: ruleResolved[tool].global.preferred,
          exists: ruleResolved[tool].global.exists,
          candidates: ruleResolved[tool].global.candidates,
          candidateDetails: ruleResolved[tool].global.candidateDetails,
        },
      },
    ]),
  );

  const toolsForMode =
    mode === "global"
      ? skillTools.filter((t) => t.installed)
      : skillTools.filter((t) => t.presentInProject || t.installed);

  return c.json({
    projectRoot,
    mode,
    skillTools,
    toolsForMode,
    toolSkillCounts: counts,
    toolRuleCounts: ruleCounts,
    skillPathsByTool,
    rulePathsByTool,
    skillToolsAvailable: SKILL_TOOLS,
    ruleToolsAvailable: RULE_TOOLS,
    ruleLayoutsByTool: Object.fromEntries(RULE_TOOLS.map((tool) => [tool, ruleLayoutInfo(tool)])),
  });
});

app.get("/api/skills", (c) => {
  const projectRoot = c.get("projectRoot");
  const tool = c.req.query("tool") as SkillTool | undefined;
  const scope = (c.req.query("scope") === "global" ? "global" : "project") as ScopeMode;

  if (tool && !(SKILL_TOOLS as readonly string[]).includes(tool)) {
    return c.json({ error: `Unsupported skill tool: ${tool}` }, 400);
  }

  const skills = listSkills({
    projectRoot,
    tool,
    scope,
    installedOnly: false,
  }).map((s) => ({
    id: s.id,
    tool: s.tool,
    scope: s.scope,
    name: s.name,
    description: s.description,
    filePath: s.filePath,
    body: s.body,
    contents: s.contents,
    readOnly: s.readOnly,
  }));

  return c.json({ skills });
});

app.get("/api/skills/:tool/:id", (c) => {
  const tool = c.req.param("tool") as SkillTool;
  const id = c.req.param("id");
  const scope = (c.req.query("scope") === "global" ? "global" : "project") as ScopeMode;
  const path = c.req.query("path") || undefined;

  if (!(SKILL_TOOLS as readonly string[]).includes(tool)) {
    return c.json({ error: `Unsupported skill tool: ${tool}` }, 400);
  }

  const skill = getSkill(c.get("projectRoot"), tool, id, scope, {}, path);
  if (!skill) return c.json({ error: "Skill not found" }, 404);
  return c.json({ skill });
});

const UpsertSchema = z.object({
  tool: z.enum(SKILL_TOOLS),
  scope: z.enum(["project", "global"]),
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  body: z.string().optional(),
  contents: z.string().optional(),
  filePath: z.string().optional(),
});

function isReadOnlyError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("Read-only skill location");
}

app.post("/api/skills", async (c) => {
  const body = UpsertSchema.parse(await c.req.json());
  const existing = getSkill(c.get("projectRoot"), body.tool, body.id, body.scope);
  if (existing) return c.json({ error: `Skill already exists: ${body.tool}/${body.id}` }, 409);

  try {
    const skill = saveSkill({
      projectRoot: c.get("projectRoot"),
      ...body,
    });
    return c.json({ skill }, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, isReadOnlyError(err) ? 403 : 400);
  }
});

app.put("/api/skills/:tool/:id", async (c) => {
  const tool = c.req.param("tool") as SkillTool;
  const id = c.req.param("id");
  const body = UpsertSchema.omit({ tool: true, id: true })
    .extend({
      tool: z.enum(SKILL_TOOLS).optional(),
      id: z.string().optional(),
    })
    .parse(await c.req.json());

  if (!(SKILL_TOOLS as readonly string[]).includes(tool)) {
    return c.json({ error: `Unsupported skill tool: ${tool}` }, 400);
  }

  try {
    const skill = saveSkill({
      projectRoot: c.get("projectRoot"),
      tool,
      id,
      scope: body.scope,
      name: body.name,
      description: body.description,
      body: body.body,
      contents: body.contents,
      filePath: body.filePath,
    });
    return c.json({ skill });
  } catch (err) {
    return c.json({ error: (err as Error).message }, isReadOnlyError(err) ? 403 : 400);
  }
});

app.delete("/api/skills/:tool/:id", (c) => {
  const tool = c.req.param("tool") as SkillTool;
  const id = c.req.param("id");
  const scope = (c.req.query("scope") === "global" ? "global" : "project") as ScopeMode;
  const path = c.req.query("path") || undefined;

  if (!(SKILL_TOOLS as readonly string[]).includes(tool)) {
    return c.json({ error: `Unsupported skill tool: ${tool}` }, 400);
  }

  try {
    const ok = deleteSkill(c.get("projectRoot"), tool, id, scope, {}, path);
    if (!ok) return c.json({ error: "Skill not found" }, 404);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, isReadOnlyError(err) ? 403 : 400);
  }
});

app.post("/api/skills/scaffold", async (c) => {
  const body = z
    .object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      tool: z.enum(SKILL_TOOLS),
      scope: z.enum(["project", "global"]).default("project"),
      save: z.boolean().optional(),
    })
    .parse(await c.req.json());

  const scaffold = scaffoldSkill(body.id, body.name, body.description);
  if (body.save) {
    const skill = saveSkill({
      projectRoot: c.get("projectRoot"),
      tool: body.tool,
      scope: body.scope,
      id: scaffold.id,
      contents: scaffold.contents,
    });
    return c.json({ skill }, 201);
  }
  return c.json(scaffold);
});

app.post("/api/skills/import", async (c) => {
  const body = z
    .object({
      source: z.object({
        tool: z.enum(SKILL_TOOLS),
        scope: z.enum(["project", "global"]),
        id: z.string(),
      }),
      targets: z
        .array(
          z.object({
            tool: z.enum(SKILL_TOOLS),
            scope: z.enum(["project", "global"]),
          }),
        )
        .min(1),
      overwrite: z.boolean().optional(),
      dryRun: z.boolean().optional(),
    })
    .parse(await c.req.json());

  const dryRun = body.dryRun || c.req.query("dryRun") === "1";

  try {
    const options = {
      projectRoot: c.get("projectRoot"),
      source: body.source,
      targets: body.targets,
      overwrite: body.overwrite,
    };
    if (dryRun) {
      return c.json(planImportSkill(options));
    }
    return c.json(importSkill(options));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 404);
  }
});

function serializeRule(r: {
  id: string;
  tool: RuleTool;
  scope: ScopeMode;
  name: string;
  description: string;
  filePath: string;
  body: string;
  contents: string;
  extension: "mdc" | "md";
  shape: "multi" | "singleton";
  readOnly: boolean;
}) {
  return {
    id: r.id,
    tool: r.tool,
    scope: r.scope,
    name: r.name,
    description: r.description,
    filePath: r.filePath,
    body: r.body,
    contents: r.contents,
    extension: r.extension,
    shape: r.shape,
    readOnly: r.readOnly,
  };
}

app.get("/api/rules", (c) => {
  const projectRoot = c.get("projectRoot");
  const tool = c.req.query("tool") as RuleTool | undefined;
  const scope = (c.req.query("scope") === "global" ? "global" : "project") as ScopeMode;

  if (tool && !(RULE_TOOLS as readonly string[]).includes(tool)) {
    return c.json({ error: `Unsupported rule tool: ${tool}` }, 400);
  }

  const rules = listRules({ projectRoot, tool, scope }).map(serializeRule);
  return c.json({ rules });
});

app.get("/api/rules/:tool/:id", (c) => {
  const tool = c.req.param("tool") as RuleTool;
  const id = c.req.param("id");
  const scope = (c.req.query("scope") === "global" ? "global" : "project") as ScopeMode;
  const path = c.req.query("path") || undefined;

  if (!(RULE_TOOLS as readonly string[]).includes(tool)) {
    return c.json({ error: `Unsupported rule tool: ${tool}` }, 400);
  }

  const rule = getRule(c.get("projectRoot"), tool, id, scope, {}, path);
  if (!rule) return c.json({ error: "Rule not found" }, 404);
  return c.json({ rule: serializeRule(rule) });
});

const RuleUpsertSchema = z.object({
  tool: z.enum(RULE_TOOLS),
  scope: z.enum(["project", "global"]),
  id: z.string(),
  description: z.string().optional(),
  body: z.string().optional(),
  contents: z.string().optional(),
  filePath: z.string().optional(),
});

app.post("/api/rules", async (c) => {
  const body = RuleUpsertSchema.parse(await c.req.json());
  const existing = getRule(c.get("projectRoot"), body.tool, body.id, body.scope);
  if (existing) return c.json({ error: `Rule already exists: ${body.tool}/${body.id}` }, 409);

  try {
    const rule = saveRule({
      projectRoot: c.get("projectRoot"),
      ...body,
    });
    return c.json({ rule: serializeRule(rule) }, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.put("/api/rules/:tool/:id", async (c) => {
  const tool = c.req.param("tool") as RuleTool;
  const id = c.req.param("id");
  const body = RuleUpsertSchema.omit({ tool: true, id: true })
    .extend({
      tool: z.enum(RULE_TOOLS).optional(),
      id: z.string().optional(),
    })
    .parse(await c.req.json());

  if (!(RULE_TOOLS as readonly string[]).includes(tool)) {
    return c.json({ error: `Unsupported rule tool: ${tool}` }, 400);
  }

  try {
    const rule = saveRule({
      projectRoot: c.get("projectRoot"),
      tool,
      id,
      scope: body.scope,
      description: body.description,
      body: body.body,
      contents: body.contents,
      filePath: body.filePath,
    });
    return c.json({ rule: serializeRule(rule) });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.delete("/api/rules/:tool/:id", (c) => {
  const tool = c.req.param("tool") as RuleTool;
  const id = c.req.param("id");
  const scope = (c.req.query("scope") === "global" ? "global" : "project") as ScopeMode;
  const path = c.req.query("path") || undefined;

  if (!(RULE_TOOLS as readonly string[]).includes(tool)) {
    return c.json({ error: `Unsupported rule tool: ${tool}` }, 400);
  }

  try {
    const ok = deleteRule(c.get("projectRoot"), tool, id, scope, {}, path);
    if (!ok) return c.json({ error: "Rule not found" }, 404);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.post("/api/rules/scaffold", async (c) => {
  const body = z
    .object({
      id: z.string(),
      description: z.string().optional(),
      tool: z.enum(RULE_TOOLS),
      scope: z.enum(["project", "global"]).default("project"),
      save: z.boolean().optional(),
    })
    .parse(await c.req.json());

  const scaffold = scaffoldRule(body.tool, body.id, body.description);
  if (body.save) {
    const rule = saveRule({
      projectRoot: c.get("projectRoot"),
      tool: body.tool,
      scope: body.scope,
      id: scaffold.id,
      contents: scaffold.contents,
    });
    return c.json({ rule: serializeRule(rule) }, 201);
  }
  return c.json(scaffold);
});

app.post("/api/rules/import", async (c) => {
  const body = z
    .object({
      source: z.object({
        tool: z.enum(RULE_TOOLS),
        scope: z.enum(["project", "global"]),
        id: z.string(),
      }),
      targets: z
        .array(
          z.object({
            tool: z.enum(RULE_TOOLS),
            scope: z.enum(["project", "global"]),
          }),
        )
        .min(1),
      overwrite: z.boolean().optional(),
      dryRun: z.boolean().optional(),
    })
    .parse(await c.req.json());

  const dryRun = body.dryRun || c.req.query("dryRun") === "1";

  try {
    const options = {
      projectRoot: c.get("projectRoot"),
      source: body.source,
      targets: body.targets,
      overwrite: body.overwrite,
    };
    if (dryRun) {
      return c.json(planImportRule(options));
    }
    return c.json(importRule(options));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 404);
  }
});

/** Native OS folder picker (A1). Works because the server runs on the user's machine. */
app.post("/api/pick-folder", async (c) => {
  const platform = process.platform;
  const pick = (): Promise<string> =>
    new Promise((resolvePick, rejectPick) => {
      const done = (err: Error | null, stdout: string) => {
        if (err) return rejectPick(err);
        const path = stdout.trim();
        if (!path) return rejectPick(new Error("No folder selected"));
        resolvePick(path);
      };
      if (platform === "darwin") {
        execFile(
          "osascript",
          ["-e", 'POSIX path of (choose folder with prompt "Select project root")'],
          (err, stdout) => done(err, stdout),
        );
      } else if (platform === "linux") {
        execFile(
          "zenity",
          ["--file-selection", "--directory", "--title=Select project root"],
          (err, stdout) => done(err, stdout),
        );
      } else if (platform === "win32") {
        execFile(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }",
          ],
          (err, stdout) => done(err, stdout),
        );
      } else {
        rejectPick(new Error(`Folder picker not supported on ${platform}`));
      }
    });

  try {
    const path = await pick();
    return c.json({ path: resolve(path) });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});
