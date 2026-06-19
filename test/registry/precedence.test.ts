import { describe, expect, it } from "vitest";
import { pickWinnerByPrecedence } from "../../src/registry/precedence.js";
import type { LoadedAsset } from "../../src/sources/types.js";
import type { Manifest } from "../../src/schema/index.js";

function makeAsset(sourceName: string): LoadedAsset {
  return {
    asset: { id: "foo", kind: "rule", name: "Foo", version: "0.1.0", description: "test", activation: "auto", targets: ["claude-code"], body: "body.md" },
    sourceName,
    origin: { dir: `/assets/${sourceName}/foo` },
    readOnly: sourceName !== "local",
  };
}

function makeManifest(precedence: string[]): Manifest {
  return {
    sources: [{ name: "local", type: "local", path: "./assets" }],
    resolution: { precedence },
  };
}

describe("pickWinnerByPrecedence", () => {
  it("returns the single candidate when there is no conflict", () => {
    const candidates = [makeAsset("local")];
    const winner = pickWinnerByPrecedence(candidates, makeManifest(["local"]));
    expect(winner.sourceName).toBe("local");
  });

  it("picks higher-precedence source when two provide the same id", () => {
    const candidates = [makeAsset("external"), makeAsset("local")];
    const winner = pickWinnerByPrecedence(candidates, makeManifest(["local", "external"]));
    expect(winner.sourceName).toBe("local");
  });

  it("flips winner when precedence order is reversed", () => {
    const candidates = [makeAsset("external"), makeAsset("local")];
    const winner = pickWinnerByPrecedence(candidates, makeManifest(["external", "local"]));
    expect(winner.sourceName).toBe("external");
  });

  it("unlisted sources rank after listed ones", () => {
    const candidates = [makeAsset("unlisted"), makeAsset("listed")];
    const winner = pickWinnerByPrecedence(candidates, makeManifest(["listed"]));
    expect(winner.sourceName).toBe("listed");
  });

  it("multiple unlisted sources preserve original load order", () => {
    const candidates = [makeAsset("a"), makeAsset("b")];
    const winner = pickWinnerByPrecedence(candidates, makeManifest([]));
    expect(winner.sourceName).toBe("a");
  });
});
