const RELEASE_URL = "https://api.github.com/repos/irvanariyanto/coactl/releases/latest";
const CACHE_KEY = "coactl.latestRelease";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface ReleaseCache {
  checkedAt: number;
  version: string;
}

export const UPDATE_COMMAND =
  "curl -fsSL https://raw.githubusercontent.com/irvanariyanto/coactl/main/scripts/install.sh | bash -s -- --background";

export async function findAvailableUpdate(currentVersion: string): Promise<string | null> {
  const cached = readCache();
  if (cached && Date.now() - cached.checkedAt < CHECK_INTERVAL_MS) {
    return isNewerVersion(cached.version, currentVersion) ? cached.version : null;
  }

  try {
    const response = await fetch(RELEASE_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) {
      writeCache({ checkedAt: Date.now(), version: currentVersion });
      return null;
    }

    const release = await response.json() as { tag_name?: unknown };
    const version = typeof release.tag_name === "string"
      ? normalizeVersion(release.tag_name)
      : null;
    if (!version) {
      writeCache({ checkedAt: Date.now(), version: currentVersion });
      return null;
    }

    writeCache({ checkedAt: Date.now(), version });
    return isNewerVersion(version, currentVersion) ? version : null;
  } catch {
    writeCache({ checkedAt: Date.now(), version: currentVersion });
    return null;
  }
}

function normalizeVersion(value: string): string | null {
  const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

function isNewerVersion(candidate: string, current: string): boolean {
  const candidateParts = normalizeVersion(candidate)?.split(".").map(Number);
  const currentParts = normalizeVersion(current)?.split(".").map(Number);
  if (!candidateParts || !currentParts) return false;

  for (let index = 0; index < 3; index += 1) {
    if (candidateParts[index]! > currentParts[index]!) return true;
    if (candidateParts[index]! < currentParts[index]!) return false;
  }
  return false;
}

function readCache(): ReleaseCache | null {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as Partial<ReleaseCache> | null;
    return value && typeof value.checkedAt === "number" && typeof value.version === "string"
      ? { checkedAt: value.checkedAt, version: value.version }
      : null;
  } catch {
    return null;
  }
}

function writeCache(value: ReleaseCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // Update checks remain optional when browser storage is unavailable.
  }
}
