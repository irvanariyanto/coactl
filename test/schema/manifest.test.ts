import { describe, expect, it } from "vitest";
import { ManifestSchema } from "../../src/schema/manifest.js";

describe("ManifestSchema", () => {
  it("parses a manifest with all source types", () => {
    const result = ManifestSchema.safeParse({
      sources: [
        { name: "local-assets", type: "local", path: "./assets" },
        { name: "shared-pkg", type: "package", registry: "npm", install: "@org/agent-assets" },
        { name: "team-git", type: "git", url: "https://example.com/repo.git", ref: "main", subdir: "assets" },
        { name: "remote-url", type: "url", url: "https://example.com/bundle.tar.gz" },
        { name: "org-shared", type: "org", org: "acme" },
      ],
      resolution: { precedence: ["local-assets", "team-git"] },
    });
    expect(result.success).toBe(true);
  });

  it("parses optional overrides", () => {
    const result = ManifestSchema.safeParse({
      sources: [{ name: "local-assets", type: "local", path: "./assets" }],
      resolution: { precedence: ["local-assets"] },
      overrides: {
        "some-asset": { targets: ["cursor"], scope: { paths: ["src/**"] }, patch: "patches/some-asset.md" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a source with an unknown type", () => {
    const result = ManifestSchema.safeParse({
      sources: [{ name: "bad", type: "ftp", url: "ftp://example.com" }],
      resolution: { precedence: [] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a git source missing required fields", () => {
    const result = ManifestSchema.safeParse({
      sources: [{ name: "team-git", type: "git", url: "https://example.com/repo.git" }],
      resolution: { precedence: [] },
    });
    expect(result.success).toBe(false);
  });
});
