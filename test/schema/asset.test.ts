import { describe, expect, it } from "vitest";
import { AssetSchema } from "../../src/schema/asset.js";

const base = {
  id: "my-asset",
  name: "My Asset",
  version: "0.1.0",
  description: "A test asset",
  targets: ["claude-code"],
  body: "body.md",
};

describe("AssetSchema", () => {
  it("parses a valid skill", () => {
    const result = AssetSchema.safeParse({
      ...base,
      kind: "skill",
      activation: "agent-requested",
      triggers: [{ type: "glob", pattern: "**/*.ts" }],
    });
    expect(result.success).toBe(true);
  });

  it("parses a valid command", () => {
    const result = AssetSchema.safeParse({
      ...base,
      kind: "command",
      activation: "manual",
      invocation: "/my-asset",
    });
    expect(result.success).toBe(true);
  });

  it("parses a valid rule", () => {
    const result = AssetSchema.safeParse({
      ...base,
      kind: "rule",
      activation: "auto",
      triggers: [{ type: "manual" }],
    });
    expect(result.success).toBe(true);
  });

  it("parses a valid workflow", () => {
    const result = AssetSchema.safeParse({
      ...base,
      kind: "workflow",
      activation: "manual",
      steps: [{ run: "skill:plan" }, { loop: { until: "done", do: [{ run: "command:test" }] } }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invocation on a non-command asset", () => {
    const result = AssetSchema.safeParse({
      ...base,
      kind: "skill",
      activation: "auto",
      invocation: "/nope",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "invocation")).toBe(true);
    }
  });

  it("rejects steps on a non-workflow asset", () => {
    const result = AssetSchema.safeParse({
      ...base,
      kind: "rule",
      activation: "auto",
      steps: [{ run: "skill:plan" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "steps")).toBe(true);
    }
  });

  it("rejects triggers on a non skill/rule asset", () => {
    const result = AssetSchema.safeParse({
      ...base,
      kind: "command",
      activation: "manual",
      triggers: [{ type: "manual" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "triggers")).toBe(true);
    }
  });

  it("rejects a non-kebab-case id with a field-specific path", () => {
    const result = AssetSchema.safeParse({
      ...base,
      id: "My_Asset",
      kind: "rule",
      activation: "auto",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "id")).toBe(true);
    }
  });

  it("rejects a bad semver version with a field-specific path", () => {
    const result = AssetSchema.safeParse({
      ...base,
      version: "not-a-version",
      kind: "rule",
      activation: "auto",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "version")).toBe(true);
    }
  });

  it("rejects an unknown target with a field-specific path", () => {
    const result = AssetSchema.safeParse({
      ...base,
      targets: ["claude-code", "unknown-tool"],
      kind: "rule",
      activation: "auto",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "targets.1")).toBe(true);
    }
  });
});
