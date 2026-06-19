import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { computeIntegrity, verifyIntegrity, canonicalBytes } from "../../src/registry/integrity.js";

const FIXTURE_DIR = join(process.cwd(), "test/fixtures/workspace/assets/rule-alpha");

describe("canonicalBytes", () => {
  it("is stable for identical inputs", () => {
    const a = canonicalBytes(FIXTURE_DIR);
    const b = canonicalBytes(FIXTURE_DIR);
    expect(a).toBe(b);
  });
});

describe("computeIntegrity", () => {
  it("returns sha256-<64hex> string", () => {
    const hash = computeIntegrity(FIXTURE_DIR);
    expect(hash).toMatch(/^sha256-[a-f0-9]{64}$/);
  });

  it("is deterministic for the same asset", () => {
    const h1 = computeIntegrity(FIXTURE_DIR);
    const h2 = computeIntegrity(FIXTURE_DIR);
    expect(h1).toBe(h2);
  });
});

describe("verifyIntegrity", () => {
  it("returns true for a matching integrity", () => {
    const hash = computeIntegrity(FIXTURE_DIR);
    expect(verifyIntegrity(FIXTURE_DIR, hash)).toBe(true);
  });

  it("returns false for a non-matching integrity", () => {
    expect(verifyIntegrity(FIXTURE_DIR, "sha256-" + "a".repeat(64))).toBe(false);
  });
});
