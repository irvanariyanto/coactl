import { execFile } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { parse } from "yaml";
import type { ScopeMode, SkillTool } from "./schema.js";
import { isReadOnlySkillDir, resolveSkillPath } from "./skill-paths.js";
import { getSkill, saveSkill } from "./skills.js";
import type { ToolDetectionOptions } from "./detect.js";

const execFileAsync = promisify(execFile);
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
  "vendor",
  ".turbo",
  ".cache",
]);

const TOOL_DOT_DIRS = new Set([
  ".claude",
  ".cursor",
  ".agents",
  ".codex",
  ".gemini",
  ".opencode",
  ".antigravity",
]);

export interface RemoteSkillCandidate {
  id: string;
  name: string;
  description: string;
  /** Path to SKILL.md relative to the repo root (posix-style). */
  repoPath: string;
  contents: string;
}

export type GitRunner = (args: string[], options?: { cwd?: string }) => Promise<void>;

async function defaultGitRunner(args: string[], options?: { cwd?: string }): Promise<void> {
  await execFileAsync("git", args, {
    cwd: options?.cwd,
    maxBuffer: 8 * 1024 * 1024,
  });
}

/** Accept public https or SSH git URLs only. */
export function assertSafeGitUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("Git URL is required");
  if (/^https:\/\/[^\s]+$/i.test(trimmed)) return trimmed.replace(/\/+$/, "");
  if (/^git@[\w.-]+:[\w./-]+(?:\.git)?$/i.test(trimmed)) return trimmed;
  throw new Error("Only https:// or git@host:path URLs are supported");
}

function splitFrontmatter(content: string): { fm: string; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  return { fm: match[1]!, body: match[2]!.replace(/^\r?\n/, "") };
}

function parseMeta(contents: string, fallbackId: string): { name: string; description: string } {
  const parts = splitFrontmatter(contents);
  if (!parts) return { name: fallbackId, description: "" };
  try {
    const fm = parse(parts.fm);
    if (fm && typeof fm === "object") {
      const obj = fm as Record<string, unknown>;
      const name =
        typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : fallbackId;
      const description = typeof obj.description === "string" ? obj.description.trim() : "";
      return { name, description };
    }
  } catch {
    /* ignore */
  }
  return { name: fallbackId, description: "" };
}

function toSkillId(dirName: string): string | null {
  if (KEBAB.test(dirName)) return dirName;
  const slug = dirName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return KEBAB.test(slug) ? slug : null;
}

function toPosix(rel: string): string {
  return rel.split(sep).join("/");
}

function rankRepoPath(repoPath: string): number {
  const p = repoPath.toLowerCase();
  // Prefer top-level skills/ before nested tool trees (which also contain /skills/).
  if (/^skills\/[^/]+\/skill\.md$/.test(p)) return 0;
  if (/(^|\/)\.claude\/skills\/[^/]+\/skill\.md$/.test(p)) return 1;
  if (/(^|\/)\.cursor\/skills\/[^/]+\/skill\.md$/.test(p)) return 2;
  if (/(^|\/)\.agents\/skills\/[^/]+\/skill\.md$/.test(p)) return 3;
  if (/(^|\/)\.codex\/skills\/[^/]+\/skill\.md$/.test(p)) return 4;
  if (/(^|\/)skills\/[^/]+\/skill\.md$/.test(p)) return 5;
  return 6;
}

/** Scan a local directory tree for SKILL.md files (no network). */
export function scanSkillsInDirectory(rootDir: string, subpath = ""): RemoteSkillCandidate[] {
  const root = resolve(rootDir);
  const start = subpath.trim() ? resolve(root, subpath.trim()) : root;
  if (!existsSync(start)) {
    throw new Error(`Subpath not found in repo: ${subpath || "."}`);
  }
  const st = statSync(start);
  if (!st.isDirectory()) {
    throw new Error(`Subpath is not a directory: ${subpath}`);
  }

  const found: RemoteSkillCandidate[] = [];

  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith(".") && !TOOL_DOT_DIRS.has(entry.name)) continue;
        walk(join(dir, entry.name));
        continue;
      }
      if (!entry.isFile() || entry.name !== "SKILL.md") continue;

      const filePath = join(dir, entry.name);
      const id = toSkillId(entry.name === "SKILL.md" ? dir.split(sep).pop()! : entry.name);
      if (!id) continue;

      try {
        const contents = readFileSync(filePath, "utf-8");
        const meta = parseMeta(contents, id);
        const repoPath = toPosix(relative(root, filePath));
        if (repoPath.startsWith("..")) continue;
        found.push({
          id,
          name: meta.name,
          description: meta.description,
          repoPath,
          contents,
        });
      } catch {
        /* skip unreadable */
      }
    }
  }

  walk(start);

  found.sort((a, b) => {
    const r = rankRepoPath(a.repoPath) - rankRepoPath(b.repoPath);
    if (r !== 0) return r;
    return a.repoPath.localeCompare(b.repoPath);
  });
  return found;
}

export interface PreviewGitSkillsOptions {
  url: string;
  branch?: string;
  subpath?: string;
  /** Override temp parent; tests can inject. */
  tmpParent?: string;
  runGit?: GitRunner;
}

export interface PreviewGitSkillsResult {
  url: string;
  branch?: string;
  subpath?: string;
  skills: RemoteSkillCandidate[];
}

