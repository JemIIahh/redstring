import { spawn } from "node:child_process";
import { access, copyFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { frontendRoutes } from "./frontend-routing.mjs";

const root = resolve(import.meta.dirname, "..");
const workspace = await mkdtemp(join(tmpdir(), "redstring-frontend-"));
const output = join(root, ".vercel/output");
// Explicit source allowlist works in Vercel build containers without .git and
// excludes .env, credentials, databases, release state and previous artifacts.
for (const directory of ["app", "actions", "server", "public"]) {
  await cp(join(root, directory), join(workspace, directory), {
    recursive: true,
    filter: path => !basename(path).startsWith(".") && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(path),
  });
}
for (const file of ["package.json", "pnpm-lock.yaml", "tsconfig.json", "vite.config.ts", "react-router.config.ts", "agent-native.config.ts", "agent-native.json"]) {
  if (await access(join(root, file)).then(() => true, () => false)) {
    await copyFile(join(root, file), join(workspace, file));
  }
}
await symlink(join(root, "node_modules"), join(workspace, "node_modules"), "dir");
await access(join(workspace, ".env")).then(() => { throw new Error("Frontend workspace must not contain .env"); }, () => {});
const networkGuard = join(workspace, "build-no-network.cjs");
await writeFile(networkGuard, `
const local = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (!local.has(url.hostname)) throw new Error("Frontend build blocks external network requests");
  return originalFetch(input, init);
};
for (const name of ["node:http", "node:https"]) {
  const transport = require(name);
  for (const method of ["request", "get"]) {
    const original = transport[method];
    transport[method] = function(input, ...args) {
      const host = typeof input === "string" || input instanceof URL ? new URL(input).hostname : (input?.hostname || input?.host || "localhost");
      if (!local.has(host)) throw new Error("Frontend build blocks external network requests");
      return original.call(this, input, ...args);
    };
  }
}
`);

// No application credential is inherited or read by the frontend compiler.
const { PATH, HOME, TMPDIR, USER, LOGNAME, SHELL, LANG, PNPM_HOME } = process.env;
const child = spawn("pnpm", ["exec", "react-router", "build"], {
  cwd: workspace,
  env: { PATH, HOME, TMPDIR, USER, LOGNAME, SHELL, LANG, PNPM_HOME,
    NODE_ENV: "production", REDSTRING_FRONTEND_ONLY: "1", CI: "true",
    NODE_OPTIONS: `--require=${networkGuard}`,
    // The shared compiler validates server configuration even in SPA mode.
    // These inert build-only placeholders never connect to a real service.
    DATABASE_URL: "postgresql://frontend-build:unused@db.example.invalid/frontend_build",
    BETTER_AUTH_SECRET: "frontend-build-placeholder-not-a-real-auth-secret",
    AGENT_CHAT_DURABLE_BACKGROUND: "0", AGENT_NATIVE_DISABLE_RECURRING_JOBS: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", data => { log += data; });
child.stderr.on("data", data => { log += data; });
const code = await new Promise((done, fail) => { child.on("error", fail); child.on("close", done); });
await mkdir(join(root, ".tmp"), { recursive: true });
await writeFile(join(root, ".tmp/frontend-build.log"), log);
console.log(log.slice(-4000));
if (code !== 0) throw new Error(`Frontend build failed (${code}); workspace ${workspace}`);
const client = join(workspace, "build/client");
await access(join(client, "index.html"));
// Only this generated output is replaced; the Vercel project link is retained.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(client, join(output, "static"), { recursive: true });
await writeFile(join(output, "config.json"), JSON.stringify({ version: 3, routes: frontendRoutes() }, null, 2));
await mkdir(join(root, ".deploy-tmp"), { recursive: true, mode: 0o700 });
await writeFile(join(root, ".deploy-tmp/frontend-build.json"), JSON.stringify({ workspace, output, functions: 0 }), { mode: 0o600 });
console.log("Vercel frontend ready: static HTML/assets only; zero functions and no application credentials.");
