import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { authFilePath, loadAuthFile } from "./auth.js";

const HOST = process.env.COACTL_HOST?.trim() || "127.0.0.1";
const PORT = Number(process.env.COACTL_PORT ?? 8787);
const auth = loadAuthFile();
const authOn = Boolean(auth?.enabled);

if (HOST !== "127.0.0.1" && HOST !== "localhost" && !authOn) {
  console.warn(
    `warning: binding ${HOST} without login enabled — anyone who can reach the port can manage files. Enable login in the UI (stored in ${authFilePath()}).`,
  );
}

console.log(`coactl server listening on http://${HOST}:${PORT}${authOn ? " (login enabled)" : ""}`);
serve({ fetch: app.fetch, hostname: HOST, port: PORT });