/** Shallow-clone a git repo and list discoverable skills. */
export async function previewSkillsFromGit(
  options: PreviewGitSkillsOptions,
): Promise<PreviewGitSkillsResult> {
  const url = assertSafeGitUrl(options.url);
  const runGit = options.runGit ?? defaultGitRunner;
  const parent = options.tmpParent ?? tmpdir();
  const workDir = mkdtempSync(join(parent, "coactl-git-"));

  try {
    const args = ["clone", "--depth", "1", "--single-branch"];
    if (options.branch?.trim()) {
      args.push("--branch", options.branch.trim());
    }
    args.push(url, workDir);
    await runGit(args);
    const skills = scanSkillsInDirectory(workDir, options.subpath);
    return {
      url,
      branch: options.branch?.trim() || undefined,
      subpath: options.subpath?.trim() || undefined,
      skills,
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

export interface InstallRemoteSkillPlanEntry {
  id: string;
  tool: SkillTool;
  scope: ScopeMode;
  filePath: string;
  exists: boolean;
  action: "write" | "overwrite" | "skip" | "error";
  reason?: string;
  existingContents?: string;
}

export interface InstallRemoteSkillsOptions {
  projectRoot: string;
  tool: SkillTool;
  scope: ScopeMode;
  skills: Array<{ id: string; contents: string }>;
  overwrite?: boolean;
  detection?: ToolDetectionOptions;
}

function planOne(
  options: InstallRemoteSkillsOptions,
  skill: { id: string; contents: string },
): InstallRemoteSkillPlanEntry {
  if (!KEBAB.test(skill.id)) {
    return {
      id: skill.id,
      tool: options.tool,
      scope: options.scope,
      filePath: "",
      exists: false,
      action: "error",
      reason: `invalid skill id (kebab-case required): ${skill.id}`,
    };
  }
  const resolved = resolveSkillPath(
    options.tool,
    options.scope,
    options.projectRoot,
    options.detection,
  );
  const preferredFile = join(resolved.preferred, skill.id, "SKILL.md");
  if (isReadOnlySkillDir(resolved.preferred)) {
    return {
      id: skill.id,
      tool: options.tool,
      scope: options.scope,
      filePath: preferredFile,
      exists: existsSync(preferredFile),
      action: "error",
      reason: `read-only skill location (vendor-managed): ${resolved.preferred}`,
    };
  }

  const existing = getSkill(
    options.projectRoot,
    options.tool,
    skill.id,
    options.scope,
    options.detection,
  );
  if (!existing) {
    return {
      id: skill.id,
      tool: options.tool,
      scope: options.scope,
      filePath: preferredFile,
      exists: false,
      action: "write",
    };
  }
  if (!options.overwrite) {
    return {
      id: skill.id,
      tool: options.tool,
      scope: options.scope,
      filePath: existing.filePath,
      exists: true,
      action: "skip",
      reason: "already exists",
    };
  }
  if (existing.readOnly) {
    return {
      id: skill.id,
      tool: options.tool,
      scope: options.scope,
      filePath: existing.filePath,
      exists: true,
      action: "error",
      reason: `read-only skill location (vendor-managed): ${existing.filePath}`,
    };
  }
  return {
    id: skill.id,
    tool: options.tool,
    scope: options.scope,
    filePath: existing.filePath,
    exists: true,
    action: "overwrite",
    existingContents: existing.contents,
  };
}

export function planInstallRemoteSkills(
  options: InstallRemoteSkillsOptions,
): { plan: InstallRemoteSkillPlanEntry[] } {
  return { plan: options.skills.map((s) => planOne(options, s)) };
}

export function installRemoteSkills(options: InstallRemoteSkillsOptions): {
  results: Array<{
    id: string;
    tool: SkillTool;
    scope: ScopeMode;
    status: "written" | "skipped" | "error";
    error?: string;
    filePath?: string;
  }>;
} {
  const results: Array<{
    id: string;
    tool: SkillTool;
    scope: ScopeMode;
    status: "written" | "skipped" | "error";
    error?: string;
    filePath?: string;
  }> = [];

  for (const skill of options.skills) {
    const plan = planOne(options, skill);
    if (plan.action === "skip") {
      results.push({
        id: skill.id,
        tool: options.tool,
        scope: options.scope,
        status: "skipped",
        error: plan.reason,
        filePath: plan.filePath || undefined,
      });
      continue;
    }
    if (plan.action === "error") {
      results.push({
        id: skill.id,
        tool: options.tool,
        scope: options.scope,
        status: "error",
        error: plan.reason,
        filePath: plan.filePath || undefined,
      });
      continue;
    }
    try {
      const saved = saveSkill(
        {
          projectRoot: options.projectRoot,
          tool: options.tool,
          scope: options.scope,
          id: skill.id,
          contents: skill.contents,
          filePath: plan.action === "overwrite" ? plan.filePath : undefined,
        },
        options.detection,
      );
      results.push({
        id: skill.id,
        tool: options.tool,
        scope: options.scope,
        status: "written",
        filePath: saved.filePath,
      });
    } catch (err) {
      results.push({
        id: skill.id,
        tool: options.tool,
        scope: options.scope,
        status: "error",
        error: (err as Error).message,
      });
    }
  }

  return { results };
}
