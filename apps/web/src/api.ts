export type Mode = "global" | "project";
export type ScopeMode = "project" | "global";

export type SkillTool =
  | "claude-code"
  | "codex"
  | "cursor"
  | "antigravity"
  | "gemini"
  | "opencode"
  | "zed";

export type RuleTool = SkillTool;

export type CommandTool = "claude-code" | "cursor" | "opencode" | "antigravity";

export type WorkflowTool = "claude-code";

export type RuleShape = "multi" | "singleton";

export interface RuleLayoutInfo {
  shape: RuleShape;
  extension: "mdc" | "md";
  singletonId?: string;
  listExtensions: Array<"mdc" | "md">;
}

export interface SkillToolInfo {
  target: SkillTool;
  installed: boolean;
  reason?: string;
  supportsSkills: boolean;
  presentInProject: boolean;
}

export interface Skill {
  id: string;
  tool: SkillTool;
  scope: ScopeMode;
  name: string;
  description: string;
  filePath: string;
  body: string;
  contents: string;
  readOnly: boolean;
}

export interface Rule {
  id: string;
  tool: RuleTool;
  scope: ScopeMode;
  name: string;
  description: string;
  filePath: string;
  body: string;
  contents: string;
  extension: "mdc" | "md";
  shape: RuleShape;
  readOnly: boolean;
}

export interface SkillPathCandidate {
  path: string;
  exists: boolean;
  writable: boolean;
}

export interface SkillPathInfo {
  path: string;
  preferred: string;
  exists: boolean;
  candidates: string[];
  candidateDetails: SkillPathCandidate[];
}

export type RulePathInfo = SkillPathInfo;

export interface CommandPathInfo extends SkillPathInfo {
  kind: "command" | "workflow";
}

export interface Command {
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
}

export type WorkflowPathInfo = SkillPathInfo;

export interface Workflow {
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
}

export interface Workspace {
  projectRoot: string;
  mode: Mode;
  skillTools: SkillToolInfo[];
  toolsForMode: SkillToolInfo[];
  toolSkillCounts: Record<SkillTool, { project: number; global: number }>;
  toolRuleCounts: Record<RuleTool, { project: number; global: number }>;
  toolCommandCounts: Record<CommandTool, { project: number; global: number }>;
  toolWorkflowCounts: Record<WorkflowTool, { project: number; global: number }>;
  skillPathsByTool: Record<SkillTool, { project: SkillPathInfo; global: SkillPathInfo }>;
  rulePathsByTool: Record<RuleTool, { project: RulePathInfo; global: RulePathInfo }>;
  commandPathsByTool: Record<
    CommandTool,
    { project: CommandPathInfo; global: CommandPathInfo }
  >;
  workflowPathsByTool: Record<
    WorkflowTool,
    { project: WorkflowPathInfo; global: WorkflowPathInfo }
  >;
  skillToolsAvailable: SkillTool[];
  ruleToolsAvailable: RuleTool[];
  commandToolsAvailable: CommandTool[];
  workflowToolsAvailable: WorkflowTool[];
  ruleLayoutsByTool: Record<RuleTool, RuleLayoutInfo>;
}

export interface ImportResult {
  results: Array<{
    tool: SkillTool;
    scope: ScopeMode;
    id: string;
    status: "written" | "skipped" | "error";
    error?: string;
    filePath?: string;
  }>;
}

export interface ImportPlan {
  plan: Array<{
    tool: SkillTool;
    scope: ScopeMode;
    id: string;
    filePath: string;
    exists: boolean;
    action: "write" | "overwrite" | "skip" | "error";
    reason?: string;
    existingContents?: string;
  }>;
}

export interface RuleImportResult {
  results: Array<{
    tool: RuleTool;
    scope: ScopeMode;
    id: string;
    status: "written" | "skipped" | "error";
    error?: string;
    filePath?: string;
  }>;
}

export interface RuleImportPlan {
  plan: Array<{
    tool: RuleTool;
    scope: ScopeMode;
    id: string;
    filePath: string;
    exists: boolean;
    action: "write" | "overwrite" | "skip" | "error";
    reason?: string;
    existingContents?: string;
  }>;
}

export interface CommandImportResult {
  results: Array<{
    tool: CommandTool;
    scope: ScopeMode;
    id: string;
    status: "written" | "skipped" | "error";
    error?: string;
    filePath?: string;
  }>;
}

export interface CommandImportPlan {
  plan: Array<{
    tool: CommandTool;
    scope: ScopeMode;
    id: string;
    filePath: string;
    exists: boolean;
    action: "write" | "overwrite" | "skip" | "error";
    reason?: string;
    existingContents?: string;
  }>;
}

export interface WorkflowImportResult {
  results: Array<{
    tool: WorkflowTool;
    scope: ScopeMode;
    id: string;
    status: "written" | "skipped" | "error";
    error?: string;
    filePath?: string;
  }>;
}

