import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GitSource } from "../../src/sources/git.js";

const TMP_REPO = join(process.cwd(), ".tmp-git-fixture");

const ASSET_YAML = `id: git-rule
kind: rule
name: Git Rule
version: 0.1.0
description: A test rule from a git source
activation: auto
targets:
  - claude-code
body: body.md
`;

beforeAll(() => {
  if (existsSync(TMP_REPO)) rmSync(TMP_REPO, { recursive: true });
  mkdirSync(join(TMP_REPO, "assets", "git-rule"), { recursive: true });
  writeFileSync(join(TMP_REPO, "assets", "git-rule", "asset.yaml"), ASSET_YAML);
  writeFileSync(join(TMP_REPO, "assets", "git-rule", "body.md"), "# Git Rule\n\nTest body.\n");
  execSync(`git -C ${TMP_REPO} init -b main`, { stdio: "pipe" });
  execSync(`git -C ${TMP_REPO} config user.email "test@test.com"`, { stdio: "pipe" });
  execSync(`git -C ${TMP_REPO} config user.name "Test"`, { stdio: "pipe" });
  execSync(`git -C ${TMP_REPO} add .`, { stdio: "pipe" });
  execSync(`git -C ${TMP_REPO} commit -m "add test asset"`, { stdio: "pipe" });
});

afterAll(() => {
  if (existsSync(TMP_REPO)) rmSync(TMP_REPO, { recursive: true });
});

describe("GitSource", () => {
  it("loads assets from a local git repo and returns readOnly: true", async () => {
    const source = new GitSource("git-source", TMP_REPO, "main", "assets");
    const { assets, errors } = await source.load();
    expect(errors).toHaveLength(0);
    expect(assets).toHaveLength(1);
    expect(assets[0].asset.id).toBe("git-rule");
    expect(assets[0].readOnly).toBe(true);
    expect(assets[0].sourceName).toBe("git-source");
  });

  it("records a resolved commit hash", async () => {
    const source = new GitSource("git-source", TMP_REPO, "main", "assets");
    const { assets } = await source.load();
    expect(assets[0].asset.id).toBe("git-rule");
  });

  it("returns sorted assets deterministically", async () => {
    const source = new GitSource("git-source", TMP_REPO, "main", "assets");
    const { assets } = await source.load();
    const ids = assets.map((a) => a.asset.id);
    expect(ids).toEqual([...ids].sort());
  });
});
