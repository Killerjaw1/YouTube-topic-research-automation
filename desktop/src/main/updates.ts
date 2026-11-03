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

/** No release published yet counts as up to date; other errors become one short sentence. */
export function describe(e: unknown): UpdateState {
  const raw = String((e as { message?: string })?.message ?? e ?? "");
  if (/\b404\b|No published versions|Unable to find latest version|latest\.yml/i.test(raw)) return { state: "none" };
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ERR_INTERNET_DISCONNECTED|ERR_NETWORK|net::/i.test(raw)) return { state: "error", message: "GitHub couldn’t be reached. Check your internet connection." };
  const first = raw.split("\n")[0].trim();
  return { state: "error", message: first.length > 140 ? first.slice(0, 139) + "…" : first || "Something went wrong." };
}

export function setupUpdates(getWin: () => BrowserWindow | null, enabled: () => boolean) {
  let last: UpdateState = { state: app.isPackaged ? "idle" : "unsupported" };
  const send = (s: UpdateState) => { last = s; getWin()?.webContents.send("update", s); };

  ipcMain.handle("update:state", () => ({ ok: true, data: last }));
  ipcMain.handle("update:check", async () => {
    if (!app.isPackaged) { send({ state: "unsupported" }); return { ok: true, data: last }; }
    try { await autoUpdater.checkForUpdates(); } catch (e) { send(describe(e)); }
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
  autoUpdater.on("error", (e) => send(describe(e)));
  if (enabled()) setTimeout(() => autoUpdater.checkForUpdates().catch(() => undefined), 8000);
}