export interface WorkflowImportPlan {
  plan: Array<{
    tool: WorkflowTool;
    scope: ScopeMode;
    id: string;
    filePath: string;
    exists: boolean;
    action: "write" | "overwrite" | "skip" | "error";
    reason?: string;
    existingContents?: string;
  }>;
}

function qs(root: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ root, ...extra });
  return `?${params.toString()}`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  workspace(root: string, mode: Mode) {
    return request<Workspace>(`/api/workspace${qs(root, { mode })}`);
  },
  listSkills(root: string, tool: SkillTool, scope: ScopeMode) {
    return request<{ skills: Skill[] }>(`/api/skills${qs(root, { tool, scope })}`);
  },
  getSkill(root: string, tool: SkillTool, id: string, scope: ScopeMode, path?: string) {
    return request<{ skill: Skill }>(
      `/api/skills/${tool}/${id}${qs(root, { scope, ...(path ? { path } : {}) })}`,
    );
  },
  saveSkill(
    root: string,
    skill: {
      tool: SkillTool;
      scope: ScopeMode;
      id: string;
      contents?: string;
      filePath?: string;
    },
    create: boolean,
  ) {
    if (create) {
      return request<{ skill: Skill }>(`/api/skills${qs(root)}`, {
        method: "POST",
        body: JSON.stringify(skill),
      });
    }
    return request<{ skill: Skill }>(`/api/skills/${skill.tool}/${skill.id}${qs(root)}`, {
      method: "PUT",
      body: JSON.stringify(skill),
    });
  },
  deleteSkill(root: string, tool: SkillTool, id: string, scope: ScopeMode, path?: string) {
    return request(`/api/skills/${tool}/${id}${qs(root, { scope, ...(path ? { path } : {}) })}`, {
      method: "DELETE",
    });
  },
  scaffold(
    root: string,
    body: { id: string; tool: SkillTool; scope: ScopeMode; name?: string; save?: boolean },
  ) {
    return request<{ skill: Skill }>(`/api/skills/scaffold${qs(root)}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  importSkill(
    root: string,
    body: {
      source: { tool: SkillTool; scope: ScopeMode; id: string };
      targets: Array<{ tool: SkillTool; scope: ScopeMode }>;
      overwrite?: boolean;
    },
  ) {
    return request<ImportResult>(`/api/skills/import${qs(root)}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  previewImport(
    root: string,
    body: {
      source: { tool: SkillTool; scope: ScopeMode; id: string };
      targets: Array<{ tool: SkillTool; scope: ScopeMode }>;
      overwrite?: boolean;
    },
  ) {
    return request<ImportPlan>(`/api/skills/import${qs(root)}`, {
      method: "POST",
      body: JSON.stringify({ ...body, dryRun: true }),
    });
  },
  listRules(root: string, tool: RuleTool, scope: ScopeMode) {
    return request<{ rules: Rule[] }>(`/api/rules${qs(root, { tool, scope })}`);
  },
  getRule(root: string, tool: RuleTool, id: string, scope: ScopeMode, path?: string) {
    return request<{ rule: Rule }>(
      `/api/rules/${tool}/${id}${qs(root, { scope, ...(path ? { path } : {}) })}`,
    );
  },
  saveRule(
    root: string,
    rule: {
      tool: RuleTool;
      scope: ScopeMode;
      id: string;
      contents?: string;
      filePath?: string;
    },
    create: boolean,
  ) {
    if (create) {
      return request<{ rule: Rule }>(`/api/rules${qs(root)}`, {
        method: "POST",
        body: JSON.stringify(rule),
      });
    }
    return request<{ rule: Rule }>(`/api/rules/${rule.tool}/${rule.id}${qs(root)}`, {
      method: "PUT",
      body: JSON.stringify(rule),
    });
  },
  deleteRule(root: string, tool: RuleTool, id: string, scope: ScopeMode, path?: string) {
    return request(`/api/rules/${tool}/${id}${qs(root, { scope, ...(path ? { path } : {}) })}`, {
      method: "DELETE",
    });
  },
  scaffoldRule(
    root: string,
    body: { id: string; tool: RuleTool; scope: ScopeMode; description?: string; save?: boolean },
  ) {
    return request<{ rule: Rule }>(`/api/rules/scaffold${qs(root)}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  importRule(
    root: string,
    body: {
      source: { tool: RuleTool; scope: ScopeMode; id: string };
      targets: Array<{ tool: RuleTool; scope: ScopeMode }>;
      overwrite?: boolean;
    },
  ) {
    return request<RuleImportResult>(`/api/rules/import${qs(root)}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  previewRuleImport(
    root: string,
    body: {
      source: { tool: RuleTool; scope: ScopeMode; id: string };
      targets: Array<{ tool: RuleTool; scope: ScopeMode }>;
      overwrite?: boolean;
    },
  ) {
    return request<RuleImportPlan>(`/api/rules/import${qs(root)}`, {
      method: "POST",
      body: JSON.stringify({ ...body, dryRun: true }),
    });
  },
  listCommands(root: string, tool: CommandTool, scope: ScopeMode) {
    return request<{ commands: Command[] }>(`/api/commands${qs(root, { tool, scope })}`);
  },
  getCommand(root: string, tool: CommandTool, id: string, scope: ScopeMode, path?: string) {
    return request<{ command: Command }>(
      `/api/commands/${tool}/${id}${qs(root, { scope, ...(path ? { path } : {}) })}`,
    );
  },
  saveCommand(
    root: string,
    command: {
      tool: CommandTool;
      scope: ScopeMode;
      id: string;
      contents?: string;
      filePath?: string;
    },
    create: boolean,
  ) {
    if (create) {
      return request<{ command: Command }>(`/api/commands${qs(root)}`, {
        method: "POST",
        body: JSON.stringify(command),
      });
    }
    return request<{ command: Command }>(
      `/api/commands/${command.tool}/${command.id}${qs(root)}`,
      {
        method: "PUT",
        body: JSON.stringify(command),
      },
    );
  },
  deleteCommand(
    root: string,
    tool: CommandTool,
    id: string,
    scope: ScopeMode,
    path?: string,
  ) {
    return request(
      `/api/commands/${tool}/${id}${qs(root, { scope, ...(path ? { path } : {}) })}`,
      {
        method: "DELETE",
      },
    );
  },
  scaffoldCommand(
    root: string,
    body: { id: string; tool: CommandTool; scope: ScopeMode; description?: string; save?: boolean },
  ) {
    return request<{ command: Command }>(`/api/commands/scaffold${qs(root)}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  importCommand(
    root: string,
    body: {
      source: { tool: CommandTool; scope: ScopeMode; id: string };
      targets: Array<{ tool: CommandTool; scope: ScopeMode }>;
      overwrite?: boolean;
    },
  ) {
    return request<CommandImportResult>(`/api/commands/import${qs(root)}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  previewCommandImport(
    root: string,
    body: {
      source: { tool: CommandTool; scope: ScopeMode; id: string };
      targets: Array<{ tool: CommandTool; scope: ScopeMode }>;
      overwrite?: boolean;
    },
  ) {
    return request<CommandImportPlan>(`/api/commands/import${qs(root)}`, {
      method: "POST",
      body: JSON.stringify({ ...body, dryRun: true }),
    });
  },
  listWorkflows(root: string, tool: WorkflowTool, scope: ScopeMode) {
    return request<{ workflows: Workflow[] }>(`/api/workflows${qs(root, { tool, scope })}`);
  },
  getWorkflow(root: string, tool: WorkflowTool, id: string, scope: ScopeMode, path?: string) {
    return request<{ workflow: Workflow }>(
      `/api/workflows/${tool}/${id}${qs(root, { scope, ...(path ? { path } : {}) })}`,
    );
  },
  saveWorkflow(
    root: string,
    workflow: {
      tool: WorkflowTool;
      scope: ScopeMode;
      id: string;
      contents?: string;
      filePath?: string;
    },
    create: boolean,
  ) {
    if (create) {
      return request<{ workflow: Workflow }>(`/api/workflows${qs(root)}`, {
        method: "POST",
        body: JSON.stringify(workflow),
      });
    }
    return request<{ workflow: Workflow }>(
      `/api/workflows/${workflow.tool}/${workflow.id}${qs(root)}`,
      {
        method: "PUT",
        body: JSON.stringify(workflow),
      },
    );
  },
  deleteWorkflow(
    root: string,
    tool: WorkflowTool,
    id: string,
    scope: ScopeMode,
    path?: string,
  ) {
    return request(
      `/api/workflows/${tool}/${id}${qs(root, { scope, ...(path ? { path } : {}) })}`,
      {
        method: "DELETE",
      },
    );
  },
  scaffoldWorkflow(
    root: string,
    body: { id: string; tool: WorkflowTool; scope: ScopeMode; description?: string; save?: boolean },
  ) {
    return request<{ workflow: Workflow }>(`/api/workflows/scaffold${qs(root)}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  importWorkflow(
    root: string,
    body: {
      source: { tool: WorkflowTool; scope: ScopeMode; id: string };
      targets: Array<{ tool: WorkflowTool; scope: ScopeMode }>;
      overwrite?: boolean;
    },
  ) {
    return request<WorkflowImportResult>(`/api/workflows/import${qs(root)}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  previewWorkflowImport(
    root: string,
    body: {
      source: { tool: WorkflowTool; scope: ScopeMode; id: string };
      targets: Array<{ tool: WorkflowTool; scope: ScopeMode }>;
      overwrite?: boolean;
    },
  ) {
    return request<WorkflowImportPlan>(`/api/workflows/import${qs(root)}`, {
      method: "POST",
      body: JSON.stringify({ ...body, dryRun: true }),
    });
  },
  pickFolder() {
    return request<{ path: string } | { cancelled: true }>(`/api/pick-folder`, { method: "POST" });
  },
};
