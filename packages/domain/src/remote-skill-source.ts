import { assertSafeGitUrl } from "./remote-git-skills.js";
import { assertSafeNpmInstall } from "./remote-pack-skills.js";

export type RemoteSkillSource =
  | { kind: "git"; source: string; url: string }
  | { kind: "npm"; source: string; install: string }
  | { kind: "archive"; source: string; path?: string; url?: string };

const GITHUB_SHORTHAND = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i;
const ARCHIVE_EXTENSION = /\.(?:zip|tgz|tar\.gz)(?:[?#].*)?$/i;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

function unwrapSkillsCommand(input: string): string {
  if (!/^npx\s+/i.test(input)) return input;
  const match = input.match(/^npx\s+skills\s+add\s+(\S+)\s*$/i);
  if (!match) {
    throw new Error("Only the command shape 'npx skills add <source>' is supported");
  }
  return match[1]!;
}

/** Detect a remote skill source without executing pasted commands. */
export function parseRemoteSkillSource(input: string): RemoteSkillSource {
  const original = input.trim();
  if (!original) throw new Error("Skill source is required");
  const source = unwrapSkillsCommand(original);

  if (GITHUB_SHORTHAND.test(source)) {
    return {
      kind: "git",
      source,
      url: `https://github.com/${source}`,
    };
  }

  if (/^git@/i.test(source)) {
    return { kind: "git", source, url: assertSafeGitUrl(source) };
  }

  if (URL_SCHEME.test(source)) {
    const parsed = new URL(source);
    if (ARCHIVE_EXTENSION.test(parsed.pathname)) {
      if (parsed.protocol !== "https:") throw new Error("Archive URL must use https://");
      return { kind: "archive", source, url: source };
    }
    return { kind: "git", source, url: assertSafeGitUrl(source) };
  }

  if (ARCHIVE_EXTENSION.test(source)) {
    return { kind: "archive", source, path: source };
  }

  return { kind: "npm", source, install: assertSafeNpmInstall(source) };
}
