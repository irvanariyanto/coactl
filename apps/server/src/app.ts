import { Hono } from "hono";
import { cors } from "hono/cors";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import {
  COMMAND_TOOLS,
  RULE_TOOLS,
  SKILL_TOOLS,
  WORKFLOW_TOOLS,
  countCommandsByTool,
  countRulesByTool,
  countSkillsByTool,
  countWorkflowsByTool,
  deleteCommand,
  deleteRule,
  deleteSkill,
  deleteWorkflow,
  detectSkillTools,
  getCommand,
  getRule,
  getSkill,
  getWorkflow,
  importCommand,
  importRule,
  importSkill,
  importWorkflow,
  installRemoteSkills,
  listCommands,
  listRules,
  listSkills,
  listWorkflows,
  planImportCommand,
  planImportRule,
  planImportSkill,
  planImportWorkflow,
  planInstallRemoteSkills,
  parseRemoteSkillSource,
  previewSkillsFromArchive,
  previewSkillsFromGit,
  previewSkillsFromNpm,
  resolveAllCommandPaths,
  resolveAllRulePaths,
  resolveAllSkillPaths,
  resolveAllWorkflowPaths,
  ruleLayoutInfo,
  saveCommand,
  saveRule,
  saveSkill,
  saveWorkflow,
  scaffoldCommand,
  scaffoldRule,
  scaffoldSkill,
  scaffoldWorkflow,
  type CommandTool,
  type RuleTool,
  type ScopeMode,
  type SkillTool,
  type WorkflowTool,
} from "@coactl/domain";
import { z } from "zod";
import {
  assertLoginAllowed,
  authFilePath,
  changePassword,
  clearLoginFailures,
  clearSessionCookie,
  disableAuth,
  enableAuth,
  getAuthStatus,
  isPublicAuthPath,
  loadAuthFile,
  readSession,
  recordLoginFailure,
  setSessionCookie,
  verifyPassword,
} from "./auth.js";

type Variables = {
  projectRoot: string;
};

export const app = new Hono<{ Variables: Variables }>();

export function normalizePickedArchivePath(path: string): string {
  const resolved = resolve(path.trim());
  if (!/\.(?:zip|tgz|tar\.gz)$/i.test(resolved)) {
    throw new Error("Select a .zip, .tgz, or .tar.gz archive");
  }
  return resolved;
}

app.use(
  "*",
  cors({
    origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
    credentials: true,
  }),
);

app.use("/api/*", async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  const file = loadAuthFile();
  const enabled = Boolean(file?.enabled && file.hash && file.salt && file.sessionSecret);
  if (enabled && !isPublicAuthPath(pathname, c.req.method) && !readSession(c, file)) {
    return c.json({ error: "Unlock required", code: "AUTH_REQUIRED" }, 401);
  }

  const rootParam = c.req.query("root") ?? process.env.COACTL_ROOT;
  c.set("projectRoot", resolve(rootParam || process.cwd()));
  await next();
});

app.get("/api/health", (c) =>
  c.json({ ok: true, version: "0.3.0", focus: "skills+rules+commands+workflows" }),
);

app.get("/api/auth/status", (c) => c.json(getAuthStatus(c)));

app.post("/api/auth/login", async (c) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  try {
    assertLoginAllowed(ip);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 429);
  }
  const body = z.object({ password: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Password required" }, 400);
  const file = loadAuthFile();
  if (!file?.enabled) return c.json({ error: "Login is not enabled" }, 400);
  if (!verifyPassword(body.data.password, file)) {
    recordLoginFailure(ip);
    return c.json({ error: "Incorrect password" }, 401);
  }
  clearLoginFailures(ip);
  setSessionCookie(c, file);
  return c.json({
    ok: true,
    enabled: true,
    unlocked: true,
    authFilePath: authFilePath(),
  });
});

app.post("/api/auth/logout", (c) => {
  clearSessionCookie(c);
  const file = loadAuthFile();
  const enabled = Boolean(file?.enabled && file.hash && file.salt && file.sessionSecret);
  return c.json({
    ok: true,
    enabled,
    unlocked: !enabled,
    authFilePath: authFilePath(),
  });
});

