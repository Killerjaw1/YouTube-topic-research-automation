/** Electron main process: window, IPC bridge to the engine, file saving and Google sign-in. */

import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { Engine, ENGINE_METHODS, type EngineMethod } from "../core/engine";
import { Store } from "../core/store";
import { claude } from "./ai";
import { signIn } from "./oauth";
import { FilePersist, osCipher } from "./persist";

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
let win: BrowserWindow | null = null;
let engine: Engine;

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

function isSafeExternal(url: string) {
  try { return ["https:", "http:"].includes(new URL(url).protocol); } catch { return false; }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: "#0b0d12",
    title: "NicheRadar",
    icon: path.join(__dirname, "../../build/icon.png"),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once("ready-to-show", () => win?.show());
  // Links to YouTube, Google Cloud etc. open in the real browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternal(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    const internal = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith("file:");
    if (!internal) {
      e.preventDefault();
      if (isSafeExternal(url)) shell.openExternal(url);
    }
  });
  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const dataDir = process.env.NICHERADAR_HOME || path.join(app.getPath("userData"), "data");
  engine = new Engine(new Store(new FilePersist(dataDir), osCipher(safeStorage)), { desktop: true, ai: claude });

  ipcMain.handle("engine", async (_e, method: EngineMethod, args: unknown[]) => {
    if (!ENGINE_METHODS.includes(method)) return { ok: false, error: `Unknown method ${method}` };
    try {
      const fn = (engine as any)[method] as (...a: unknown[]) => unknown;
      return { ok: true, data: await fn.apply(engine, Array.isArray(args) ? args : []) };
    } catch (e: any) {
      if (!e?.kind) console.error(e);
      return { ok: false, error: e?.message ?? String(e), kind: e?.kind };
    }
  });

  ipcMain.handle("analytics:connect", async () => {
    try {
      const info = await signIn(engine.analytics, (url) => shell.openExternal(url));
      return { ok: true, data: info };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  });

  ipcMain.handle("save-file", async (_e, filename: string, text: string) => {
    const res = await dialog.showSaveDialog(win!, {
      defaultPath: path.join(app.getPath("documents"), path.basename(filename)),
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (res.canceled || !res.filePath) return { ok: true, data: null };
    fs.writeFileSync(res.filePath, text, "utf8");
    return { ok: true, data: res.filePath };
  });

  ipcMain.handle("open-external", async (_e, url: string) => {
    if (isSafeExternal(url)) await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle("open-data-folder", async () => {
    await shell.openPath(dataDir);
    return { ok: true };
  });

  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
