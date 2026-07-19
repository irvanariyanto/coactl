import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { create as createTar } from "tar";
import yazl from "yazl";
import {
  MAX_ARCHIVE_BYTES,
  assertSafeNpmInstall,
  previewSkillsFromArchive,
  previewSkillsFromNpm,
} from "./remote-pack-skills.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "coactl-pack-test-"));
  temps.push(dir);
  return dir;
}

function addSkill(root: string, prefix = ""): void {
  const dir = join(root, prefix, "skills", "foo");
  mkdirSync(dir, { recursive: true });
  writeFileSync(dir + "/SKILL.md", "---\nname: Foo\ndescription: Packed skill\n---\n\nUse it.\n");
}

async function writeZip(filePath: string, entryName = "skills/foo/SKILL.md"): Promise<void> {
  const zip = new yazl.ZipFile();
  zip.addBuffer(Buffer.from("---\nname: Foo\ndescription: Zip skill\n---\n"), entryName);
  zip.end();
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const done = new Promise<void>((resolve, reject) => {
    output.on("end", () => resolve());
    output.on("error", reject);
  });
  zip.outputStream.pipe(output);
  await done;
  writeFileSync(filePath, Buffer.concat(chunks));
}

describe("previewSkillsFromNpm", () => {
  it("packs without installing and scans below the npm package root", async () => {
    const parent = tempDir();
    const result = await previewSkillsFromNpm({
      install: "@example/skills@1.2.3",
      tmpParent: parent,
      runNpmPack: async (args) => {
        const destination = args[args.indexOf("--pack-destination") + 1]!;
        const source = join(parent, "source");
        addSkill(source, "package");
        await createTar({ cwd: source, file: join(destination, "example-skills-1.2.3.tgz"), gzip: true }, ["package"]);
        return "example-skills-1.2.3.tgz";
      },
    });
    expect(result.install).toBe("@example/skills@1.2.3");
    expect(result.skills.map((skill) => skill.id)).toEqual(["foo"]);
    expect(result.skills[0]?.repoPath).toBe("skills/foo/SKILL.md");
  });

  it("rejects empty, path, and shell-like package specs", () => {
    for (const value of ["", "../pack", "pkg;whoami", "pkg@$(whoami)", "./local.tgz"]) {
      expect(() => assertSafeNpmInstall(value)).toThrow();
    }
  });
});

describe("previewSkillsFromArchive", () => {
  it("extracts local zip and tgz archives", async () => {
    const parent = tempDir();
    const zipPath = join(parent, "skills.zip");
    await writeZip(zipPath);
    const source = join(parent, "tar-source");
    addSkill(source);
    const tgzPath = join(parent, "skills.tgz");
    await createTar({ cwd: source, file: tgzPath, gzip: true }, ["skills"]);

    expect((await previewSkillsFromArchive({ path: zipPath, tmpParent: parent })).skills).toHaveLength(1);
    expect((await previewSkillsFromArchive({ path: tgzPath, tmpParent: parent })).skills).toHaveLength(1);
  });

  it("rejects non-https URLs and missing files", async () => {
    await expect(previewSkillsFromArchive({ url: "http://example.com/skills.zip" })).rejects.toThrow("https://");
    await expect(previewSkillsFromArchive({ path: "/definitely/missing/skills.zip" })).rejects.toThrow("not found");
  });

  it("rejects oversized downloads before reading the body", async () => {
    let read = false;
    await expect(
      previewSkillsFromArchive({
        url: "https://example.com/skills.zip",
        fetchUrl: async () => ({
          ok: true,
          status: 200,
          headers: { get: () => String(MAX_ARCHIVE_BYTES + 1) },
          arrayBuffer: async () => {
            read = true;
            return new ArrayBuffer(0);
          },
        }),
      }),
    ).rejects.toThrow("50 MiB");
    expect(read).toBe(false);
  });

  it("rejects zip entries that escape the extraction root", async () => {
    const parent = tempDir();
    const zipPath = join(parent, "traversal.zip");
    await writeZip(zipPath, "safe/evilx");
    const data = readFileSync(zipPath);
    const safe = Buffer.from("safe/evilx");
    const unsafe = Buffer.from("../outside");
    for (let offset = data.indexOf(safe); offset >= 0; offset = data.indexOf(safe, offset + 1)) {
      unsafe.copy(data, offset);
    }
    writeFileSync(zipPath, data);
    await expect(previewSkillsFromArchive({ path: zipPath, tmpParent: parent })).rejects.toThrow(/relative path|escapes/);
  });
});
