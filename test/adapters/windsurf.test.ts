import { describe, expect, it } from "vitest";
import { WindsurfAdapter } from "../../src/adapters/windsurf.js";
import { loadAsset } from "../../src/schema/load.js";
import type { ResolvedAsset } from "../../src/registry/types.js";
import { join } from "node:path";

const FIXTURE_RULE_DIR = join(process.cwd(), "test/fixtures/workspace/assets/rule-alpha");

function makeResolved(assetDir: string): ResolvedAsset {
  const { asset, bodyText } = loadAsset(assetDir);
  return {
    asset,
    bodyText,
    sourceName: "test-source",
    readOnly: false,
    origin: { dir: assetDir },
    provenance: { winningSource: "test-source", candidates: [{ sourceName: "test-source", readOnly: false }] },
  };
}

describe("WindsurfAdapter", () => {
  const adapter = new WindsurfAdapter();

  it("has target = 'windsurf'", () => {
    expect(adapter.target).toBe("windsurf");
  });

  it("capability: rule=native, skill=degraded, command/workflow=skip", () => {
    expect(adapter.capability("rule")).toBe("native");
    expect(adapter.capability("skill")).toBe("degraded");
    expect(adapter.capability("command")).toBe("skip");
    expect(adapter.capability("workflow")).toBe("skip");
  });

  it("emits rule as managed block in .windsurfrules", () => {
    const resolved = makeResolved(FIXTURE_RULE_DIR);
    const files = adapter.emit(resolved);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe(".windsurfrules");
    expect(files[0].contents).toContain(`<!-- BEGIN coactl:${resolved.asset.id} -->`);
    expect(files[0].contents).toContain("DO NOT EDIT");
  });

  it("command and workflow return empty (skip)", () => {
    const resolved = makeResolved(FIXTURE_RULE_DIR);
    expect(adapter.emit({ ...resolved, asset: { ...resolved.asset, kind: "command" } })).toHaveLength(0);
    expect(adapter.emit({ ...resolved, asset: { ...resolved.asset, kind: "workflow" } })).toHaveLength(0);
  });

  it("output is idempotent", () => {
    const resolved = makeResolved(FIXTURE_RULE_DIR);
    expect(adapter.emit(resolved)[0].contents).toBe(adapter.emit(resolved)[0].contents);
  });
});
