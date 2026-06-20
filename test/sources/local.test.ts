import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { LocalSource } from "../../src/sources/local.js";
import { buildSourceLoaders } from "../../src/sources/registry-of-sources.js";

const WORKSPACE_DIR = join(process.cwd(), "test/fixtures/workspace");
const MANIFEST_PATH = join(process.cwd(), "test/fixtures/workspace/agent.manifest.yaml");

describe("LocalSource", () => {
  it("loads all valid assets from the source path", async () => {
    const source = new LocalSource("local-assets", WORKSPACE_DIR);
    const { assets } = await source.load();
    const ids = assets.map((a) => a.asset.id);
    expect(ids).toContain("skill-one");
    expect(ids).toContain("rule-alpha");
  });

  it("returns assets in stable sorted-by-id order", async () => {
    const source = new LocalSource("local-assets", WORKSPACE_DIR);
    const { assets } = await source.load();
    const ids = assets.map((a) => a.asset.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("sets sourceName and readOnly: false on each loaded asset", async () => {
    const source = new LocalSource("local-assets", WORKSPACE_DIR);
    const { assets } = await source.load();
    const one = assets.find((a) => a.asset.id === "skill-one")!;
    expect(one.sourceName).toBe("local-assets");
    expect(one.readOnly).toBe(false);
    expect(one.origin.dir).toContain("skill-one");
  });

  it("populates bodyText for each loaded asset", async () => {
    const source = new LocalSource("local-assets", WORKSPACE_DIR);
    const { assets } = await source.load();
    const rule = assets.find((a) => a.asset.id === "rule-alpha")!;
    expect(rule.bodyText).toContain("Rule Alpha");
  });

  it("reports errors for invalid assets but still returns valid ones", async () => {
    const source = new LocalSource("local-assets", WORKSPACE_DIR);
    const { assets, errors } = await source.load();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.dir.includes("broken-body"))).toBe(true);
    expect(assets.some((a) => a.asset.id === "skill-one")).toBe(true);
    expect(assets.some((a) => a.asset.id === "rule-alpha")).toBe(true);
  });

  it("skips non-coactl .md files without targets frontmatter", async () => {
    const source = new LocalSource("local-assets", WORKSPACE_DIR);
    const { assets } = await source.load();
    expect(assets.every((a) => a.asset.id !== "not-an-asset")).toBe(true);
  });
});

describe("buildSourceLoaders", () => {
  it("builds a LocalSource loader from a manifest with a local source", async () => {
    const loaders = buildSourceLoaders(MANIFEST_PATH);
    expect(loaders).toHaveLength(1);
    const { assets } = await loaders[0].load();
    expect(assets.length).toBeGreaterThan(0);
  });

  it("throws for unimplemented source types", () => {
    expect(() => buildSourceLoaders(MANIFEST_PATH + ".nonexistent")).toThrow();
  });
});
