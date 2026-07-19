import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const host = process.env.COACTL_HOST?.trim() || "127.0.0.1";
const port = process.env.COACTL_PORT?.trim() || "8787";

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(npm, args, { stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`npm ${args.join(" ")} stopped by ${signal}`));
      else if (code === 0) resolve();
      else reject(new Error(`npm ${args.join(" ")} exited with code ${code}`));
    });
  });
}

await run(["run", "build", "-w", "@coactl/domain"]);
await run(["run", "build", "-w", "@coactl/server"]);

console.log(`Starting coactl API on http://${host}:${port}`);
if (host === "0.0.0.0" || host === "::") {
  console.log("Security reminder: enable optional login on localhost before public binding, and use a TLS reverse proxy.");
}

const server = spawn(npm, ["run", "start", "-w", "@coactl/server"], {
  stdio: "inherit",
  env: process.env,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
