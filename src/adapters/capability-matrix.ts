import type { AssetKind, Target } from "../schema/index.js";
import type { AdapterContext, Capability } from "./types.js";

// Per PRD §6 adapter capability matrix
export const CAPABILITY_MATRIX: Record<Target, Record<AssetKind, Capability>> = {
  "claude-code": {
    skill: "native",
    command: "native",
    rule: "native",
    workflow: "native",
  },
  codex: {
    skill: "native",
    command: "degraded",
    rule: "native",
    workflow: "skip",
  },
  cursor: {
    skill: "degraded",
    command: "degraded",
    rule: "native",
    workflow: "skip",
  },
  windsurf: {
    skill: "degraded",
    command: "skip",
    rule: "native",
    workflow: "skip",
  },
  copilot: {
    skill: "degraded",
    command: "skip",
    rule: "native",
    workflow: "skip",
  },
};

export function capabilityFor(target: Target, kind: AssetKind, scope?: AdapterContext["scope"]): Capability {
  if (target === "codex" && kind === "command" && scope === "project") return "skip";
  return CAPABILITY_MATRIX[target][kind];
}
