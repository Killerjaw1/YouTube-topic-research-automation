/**
 * Updates from GitHub Releases (electron-updater). Checks once at startup when enabled,
 * downloads in the background and asks before restarting. Only active in the installed app.
 */

import { app, type BrowserWindow, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";

export type UpdateState =
  | { state: "idle" | "checking" | "none" | "unsupported" }
  | { state: "available" | "downloading"; version?: string; percent?: number }
  | { state: "ready"; version: string }
  | { state: "error"; message: string };

export function setupUpdates(getWin: () => BrowserWindow | null, enabled: () => boolean) {
  let last: UpdateState = { state: app.isPackaged ? "idle" : "unsupported" };
  const send = (s: UpdateState) => { last = s; getWin()?.webContents.send("update", s); };

  ipcMain.handle("update:state", () => ({ ok: true, data: last }));
  ipcMain.handle("update:check", async () => {
    if (!app.isPackaged) { send({ state: "unsupported" }); return { ok: true, data: last }; }
    try { await autoUpdater.checkForUpdates(); } catch (e: any) { send({ state: "error", message: e?.message ?? String(e) }); }
    return { ok: true, data: last };
  });
  ipcMain.handle("update:install", () => { autoUpdater.quitAndInstall(); return { ok: true }; });

  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => send({ state: "checking" }));
  autoUpdater.on("update-not-available", () => send({ state: "none" }));
  autoUpdater.on("update-available", (i) => send({ state: "available", version: i.version }));
  autoUpdater.on("download-progress", (p) => send({ state: "downloading", percent: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded", (i) => send({ state: "ready", version: i.version }));
  autoUpdater.on("error", (e) => send({ state: "error", message: e?.message ?? String(e) }));
  if (enabled()) setTimeout(() => autoUpdater.checkForUpdates().catch(() => undefined), 8000);
}
