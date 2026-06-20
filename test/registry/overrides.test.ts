import { describe, expect, it } from "vitest";
import { applyOverrides } from "../../src/registry/overrides.js";
import type { ResolvedAsset } from "../../src/registry/types.js";
import type { Manifest } from "../../src/schema/index.js";
import { join } from "node:path";

function makeResolved(
  overrides?: Record<string, unknown>,
  originDir = "/assets/test-rule",
): { resolved: ResolvedAsset; manifest: Manifest } {
  const resolved: ResolvedAsset = {
    asset: {
      id: "test-rule",
      kind: "rule",
      name: "Test Rule",
      version: "0.1.0",
      description: "desc",
      activation: "auto",
      targets: ["claude-code", "cursor"],
      scope: { languages: ["ts"], paths: ["src/**"] },
    },
    bodyText: "original body",
    sourceName: "external",
    readOnly: true,
    origin: { dir: originDir },
    provenance: { winningSource: "external", candidates: [{ sourceName: "external", readOnly: true }] },
  };
  const manifest: Manifest = {
    sources: [{ name: "external", type: "local", path: "./assets" }],
    resolution: { precedence: ["external"] },
    overrides: overrides as Manifest["overrides"],
  };
  return { resolved, manifest };
}

describe("applyOverrides", () => {
  it("returns asset unchanged when no override exists", () => {
    const { resolved, manifest } = makeResolved();
    expect(applyOverrides(resolved, manifest)).toBe(resolved);
  });

  it("replaces targets from override", () => {
    const { resolved, manifest } = makeResolved({ "test-rule": { targets: ["windsurf"] } });
    const result = applyOverrides(resolved, manifest);
    expect(result.asset.targets).toEqual(["windsurf"]);
    expect(resolved.asset.targets).toEqual(["claude-code", "cursor"]);
  });

  it("deep-merges scope override", () => {
    const { resolved, manifest } = makeResolved({ "test-rule": { scope: { paths: ["lib/**"] } } });
    const result = applyOverrides(resolved, manifest);
    expect(result.asset.scope?.paths).toEqual(["lib/**"]);
    expect(result.asset.scope?.languages).toEqual(["ts"]);
  });

  it("replaces bodyText when patch is set", () => {
    const fixturesDir = join(process.cwd(), "test/fixtures");
    const { resolved, manifest } = makeResolved({ "test-rule": { patch: "patches/test-rule.md" } }, fixturesDir);
    const result = applyOverrides(resolved, manifest);
    expect(result.bodyText).toContain("Patched rule content");
    expect(resolved.bodyText).toBe("original body");
  });

  it("does not mutate the original source asset", () => {
    const { resolved, manifest } = makeResolved({ "test-rule": { targets: ["copilot"] } });
    applyOverrides(resolved, manifest);
    expect(resolved.asset.targets).toEqual(["claude-code", "cursor"]);
  });
});
