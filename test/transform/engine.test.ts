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

function makeLoaded(assetDir: string) {
  const { asset, bodyText } = loadAsset(assetDir);
  return { asset, bodyText, sourceName: "test-source", origin: { dir: assetDir }, readOnly: false };
}

describe("transform engine", () => {
  it("dispatches asset to each target and aggregates files", () => {
    const loaded = [makeLoaded(FIXTURE_RULE_DIR)];
    const registry = resolveRegistry(loaded, MANIFEST);
    const result = transform(registry, MANIFEST);

    expect(result.files.length).toBeGreaterThan(0);
    expect(result.files.some((f) => f.path.includes(".claude/rules"))).toBe(true);
    expect(result.files.some((f) => f.path.includes(".cursor"))).toBe(true);
  });

  it("generates degraded warning for degraded capabilities", () => {
    const loaded = [makeLoaded(FIXTURE_SKILL_DIR)];
    const registry = resolveRegistry(loaded, MANIFEST);
    const result = transform(registry, MANIFEST);

    const warnings = result.diagnostics.filter((d) => d.level === "warn");
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.target === "cursor")).toBe(true);
  });

  it("filters by kind option", () => {
    const skillLoaded = makeLoaded(FIXTURE_SKILL_DIR);
    const ruleLoaded = makeLoaded(FIXTURE_RULE_DIR);
    const registry = resolveRegistry([skillLoaded, ruleLoaded], MANIFEST);
    const result = transform(registry, MANIFEST, { kinds: ["rule"] });

    const assetIds = result.files.map((f) => f.assetId);
    expect(assetIds).toContain(ruleLoaded.asset.id);
    expect(assetIds).not.toContain(skillLoaded.asset.id);
  });

  it("filters by target option", () => {
    const loaded = [makeLoaded(FIXTURE_RULE_DIR)];
    const registry = resolveRegistry(loaded, MANIFEST);
    const result = transform(registry, MANIFEST, { targets: ["claude-code"] });

    expect(result.files.every((f) => !f.path.includes(".cursor"))).toBe(true);
  });

  it("returns files with correct assetId", () => {
    const loaded = [makeLoaded(FIXTURE_RULE_DIR)];
    const registry = resolveRegistry(loaded, MANIFEST);
    const result = transform(registry, MANIFEST, { targets: ["claude-code"] });

    expect(result.files.every((f) => f.assetId === loaded[0].asset.id)).toBe(true);
  });

  it("aggregates diagnostics from all assets and targets", () => {
    const loaded = [makeLoaded(FIXTURE_SKILL_DIR)];
    const registry = resolveRegistry(loaded, MANIFEST);
    const result = transform(registry, MANIFEST);

    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.every((d) => d.assetId === loaded[0].asset.id)).toBe(true);
  });
});
