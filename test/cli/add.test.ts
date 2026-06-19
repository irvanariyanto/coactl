import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadAsset } from "../../src/schema/load.js";

const cliPath = join(process.cwd(), "dist/cli/index.js");

function run(args: string[], cwd: string): string {
  try {
    return execFileSync("node", [cliPath, ...args], {
      encoding: "utf-8",
      cwd,
      env: { ...process.env, FORCE_COLOR: "0" },
    });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string };
    return (e.stdout ?? "") + (e.stderr ?? "");
  }
}

describe("add command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(process.cwd(), `.tmp-add-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  for (const kind of ["skill", "command", "rule", "workflow"] as const) {
    it(`scaffolds a valid ${kind} asset that passes schema validation`, () => {
      run(["add", "--kind", kind, `test-${kind}`], tmpDir);
      const assetDir = join(tmpDir, `assets/test-${kind}`);
      expect(existsSync(join(assetDir, "asset.yaml"))).toBe(true);
      expect(existsSync(join(assetDir, "body.md"))).toBe(true);
      const { asset } = loadAsset(assetDir);
      expect(asset.id).toBe(`test-${kind}`);
      expect(asset.kind).toBe(kind);
    });
  }

  it("command kind includes invocation field", () => {
    run(["add", "--kind", "command", "my-cmd"], tmpDir);
    const yaml = readFileSync(join(tmpDir, "assets/my-cmd/asset.yaml"), "utf-8");
    expect(yaml).toContain("invocation: /my-cmd");
  });

  it("workflow kind includes steps with loop", () => {
    run(["add", "--kind", "workflow", "my-flow"], tmpDir);
    const yaml = readFileSync(join(tmpDir, "assets/my-flow/asset.yaml"), "utf-8");
    expect(yaml).toContain("steps:");
    expect(yaml).toContain("loop:");
  });

  it("errors without --force when asset already exists", () => {
    run(["add", "--kind", "skill", "my-skill"], tmpDir);
    const output = run(["add", "--kind", "skill", "my-skill"], tmpDir);
    expect(output).toContain("already exists");
  });

  it("overwrites with --force", () => {
    run(["add", "--kind", "skill", "my-skill"], tmpDir);
    run(["add", "--kind", "skill", "my-skill", "--force"], tmpDir);
    expect(existsSync(join(tmpDir, "assets/my-skill/asset.yaml"))).toBe(true);
  });

  it("rejects non-kebab-case id without writing files", () => {
    const output = run(["add", "--kind", "skill", "Invalid_ID"], tmpDir);
    expect(existsSync(join(tmpDir, "assets/Invalid_ID"))).toBe(false);
    expect(output).toContain("kebab-case");
  });

  it("rejects unknown kind without writing files", () => {
    const output = run(["add", "--kind", "unknown", "my-asset"], tmpDir);
    expect(existsSync(join(tmpDir, "assets/my-asset"))).toBe(false);
    expect(output).toContain("unknown");
  });
});
