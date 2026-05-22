import { spawn } from "node:child_process";

const children = [];

const run = (command, args, name) => {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  children.push(child);
  child.on("exit", (code, signal) => {
    if (signal) return;
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code);
    }
  });
  return child;
};

const shutdown = (code = 0) => {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const astroArgs = ["run", "dev:site"];
if (process.env.PORT) {
  astroArgs.push("--", "--port", process.env.PORT);
}

run("node", ["./scripts/content-admin-server.mjs"], "admin");
run("npm", astroArgs, "astro");
