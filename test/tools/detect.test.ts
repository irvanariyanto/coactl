import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectInstalledTargets, toolInstallInfo } from "../../src/tools/detect.js";

let tmp: string | undefined;

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

describe("tool detection", () => {
  it("detects tools by command on PATH", () => {
    tmp = mkdtempSync(join(tmpdir(), "coactl-detect-"));
    const bin = join(tmp, "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "aider"), "#!/bin/sh\n");

    const targets = detectInstalledTargets({ env: { PATH: bin }, home: join(tmp, "home") });

    expect(targets).toContain("aider");
  });

  it("detects tools by known config paths", () => {
    tmp = mkdtempSync(join(tmpdir(), "coactl-detect-"));
    const home = join(tmp, "home");
    mkdirSync(join(home, ".gemini"), { recursive: true });

    const info = toolInstallInfo("gemini", { env: { PATH: "" }, home });

    expect(info.installed).toBe(true);
    expect(info.reason).toContain(".gemini");
  });

  it("does not mark unsupported-by-device tools as installed", () => {
    tmp = mkdtempSync(join(tmpdir(), "coactl-detect-"));

    const info = toolInstallInfo("opencode", { env: { PATH: "" }, home: join(tmp, "home") });

    expect(info.installed).toBe(false);
  });
});
