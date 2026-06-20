import { withFullScreen } from "fullscreen-ink";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Dashboard } from "../../tui/views/Dashboard.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function dashboardAction(): Promise<void> {
  const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "package.json"), "utf-8")) as {
    version: string;
  };

  const app = withFullScreen(<Dashboard version={pkg.version} />);
  app.start();
  await app.waitUntilExit();
}
