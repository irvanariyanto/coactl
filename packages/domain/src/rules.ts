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
import { parse, stringify } from "yaml";
import type { ToolDetectionOptions } from "./detect.js";
import {
  resolveRulePath,
  ruleFileExtension,
  ruleFilePath,
  ruleListExtensions,
  rulePathCandidates,
  ruleShape,
  singletonRuleId,
} from "./rule-paths.js";
import type { RuleRecord, RuleTool, ScopeMode } from "./schema.js";
import { RULE_TOOLS } from "./schema.js";

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function splitFrontmatter(content: string): { fm: string; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  return { fm: match[1]!, body: match[2]!.replace(/^\r?\n/, "") };
}

function parseRuleFile(
  filePath: string,
  id: string,
): { name: string; description: string; body: string } {
  const contents = readFileSync(filePath, "utf-8");
  const parts = splitFrontmatter(contents);
  if (!parts) {
    return { name: id, description: "", body: contents };
  }

  let name = id;
  let description = "";
  try {
    const fm = parse(parts.fm);
    if (fm && typeof fm === "object") {
      const obj = fm as Record<string, unknown>;
      if (typeof obj.description === "string" && obj.description.trim()) {
        description = obj.description.trim();
        name = description.length > 48 ? `${description.slice(0, 47)}…` : description;
      }
      if (typeof obj.name === "string" && obj.name.trim()) name = obj.name.trim();
    }
  } catch {
    return { name: id, description: "", body: contents };
  }

  return { name, description, body: parts.body };
}

function renderFrontmatterRule(
  tool: RuleTool,
  meta: { description: string },
  body: string,
): string {
  const fm =
    tool === "cursor"
      ? stringify({ description: meta.description, alwaysApply: false }).trimEnd()
      : stringify({ description: meta.description }).trimEnd();
  return `---\n${fm}\n---\n\n${body.trimStart()}`;
}

function renderContents(
  tool: RuleTool,
  meta: { description: string },
  body: string,
): string {
  if (ruleShape(tool) === "singleton") {
    return body.trimStart().endsWith("\n") ? body.trimStart() : `${body.trimStart()}\n`;
  }
  return renderFrontmatterRule(tool, meta, body);
}

function toRecord(
  tool: RuleTool,
  scope: ScopeMode,
  id: string,
  filePath: string,
  extension: "mdc" | "md",
): RuleRecord {
  const contents = readFileSync(filePath, "utf-8");
  const parsed = parseRuleFile(filePath, id);
  return {
    id,
    tool,
    scope,
    name: parsed.name,
    description: parsed.description,
    body: parsed.body,
    contents,
    filePath,
    extension,
    shape: ruleShape(tool),
    readOnly: false,
  };
}

export interface ListRulesOptions extends ToolDetectionOptions {
  projectRoot: string;
  tool?: RuleTool;
  scope?: ScopeMode;
}

function listSingleton(
  tool: RuleTool,
  scope: ScopeMode,
  projectRoot: string,
  options: ToolDetectionOptions,
): RuleRecord[] {
  const id = singletonRuleId(tool);
  const rules: RuleRecord[] = [];
  const seen = new Set<string>();
  for (const filePath of rulePathCandidates(tool, scope, projectRoot, options)) {
    if (!existsSync(filePath)) continue;
    try {
      if (!statSync(filePath).isFile()) continue;
    } catch {
      continue;
    }
    const key = resolve(filePath);
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      rules.push(toRecord(tool, scope, id, filePath, "md"));
    } catch {
      // skip unreadable
    }
  }
  return rules;
}

function listMulti(
  tool: RuleTool,
  scope: ScopeMode,
  projectRoot: string,
  options: ToolDetectionOptions,
): RuleRecord[] {
  const want = new Set(ruleListExtensions(tool).map((e) => `.${e}`));
  const rules: RuleRecord[] = [];
  const seen = new Set<string>();

  for (const dir of rulePathCandidates(tool, scope, projectRoot, options)) {
    if (!existsSync(dir)) continue;
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const ext = extname(entry.name);
      if (!want.has(ext)) continue;
      const id = basename(entry.name, ext);
      if (!KEBAB.test(id)) continue;

      const filePath = join(dir, entry.name);
      const key = resolve(filePath);
      if (seen.has(key)) continue;
      seen.add(key);

      try {
        const extension = (ext.slice(1) === "mdc" ? "mdc" : "md") as "mdc" | "md";
        rules.push(toRecord(tool, scope, id, filePath, extension));
      } catch {
        // skip unreadable
      }
    }
  }
  return rules;
}

