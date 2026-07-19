#!/usr/bin/env node
// Single entry point for local development: builds the domain package,
// then runs the API server and the Vite dev server together, and opens
// the browser once the web server is up.
import { spawn } from "node:child_process";

const WEB_URL = "http://127.0.0.1:5173";
const children = [];

function run(name, command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    ...options,
  });
  children.push(child);
  const prefix = `[${name}] `;
  const forward = (stream, out) => {
    stream.on("data", (chunk) => {
      for (const line of chunk.toString().split("\n")) {
        if (line.trim()) out.write(prefix + line + "\n");
      }
    });
  };
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);
  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`${prefix}exited with code ${code}`);
      shutdown(code);
    }
  });
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  spawn(cmd, [url], { stdio: "ignore", shell: platform === "win32" }).on("error", () => {
    console.log(`Open ${url} in your browser.`);
  });
}

async function waitFor(url, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      await fetch(url);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

console.log("Building @coactl/domain…");
await new Promise((resolve, reject) => {
  const build = spawn("npm", ["run", "build", "-w", "@coactl/domain"], { stdio: "inherit" });
  build.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("domain build failed"))));
});

run("api", "npm", ["run", "dev", "-w", "@coactl/server"]);
run("web", "npm", ["run", "dev", "-w", "@coactl/web"]);

if (await waitFor(WEB_URL)) {
  if (process.env.COACTL_OPEN_BROWSER !== "0") {
    console.log(`Opening ${WEB_URL}`);
    openBrowser(WEB_URL);
  } else {
    console.log(`coactl is ready at ${WEB_URL}`);
  }
} else {
  console.log(`Web server did not come up; open ${WEB_URL} manually once it does.`);
}
