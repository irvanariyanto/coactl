import { existsSync, statSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { homedir } from "node:os";
import { SKILL_TOOLS, SUPPORTED_TARGETS, type ScopeMode, type SkillTool, type Target } from "./schema.js";
import { projectPresenceCandidates, skillPathCandidates } from "./skill-paths.js";

export interface ToolInstallInfo {
  target: Target;
  installed: boolean;
  reason?: string;
  supportsSkills: boolean;
  presentInProject?: boolean;
}

export interface ToolDetectionOptions {
  env?: NodeJS.ProcessEnv;
  home?: string;
}

export interface SkillRoot {
  tool: SkillTool;
  scope: ScopeMode;
  dir: string;
}

function firstExistingPath(paths: string[]): string | undefined {
  return paths.find((path) => {
    try {
      return existsSync(path);
    } catch {
      return false;
    }
  });
}

function commandExists(command: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const pathValue = env.PATH ?? "";
  const extensions =
    process.platform === "win32" ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";") : [""];

  for (const dir of pathValue.split(delimiter).filter(Boolean)) {
    for (const ext of extensions) {
      const candidate = join(dir, `${command}${ext}`);
      try {
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
      } catch {
        // ignore
      }
    }
  }
  return undefined;
}

function homePath(home: string, ...parts: string[]): string {
  return join(home, ...parts);
}

export function toolInstallInfo(target: Target, options: ToolDetectionOptions = {}): ToolInstallInfo {
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const checks: Array<{ commands?: string[]; paths?: string[] }> = [];
  const supportsSkills = (SKILL_TOOLS as readonly string[]).includes(target);

  switch (target) {
    case "claude-code":
      checks.push({ commands: ["claude"], paths: [homePath(home, ".claude")] });
      break;
    case "codex":
      checks.push({
        commands: ["codex"],
        paths: [
          resolve(env.CODEX_HOME || homePath(home, ".codex")),
          homePath(home, ".codex"),
          homePath(home, ".codex", "skills"),
          homePath(home, ".agents"),
        ],
      });
      break;
    case "antigravity":
      checks.push({
        commands: ["agy", "antigravity"],
        paths: [resolve(env.ANTIGRAVITY_HOME || homePath(home, ".antigravity"))],
      });
      break;
    case "gemini":
      checks.push({
        commands: ["gemini"],
        paths: [resolve(env.GEMINI_HOME || homePath(home, ".gemini"))],
      });
      break;
    case "cline":
      checks.push({
        paths: [resolve(env.CLINE_HOME || homePath(home, "Cline")), homePath(home, ".cline")],
      });
      break;
    case "roo-code":
      checks.push({
        commands: ["roo"],
        paths: [resolve(env.ROO_CODE_HOME || homePath(home, ".roo"))],
      });
      break;
    case "continue":
      checks.push({
        commands: ["continue", "cn"],
        paths: [resolve(env.CONTINUE_HOME || homePath(home, ".continue"))],
      });
      break;
    case "aider":
      checks.push({
        commands: ["aider"],
        paths: [homePath(home, ".aider.conf.yml"), resolve(env.AIDER_HOME || homePath(home, ".aider"))],
      });
      break;
    case "opencode":
      checks.push({
        commands: ["opencode"],
        paths: [
          resolve(env.OPENCODE_HOME || homePath(home, ".config", "opencode")),
          homePath(home, ".opencode"),
          homePath(home, ".opencode", "skills"),
          homePath(home, ".config", "opencode"),
        ],
      });
      break;
    case "zed":
      checks.push({
        commands: ["zed"],
        paths: [resolve(env.ZED_HOME || homePath(home, ".config", "zed")), homePath(home, ".agents")],
      });
      break;
    case "jetbrains":
      checks.push({
        commands: ["idea", "pycharm", "webstorm", "phpstorm", "goland", "rubymine", "clion", "rider"],
        paths: [
          resolve(env.JETBRAINS_AI_HOME || homePath(home, ".aiassistant")),
          homePath(home, ".config", "JetBrains"),
          homePath(home, "Library", "Application Support", "JetBrains"),
        ],
      });
      break;
    case "cursor":
      checks.push({
        commands: ["cursor"],
        paths: [
          homePath(home, ".cursor"),
          homePath(home, ".cursor", "skills"),
          homePath(home, ".cursor", "skills-cursor"),
        ],
      });
      break;
    case "windsurf":
      checks.push({ commands: ["windsurf"], paths: [homePath(home, ".codeium", "windsurf")] });
      break;
    case "copilot":
      checks.push({
        paths: [
          homePath(home, ".config", "github-copilot"),
          homePath(home, ".config", "Code", "User", "globalStorage", "github.copilot"),
        ],
      });
      break;
  }

  for (const check of checks) {
    for (const command of check.commands ?? []) {
      const found = commandExists(command, env);
      if (found) return { target, installed: true, reason: `command:${command}`, supportsSkills };
    }
    const foundPath = firstExistingPath(check.paths ?? []);
    if (foundPath) return { target, installed: true, reason: `path:${foundPath}`, supportsSkills };
  }

  return { target, installed: false, supportsSkills };
}

export function detectToolInstallInfo(options: ToolDetectionOptions = {}): ToolInstallInfo[] {
  return SUPPORTED_TARGETS.map((target) => toolInstallInfo(target, options));
}

export function detectInstalledTargets(options: ToolDetectionOptions = {}): Target[] {
  return detectToolInstallInfo(options)
    .filter((t) => t.installed)
    .map((t) => t.target);
}

/** Native skill directories for a tool (project and/or global).
 * Emits one entry per candidate directory so list/scan covers all valid sources.
 */
export function skillRootsForTool(
  tool: SkillTool,
  projectRoot: string,
  options: ToolDetectionOptions = {},
): SkillRoot[] {
  const scopes: ScopeMode[] = ["project", "global"];
  return scopes.flatMap((scope) =>
    skillPathCandidates(tool, scope, projectRoot, options).map((dir) => ({
      tool,
      scope,
      dir,
    })),
  );
}

export function skillRoots(
  projectRoot: string,
  options: ToolDetectionOptions & { installedOnly?: boolean } = {},
): SkillRoot[] {
  const installedOnly = options.installedOnly ?? true;
  const installed = new Set(detectInstalledTargets(options));
  const tools = installedOnly
    ? SKILL_TOOLS.filter((t) => installed.has(t))
    : [...SKILL_TOOLS];

  return tools.flatMap((tool) => skillRootsForTool(tool, projectRoot, options));
}

export function isToolPresentInProject(tool: SkillTool, projectRoot: string): boolean {
  return projectPresenceCandidates(tool, projectRoot).some((p) => {
    try {
      return existsSync(p);
    } catch {
      return false;
    }
  });
}

export interface SkillToolInfo extends ToolInstallInfo {
  target: SkillTool;
  presentInProject: boolean;
}

/** Skill-capable tools with install + project presence flags. */
export function detectSkillTools(
  projectRoot: string,
  options: ToolDetectionOptions = {},
): SkillToolInfo[] {
  return SKILL_TOOLS.map((tool) => {
    const info = toolInstallInfo(tool, options);
    return {
      ...info,
      target: tool,
      presentInProject: isToolPresentInProject(tool, projectRoot),
    };
  });
}