export function listRules(options: ListRulesOptions): RuleRecord[] {
  const tools: RuleTool[] = options.tool ? [options.tool] : [...RULE_TOOLS];
  const scopes: ScopeMode[] = options.scope ? [options.scope] : ["project", "global"];
  const rules: RuleRecord[] = [];

  for (const tool of tools) {
    for (const scope of scopes) {
      if (ruleShape(tool) === "singleton") {
        rules.push(...listSingleton(tool, scope, options.projectRoot, options));
      } else {
        rules.push(...listMulti(tool, scope, options.projectRoot, options));
      }
    }
  }

  return rules.sort((a, b) => {
    const t = a.tool.localeCompare(b.tool);
    if (t !== 0) return t;
    const s = a.scope.localeCompare(b.scope);
    if (s !== 0) return s;
    const i = a.id.localeCompare(b.id);
    if (i !== 0) return i;
    return a.filePath.localeCompare(b.filePath);
  });
}

export function getRule(
  projectRoot: string,
  tool: RuleTool,
  id: string,
  scope: ScopeMode,
  options: ToolDetectionOptions = {},
  filePath?: string,
): RuleRecord | null {
  const matches = listRules({ projectRoot, tool, scope, ...options }).filter((r) => r.id === id);
  if (filePath) {
    return matches.find((r) => resolve(r.filePath) === resolve(filePath)) ?? null;
  }
  return matches[0] ?? null;
}

export interface SaveRuleInput {
  projectRoot: string;
  tool: RuleTool;
  scope: ScopeMode;
  id: string;
  description?: string;
  contents?: string;
  body?: string;
  filePath?: string;
}

function normalizeRuleId(tool: RuleTool, id: string): string {
  if (ruleShape(tool) === "singleton") {
    const expected = singletonRuleId(tool);
    if (id !== expected) {
      throw new Error(`${tool} uses a single instruction file; id must be "${expected}"`);
    }
    return expected;
  }
  if (!KEBAB.test(id)) {
    throw new Error(`Rule id must be kebab-case: ${id}`);
  }
  return id;
}

/** Target id when importing a source rule into another tool. */
export function importRuleTargetId(source: RuleRecord, targetTool: RuleTool): string {
  if (ruleShape(targetTool) === "singleton") return singletonRuleId(targetTool);
  if (ruleShape(source.tool) === "singleton") {
    if (source.id === "gemini") return "gemini-md";
    if (source.id === "agents") return "agents-md";
  }
  return source.id;
}

export function saveRule(input: SaveRuleInput, options: ToolDetectionOptions = {}): RuleRecord {
  if (!(RULE_TOOLS as readonly string[]).includes(input.tool)) {
    throw new Error(`Unsupported rule tool: ${input.tool}`);
  }
  const id = normalizeRuleId(input.tool, input.id);

  const existing = getRule(input.projectRoot, input.tool, id, input.scope, options, input.filePath);
  if (input.filePath && !existing) {
    throw new Error(`Rule not found at ${input.filePath}`);
  }

  const resolved = resolveRulePath(input.tool, input.scope, input.projectRoot, options);
  const filePath = existing?.filePath ?? ruleFilePath(resolved.preferred, id, input.tool);
  mkdirSync(dirname(filePath), { recursive: true });

  const description = input.description ?? existing?.description ?? `Rules for ${id}`;
  const body =
    input.body ??
    existing?.body ??
    (ruleShape(input.tool) === "singleton"
      ? `# ${id === "gemini" ? "GEMINI" : "AGENTS"}\n\nAdd durable instructions for the agent.\n`
      : `# ${id}\n\nDescribe this rule.\n`);
  const contents = input.contents ?? renderContents(input.tool, { description }, body);

  writeFileSync(filePath, contents, "utf-8");

  const extension =
    ruleShape(input.tool) === "singleton"
      ? "md"
      : ((extname(filePath).slice(1) === "mdc" ? "mdc" : "md") as "mdc" | "md");
  return toRecord(input.tool, input.scope, id, filePath, extension);
}

export function deleteRule(
  projectRoot: string,
  tool: RuleTool,
  id: string,
  scope: ScopeMode,
  options: ToolDetectionOptions = {},
  filePath?: string,
): boolean {
  const existing = getRule(projectRoot, tool, id, scope, options, filePath);
  if (!existing) return false;
  if (existing.readOnly) {
    throw new Error(`Read-only rule location: ${dirname(existing.filePath)}`);
  }
  unlinkSync(existing.filePath);
  return true;
}

