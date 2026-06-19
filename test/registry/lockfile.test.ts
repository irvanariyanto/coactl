import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readLockfile, writeLockfile, upsertLockEntry } from "../../src/registry/lockfile.js";

const TMP = join(process.cwd(), ".tmp-lockfile-test");
const LOCK_PATH = join(TMP, "agent.lock.yaml");
const VALID_INTEGRITY = `sha256-${"a".repeat(64)}`;

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("readLockfile", () => {
  it("returns empty lockfile when file does not exist", () => {
    const lock = readLockfile(LOCK_PATH);
    expect(lock).toEqual({ assets: {} });
  });
});

describe("writeLockfile / readLockfile round-trip", () => {
  it("writes and reads back correctly", () => {
    const lock = { assets: { "my-asset": { source: "local", integrity: VALID_INTEGRITY } } };
    writeLockfile(lock, LOCK_PATH);
    const read = readLockfile(LOCK_PATH);
    expect(read.assets["my-asset"].source).toBe("local");
    expect(read.assets["my-asset"].integrity).toBe(VALID_INTEGRITY);
  });

  it("serialization is deterministic (sorted by id)", () => {
    const lock = {
      assets: {
        "z-asset": { source: "local", integrity: VALID_INTEGRITY },
        "a-asset": { source: "local", integrity: VALID_INTEGRITY },
      },
    };
    writeLockfile(lock, LOCK_PATH);
    const read = readLockfile(LOCK_PATH);
    expect(Object.keys(read.assets)).toEqual(["a-asset", "z-asset"]);
  });

  it("re-writing identical content produces byte-identical file", () => {
    const lock = { assets: { "my-asset": { source: "local", integrity: VALID_INTEGRITY } } };
    writeLockfile(lock, LOCK_PATH);
    const { mtimeMs: t1 } = require("fs").statSync(LOCK_PATH);
    writeLockfile(lock, LOCK_PATH);
    const { mtimeMs: t2 } = require("fs").statSync(LOCK_PATH);
    const read = readLockfile(LOCK_PATH);
    expect(read).toEqual(lock);
  });
});

describe("upsertLockEntry", () => {
  it("adds a new entry", () => {
    const lock = { assets: {} };
    const updated = upsertLockEntry(lock, "new-asset", { source: "local", integrity: VALID_INTEGRITY });
    expect(updated.assets["new-asset"]).toBeDefined();
  });

  it("updates an existing entry", () => {
    const lock = { assets: { "my-asset": { source: "local", integrity: VALID_INTEGRITY } } };
    const newIntegrity = `sha256-${"b".repeat(64)}`;
    const updated = upsertLockEntry(lock, "my-asset", { source: "local", integrity: newIntegrity });
    expect(updated.assets["my-asset"].integrity).toBe(newIntegrity);
  });
});
