import { execFile } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { parse } from "yaml";
import type { ScopeMode, SkillTool } from "./schema.js";
import { isReadOnlySkillDir, resolveSkillPath } from "./skill-paths.js";
import { getSkill } from "./skills.js";
import type { ToolDetectionOptions } from "./detect.js";

const execFileAsync = promisify(execFile);
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_SKILL_FILES = 1_000;
const MAX_SKILL_BYTES = 20 * 1024 * 1024;
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
  files: RemoteSkillFile[];
}

export interface RemoteSkillFile {
  /** Path relative to the skill directory (posix-style). */
  path: string;
  contentsBase64: string;
  size: number;
  mode?: number;
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

function collectSkillFiles(skillDir: string): RemoteSkillFile[] {
  const files: RemoteSkillFile[] = [];
  let totalBytes = 0;

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const filePath = join(dir, entry.name);
      const stat = lstatSync(filePath);
      if (stat.isSymbolicLink()) {
        throw new Error(`Skill directory contains a symbolic link: ${toPosix(relative(skillDir, filePath))}`);
      }
      if (stat.isDirectory()) {
        walk(filePath);
        continue;
      }
      if (!stat.isFile()) {
        throw new Error(`Skill directory contains an unsupported file: ${toPosix(relative(skillDir, filePath))}`);
      }
      const contents = readFileSync(filePath);
      totalBytes += contents.byteLength;
      if (files.length >= MAX_SKILL_FILES) {
        throw new Error(`Skill directory exceeds the ${MAX_SKILL_FILES} file limit`);
      }
      if (totalBytes > MAX_SKILL_BYTES) {
        throw new Error("Skill directory exceeds the 20 MiB size limit");
      }
      files.push({
        path: toPosix(relative(skillDir, filePath)),
        contentsBase64: contents.toString("base64"),
        size: contents.byteLength,
        mode: stat.mode & 0o777,
      });
    }
  }

  walk(skillDir);
  return files.sort((a, b) => a.path.localeCompare(b.path));
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
        files: collectSkillFiles(dir),
      });
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
  files: Array<{
    path: string;
    filePath: string;
    exists: boolean;
    action: "write" | "overwrite" | "skip" | "error";
  }>;
  removedFiles?: string[];
}

export interface InstallRemoteSkillInput {
  id: string;
  contents: string;
  files?: RemoteSkillFile[];
}

export interface InstallRemoteSkillsOptions {
  projectRoot: string;
  tool: SkillTool;
  scope: ScopeMode;
  skills: InstallRemoteSkillInput[];
  overwrite?: boolean;
  detection?: ToolDetectionOptions;
}

function planOne(
  options: InstallRemoteSkillsOptions,
  skill: InstallRemoteSkillInput,
): InstallRemoteSkillPlanEntry {
  let incomingFiles: RemoteSkillFile[];
  try {
    incomingFiles = normalizeSkillFiles(skill);
  } catch (err) {
    return {
      id: skill.id,
      tool: options.tool,
      scope: options.scope,
      filePath: "",
      exists: false,
      action: "error",
      reason: (err as Error).message,
      files: [],
    };
  }
  if (!KEBAB.test(skill.id)) {
    return {
      id: skill.id,
      tool: options.tool,
      scope: options.scope,
      filePath: "",
      exists: false,
      action: "error",
      reason: `invalid skill id (kebab-case required): ${skill.id}`,
      files: [],
    };
  }
  const resolved = resolveSkillPath(
    options.tool,
    options.scope,
    options.projectRoot,
    options.detection,
  );
  const preferredFile = join(resolved.preferred, skill.id, "SKILL.md");
  const preferredDir = join(resolved.preferred, skill.id);
  if (isReadOnlySkillDir(resolved.preferred)) {
    return {
      id: skill.id,
      tool: options.tool,
      scope: options.scope,
      filePath: preferredFile,
      exists: existsSync(preferredFile),
      action: "error",
      reason: `read-only skill location (vendor-managed): ${resolved.preferred}`,
      files: planFiles(incomingFiles, preferredDir, "error"),
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
      files: planFiles(incomingFiles, preferredDir, "write"),
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
      files: planFiles(incomingFiles, join(existing.filePath, ".."), "skip"),
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
      files: planFiles(incomingFiles, join(existing.filePath, ".."), "error"),
    };
  }
  const existingDir = resolve(existing.filePath, "..");
  const incomingPaths = new Set(incomingFiles.map((file) => file.path));
  return {
    id: skill.id,
    tool: options.tool,
    scope: options.scope,
    filePath: existing.filePath,
    exists: true,
    action: "overwrite",
    existingContents: existing.contents,
    files: planFiles(incomingFiles, existingDir, "overwrite"),
    removedFiles: listRegularFiles(existingDir).filter((path) => !incomingPaths.has(path)),
  };
}

function assertSafeRelativeFilePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[a-z]:\//i.test(normalized) ||
    normalized.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`Invalid skill file path: ${path}`);
  }
  return normalized;
}

function decodeBase64(value: string, path: string): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error(`Invalid base64 contents for skill file: ${path}`);
  }
  return Buffer.from(value, "base64");
}

function normalizeSkillFiles(skill: InstallRemoteSkillInput): RemoteSkillFile[] {
  const files = skill.files ?? [
    {
      path: "SKILL.md",
      contentsBase64: Buffer.from(skill.contents, "utf-8").toString("base64"),
      size: Buffer.byteLength(skill.contents),
      mode: 0o644,
    },
  ];
  if (files.length === 0 || files.length > MAX_SKILL_FILES) {
    throw new Error(`Skill must contain between 1 and ${MAX_SKILL_FILES} files`);
  }
  const seen = new Set<string>();
  let totalBytes = 0;
  const normalized = files.map((file) => {
    const path = assertSafeRelativeFilePath(file.path);
    if (seen.has(path)) throw new Error(`Duplicate skill file path: ${path}`);
    seen.add(path);
    const contents = decodeBase64(file.contentsBase64, path);
    if (contents.byteLength !== file.size) throw new Error(`Incorrect size for skill file: ${path}`);
    totalBytes += contents.byteLength;
    const mode = file.mode ?? 0o644;
    if (!Number.isInteger(mode) || mode < 0 || mode > 0o777) {
      throw new Error(`Invalid mode for skill file: ${path}`);
    }
    return { path, contentsBase64: file.contentsBase64, size: contents.byteLength, mode };
  });
  if (totalBytes > MAX_SKILL_BYTES) throw new Error("Skill directory exceeds the 20 MiB size limit");
  const markdown = normalized.find((file) => file.path === "SKILL.md");
  if (!markdown) throw new Error("Skill directory must contain SKILL.md");
  if (decodeBase64(markdown.contentsBase64, markdown.path).toString("utf-8") !== skill.contents) {
    throw new Error("SKILL.md contents do not match the skill payload");
  }
  return normalized;
}

function listRegularFiles(root: string): string[] {
  const files: string[] = [];
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.push(toPosix(relative(root, path)));
    }
  }
  if (existsSync(root)) walk(root);
  return files.sort();
}

function planFiles(
  files: RemoteSkillFile[],
  targetDir: string,
  defaultAction: "write" | "overwrite" | "skip" | "error",
): InstallRemoteSkillPlanEntry["files"] {
  return files.map((file) => {
    const filePath = join(targetDir, ...file.path.split("/"));
    const exists = existsSync(filePath);
    return {
      path: file.path,
      filePath,
      exists,
      action: defaultAction === "overwrite" ? (exists ? "overwrite" : "write") : defaultAction,
    };
  });
}

function writeSkillDirectory(skill: InstallRemoteSkillInput, targetFile: string): void {
  const files = normalizeSkillFiles(skill);
  const targetDir = resolve(targetFile, "..");
  const parent = resolve(targetDir, "..");
  mkdirSync(parent, { recursive: true });
  const staging = mkdtempSync(join(parent, `.${skill.id}-install-`));
  const backup = `${targetDir}.coactl-backup-${randomUUID()}`;
  let backedUp = false;
  try {
    for (const file of files) {
      const destination = join(staging, ...file.path.split("/"));
      mkdirSync(resolve(destination, ".."), { recursive: true });
      writeFileSync(destination, decodeBase64(file.contentsBase64, file.path), { flag: "wx" });
      chmodSync(destination, file.mode ?? 0o644);
    }
    if (existsSync(targetDir)) {
      renameSync(targetDir, backup);
      backedUp = true;
    }
    renameSync(staging, targetDir);
    if (backedUp) rmSync(backup, { recursive: true, force: true });
  } catch (err) {
    rmSync(staging, { recursive: true, force: true });
    if (backedUp && existsSync(backup)) {
      rmSync(targetDir, { recursive: true, force: true });
      renameSync(backup, targetDir);
    }
    throw err;
  }
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
      writeSkillDirectory(skill, plan.filePath);
      results.push({
        id: skill.id,
        tool: options.tool,
        scope: options.scope,
        status: "written",
        filePath: plan.filePath,
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
