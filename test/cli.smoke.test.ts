import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const cliPath = join(process.cwd(), "dist", "cli", "index.js");

const NO_COLOR: ExecFileSyncOptions = {
  encoding: "utf-8",
  env: { ...process.env, FORCE_COLOR: "0" },
};

function runCli(args: string[]): string {
  try {
    return execFileSync("node", [cliPath, ...args], { encoding: "utf-8" });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string };
    return (e.stdout ?? "") + (e.stderr ?? "");
  }
}

function runCliNoColor(args: string[]): string {
  try {
    return execFileSync("node", [cliPath, ...args], NO_COLOR);
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string };
    return (e.stdout ?? "") + (e.stderr ?? "");
  }
}

describe("coactl CLI smoke test", () => {
  it("dist build exists", () => {
    expect(existsSync(cliPath)).toBe(true);
  });

  it("--help lists all subcommands", () => {
    const output = runCli(["--help"]);
    expect(output).toContain("coactl");
    for (const cmd of ["add", "source", "install", "update", "override", "build", "sync", "status", "why", "explain", "dashboard"]) {
      expect(output).toContain(cmd);
    }
  });

  it("--version prints the package version", () => {
    const output = runCli(["--version"]).trim();
    expect(output).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("status command produces styled output", () => {
    const output = runCliNoColor(["status"]);
    expect(output).toContain("status");
  });

  it("explain command produces table output", () => {
    const output = runCliNoColor(["explain", "test-asset"]);
    expect(output).toContain("Claude Code");
    expect(output).toContain("Cursor");
  });

  it("why command reports missing manifest gracefully", () => {
    const output = runCliNoColor(["why", "test-asset"]);
    expect(output).toMatch(/why failed|not found|manifest/i);
  });
});
