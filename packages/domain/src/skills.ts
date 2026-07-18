import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse, stringify } from "yaml";
import { skillRoots, skillRootsForTool, type ToolDetectionOptions } from "./detect.js";
import { isReadOnlySkillDir, resolveSkillPath } from "./skill-paths.js";
import type { ScopeMode, SkillRecord, SkillTool } from "./schema.js";

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function splitFrontmatter(content: string): { fm: string; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  return { fm: match[1]!, body: match[2]!.replace(/^\r?\n/, "") };
}

function parseSkillFile(filePath: string, id: string): { name: string; description: string; body: string } {
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
      if (typeof obj.name === "string" && obj.name.trim()) name = obj.name.trim();
      if (typeof obj.description === "string") description = obj.description.trim();
    }
  } catch {
    // Non-YAML frontmatter (some Claude skills use freeform blocks) — keep raw body
    return { name: id, description: "", body: contents };
  }

  return { name, description, body: parts.body };
}

function renderSkillMarkdown(meta: { name: string; description: string }, body: string): string {
  const fm = stringify({
    name: meta.name,
    description: meta.description,
  }).trimEnd();
  const trimmed = body.trimStart();
  return `---\n${fm}\n---\n\n${trimmed}`;
}

export interface ListSkillsOptions extends ToolDetectionOptions {
  projectRoot: string;
  tool?: SkillTool;
  scope?: ScopeMode;
  installedOnly?: boolean;
}

