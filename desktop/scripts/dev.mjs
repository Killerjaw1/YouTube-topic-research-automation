// `npm run dev`: Vite dev server with hot reload for the UI + Electron pointed at it.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "vite";

const require = createRequire(import.meta.url);
const server = await createServer({ configFile: "vite.config.ts", mode: "development" });
await server.listen();
const url = server.resolvedUrls.local[0];
await import("./build-main.mjs");
const electron = spawn(require("electron"), ["."], { stdio: "inherit", env: { ...process.env, VITE_DEV_SERVER_URL: url } });
electron.on("exit", async (code) => { await server.close(); process.exit(code ?? 0); });
