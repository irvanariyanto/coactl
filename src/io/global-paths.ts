import { homedir } from "node:os";
import { join } from "node:path";
import type { Target } from "../schema/index.js";

// Decision (PRD §11): --global and project assets are strictly separate targets.
// Project sync never touches global files and vice versa.
export function globalRootDir(): string {
  return homedir();
}

export function globalBasePath(target: Target): string {
  const home = homedir();
  switch (target) {
    case "claude-code": return join(home, ".claude");
    case "cursor": return join(home, ".cursor");
    case "windsurf": return home;
    case "copilot": return join(home, ".github");
  }
}
