import { describe, expect, it } from "vitest";
import { AntigravityAdapter } from "../../src/adapters/antigravity.js";
import type { ResolvedAsset } from "../../src/registry/types.js";

function asset(kind: "skill" | "command" | "rule" | "workflow"): ResolvedAsset {
  return {
    asset: {
      id: "review-code",
      kind,
      name: "Review Code",
      version: "1.0.0",
      description: "Review a code change.",
      activation: kind === "rule" ? "auto" : "manual",
      ...(kind === "command" ? { invocation: "/review-code" } : {}),
      targets: ["claude-code", "antigravity"],
    },
    bodyText: "# Review\n\nInspect the change.\n",
    sourceName: "local",
    readOnly: false,
    origin: { dir: "/tmp/review-code" },
    provenance: { winningSource: "local", candidates: [{ sourceName: "local", readOnly: false }] },
  };
}

describe("AntigravityAdapter", () => {
  const adapter = new AntigravityAdapter();

  it("maps project skills, rules, and commands to Antigravity locations", () => {
    const skill = adapter.emit(asset("skill"), { scope: "project" });
    const rule = adapter.emit(asset("rule"), { scope: "project" });
    const command = adapter.emit(asset("command"), { scope: "project" });

    expect(skill[0].path).toBe(".antigravity/skills/review-code/SKILL.md");
    expect(skill[0].contents).toContain("name: review-code");
    expect(rule[0].path).toBe("AGENTS.md");
    expect(rule[0].contents).toContain("<!-- BEGIN coactl:review-code -->");
    expect(command[0].path).toBe(".antigravity/commands/review-code.md");
    expect(command[0].contents).toContain("invocation");
  });

  it("uses ANTIGRAVITY_HOME-style global paths when provided", () => {
    const context = { scope: "global" as const, antigravityHome: "/tmp/antigravity-home" };
    const skill = adapter.emit(asset("skill"), context);
    const rule = adapter.emit(asset("rule"), context);

    expect(skill[0].path).toBe("/tmp/antigravity-home/skills/review-code/SKILL.md");
    expect(rule[0].path).toBe("/tmp/antigravity-home/AGENTS.md");
  });

  it("does not emit workflows", () => {
    expect(adapter.emit(asset("workflow"), { scope: "project" })).toEqual([]);
  });
});