export function listSkills(options: ListSkillsOptions): SkillRecord[] {
  const roots = (options.tool
    ? skillRootsForTool(options.tool, options.projectRoot, options)
    : skillRoots(options.projectRoot, options)
  ).filter((r) => (options.scope ? r.scope === options.scope : true));

  // One row per physical path: the same id in two candidate dirs is listed twice.
  const seen = new Set<string>();
  const skills: SkillRecord[] = [];

  for (const root of roots) {
    if (!existsSync(root.dir)) continue;
    const readOnly = isReadOnlySkillDir(root.dir);
    for (const entry of readdirSync(root.dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const id = entry.name;
      const filePath = join(root.dir, id, "SKILL.md");
      if (!existsSync(filePath)) continue;

      const key = `${root.tool}:${root.scope}:${resolve(filePath)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      try {
        const contents = readFileSync(filePath, "utf-8");
        const parsed = parseSkillFile(filePath, id);
        skills.push({
          id,
          tool: root.tool,
          scope: root.scope,
          name: parsed.name,
          description: parsed.description,
          body: parsed.body,
          contents,
          filePath,
          readOnly,
        });
      } catch {
        // skip unreadable
      }
    }
  }

  return skills.sort((a, b) => {
    const t = a.tool.localeCompare(b.tool);
    if (t !== 0) return t;
    const s = a.scope.localeCompare(b.scope);
    if (s !== 0) return s;
    const i = a.id.localeCompare(b.id);
    if (i !== 0) return i;
    return a.filePath.localeCompare(b.filePath);
  });
}

export function getSkill(
  projectRoot: string,
  tool: SkillTool,
  id: string,
  scope: ScopeMode,
  options: ToolDetectionOptions = {},
  /** Disambiguates duplicates: when set, only the record at this exact file path matches. */
  filePath?: string,
): SkillRecord | null {
  const matches = listSkills({ projectRoot, tool, scope, installedOnly: false, ...options }).filter(
    (s) => s.id === id,
  );
  if (filePath) {
    return matches.find((s) => resolve(s.filePath) === resolve(filePath)) ?? null;
  }
  return matches[0] ?? null;
}

export interface SaveSkillInput {
  projectRoot: string;
  tool: SkillTool;
  scope: ScopeMode;
  id: string;
  name?: string;
  description?: string;
  /** Full file contents. If set, written as-is. Otherwise name/description/body are rendered. */
  contents?: string;
  body?: string;
  /** Update this exact location (disambiguates duplicate ids across candidate dirs). */
  filePath?: string;
}

export function saveSkill(input: SaveSkillInput, options: ToolDetectionOptions = {}): SkillRecord {
  if (!KEBAB.test(input.id)) {
    throw new Error(`Skill id must be kebab-case: ${input.id}`);
  }

  const existing = getSkill(input.projectRoot, input.tool, input.id, input.scope, options, input.filePath);
  if (input.filePath && !existing) {
    throw new Error(`Skill not found at ${input.filePath}`);
  }
  const resolved = resolveSkillPath(input.tool, input.scope, input.projectRoot, options);
  const targetDir = existing ? dirname(existing.filePath) : join(resolved.preferred, input.id);
  if (isReadOnlySkillDir(dirname(targetDir))) {
    throw new Error(`Read-only skill location (vendor-managed): ${dirname(targetDir)}`);
  }
  mkdirSync(targetDir, { recursive: true });
  const filePath = join(targetDir, "SKILL.md");

  const name = input.name ?? input.id;
  const description = input.description ?? "";
  const contents =
    input.contents ??
    renderSkillMarkdown({ name, description }, input.body ?? `# ${name}\n\nDescribe this skill.\n`);

  writeFileSync(filePath, contents, "utf-8");

  const parsed = parseSkillFile(filePath, input.id);
  return {
    id: input.id,
    tool: input.tool,
    scope: input.scope,
    name: parsed.name,
    description: parsed.description,
    body: parsed.body,
    contents: readFileSync(filePath, "utf-8"),
    filePath,
    readOnly: false,
  };
}

export function deleteSkill(
  projectRoot: string,
  tool: SkillTool,
  id: string,
  scope: ScopeMode,
  options: ToolDetectionOptions = {},
  /** Delete this exact location (disambiguates duplicate ids across candidate dirs). */
  filePath?: string,
): boolean {
  const existing = getSkill(projectRoot, tool, id, scope, options, filePath);
  if (!existing) return false;
  if (existing.readOnly) {
    throw new Error(`Read-only skill location (vendor-managed): ${dirname(existing.filePath)}`);
  }
  rmSync(dirname(existing.filePath), { recursive: true, force: true });
  return true;
}

export function scaffoldSkill(id: string, name?: string, description?: string): {
  id: string;
  name: string;
  description: string;
  body: string;
  contents: string;
} {
  const display = name ?? id.split("-").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
  const desc = description ?? `Describe what ${display} does.`;
  const body = `# ${display}\n\nDescribe when to use this skill and what it should do.\n`;
  const contents = renderSkillMarkdown({ name: display, description: desc }, body);
  return { id, name: display, description: desc, body, contents };
}

export type SkillCountMap = Record<SkillTool, { project: number; global: number }>;

export function countSkillsByTool(
  projectRoot: string,
  options: ToolDetectionOptions = {},
): SkillCountMap {
  const tools: SkillTool[] = [
    "claude-code",
    "codex",
    "cursor",
    "antigravity",
    "gemini",
    "opencode",
    "zed",
  ];
  const counts = Object.fromEntries(tools.map((tool) => [tool, { project: 0, global: 0 }])) as SkillCountMap;

  for (const skill of listSkills({ projectRoot, installedOnly: false, ...options })) {
    counts[skill.tool][skill.scope] += 1;
  }
  return counts;
}

export interface ImportSkillTarget {
  tool: SkillTool;
  scope: ScopeMode;
}

export interface ImportSkillResult {
  tool: SkillTool;
  scope: ScopeMode;
  id: string;
  status: "written" | "skipped" | "error";
  error?: string;
  filePath?: string;
}

export interface ImportSkillPlanEntry {
  tool: SkillTool;
  scope: ScopeMode;
  id: string;
  /** Path the import would write to (or the existing path when skipping/blocked). */
  filePath: string;
  exists: boolean;
  action: "write" | "overwrite" | "skip" | "error";
  reason?: string;
  /** Existing contents at the target, present when action is overwrite (for diffing). */
  existingContents?: string;
}

interface ImportSkillOptions {
  projectRoot: string;
  source: { tool: SkillTool; scope: ScopeMode; id: string };
  targets: ImportSkillTarget[];
  overwrite?: boolean;
  detection?: ToolDetectionOptions;
}

function loadImportSource(options: ImportSkillOptions): SkillRecord {
  const source = getSkill(
    options.projectRoot,
    options.source.tool,
    options.source.id,
    options.source.scope,
    options.detection,
  );
  if (!source) {
    throw new Error(
      `Source skill not found: ${options.source.tool}/${options.source.scope}/${options.source.id}`,
    );
  }
  return source;
}

function planImportTarget(
  options: ImportSkillOptions,
  target: ImportSkillTarget,
): ImportSkillPlanEntry {
  const id = options.source.id;
  const overwrite = Boolean(options.overwrite);
  const resolved = resolveSkillPath(target.tool, target.scope, options.projectRoot, options.detection);
  const preferredFile = join(resolved.preferred, id, "SKILL.md");

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

  const existing = getSkill(options.projectRoot, target.tool, id, target.scope, options.detection);
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
      reason: `read-only skill location (vendor-managed): ${dirname(dirname(existing.filePath))}`,
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

/** Preview what an import would do without writing anything (A5). */
export function planImportSkill(options: ImportSkillOptions): { plan: ImportSkillPlanEntry[] } {
  loadImportSource(options);
  return { plan: options.targets.map((target) => planImportTarget(options, target)) };
}

export function importSkill(options: ImportSkillOptions): { results: ImportSkillResult[] } {
  const source = loadImportSource(options);
  const results: ImportSkillResult[] = [];

  for (const target of options.targets) {
    const plan = planImportTarget(options, target);
    if (plan.action === "skip") {
      results.push({
        tool: target.tool,
        scope: target.scope,
        id: options.source.id,
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
        id: options.source.id,
        status: "error",
        error: plan.reason,
        filePath: plan.filePath,
      });
      continue;
    }

    try {
      const saved = saveSkill(
        {
          projectRoot: options.projectRoot,
          tool: target.tool,
          scope: target.scope,
          id: options.source.id,
          contents: source.contents,
          filePath: plan.action === "overwrite" ? plan.filePath : undefined,
        },
        options.detection,
      );
      results.push({
        tool: target.tool,
        scope: target.scope,
        id: options.source.id,
        status: "written",
        filePath: saved.filePath,
      });
    } catch (err) {
      results.push({
        tool: target.tool,
        scope: target.scope,
        id: options.source.id,
        status: "error",
        error: (err as Error).message,
      });
    }
  }

  return { results };
}