export function scaffoldRule(
  tool: RuleTool,
  id: string,
  description?: string,
): { id: string; description: string; body: string; contents: string; extension: "mdc" | "md" } {
  const normalized =
    ruleShape(tool) === "singleton" ? singletonRuleId(tool) : KEBAB.test(id) ? id : id;
  if (ruleShape(tool) !== "singleton" && !KEBAB.test(normalized)) {
    throw new Error(`Rule id must be kebab-case: ${id}`);
  }
  const desc =
    description ??
    (ruleShape(tool) === "singleton"
      ? `Project instructions for ${tool}`
      : `Describe when to apply ${normalized}.`);
  const body =
    ruleShape(tool) === "singleton"
      ? `# ${normalized === "gemini" ? "Project context" : "Agent instructions"}\n\nAdd durable instructions for the agent.\n`
      : `# ${normalized}\n\nAdd durable instructions for the agent.\n`;
  const contents = renderContents(tool, { description: desc }, body);
  return {
    id: normalized,
    description: desc,
    body,
    contents,
    extension: ruleFileExtension(tool),
  };
}

export type RuleCountMap = Record<RuleTool, { project: number; global: number }>;

export function countRulesByTool(projectRoot: string, options: ToolDetectionOptions = {}): RuleCountMap {
  const counts = Object.fromEntries(RULE_TOOLS.map((tool) => [tool, { project: 0, global: 0 }])) as RuleCountMap;
  for (const rule of listRules({ projectRoot, ...options })) {
    counts[rule.tool][rule.scope] += 1;
  }
  return counts;
}

export interface ImportRuleTarget {
  tool: RuleTool;
  scope: ScopeMode;
}

export interface ImportRuleResult {
  tool: RuleTool;
  scope: ScopeMode;
  id: string;
  status: "written" | "skipped" | "error";
  error?: string;
  filePath?: string;
}

export interface ImportRulePlanEntry {
  tool: RuleTool;
  scope: ScopeMode;
  id: string;
  filePath: string;
  exists: boolean;
  action: "write" | "overwrite" | "skip" | "error";
  reason?: string;
  existingContents?: string;
}

interface ImportRuleOptions {
  projectRoot: string;
  source: { tool: RuleTool; scope: ScopeMode; id: string; filePath?: string };
  targets: ImportRuleTarget[];
  overwrite?: boolean;
  detection?: ToolDetectionOptions;
}

function loadImportSource(options: ImportRuleOptions): RuleRecord {
  const source = getRule(
    options.projectRoot,
    options.source.tool,
    options.source.id,
    options.source.scope,
    options.detection,
    options.source.filePath,
  );
  if (!source) {
    throw new Error(
      `Source rule not found: ${options.source.tool}/${options.source.scope}/${options.source.id}`,
    );
  }
  return source;
}

function planImportTarget(options: ImportRuleOptions, target: ImportRuleTarget): ImportRulePlanEntry {
  const source = loadImportSource(options);
  const id = importRuleTargetId(source, target.tool);
  const overwrite = Boolean(options.overwrite);
  const resolved = resolveRulePath(target.tool, target.scope, options.projectRoot, options.detection);
  const preferredFile = ruleFilePath(resolved.preferred, id, target.tool);

  if (resolve(source.filePath) === resolve(preferredFile)) {
    return {
      tool: target.tool,
      scope: target.scope,
      id,
      filePath: preferredFile,
      exists: true,
      action: "skip",
      reason: "same file as source",
    };
  }

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

  const existing = getRule(options.projectRoot, target.tool, id, target.scope, options.detection);
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
      reason: `read-only rule location: ${dirname(existing.filePath)}`,
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

export function planImportRule(options: ImportRuleOptions): { plan: ImportRulePlanEntry[] } {
  loadImportSource(options);
  return { plan: options.targets.map((target) => planImportTarget(options, target)) };
}

export function importRule(options: ImportRuleOptions): { results: ImportRuleResult[] } {
  const source = loadImportSource(options);
  const results: ImportRuleResult[] = [];

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
      const sameTool = source.tool === target.tool;
      const sameShape = ruleShape(source.tool) === ruleShape(target.tool);
      const saved = saveRule(
        {
          projectRoot: options.projectRoot,
          tool: target.tool,
          scope: target.scope,
          id: plan.id,
          ...(sameTool && sameShape
            ? { contents: source.contents }
            : {
                description: source.description || `Rules for ${source.id}`,
                body: source.body || source.contents,
              }),
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
