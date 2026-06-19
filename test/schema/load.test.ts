import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { loadAsset } from "../../src/schema/load.js";
import { ValidationError } from "../../src/schema/errors.js";

const FIXTURES = join(process.cwd(), "test/fixtures/assets");

describe("loadAsset", () => {
  it("returns parsed asset and resolved dir for a valid asset", () => {
    const { asset, dir } = loadAsset(join(FIXTURES, "valid-skill"));
    expect(asset.id).toBe("valid-skill");
    expect(asset.kind).toBe("skill");
    expect(asset.version).toBe("0.1.0");
    expect(dir).toBeTruthy();
  });

  it("throws ValidationError with body path when body file is missing", () => {
    let caught: unknown;
    try {
      loadAsset(join(FIXTURES, "missing-body"));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    const ve = caught as ValidationError;
    expect(ve.issues.some((i) => i.path === "body")).toBe(true);
    expect(ve.message).toContain("nonexistent.md");
  });

  it("throws ValidationError with (yaml) path for malformed YAML", () => {
    let caught: unknown;
    try {
      loadAsset(join(FIXTURES, "bad-yaml"));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    const ve = caught as ValidationError;
    expect(ve.issues.some((i) => i.path === "(yaml)")).toBe(true);
    // message should not be a raw stack trace
    expect(ve.message).not.toContain("at Object.");
  });

  it("throws ValidationError with field-specific paths for schema violations", () => {
    let caught: unknown;
    try {
      loadAsset(join(FIXTURES, "invalid-schema"));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    const ve = caught as ValidationError;
    expect(ve.issues.length).toBeGreaterThan(0);
    // id, kind, version, activation, targets should all fail
    const paths = ve.issues.map((i) => i.path);
    expect(paths.some((p) => p === "id" || p === "kind" || p === "version")).toBe(true);
  });

  it("thrown ValidationError carries the file path", () => {
    let caught: unknown;
    try {
      loadAsset(join(FIXTURES, "missing-body"));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).file).toContain("asset.yaml");
  });
});
