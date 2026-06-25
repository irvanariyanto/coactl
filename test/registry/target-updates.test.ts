import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { updateLocalAssetTargets } from "../../src/registry/target-updates.js";
import type { Manifest } from "../../src/schema/index.js";

let tmp: string | undefined;

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

function writeSkill(root: string, id: string, targets: string[]): string {
  const dir = join(root, "skills", id);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "SKILL.md");
  writeFileSync(path, [
    "---",
    `name: ${id}`,
    "version: 0.1.0",
    `description: ${id}`,
    "activation: agent-requested",
    "targets:",
    ...targets.map((target) => `  - ${target}`),
    "---",
    "",
    `# ${id}`,
    "",
  ].join("\n"));
  return path;
}

describe("updateLocalAssetTargets", () => {
  it("enables a compatible target on local assets", () => {
    tmp = mkdtempSync(join(tmpdir(), "coactl-target-updates-"));
    const assetPath = writeSkill(tmp, "review", ["claude-code", "codex"]);
    const manifest: Manifest = {
      sources: [{ name: "local", type: "local", path: "." }],
      resolution: { precedence: ["local"] },
    };

    const result = updateLocalAssetTargets({
      manifestPath: join(tmp, "agent.manifest.yaml"),
      manifest,
      scope: "global",
      targets: ["opencode"],
      enable: true,
    });

    expect(result.updated).toBe(1);
    expect(readFileSync(assetPath, "utf-8")).toContain("  - opencode");
  });

  it("disables a target on local assets", () => {
    tmp = mkdtempSync(join(tmpdir(), "coactl-target-updates-"));
    const assetPath = writeSkill(tmp, "review", ["claude-code", "codex", "opencode"]);
    const manifest: Manifest = {
      sources: [{ name: "local", type: "local", path: "." }],
      resolution: { precedence: ["local"] },
    };

    const result = updateLocalAssetTargets({
      manifestPath: join(tmp, "agent.manifest.yaml"),
      manifest,
      scope: "global",
      targets: ["opencode"],
      enable: false,
    });

    expect(result.updated).toBe(1);
    expect(readFileSync(assetPath, "utf-8")).not.toContain("  - opencode");
  });
});
