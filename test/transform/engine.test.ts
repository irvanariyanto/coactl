import { describe, expect, it } from "vitest";
import { transform } from "../../src/transform/engine.js";
import { resolveRegistry } from "../../src/registry/resolve.js";
import { loadAsset } from "../../src/schema/load.js";
import type { Manifest } from "../../src/schema/index.js";
import { join } from "node:path";

const FIXTURE_SKILL_DIR = join(process.cwd(), "test/fixtures/workspace/assets/skill-one");
const FIXTURE_RULE_DIR = join(process.cwd(), "test/fixtures/workspace/assets/rule-alpha");

const MANIFEST: Manifest = {
  sources: [{ name: "test-source", type: "local", path: "./assets" }],
  resolution: { precedence: ["test-source"] },
};

describe("transform engine", () => {
  it("dispatches asset to each target and aggregates files", () => {
    const { asset: skillAsset } = loadAsset(FIXTURE_SKILL_DIR);
    const loaded = [
      {
        asset: skillAsset,
        sourceName: "test-source",
        origin: { dir: FIXTURE_SKILL_DIR },
        readOnly: false,
      },
    ];
    const registry = resolveRegistry(loaded, MANIFEST);
    const result = transform(registry, MANIFEST);

    expect(result.files.length).toBeGreaterThan(0);
    expect(result.files.some((f) => f.path.includes(".claude"))).toBe(true);
    expect(result.files.some((f) => f.path.includes(".cursor"))).toBe(true);
  });

  it("generates degraded warning for degraded capabilities", () => {
    const { asset: skillAsset } = loadAsset(FIXTURE_SKILL_DIR);
    const loaded = [
      {
        asset: skillAsset,
        sourceName: "test-source",
        origin: { dir: FIXTURE_SKILL_DIR },
        readOnly: false,
      },
    ];
    const registry = resolveRegistry(loaded, MANIFEST);
    const result = transform(registry, MANIFEST);

    const warnings = result.diagnostics.filter((d) => d.level === "warn");
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.target === "cursor")).toBe(true);
  });

  it("filters by kind option", () => {
    const { asset: skillAsset } = loadAsset(FIXTURE_SKILL_DIR);
    const { asset: ruleAsset } = loadAsset(FIXTURE_RULE_DIR);
    const loaded = [
      {
        asset: skillAsset,
        sourceName: "test-source",
        origin: { dir: FIXTURE_SKILL_DIR },
        readOnly: false,
      },
      {
        asset: ruleAsset,
        sourceName: "test-source",
        origin: { dir: FIXTURE_RULE_DIR },
        readOnly: false,
      },
    ];
    const registry = resolveRegistry(loaded, MANIFEST);
    const result = transform(registry, MANIFEST, { kinds: ["rule"] });

    const assetIds = result.files.map((f) => f.assetId);
    expect(assetIds).toContain(ruleAsset.id);
    expect(assetIds).not.toContain(skillAsset.id);
  });

  it("filters by target option", () => {
    const { asset: skillAsset } = loadAsset(FIXTURE_SKILL_DIR);
    const loaded = [
      {
        asset: skillAsset,
        sourceName: "test-source",
        origin: { dir: FIXTURE_SKILL_DIR },
        readOnly: false,
      },
    ];
    const registry = resolveRegistry(loaded, MANIFEST);
    const result = transform(registry, MANIFEST, { targets: ["claude-code"] });

    expect(result.files.every((f) => !f.path.includes(".cursor"))).toBe(true);
  });

  it("returns files with correct assetId", () => {
    const { asset: skillAsset } = loadAsset(FIXTURE_SKILL_DIR);
    const loaded = [
      {
        asset: skillAsset,
        sourceName: "test-source",
        origin: { dir: FIXTURE_SKILL_DIR },
        readOnly: false,
      },
    ];
    const registry = resolveRegistry(loaded, MANIFEST);
    const result = transform(registry, MANIFEST, { targets: ["claude-code"] });

    expect(result.files.every((f) => f.assetId === skillAsset.id)).toBe(true);
  });

  it("aggregates diagnostics from all assets and targets", () => {
    const { asset: skillAsset } = loadAsset(FIXTURE_SKILL_DIR);
    const loaded = [
      {
        asset: skillAsset,
        sourceName: "test-source",
        origin: { dir: FIXTURE_SKILL_DIR },
        readOnly: false,
      },
    ];
    const registry = resolveRegistry(loaded, MANIFEST);
    const result = transform(registry, MANIFEST);

    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.every((d) => d.assetId === skillAsset.id)).toBe(true);
  });
});
