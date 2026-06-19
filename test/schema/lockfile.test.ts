import { describe, expect, it } from "vitest";
import { LockfileSchema } from "../../src/schema/lockfile.js";

const validIntegrity = `sha256-${"a".repeat(64)}`;

describe("LockfileSchema", () => {
  it("parses a valid lockfile", () => {
    const result = LockfileSchema.safeParse({
      assets: {
        "my-asset": { source: "local-assets", version: "0.1.0", integrity: validIntegrity },
        "remote-asset": { source: "team-git", commit: "abc123", integrity: validIntegrity },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an integrity string not matching sha256-<64 hex>", () => {
    const result = LockfileSchema.safeParse({
      assets: {
        "my-asset": { source: "local-assets", integrity: "sha256-not-hex" },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "assets.my-asset.integrity")).toBe(true);
    }
  });

  it("rejects a missing source field", () => {
    const result = LockfileSchema.safeParse({
      assets: {
        "my-asset": { integrity: validIntegrity },
      },
    });
    expect(result.success).toBe(false);
  });
});