app.post("/api/auth/enable", async (c) => {
  const body = z
    .object({ password: z.string().min(8), confirm: z.string().min(8) })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Password must be at least 8 characters" }, 400);
  if (body.data.password !== body.data.confirm) {
    return c.json({ error: "Passwords do not match" }, 400);
  }
  try {
    const file = enableAuth(body.data.password);
    setSessionCookie(c, file);
    return c.json({
      ok: true,
      enabled: true,
      unlocked: true,
      authFilePath: authFilePath(),
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.post("/api/auth/disable", async (c) => {
  const body = z.object({ password: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Password required" }, 400);
  const file = loadAuthFile();
  if (!file?.enabled) return c.json({ error: "Login is not enabled" }, 400);
  if (!verifyPassword(body.data.password, file)) {
    return c.json({ error: "Incorrect password" }, 401);
  }
  disableAuth();
  clearSessionCookie(c);
  return c.json({
    ok: true,
    enabled: false,
    unlocked: true,
    authFilePath: authFilePath(),
  });
});

app.post("/api/auth/password", async (c) => {
  const body = z
    .object({
      current: z.string().min(1),
      password: z.string().min(8),
      confirm: z.string().min(8),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Invalid password change request" }, 400);
  if (body.data.password !== body.data.confirm) {
    return c.json({ error: "Passwords do not match" }, 400);
  }
  try {
    const file = changePassword(body.data.current, body.data.password);
    setSessionCookie(c, file);
    return c.json({
      ok: true,
      enabled: true,
      unlocked: true,
      authFilePath: authFilePath(),
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.get("/api/workspace", (c) => {
  const projectRoot = c.get("projectRoot");
  const mode = (c.req.query("mode") === "project" ? "project" : "global") as ScopeMode;
  const skillTools = detectSkillTools(projectRoot);
  const counts = countSkillsByTool(projectRoot);
  const ruleCounts = countRulesByTool(projectRoot);
  const commandCounts = countCommandsByTool(projectRoot);
  const workflowCounts = countWorkflowsByTool(projectRoot);
  const resolved = resolveAllSkillPaths(projectRoot);
  const ruleResolved = resolveAllRulePaths(projectRoot);
  const commandResolved = resolveAllCommandPaths(projectRoot);
  const workflowResolved = resolveAllWorkflowPaths(projectRoot);

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

  const commandPathsByTool = Object.fromEntries(
    COMMAND_TOOLS.map((tool) => [
      tool,
      {
        project: {
          path: commandResolved[tool].project.path,
          preferred: commandResolved[tool].project.preferred,
          exists: commandResolved[tool].project.exists,
          candidates: commandResolved[tool].project.candidates,
          candidateDetails: commandResolved[tool].project.candidateDetails,
          kind: commandResolved[tool].project.kind,
        },
        global: {
          path: commandResolved[tool].global.path,
          preferred: commandResolved[tool].global.preferred,
          exists: commandResolved[tool].global.exists,
          candidates: commandResolved[tool].global.candidates,
          candidateDetails: commandResolved[tool].global.candidateDetails,
          kind: commandResolved[tool].global.kind,
        },
      },
    ]),
  );

  const workflowPathsByTool = Object.fromEntries(
    WORKFLOW_TOOLS.map((tool) => [
      tool,
      {
        project: {
          path: workflowResolved[tool].project.path,
          preferred: workflowResolved[tool].project.preferred,
          exists: workflowResolved[tool].project.exists,
          candidates: workflowResolved[tool].project.candidates,
          candidateDetails: workflowResolved[tool].project.candidateDetails,
        },
        global: {
          path: workflowResolved[tool].global.path,
          preferred: workflowResolved[tool].global.preferred,
          exists: workflowResolved[tool].global.exists,
          candidates: workflowResolved[tool].global.candidates,
          candidateDetails: workflowResolved[tool].global.candidateDetails,
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
    toolCommandCounts: commandCounts,
    toolWorkflowCounts: workflowCounts,
    skillPathsByTool,
    rulePathsByTool,
    commandPathsByTool,
    workflowPathsByTool,
    skillToolsAvailable: SKILL_TOOLS,
    ruleToolsAvailable: RULE_TOOLS,
    commandToolsAvailable: COMMAND_TOOLS,
    workflowToolsAvailable: WORKFLOW_TOOLS,
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

app.post("/api/skills/remote/git/preview", async (c) => {
  const body = z
    .object({
      url: z.string().min(1),
      branch: z.string().optional(),
      subpath: z.string().optional(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "url is required" }, 400);
  try {
    const preview = await previewSkillsFromGit({
      url: body.data.url,
      branch: body.data.branch,
      subpath: body.data.subpath,
    });
    return c.json(preview);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.post("/api/skills/remote/pack/preview", async (c) => {
  const body = z
    .discriminatedUnion("kind", [
      z.object({
        kind: z.literal("npm"),
        install: z.string().min(1),
        registry: z.string().optional(),
        subpath: z.string().optional(),
      }),
      z.object({
        kind: z.literal("archive"),
        path: z.string().optional(),
        url: z.string().optional(),
        subpath: z.string().optional(),
      }),
    ])
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "A valid npm or archive pack source is required" }, 400);
  try {
    if (body.data.kind === "npm") {
      const preview = await previewSkillsFromNpm(body.data);
      return c.json({
        kind: "npm" as const,
        source: preview.install,
        subpath: preview.subpath,
        skills: preview.skills,
      });
    }
    const preview = await previewSkillsFromArchive(body.data);
    return c.json({ kind: "archive" as const, ...preview });
  } catch (err) {
    const message = (err as Error).message;
    const invalid = /required|provide exactly|must (?:be|use|stay)|not found|not a regular file/i.test(message);
    return c.json({ error: message }, invalid ? 400 : 502);
  }
});

app.post("/api/skills/remote/preview", async (c) => {
  const body = z
    .object({
      source: z.string().min(1),
      branch: z.string().optional(),
      registry: z.string().optional(),
      subpath: z.string().optional(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Skill source is required" }, 400);

  try {
    const detected = parseRemoteSkillSource(body.data.source);
    if (detected.kind === "git") {
      const preview = await previewSkillsFromGit({
        url: detected.url,
        branch: body.data.branch,
        subpath: body.data.subpath,
      });
      return c.json({ ...preview, kind: detected.kind, source: detected.source });
    }
    if (detected.kind === "npm") {
      const preview = await previewSkillsFromNpm({
        install: detected.install,
        registry: body.data.registry,
        subpath: body.data.subpath,
      });
      return c.json({ ...preview, kind: detected.kind, source: detected.source });
    }
    const preview = await previewSkillsFromArchive({
      path: detected.path,
      url: detected.url,
      subpath: body.data.subpath,
    });
    return c.json({ ...preview, kind: detected.kind, source: detected.source });
  } catch (err) {
    const message = (err as Error).message;
    const invalid = /required|only the command|only https|must (?:be|use|stay)|package name|provide exactly|not found|not a regular file/i.test(message);
    return c.json({ error: message }, invalid ? 400 : 502);
  }
});

app.post("/api/skills/remote/git/install", async (c) => {
  const body = z
    .object({
      tool: z.enum(SKILL_TOOLS),
      scope: z.enum(["project", "global"]),
      skills: z
        .array(
          z.object({
            id: z.string().min(1),
            contents: z.string().min(1),
            files: z
              .array(
                z.object({
                  path: z.string().min(1),
                  contentsBase64: z.string(),
                  size: z.number().int().nonnegative(),
                  mode: z.number().int().min(0).max(0o777).optional(),
                }),
              )
              .optional(),
          }),
        )
        .min(1),
      overwrite: z.boolean().optional(),
      dryRun: z.boolean().optional(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "tool, scope, and skills[] are required" }, 400);

  const options = {
    projectRoot: c.get("projectRoot"),
    tool: body.data.tool as SkillTool,
    scope: body.data.scope as ScopeMode,
    skills: body.data.skills,
    overwrite: body.data.overwrite,
  };
  const dryRun = body.data.dryRun || c.req.query("dryRun") === "1";
  try {
    if (dryRun) return c.json(planInstallRemoteSkills(options));
    return c.json(installRemoteSkills(options));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
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

function serializeCommand(r: {
  id: string;
  tool: CommandTool;
  scope: ScopeMode;
  name: string;
  description: string;
  filePath: string;
  body: string;
  contents: string;
  extension: "md";
  kind: "command" | "workflow";
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
    kind: r.kind,
    readOnly: r.readOnly,
  };
}

app.get("/api/commands", (c) => {
  const projectRoot = c.get("projectRoot");
  const tool = c.req.query("tool") as CommandTool | undefined;
  const scope = (c.req.query("scope") === "global" ? "global" : "project") as ScopeMode;

  if (tool && !(COMMAND_TOOLS as readonly string[]).includes(tool)) {
    return c.json({ error: `Unsupported command tool: ${tool}` }, 400);
  }

  const commands = listCommands({ projectRoot, tool, scope }).map(serializeCommand);
  return c.json({ commands });
});

app.get("/api/commands/:tool/:id", (c) => {
  const tool = c.req.param("tool") as CommandTool;
  const id = c.req.param("id");
  const scope = (c.req.query("scope") === "global" ? "global" : "project") as ScopeMode;
  const path = c.req.query("path") || undefined;

  if (!(COMMAND_TOOLS as readonly string[]).includes(tool)) {
    return c.json({ error: `Unsupported command tool: ${tool}` }, 400);
  }

  const command = getCommand(c.get("projectRoot"), tool, id, scope, {}, path);
  if (!command) return c.json({ error: "Command not found" }, 404);
  return c.json({ command: serializeCommand(command) });
});

const CommandUpsertSchema = z.object({
  tool: z.enum(COMMAND_TOOLS),
  scope: z.enum(["project", "global"]),
  id: z.string(),
  description: z.string().optional(),
  body: z.string().optional(),
  contents: z.string().optional(),
  filePath: z.string().optional(),
});

app.post("/api/commands", async (c) => {
  const body = CommandUpsertSchema.parse(await c.req.json());
  const existing = getCommand(c.get("projectRoot"), body.tool, body.id, body.scope);
  if (existing) return c.json({ error: `Command already exists: ${body.tool}/${body.id}` }, 409);

  try {
    const command = saveCommand({
      projectRoot: c.get("projectRoot"),
      ...body,
    });
    return c.json({ command: serializeCommand(command) }, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.put("/api/commands/:tool/:id", async (c) => {
  const tool = c.req.param("tool") as CommandTool;
  const id = c.req.param("id");
  const body = CommandUpsertSchema.omit({ tool: true, id: true })
    .extend({
      tool: z.enum(COMMAND_TOOLS).optional(),
      id: z.string().optional(),
    })
    .parse(await c.req.json());

  if (!(COMMAND_TOOLS as readonly string[]).includes(tool)) {
    return c.json({ error: `Unsupported command tool: ${tool}` }, 400);
  }

  try {
    const command = saveCommand({
      projectRoot: c.get("projectRoot"),
      tool,
      id,
      scope: body.scope,
      description: body.description,
      body: body.body,
      contents: body.contents,
      filePath: body.filePath,
    });
    return c.json({ command: serializeCommand(command) });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.delete("/api/commands/:tool/:id", (c) => {
  const tool = c.req.param("tool") as CommandTool;
  const id = c.req.param("id");
  const scope = (c.req.query("scope") === "global" ? "global" : "project") as ScopeMode;
  const path = c.req.query("path") || undefined;

  if (!(COMMAND_TOOLS as readonly string[]).includes(tool)) {
    return c.json({ error: `Unsupported command tool: ${tool}` }, 400);
  }

  try {
    const ok = deleteCommand(c.get("projectRoot"), tool, id, scope, {}, path);
    if (!ok) return c.json({ error: "Command not found" }, 404);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.post("/api/commands/scaffold", async (c) => {
  const body = z
    .object({
      id: z.string(),
      description: z.string().optional(),
      tool: z.enum(COMMAND_TOOLS),
      scope: z.enum(["project", "global"]).default("project"),
      save: z.boolean().optional(),
    })
    .parse(await c.req.json());

  const scaffold = scaffoldCommand(body.tool, body.id, body.description);
  if (body.save) {
    const command = saveCommand({
      projectRoot: c.get("projectRoot"),
      tool: body.tool,
      scope: body.scope,
      id: scaffold.id,
      contents: scaffold.contents,
    });
    return c.json({ command: serializeCommand(command) }, 201);
  }
  return c.json(scaffold);
});

app.post("/api/commands/import", async (c) => {
  const body = z
    .object({
      source: z.object({
        tool: z.enum(COMMAND_TOOLS),
        scope: z.enum(["project", "global"]),
        id: z.string(),
      }),
      targets: z
        .array(
          z.object({
            tool: z.enum(COMMAND_TOOLS),
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
      return c.json(planImportCommand(options));
    }
    return c.json(importCommand(options));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 404);
  }
});

function serializeWorkflow(r: {
  id: string;
  tool: WorkflowTool;
  scope: ScopeMode;
  name: string;
  description: string;
  filePath: string;
  body: string;
  contents: string;
  extension: "js";
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
    readOnly: r.readOnly,
  };
}

app.get("/api/workflows", (c) => {
  const projectRoot = c.get("projectRoot");
  const tool = c.req.query("tool") as WorkflowTool | undefined;
  const scope = (c.req.query("scope") === "global" ? "global" : "project") as ScopeMode;

  if (tool && !(WORKFLOW_TOOLS as readonly string[]).includes(tool)) {
    return c.json({ error: `Unsupported workflow tool: ${tool}` }, 400);
  }

  const workflows = listWorkflows({ projectRoot, tool, scope }).map(serializeWorkflow);
  return c.json({ workflows });
});

app.get("/api/workflows/:tool/:id", (c) => {
  const tool = c.req.param("tool") as WorkflowTool;
  const id = c.req.param("id");
  const scope = (c.req.query("scope") === "global" ? "global" : "project") as ScopeMode;
  const path = c.req.query("path") || undefined;

  if (!(WORKFLOW_TOOLS as readonly string[]).includes(tool)) {
    return c.json({ error: `Unsupported workflow tool: ${tool}` }, 400);
  }

  const workflow = getWorkflow(c.get("projectRoot"), tool, id, scope, {}, path);
  if (!workflow) return c.json({ error: "Workflow not found" }, 404);
  return c.json({ workflow: serializeWorkflow(workflow) });
});

const WorkflowUpsertSchema = z.object({
  tool: z.enum(WORKFLOW_TOOLS),
  scope: z.enum(["project", "global"]),
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  body: z.string().optional(),
  contents: z.string().optional(),
  filePath: z.string().optional(),
});

app.post("/api/workflows", async (c) => {
  const body = WorkflowUpsertSchema.parse(await c.req.json());
  const existing = getWorkflow(c.get("projectRoot"), body.tool, body.id, body.scope);
  if (existing) return c.json({ error: `Workflow already exists: ${body.tool}/${body.id}` }, 409);

  try {
    const workflow = saveWorkflow({
      projectRoot: c.get("projectRoot"),
      ...body,
    });
    return c.json({ workflow: serializeWorkflow(workflow) }, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.put("/api/workflows/:tool/:id", async (c) => {
  const tool = c.req.param("tool") as WorkflowTool;
  const id = c.req.param("id");
  const body = WorkflowUpsertSchema.omit({ tool: true, id: true })
    .extend({
      tool: z.enum(WORKFLOW_TOOLS).optional(),
      id: z.string().optional(),
    })
    .parse(await c.req.json());

  if (!(WORKFLOW_TOOLS as readonly string[]).includes(tool)) {
    return c.json({ error: `Unsupported workflow tool: ${tool}` }, 400);
  }

  try {
    const workflow = saveWorkflow({
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
    return c.json({ workflow: serializeWorkflow(workflow) });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.delete("/api/workflows/:tool/:id", (c) => {
  const tool = c.req.param("tool") as WorkflowTool;
  const id = c.req.param("id");
  const scope = (c.req.query("scope") === "global" ? "global" : "project") as ScopeMode;
  const path = c.req.query("path") || undefined;

  if (!(WORKFLOW_TOOLS as readonly string[]).includes(tool)) {
    return c.json({ error: `Unsupported workflow tool: ${tool}` }, 400);
  }

  try {
    const ok = deleteWorkflow(c.get("projectRoot"), tool, id, scope, {}, path);
    if (!ok) return c.json({ error: "Workflow not found" }, 404);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.post("/api/workflows/scaffold", async (c) => {
  const body = z
    .object({
      id: z.string(),
      description: z.string().optional(),
      tool: z.enum(WORKFLOW_TOOLS),
      scope: z.enum(["project", "global"]).default("project"),
      save: z.boolean().optional(),
    })
    .parse(await c.req.json());

  const scaffold = scaffoldWorkflow(body.tool, body.id, body.description);
  if (body.save) {
    const workflow = saveWorkflow({
      projectRoot: c.get("projectRoot"),
      tool: body.tool,
      scope: body.scope,
      id: scaffold.id,
      contents: scaffold.contents,
    });
    return c.json({ workflow: serializeWorkflow(workflow) }, 201);
  }
  return c.json(scaffold);
});

app.post("/api/workflows/import", async (c) => {
  const body = z
    .object({
      source: z.object({
        tool: z.enum(WORKFLOW_TOOLS),
        scope: z.enum(["project", "global"]),
        id: z.string(),
      }),
      targets: z
        .array(
          z.object({
            tool: z.enum(WORKFLOW_TOOLS),
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
      return c.json(planImportWorkflow(options));
    }
    return c.json(importWorkflow(options));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 404);
  }
});

/** Native OS folder picker (A1). Works because the server runs on the user's machine. */
app.post("/api/pick-folder", async (c) => {
  const platform = process.platform;

  function isUserCancel(err: Error | null, stderr: string): boolean {
    const msg = `${err?.message ?? ""}\n${stderr}`;
    // macOS osascript: User canceled. (-128)
    if (/User canceled|User cancelled|-128/i.test(msg)) return true;
    // zenity: exit code 1 on Cancel
    if (platform === "linux" && err && "code" in err && Number((err as { code?: string | number }).code) === 1) {
      return true;
    }
    return false;
  }

  const pick = (): Promise<{ path: string } | { cancelled: true }> =>
    new Promise((resolvePick, rejectPick) => {
      const done = (err: Error | null, stdout: string, stderr = "") => {
        const path = stdout.trim();
        if (path) return resolvePick({ path });
        // Empty selection / dialog dismiss — treat as cancel, not a hard failure.
        if (!err || isUserCancel(err, stderr)) return resolvePick({ cancelled: true });
        return rejectPick(err);
      };
      if (platform === "darwin") {
        execFile(
          "osascript",
          ["-e", 'POSIX path of (choose folder with prompt "Select project root")'],
          (err, stdout, stderr) => done(err, stdout, stderr),
        );
      } else if (platform === "linux") {
        execFile(
          "zenity",
          ["--file-selection", "--directory", "--title=Select project root"],
          (err, stdout, stderr) => done(err, stdout, stderr),
        );
      } else if (platform === "win32") {
        execFile(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }",
          ],
          (err, stdout, stderr) => done(err, stdout, stderr),
        );
      } else {
        rejectPick(new Error(`Folder picker not supported on ${platform}`));
      }
    });

  try {
    const result = await pick();
    if ("cancelled" in result) return c.json({ cancelled: true });
    return c.json({ path: resolve(result.path) });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

/** Native OS archive picker. The selected file is still validated again during preview. */
app.post("/api/pick-archive", async (c) => {
  const platform = process.platform;

  function isUserCancel(err: Error | null, stderr: string): boolean {
    const msg = `${err?.message ?? ""}\n${stderr}`;
    if (/User canceled|User cancelled|-128/i.test(msg)) return true;
    return platform === "linux" && Boolean(err && "code" in err && Number((err as { code?: string | number }).code) === 1);
  }

  const pick = (): Promise<{ path: string } | { cancelled: true }> =>
    new Promise((resolvePick, rejectPick) => {
      const done = (err: Error | null, stdout: string, stderr = "") => {
        const path = stdout.trim();
        if (path) return resolvePick({ path });
        if (!err || isUserCancel(err, stderr)) return resolvePick({ cancelled: true });
        return rejectPick(err);
      };
      if (platform === "darwin") {
        execFile(
          "osascript",
          ["-e", 'POSIX path of (choose file with prompt "Select a skill archive (.zip, .tgz, or .tar.gz)")'],
          (err, stdout, stderr) => done(err, stdout, stderr),
        );
      } else if (platform === "linux") {
        execFile(
          "zenity",
          [
            "--file-selection",
            "--title=Select a skill archive",
            "--file-filter=Skill archives | *.zip *.tgz *.tar.gz",
          ],
          (err, stdout, stderr) => done(err, stdout, stderr),
        );
      } else if (platform === "win32") {
        execFile(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.OpenFileDialog; $d.Title = 'Select a skill archive'; $d.Filter = 'Skill archives (*.zip;*.tgz;*.tar.gz)|*.zip;*.tgz;*.tar.gz'; if ($d.ShowDialog() -eq 'OK') { $d.FileName }",
          ],
          (err, stdout, stderr) => done(err, stdout, stderr),
        );
      } else {
        rejectPick(new Error(`Archive picker not supported on ${platform}`));
      }
    });

  try {
    const result = await pick();
    if ("cancelled" in result) return c.json({ cancelled: true });
    return c.json({ path: normalizePickedArchivePath(result.path) });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});
