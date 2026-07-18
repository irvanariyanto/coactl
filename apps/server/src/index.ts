import { serve } from "@hono/node-server";
import { app } from "./app.js";

const HOST = "127.0.0.1";
const PORT = Number(process.env.COACTL_PORT ?? 8787);

console.log(`coactl server listening on http://${HOST}:${PORT}`);
serve({ fetch: app.fetch, hostname: HOST, port: PORT });
