import { describe, expect, it } from "vitest";
import { CAPABILITY_MATRIX, capabilityFor } from "../../src/adapters/capability-matrix.js";
import { NoopAdapter } from "../../src/adapters/types.js";
import { ASSET_KINDS, SUPPORTED_TARGETS } from "../../src/schema/index.js";
import type { ResolvedAsset } from "../../src/registry/types.js";

describe("CAPABILITY_MATRIX", () => {
  it("keeps Claude Code as the first reference target", () => {
    expect(SUPPORTED_TARGETS[0]).toBe("claude-code");
  });

  it("covers every target and kind combination", () => {
    for (const target of SUPPORTED_TARGETS) {
      for (const kind of ASSET_KINDS) {
        expect(["native", "degraded", "skip"]).toContain(CAPABILITY_MATRIX[target][kind]);
      }
    }
  });

  it("claude-code: all kinds are native", () => {
    for (const kind of ASSET_KINDS) {
      expect(CAPABILITY_MATRIX["claude-code"][kind]).toBe("native");
    }
  });

  it("codex: skill/rule=native, command=degraded, workflow=skip", () => {
    expect(CAPABILITY_MATRIX.codex.skill).toBe("native");
    expect(CAPABILITY_MATRIX.codex.rule).toBe("native");
    expect(CAPABILITY_MATRIX.codex.command).toBe("degraded");
    expect(CAPABILITY_MATRIX.codex.workflow).toBe("skip");
  });

  it("cursor: skill=degraded, command=degraded, rule=native, workflow=skip", () => {
    expect(CAPABILITY_MATRIX["cursor"]["skill"]).toBe("degraded");
    expect(CAPABILITY_MATRIX["cursor"]["command"]).toBe("degraded");
    expect(CAPABILITY_MATRIX["cursor"]["rule"]).toBe("native");
    expect(CAPABILITY_MATRIX["cursor"]["workflow"]).toBe("skip");
  });

  it("windsurf: skill=degraded, command=skip, rule=native, workflow=skip", () => {
    expect(CAPABILITY_MATRIX["windsurf"]["skill"]).toBe("degraded");
    expect(CAPABILITY_MATRIX["windsurf"]["command"]).toBe("skip");
    expect(CAPABILITY_MATRIX["windsurf"]["rule"]).toBe("native");
    expect(CAPABILITY_MATRIX["windsurf"]["workflow"]).toBe("skip");
  });

  it("copilot: skill=degraded, command=skip, rule=native, workflow=skip", () => {
    expect(CAPABILITY_MATRIX["copilot"]["skill"]).toBe("degraded");
    expect(CAPABILITY_MATRIX["copilot"]["command"]).toBe("skip");
    expect(CAPABILITY_MATRIX["copilot"]["rule"]).toBe("native");
    expect(CAPABILITY_MATRIX["copilot"]["workflow"]).toBe("skip");
  });
});

describe("capabilityFor", () => {
  it('capabilityFor("windsurf", "command") === "skip"', () => {
    expect(capabilityFor("windsurf", "command")).toBe("skip");
  });

  it("returns native for claude-code + any kind", () => {
    for (const kind of ASSET_KINDS) {
      expect(capabilityFor("claude-code", kind)).toBe("native");
    }
  });

  it("skips Codex commands in project scope", () => {
    expect(capabilityFor("codex", "command", "project")).toBe("skip");
    expect(capabilityFor("codex", "command", "global")).toBe("degraded");
  });
});

describe("NoopAdapter", () => {
  it("implements Adapter: target set, capability returns skip, emit returns []", () => {
    const adapter = new NoopAdapter("cursor");
    expect(adapter.target).toBe("cursor");
    expect(adapter.capability("skill")).toBe("skip");
    expect(adapter.emit({} as ResolvedAsset)).toEqual([]);
  });
});
