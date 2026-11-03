// Bundles the Electron main + preload scripts (TypeScript) into dist/main with esbuild.
import { build } from "esbuild";

const common = { bundle: true, platform: "node", target: "node22", format: "cjs", sourcemap: true, external: ["electron", "electron-updater"], logLevel: "info" };
await build({ ...common, entryPoints: ["src/main/main.ts"], outfile: "dist/main/main.js" });
await build({ ...common, entryPoints: ["src/main/preload.ts"], outfile: "dist/main/preload.js" });
