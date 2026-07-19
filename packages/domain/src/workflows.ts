import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import type { ToolDetectionOptions } from "./detect.js";
import {
  resolveWorkflowPath,
  workflowFilePath,
  workflowPathCandidates,
} from "./workflow-paths.js";
import type { ScopeMode, WorkflowRecord, WorkflowTool } from "./schema.js";
import { WORKFLOW_TOOLS } from "./schema.js";

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LIST_EXTS = new Set([".js", ".mjs"]);

function parseWorkflowMeta(contents: string, id: string): { name: string; description: string; body: string } {
  let name = id;
  let description = "";

  const metaMatch = contents.match(/export\s+const\s+meta\s*=\s*\{([\s\S]*?)\n\}/);
  if (metaMatch) {
    const block = metaMatch[1]!;
    const nameM = block.match(/name\s*:\s*['"`]([^'"`]+)['"`]/);
    const descM = block.match(/description\s*:\s*['"`]([^'"`]+)['"`]/);
    if (nameM?.[1]) name = nameM[1];
    if (descM?.[1]) description = descM[1];
  }

  // Best-effort: body is everything after the meta export closing brace.
  let body = contents;
  if (metaMatch) {
    const end = contents.indexOf(metaMatch[0]!) + metaMatch[0]!.length;
    body = contents.slice(end).replace(/^\s*\n+/, "");
  }

  return { name, description, body };
}

function renderWorkflow(meta: { name: string; description: string }, body: string): string {
  const script = body.trim() || defaultBody(meta.name);
  return `export const meta = {
  name: ${JSON.stringify(meta.name)},
  description: ${JSON.stringify(meta.description)},
}

${script.trimStart().endsWith("\n") ? script.trimStart() : `${script.trimStart()}\n`}`;
}

function defaultBody(id: string): string {
  return `const result = await agent('Describe the first step for /${id}.', {
  label: 'step-1',
})

return result
`;
}

function toRecord(
  tool: WorkflowTool,
  scope: ScopeMode,
  id: string,
  filePath: string,
): WorkflowRecord {
  const contents = readFileSync(filePath, "utf-8");
  const parsed = parseWorkflowMeta(contents, id);
  return {
    id,
    tool,
    scope,
    name: parsed.name,
    description: parsed.description,
    body: parsed.body,
    contents,
    filePath,
    extension: "js",
    readOnly: false,
  };
}

export interface ListWorkflowsOptions extends ToolDetectionOptions {
  projectRoot: string;
  tool?: WorkflowTool;
  scope?: ScopeMode;
}

export function listWorkflows(options: ListWorkflowsOptions): WorkflowRecord[] {
  const tools: WorkflowTool[] = options.tool ? [options.tool] : [...WORKFLOW_TOOLS];
  const scopes: ScopeMode[] = options.scope ? [options.scope] : ["project", "global"];
  const out: WorkflowRecord[] = [];
  const seen = new Set<string>();

  for (const tool of tools) {
    for (const scope of scopes) {
      for (const dir of workflowPathCandidates(tool, scope, options.projectRoot, options)) {
        if (!existsSync(dir)) continue;
        try {
          if (!statSync(dir).isDirectory()) continue;
        } catch {
          continue;
        }
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (!entry.isFile()) continue;
          const ext = extname(entry.name);
          if (!LIST_EXTS.has(ext)) continue;
          const id = basename(entry.name, ext);
          if (!KEBAB.test(id)) continue;
          const filePath = join(dir, entry.name);
          const key = resolve(filePath);
          if (seen.has(key)) continue;
          seen.add(key);
          try {
            out.push(toRecord(tool, scope, id, filePath));
          } catch {
            // skip
          }
        }
      }
    }
  }

  return out.sort((a, b) => a.id.localeCompare(b.id) || a.filePath.localeCompare(b.filePath));
}

export function getWorkflow(
  projectRoot: string,
  tool: WorkflowTool,
  id: string,
  scope: ScopeMode,
  options: ToolDetectionOptions = {},
  filePath?: string,
): WorkflowRecord | null {
  const matches = listWorkflows({ projectRoot, tool, scope, ...options }).filter((w) => w.id === id);
  if (filePath) {
    return matches.find((w) => resolve(w.filePath) === resolve(filePath)) ?? null;
  }
  return matches[0] ?? null;
}

export interface SaveWorkflowInput {
  projectRoot: string;
  tool: WorkflowTool;
  scope: ScopeMode;
  id: string;
  name?: string;
  description?: string;
  contents?: string;
  body?: string;
  filePath?: string;
}

export function saveWorkflow(input: SaveWorkflowInput, options: ToolDetectionOptions = {}): WorkflowRecord {
  if (!KEBAB.test(input.id)) {
    throw new Error(`Workflow id must be kebab-case: ${input.id}`);
  }
  if (!(WORKFLOW_TOOLS as readonly string[]).includes(input.tool)) {
    throw new Error(`Unsupported workflow tool: ${input.tool}`);
  }

  const existing = getWorkflow(
    input.projectRoot,
    input.tool,
    input.id,
    input.scope,
    options,
    input.filePath,
  );
  if (input.filePath && !existing) {
    throw new Error(`Workflow not found at ${input.filePath}`);
  }

  const resolved = resolveWorkflowPath(input.tool, input.scope, input.projectRoot, options);
  const filePath = existing?.filePath ?? workflowFilePath(resolved.preferred, input.id);
  mkdirSync(dirname(filePath), { recursive: true });

  const name = input.name ?? existing?.name ?? input.id;
  const description =
    input.description ?? existing?.description ?? `Dynamic workflow /${input.id}`;
  const contents =
    input.contents ??
    renderWorkflow({ name, description }, input.body ?? existing?.body ?? defaultBody(input.id));

  writeFileSync(filePath, contents, "utf-8");
  return toRecord(input.tool, input.scope, input.id, filePath);
}

export function deleteWorkflow(
  projectRoot: string,
  tool: WorkflowTool,
  id: string,
  scope: ScopeMode,
  options: ToolDetectionOptions = {},
  filePath?: string,
): boolean {
  const existing = getWorkflow(projectRoot, tool, id, scope, options, filePath);
  if (!existing) return false;
  if (existing.readOnly) {
    throw new Error(`Read-only workflow location: ${dirname(existing.filePath)}`);
  }
  unlinkSync(existing.filePath);
  return true;
}

export function scaffoldWorkflow(
  tool: WorkflowTool,
  id: string,
  description?: string,
): { id: string; name: string; description: string; body: string; contents: string; extension: "js" } {
  if (!(WORKFLOW_TOOLS as readonly string[]).includes(tool)) {
    throw new Error(`Unsupported workflow tool: ${tool}`);
  }
  if (!KEBAB.test(id)) {
    throw new Error(`Workflow id must be kebab-case: ${id}`);
  }
  const desc = description ?? `Dynamic workflow /${id}`;
  const body = defaultBody(id);
  const contents = renderWorkflow({ name: id, description: desc }, body);
  return { id, name: id, description: desc, body, contents, extension: "js" };
}

export type WorkflowCountMap = Record<WorkflowTool, { project: number; global: number }>;

export function countWorkflowsByTool(
  projectRoot: string,
  options: ToolDetectionOptions = {},
): WorkflowCountMap {
  const counts = Object.fromEntries(
    WORKFLOW_TOOLS.map((tool) => [tool, { project: 0, global: 0 }]),
  ) as WorkflowCountMap;
  for (const wf of listWorkflows({ projectRoot, ...options })) {
    counts[wf.tool][wf.scope] += 1;
  }
  return counts;
}

export interface ImportWorkflowTarget {
  tool: WorkflowTool;
  scope: ScopeMode;
}

export interface ImportWorkflowResult {
  tool: WorkflowTool;
  scope: ScopeMode;
  id: string;
  status: "written" | "skipped" | "error";
  error?: string;
  filePath?: string;
}

export interface ImportWorkflowPlanEntry {
  tool: WorkflowTool;
  scope: ScopeMode;
  id: string;
  filePath: string;
  exists: boolean;
  action: "write" | "overwrite" | "skip" | "error";
  reason?: string;
  existingContents?: string;
}

interface ImportWorkflowOptions {
  projectRoot: string;
  source: { tool: WorkflowTool; scope: ScopeMode; id: string; filePath?: string };
  targets: ImportWorkflowTarget[];
  overwrite?: boolean;
  detection?: ToolDetectionOptions;
}

function loadImportSource(options: ImportWorkflowOptions): WorkflowRecord {
  const source = getWorkflow(
    options.projectRoot,
    options.source.tool,
    options.source.id,
    options.source.scope,
    options.detection,
    options.source.filePath,
  );
  if (!source) {
    throw new Error(
      `Source workflow not found: ${options.source.tool}/${options.source.scope}/${options.source.id}`,
    );
  }
  return source;
}

function planImportTarget(
  options: ImportWorkflowOptions,
  target: ImportWorkflowTarget,
): ImportWorkflowPlanEntry {
  const id = options.source.id;
  const overwrite = Boolean(options.overwrite);
  const resolved = resolveWorkflowPath(target.tool, target.scope, options.projectRoot, options.detection);
  const preferredFile = workflowFilePath(resolved.preferred, id);

  if (target.tool === options.source.tool && target.scope === options.source.scope) {
    return {
      tool: target.tool,
      scope: target.scope,
      id,
      filePath: preferredFile,
      exists: existsSync(preferredFile),
      action: "skip",
      reason: "same as source",
    };
  }

  const existing = getWorkflow(options.projectRoot, target.tool, id, target.scope, options.detection);
  if (!existing) {
    return { tool: target.tool, scope: target.scope, id, filePath: preferredFile, exists: false, action: "write" };
  }
  if (!overwrite) {
    return {
      tool: target.tool,
      scope: target.scope,
      id,
      filePath: existing.filePath,
      exists: true,
      action: "skip",
      reason: "already exists",
    };
  }
  if (existing.readOnly) {
    return {
      tool: target.tool,
      scope: target.scope,
      id,
      filePath: existing.filePath,
      exists: true,
      action: "error",
      reason: `read-only workflow location: ${dirname(existing.filePath)}`,
    };
  }
  return {
    tool: target.tool,
    scope: target.scope,
    id,
    filePath: existing.filePath,
    exists: true,
    action: "overwrite",
    existingContents: existing.contents,
  };
}

export function planImportWorkflow(options: ImportWorkflowOptions): { plan: ImportWorkflowPlanEntry[] } {
  loadImportSource(options);
  return { plan: options.targets.map((target) => planImportTarget(options, target)) };
}

export function importWorkflow(options: ImportWorkflowOptions): { results: ImportWorkflowResult[] } {
  const source = loadImportSource(options);
  const results: ImportWorkflowResult[] = [];

  for (const target of options.targets) {
    const plan = planImportTarget(options, target);
    if (plan.action === "skip") {
      results.push({
        tool: target.tool,
        scope: target.scope,
        id: plan.id,
        status: "skipped",
        error: plan.reason,
        filePath: plan.exists ? plan.filePath : undefined,
      });
      continue;
    }
    if (plan.action === "error") {
      results.push({
        tool: target.tool,
        scope: target.scope,
        id: plan.id,
        status: "error",
        error: plan.reason,
        filePath: plan.filePath,
      });
      continue;
    }

    try {
      const saved = saveWorkflow(
        {
          projectRoot: options.projectRoot,
          tool: target.tool,
          scope: target.scope,
          id: plan.id,
          contents: source.contents,
          filePath: plan.action === "overwrite" ? plan.filePath : undefined,
        },
        options.detection,
      );
      results.push({
        tool: target.tool,
        scope: target.scope,
        id: plan.id,
        status: "written",
        filePath: saved.filePath,
      });
    } catch (err) {
      results.push({
        tool: target.tool,
        scope: target.scope,
        id: plan.id,
        status: "error",
        error: (err as Error).message,
      });
    }
  }

  return { results };
}
