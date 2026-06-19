import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { writeFiles } from "../../src/io/write-files.js";
import { mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { EmittedFile } from "../../src/adapters/types.js";

const TEST_DIR = join(process.cwd(), ".tmp-write-test");

function cleanup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
}

beforeEach(() => {
  cleanup();
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  cleanup();
});

describe("writeFiles", () => {
  it("writes files to disk with correct contents", () => {
    const files: EmittedFile[] = [
      { path: "test.txt", contents: "hello", assetId: "test-asset" },
    ];
    const summary = writeFiles(files, TEST_DIR);
    expect(summary.written).toBe(1);
    expect(readFileSync(join(TEST_DIR, "test.txt"), "utf-8")).toBe("hello");
  });

  it("creates parent directories", () => {
    const files: EmittedFile[] = [
      { path: "nested/dir/test.txt", contents: "nested", assetId: "test" },
    ];
    writeFiles(files, TEST_DIR);
    expect(existsSync(join(TEST_DIR, "nested/dir/test.txt"))).toBe(true);
  });

  it("reports unchanged when file already exists with same contents", () => {
    const files: EmittedFile[] = [
      { path: "test.txt", contents: "same", assetId: "test" },
    ];
    writeFiles(files, TEST_DIR);
    const summary = writeFiles(files, TEST_DIR);
    expect(summary.unchanged).toBe(1);
    expect(summary.written).toBe(0);
  });

  it("reports written when file contents change", () => {
    const files1: EmittedFile[] = [
      { path: "test.txt", contents: "old", assetId: "test" },
    ];
    writeFiles(files1, TEST_DIR);
    const files2: EmittedFile[] = [
      { path: "test.txt", contents: "new", assetId: "test" },
    ];
    const summary = writeFiles(files2, TEST_DIR);
    expect(summary.written).toBe(1);
    expect(summary.unchanged).toBe(0);
  });

  it("merges managed aggregate files (CLAUDE.md)", () => {
    const file1: EmittedFile[] = [
      {
        path: "CLAUDE.md",
        contents: "<!-- BEGIN coactl:asset1 -->\nAsset 1\n<!-- END coactl:asset1 -->",
        assetId: "asset1",
      },
    ];
    writeFiles(file1, TEST_DIR);

    const file2: EmittedFile[] = [
      {
        path: "CLAUDE.md",
        contents: "<!-- BEGIN coactl:asset2 -->\nAsset 2\n<!-- END coactl:asset2 -->",
        assetId: "asset2",
      },
    ];
    writeFiles(file2, TEST_DIR);

    const content = readFileSync(join(TEST_DIR, "CLAUDE.md"), "utf-8");
    expect(content).toContain("Asset 1");
    expect(content).toContain("Asset 2");
  });

  it("preserves user content outside managed markers", () => {
    const initialContent = "USER CONTENT\n<!-- BEGIN coactl:asset -->\nOld\n<!-- END coactl:asset -->\nMORE USER";
    const file = join(TEST_DIR, "CLAUDE.md");
    mkdirSync(join(TEST_DIR), { recursive: true });
    const fs = require("fs");
    fs.writeFileSync(file, initialContent);

    const files: EmittedFile[] = [
      {
        path: "CLAUDE.md",
        contents: "<!-- BEGIN coactl:asset -->\nNew\n<!-- END coactl:asset -->",
        assetId: "asset",
      },
    ];
    writeFiles(files, TEST_DIR);

    const content = readFileSync(file, "utf-8");
    expect(content).toContain("USER CONTENT");
    expect(content).toContain("MORE USER");
    expect(content).toContain("New");
    expect(content).not.toContain("Old");
  });
});
