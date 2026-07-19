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
  commandFilePath,
  commandKind,
  commandPathCandidates,
  resolveCommandPath,
} from "./command-paths.js";
import type { CommandRecord, CommandTool, ScopeMode } from "./schema.js";
import { COMMAND_TOOLS } from "./schema.js";

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function splitFrontmatter(content: string): { fm: string; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  return { fm: match[1]!, body: match[2]!.replace(/^\r?\n/, "") };
}

function parseCommandFile(
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

function renderCommand(meta: { description: string }, body: string): string {
  const fm = stringify({ description: meta.description }).trimEnd();
  return `---\n${fm}\n---\n\n${body.trimStart()}`;
}

function toRecord(
  tool: CommandTool,
  scope: ScopeMode,
  id: string,
  filePath: string,
): CommandRecord {
  const contents = readFileSync(filePath, "utf-8");
  const parsed = parseCommandFile(filePath, id);
  return {
    id,
    tool,
    scope,
    name: parsed.name,
    description: parsed.description,
    body: parsed.body,
    contents,
    filePath,
    extension: "md",
    kind: commandKind(tool),
    readOnly: false,
  };
}

export interface ListCommandsOptions extends ToolDetectionOptions {
  projectRoot: string;
  tool?: CommandTool;
  scope?: ScopeMode;
}

export function listCommands(options: ListCommandsOptions): CommandRecord[] {
  const tools: CommandTool[] = options.tool ? [options.tool] : [...COMMAND_TOOLS];
  const scopes: ScopeMode[] = options.scope ? [options.scope] : ["project", "global"];
  const out: CommandRecord[] = [];
  const seen = new Set<string>();

  for (const tool of tools) {
    for (const scope of scopes) {
      for (const dir of commandPathCandidates(tool, scope, options.projectRoot, options)) {
        if (!existsSync(dir)) continue;
        try {
          if (!statSync(dir).isDirectory()) continue;
        } catch {
          continue;
        }
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (!entry.isFile()) continue;
          if (extname(entry.name) !== ".md") continue;
          const id = basename(entry.name, ".md");
          if (!KEBAB.test(id)) continue;
          const filePath = join(dir, entry.name);
          const key = `${tool}:${scope}:${resolve(filePath)}`;
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

  return out.sort((a, b) => {
    const t = a.tool.localeCompare(b.tool);
    if (t !== 0) return t;
    const s = a.scope.localeCompare(b.scope);
    if (s !== 0) return s;
    return a.id.localeCompare(b.id) || a.filePath.localeCompare(b.filePath);
  });
}

export function getCommand(
  projectRoot: string,
  tool: CommandTool,
  id: string,
  scope: ScopeMode,
  options: ToolDetectionOptions = {},
  filePath?: string,
): CommandRecord | null {
  const matches = listCommands({ projectRoot, tool, scope, ...options }).filter((c) => c.id === id);
  if (filePath) {
    return matches.find((c) => resolve(c.filePath) === resolve(filePath)) ?? null;
  }
  return matches[0] ?? null;
}

export interface SaveCommandInput {
  projectRoot: string;
  tool: CommandTool;
  scope: ScopeMode;
  id: string;
  description?: string;
  contents?: string;
  body?: string;
  filePath?: string;
}

export function saveCommand(input: SaveCommandInput, options: ToolDetectionOptions = {}): CommandRecord {
  if (!KEBAB.test(input.id)) {
    throw new Error(`Command id must be kebab-case: ${input.id}`);
  }
  if (!(COMMAND_TOOLS as readonly string[]).includes(input.tool)) {
    throw new Error(`Unsupported command tool: ${input.tool}`);
  }

  const existing = getCommand(
    input.projectRoot,
    input.tool,
    input.id,
    input.scope,
    options,
    input.filePath,
  );
  if (input.filePath && !existing) {
    throw new Error(`Command not found at ${input.filePath}`);
  }

  const resolved = resolveCommandPath(input.tool, input.scope, input.projectRoot, options);
  const filePath = existing?.filePath ?? commandFilePath(resolved.preferred, input.id);
  mkdirSync(dirname(filePath), { recursive: true });

  const description = input.description ?? existing?.description ?? `Slash command /${input.id}`;
  const body =
    input.body ??
    existing?.body ??
    `# /${input.id}\n\nDescribe what this command should do.\n\n$ARGUMENTS\n`;
  const contents = input.contents ?? renderCommand({ description }, body);

  writeFileSync(filePath, contents, "utf-8");
  return toRecord(input.tool, input.scope, input.id, filePath);
}

export function deleteCommand(
  projectRoot: string,
  tool: CommandTool,
  id: string,
  scope: ScopeMode,
  options: ToolDetectionOptions = {},
  filePath?: string,
): boolean {
  const existing = getCommand(projectRoot, tool, id, scope, options, filePath);
  if (!existing) return false;
  if (existing.readOnly) {
    throw new Error(`Read-only command location: ${dirname(existing.filePath)}`);
  }
  unlinkSync(existing.filePath);
  return true;
}

export function scaffoldCommand(
  tool: CommandTool,
  id: string,
  description?: string,
): { id: string; description: string; body: string; contents: string; extension: "md"; kind: "command" | "workflow" } {
  if (!KEBAB.test(id)) {
    throw new Error(`Command id must be kebab-case: ${id}`);
  }
  const desc = description ?? `Describe /${id}`;
  const body = `# /${id}\n\nAdd the prompt template for this slash command.\n\n$ARGUMENTS\n`;
  return {
    id,
    description: desc,
    body,
    contents: renderCommand({ description: desc }, body),
    extension: "md",
    kind: commandKind(tool),
  };
}

export type CommandCountMap = Record<CommandTool, { project: number; global: number }>;

export function countCommandsByTool(
  projectRoot: string,
  options: ToolDetectionOptions = {},
): CommandCountMap {
  const counts = Object.fromEntries(
    COMMAND_TOOLS.map((tool) => [tool, { project: 0, global: 0 }]),
  ) as CommandCountMap;
  for (const cmd of listCommands({ projectRoot, ...options })) {
    counts[cmd.tool][cmd.scope] += 1;
  }
  return counts;
}

export interface ImportCommandTarget {
  tool: CommandTool;
  scope: ScopeMode;
}

export interface ImportCommandResult {
  tool: CommandTool;
  scope: ScopeMode;
  id: string;
  status: "written" | "skipped" | "error";
  error?: string;
  filePath?: string;
}

export interface ImportCommandPlanEntry {
  tool: CommandTool;
  scope: ScopeMode;
  id: string;
  filePath: string;
  exists: boolean;
  action: "write" | "overwrite" | "skip" | "error";
  reason?: string;
  existingContents?: string;
}

interface ImportCommandOptions {
  projectRoot: string;
  source: { tool: CommandTool; scope: ScopeMode; id: string; filePath?: string };
  targets: ImportCommandTarget[];
  overwrite?: boolean;
  detection?: ToolDetectionOptions;
}

function loadImportSource(options: ImportCommandOptions): CommandRecord {
  const source = getCommand(
    options.projectRoot,
    options.source.tool,
    options.source.id,
    options.source.scope,
    options.detection,
    options.source.filePath,
  );
  if (!source) {
    throw new Error(
      `Source command not found: ${options.source.tool}/${options.source.scope}/${options.source.id}`,
    );
  }
  return source;
}

function planImportTarget(
  options: ImportCommandOptions,
  target: ImportCommandTarget,
): ImportCommandPlanEntry {
  const id = options.source.id;
  const overwrite = Boolean(options.overwrite);
  const resolved = resolveCommandPath(target.tool, target.scope, options.projectRoot, options.detection);
  const preferredFile = commandFilePath(resolved.preferred, id);

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

  const existing = getCommand(options.projectRoot, target.tool, id, target.scope, options.detection);
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
      reason: `read-only command location: ${dirname(existing.filePath)}`,
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

export function planImportCommand(options: ImportCommandOptions): { plan: ImportCommandPlanEntry[] } {
  loadImportSource(options);
  return { plan: options.targets.map((target) => planImportTarget(options, target)) };
}

export function importCommand(options: ImportCommandOptions): { results: ImportCommandResult[] } {
  const source = loadImportSource(options);
  const results: ImportCommandResult[] = [];

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
      const saved = saveCommand(
        {
          projectRoot: options.projectRoot,
          tool: target.tool,
          scope: target.scope,
          id: plan.id,
          // All command files are .md — preserve raw contents across tools.
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
