import { describe, expect, it } from "vitest";
import { ClaudeCodeAdapter } from "../../src/adapters/claude-code.js";
import { CursorAdapter } from "../../src/adapters/cursor.js";
import { loadAsset } from "../../src/schema/load.js";
import type { ResolvedAsset } from "../../src/registry/types.js";
import { join } from "node:path";

const FIXTURE_SKILL_DIR = join(process.cwd(), "test/fixtures/workspace/assets/skill-one");
const FIXTURE_RULE_DIR = join(process.cwd(), "test/fixtures/workspace/assets/rule-alpha");

function makeResolvedAsset(assetDir: string, sourceName = "test-source"): ResolvedAsset {
  const { asset, bodyText } = loadAsset(assetDir);
  return {
    asset,
    bodyText,
    sourceName,
    readOnly: false,
    origin: { dir: assetDir },
    provenance: {
      winningSource: sourceName,
      candidates: [{ sourceName, readOnly: false }],
    },
  };
}

describe("ClaudeCodeAdapter", () => {
  const adapter = new ClaudeCodeAdapter();

  it("has target = 'claude-code'", () => {
    expect(adapter.target).toBe("claude-code");
  });

  it("capability() returns 'native' for all kinds", () => {
    for (const kind of ["skill", "command", "rule", "workflow"] as const) {
      expect(adapter.capability(kind)).toBe("native");
    }
  });

  it("emits nothing for skills (source files live in .claude/ already)", () => {
    const asset = makeResolvedAsset(FIXTURE_SKILL_DIR);
    const files = adapter.emit(asset);
    expect(files).toHaveLength(0);
  });

  it("emits rule as part of CLAUDE.md with managed fences", () => {
    const asset = makeResolvedAsset(FIXTURE_RULE_DIR);
    const files = adapter.emit(asset);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("CLAUDE.md");
    expect(files[0].contents).toContain(`<!-- BEGIN coactl:${asset.asset.id} -->`);
    expect(files[0].contents).toContain(`<!-- END coactl:${asset.asset.id} -->`);
    expect(files[0].contents).toContain("DO NOT EDIT");
  });

  it("emits are idempotent (same rule asset → same output)", () => {
    const asset = makeResolvedAsset(FIXTURE_RULE_DIR);
    const files1 = adapter.emit(asset);
    const files2 = adapter.emit(asset);
    expect(files1[0].contents).toBe(files2[0].contents);
  });
});

describe("CursorAdapter", () => {
  const adapter = new CursorAdapter();

  it("has target = 'cursor'", () => {
    expect(adapter.target).toBe("cursor");
  });

  it("capability() returns native for rule, degraded for skill/command, skip for workflow", () => {
    expect(adapter.capability("rule")).toBe("native");
    expect(adapter.capability("skill")).toBe("degraded");
    expect(adapter.capability("command")).toBe("degraded");
    expect(adapter.capability("workflow")).toBe("skip");
  });

  it("emits rule as .cursor/rules/<id>.mdc with front-matter", () => {
    const asset = makeResolvedAsset(FIXTURE_RULE_DIR);
    const files = adapter.emit(asset);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe(`.cursor/rules/${asset.asset.id}.mdc`);
    expect(files[0].contents).toContain("---");
    expect(files[0].contents).toContain("description:");
    expect(files[0].contents).toContain("globs:");
    expect(files[0].contents).toContain("alwaysApply:");
  });

  it("emits are idempotent (same asset → same hash)", () => {
    const asset = makeResolvedAsset(FIXTURE_RULE_DIR);
    const files1 = adapter.emit(asset);
    const files2 = adapter.emit(asset);
    expect(files1[0].contents).toBe(files2[0].contents);
  });
});
