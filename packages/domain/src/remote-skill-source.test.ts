import { describe, expect, it } from "vitest";
import { parseRemoteSkillSource } from "./remote-skill-source.js";

describe("parseRemoteSkillSource", () => {
  it("expands GitHub shorthand and skills CLI commands", () => {
    expect(parseRemoteSkillSource("addyosmani/agent-skills")).toEqual({
      kind: "git",
      source: "addyosmani/agent-skills",
      url: "https://github.com/addyosmani/agent-skills",
    });
    expect(parseRemoteSkillSource("npx skills add addyosmani/agent-skills")).toMatchObject({
      kind: "git",
      url: "https://github.com/addyosmani/agent-skills",
    });
  });

  it("recognizes git URLs, npm specs, and archives", () => {
    expect(parseRemoteSkillSource("https://github.com/org/repo").kind).toBe("git");
    expect(parseRemoteSkillSource("git@github.com:org/repo.git").kind).toBe("git");
    expect(parseRemoteSkillSource("@scope/skills@1.2.0")).toMatchObject({
      kind: "npm",
      install: "@scope/skills@1.2.0",
    });
    expect(parseRemoteSkillSource("https://example.com/skills.tar.gz?download=1")).toMatchObject({
      kind: "archive",
      url: "https://example.com/skills.tar.gz?download=1",
    });
    expect(parseRemoteSkillSource("/tmp/skills.zip")).toMatchObject({
      kind: "archive",
      path: "/tmp/skills.zip",
    });
  });

  it("rejects command flags, extra arguments, and unsafe schemes", () => {
    for (const source of [
      "npx skills add --global org/repo",
      "npx skills add org/repo && whoami",
      "http://example.com/skills.zip",
      "file:///tmp/skills.zip",
    ]) {
      expect(() => parseRemoteSkillSource(source)).toThrow();
    }
  });
});
