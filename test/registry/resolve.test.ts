import { describe, expect, it } from "vitest";
import { resolveRegistry } from "../../src/registry/resolve.js";
import type { LoadedAsset } from "../../src/sources/types.js";
import type { Manifest } from "../../src/schema/index.js";

const MANIFEST: Manifest = {
  sources: [{ name: "local-assets", type: "local", path: "./assets" }],
  resolution: { precedence: ["local-assets"] },
};

function makeLoaded(id: string, sourceName = "local-assets", readOnly = false): LoadedAsset {
  return {
    asset: {
      id,
      kind: "rule",
      name: id,
      version: "0.1.0",
      description: "test",
      activation: "auto",
      targets: ["claude-code"],
      body: "body.md",
    },
    sourceName,
    origin: { dir: `/assets/${id}` },
    readOnly,
  };
}

describe("resolveRegistry", () => {
  it("returns one ResolvedAsset per unique id from a single source", () => {
    const registry = resolveRegistry([makeLoaded("skill-one"), makeLoaded("rule-alpha")], MANIFEST);
    expect(registry.all()).toHaveLength(2);
    expect(registry.conflicts).toHaveLength(0);
  });

  it("all() returns assets sorted by id", () => {
    const registry = resolveRegistry(
      [makeLoaded("zebra"), makeLoaded("apple"), makeLoaded("mango")],
      MANIFEST,
    );
    expect(registry.all().map((r) => r.asset.id)).toEqual(["apple", "mango", "zebra"]);
  });

  it("get() returns the resolved asset or undefined", () => {
    const registry = resolveRegistry([makeLoaded("skill-one")], MANIFEST);
    expect(registry.get("skill-one")?.asset.id).toBe("skill-one");
    expect(registry.get("missing")).toBeUndefined();
  });

  it("records provenance with winningSource and candidates", () => {
    const registry = resolveRegistry([makeLoaded("skill-one")], MANIFEST);
    const { provenance } = registry.get("skill-one")!;
    expect(provenance.winningSource).toBe("local-assets");
    expect(provenance.candidates).toHaveLength(1);
    expect(provenance.candidates[0].sourceName).toBe("local-assets");
    expect(provenance.candidates[0].readOnly).toBe(false);
  });

  it("records conflicts when multiple sources provide the same id", () => {
    const registry = resolveRegistry(
      [makeLoaded("shared", "source-a"), makeLoaded("shared", "source-b")],
      MANIFEST,
    );
    expect(registry.conflicts).toHaveLength(1);
    expect(registry.conflicts[0].id).toBe("shared");
    expect(registry.conflicts[0].candidates).toContain("source-a");
    expect(registry.conflicts[0].candidates).toContain("source-b");
  });

  it("returns an empty registry for an empty asset list", () => {
    const registry = resolveRegistry([], MANIFEST);
    expect(registry.all()).toHaveLength(0);
    expect(registry.conflicts).toHaveLength(0);
  });
});
