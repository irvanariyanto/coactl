import { describe, expect, it } from "vitest";
import { CursorAdapter } from "../../src/adapters/cursor.js";
import { loadAsset } from "../../src/schema/load.js";
import type { ResolvedAsset } from "../../src/registry/types.js";
import { join } from "node:path";

const FIXTURE_RULE_DIR = join(process.cwd(), "test/fixtures/workspace/assets/rule-alpha");

function makeResolvedAsset(assetDir: string, sourceName = "test-source"): ResolvedAsset {
  const { asset } = loadAsset(assetDir);
  return {
    asset,
    sourceName,
    readOnly: false,
    origin: { dir: assetDir },
    provenance: {
      winningSource: sourceName,
      candidates: [{ sourceName, readOnly: false }],
    },
  };
}

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

  it("emits rule as .cursor/rules/<id>.mdc with YAML front-matter", () => {
    const asset = makeResolvedAsset(FIXTURE_RULE_DIR);
    const files = adapter.emit(asset);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe(`.cursor/rules/${asset.asset.id}.mdc`);
    expect(files[0].contents).toContain("---");
    expect(files[0].contents).toContain("description:");
    expect(files[0].contents).toContain("globs:");
    expect(files[0].contents).toContain("alwaysApply:");
  });

  it("workflow returns empty array (skip)", () => {
    const asset = makeResolvedAsset(FIXTURE_RULE_DIR);
    asset.asset.kind = "workflow";
    const files = adapter.emit(asset);
    expect(files).toHaveLength(0);
  });

  it("emits are idempotent", () => {
    const asset = makeResolvedAsset(FIXTURE_RULE_DIR);
    const files1 = adapter.emit(asset);
    const files2 = adapter.emit(asset);
    expect(files1[0].contents).toBe(files2[0].contents);
  });
});
