import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { UrlSource } from "../../src/sources/url.js";

const TMP_DIR = join(process.cwd(), ".tmp-url-fixture");
const TARBALL = join(TMP_DIR, "bundle.tar.gz");

const ASSET_YAML = `id: url-rule
kind: rule
name: URL Rule
version: 0.1.0
description: A test rule from a url source
activation: auto
targets:
  - claude-code
body: body.md
`;

beforeAll(() => {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true });
  const assetDir = join(TMP_DIR, "src", "url-rule");
  mkdirSync(assetDir, { recursive: true });
  writeFileSync(join(assetDir, "asset.yaml"), ASSET_YAML);
  writeFileSync(join(assetDir, "body.md"), "# URL Rule\n\nTest body.\n");
  execSync(`tar -czf ${TARBALL} -C ${join(TMP_DIR, "src")} .`, { stdio: "pipe" });
});

afterAll(() => {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true });
});

describe("UrlSource", () => {
  it("loads assets from a local tarball and returns readOnly: true", async () => {
    const source = new UrlSource("url-source", `file://${TARBALL}`);
    const { assets, errors } = await source.load();
    expect(errors).toHaveLength(0);
    expect(assets).toHaveLength(1);
    expect(assets[0].asset.id).toBe("url-rule");
    expect(assets[0].readOnly).toBe(true);
    expect(assets[0].sourceName).toBe("url-source");
  });

  it("returns sorted assets deterministically", async () => {
    const source = new UrlSource("url-source", `file://${TARBALL}`);
    const { assets } = await source.load();
    const ids = assets.map((a) => a.asset.id);
    expect(ids).toEqual([...ids].sort());
  });
});
