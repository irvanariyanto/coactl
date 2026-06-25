import { existsSync, statSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { homedir } from "node:os";
import { SUPPORTED_TARGETS, type Target } from "../schema/index.js";

export interface ToolInstallInfo {
  target: Target;
  installed: boolean;
  reason?: string;
}

export interface ToolDetectionOptions {
  env?: NodeJS.ProcessEnv;
  home?: string;
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
  const extensions = process.platform === "win32"
    ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];

  for (const dir of pathValue.split(delimiter).filter(Boolean)) {
    for (const ext of extensions) {
      const candidate = join(dir, `${command}${ext}`);
      try {
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
      } catch {
        // Ignore unreadable PATH entries.
      }
    }
  }
  return undefined;
}

function envPath(name: string, fallback: string, env: NodeJS.ProcessEnv): string {
  return resolve(env[name] || fallback);
}

function homePath(home: string, ...parts: string[]): string {
  return join(home, ...parts);
}

export function toolInstallInfo(target: Target, options: ToolDetectionOptions = {}): ToolInstallInfo {
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const checks: Array<{ commands?: string[]; paths?: string[] }> = [];

  switch (target) {
    case "claude-code":
      checks.push({ commands: ["claude"], paths: [homePath(home, ".claude")] });
      break;
    case "codex":
      checks.push({ commands: ["codex"], paths: [envPath("CODEX_HOME", homePath(home, ".codex"), env)] });
      break;
    case "antigravity":
      checks.push({ commands: ["agy", "antigravity"], paths: [envPath("ANTIGRAVITY_HOME", homePath(home, ".antigravity"), env)] });
      break;
    case "gemini":
      checks.push({ commands: ["gemini"], paths: [envPath("GEMINI_HOME", homePath(home, ".gemini"), env)] });
      break;
    case "cline":
      checks.push({ paths: [envPath("CLINE_HOME", homePath(home, "Cline"), env), homePath(home, ".cline")] });
      break;
    case "roo-code":
      checks.push({ commands: ["roo"], paths: [envPath("ROO_CODE_HOME", homePath(home, ".roo"), env)] });
      break;
    case "continue":
      checks.push({ commands: ["continue", "cn"], paths: [envPath("CONTINUE_HOME", homePath(home, ".continue"), env)] });
      break;
    case "aider":
      checks.push({ commands: ["aider"], paths: [homePath(home, ".aider.conf.yml"), envPath("AIDER_HOME", homePath(home, ".aider"), env)] });
      break;
    case "opencode":
      checks.push({ commands: ["opencode"], paths: [envPath("OPENCODE_HOME", homePath(home, ".config", "opencode"), env)] });
      break;
    case "zed":
      checks.push({ commands: ["zed"], paths: [envPath("ZED_HOME", homePath(home, ".config", "zed"), env)] });
      break;
    case "jetbrains":
      checks.push({
        commands: ["idea", "pycharm", "webstorm", "phpstorm", "goland", "rubymine", "clion", "rider"],
        paths: [
          envPath("JETBRAINS_AI_HOME", homePath(home, ".aiassistant"), env),
          homePath(home, ".config", "JetBrains"),
          homePath(home, ".local", "share", "JetBrains"),
          homePath(home, "Library", "Application Support", "JetBrains"),
        ],
      });
      break;
    case "cursor":
      checks.push({ commands: ["cursor"], paths: [homePath(home, ".cursor")] });
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
      if (found) return { target, installed: true, reason: `command:${command}` };
    }
    const foundPath = firstExistingPath(check.paths ?? []);
    if (foundPath) return { target, installed: true, reason: `path:${foundPath}` };
  }

  return { target, installed: false };
}

export function detectInstalledTargets(options: ToolDetectionOptions = {}): Target[] {
  return SUPPORTED_TARGETS.filter((target) => toolInstallInfo(target, options).installed);
}

export function detectToolInstallInfo(options: ToolDetectionOptions = {}): ToolInstallInfo[] {
  return SUPPORTED_TARGETS.map((target) => toolInstallInfo(target, options));
}
