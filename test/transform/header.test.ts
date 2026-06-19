import { describe, expect, it } from "vitest";
import { contentHash, parseHeader, renderHeader } from "../../src/transform/header.js";

describe("contentHash", () => {
  it("returns sha256- prefixed hex string", () => {
    const hash = contentHash("test");
    expect(hash).toMatch(/^sha256-[a-f0-9]{64}$/);
  });

  it("is stable for identical content", () => {
    const hash1 = contentHash("content");
    const hash2 = contentHash("content");
    expect(hash1).toBe(hash2);
  });

  it("changes when content changes", () => {
    const hash1 = contentHash("content1");
    const hash2 = contentHash("content2");
    expect(hash1).not.toBe(hash2);
  });
});

describe("renderHeader & parseHeader round-trip", () => {
  for (const syntax of ["<!-- -->", "#", "//"] as const) {
    it(`round-trips with ${syntax} syntax`, () => {
      const fields = {
        assetId: "test-asset",
        source: "local-source",
        hash: "sha256-abc123def456",
        commentSyntax: syntax,
      };

      const rendered = renderHeader(fields);
      const parsed = parseHeader(rendered + "body content");

      expect(parsed).toEqual({
        assetId: "test-asset",
        source: "local-source",
        hash: "sha256-abc123def456",
      });
    });
  }

  it("returns null when no header found", () => {
    const parsed = parseHeader("no header here");
    expect(parsed).toBeNull();
  });
});

describe("renderHeader", () => {
  it("renders HTML comment syntax correctly", () => {
    const header = renderHeader({
      assetId: "my-asset",
      source: "my-source",
      hash: "sha256-abc",
      commentSyntax: "<!-- -->",
    });
    expect(header).toContain("<!--");
    expect(header).toContain("-->");
    expect(header).toContain("DO NOT EDIT");
    expect(header).toContain("asset: my-asset");
  });

  it("renders hash syntax correctly", () => {
    const header = renderHeader({
      assetId: "my-asset",
      source: "my-source",
      hash: "sha256-abc",
      commentSyntax: "#",
    });
    expect(header).toContain("# DO NOT EDIT");
    expect(header).toMatch(/^#/m);
  });

  it("renders slash syntax correctly", () => {
    const header = renderHeader({
      assetId: "my-asset",
      source: "my-source",
      hash: "sha256-abc",
      commentSyntax: "//",
    });
    expect(header).toContain("// DO NOT EDIT");
    expect(header).toMatch(/^\/\//m);
  });
});
