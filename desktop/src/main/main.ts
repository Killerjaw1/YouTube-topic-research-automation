/** Electron main process: window, IPC bridge to the engine, files, PDF export, Google sign-in, updates. */

import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, Notification, safeStorage, screen, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { Engine, ENGINE_METHODS, type EngineMethod } from "../core/engine";
import { Store } from "../core/store";
import { CHROME, TITLEBAR_HEIGHT } from "../shared/chrome";
import { claude } from "./ai";
import { signIn } from "./oauth";
import { FilePersist, osCipher } from "./persist";
import { setupUpdates } from "./updates";

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const IS_WIN = process.platform === "win32";
let win: BrowserWindow | null = null;
let engine: Engine;

// A second launch only focuses the open window; it must not start its own engine on the same data.
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
app.on("second-instance", () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

const THEMES = {
  dark: { color: CHROME.dark.chrome, symbolColor: CHROME.dark.symbol, bg: CHROME.dark.app },
  light: { color: CHROME.light.chrome, symbolColor: CHROME.light.symbol, bg: CHROME.light.app },
};

function isSafeExternal(url: string) {
  try { return ["https:", "http:"].includes(new URL(url).protocol); } catch { return false; }
}

// ---------------------------------------------------------- window state
interface WinState { x?: number; y?: number; width: number; height: number; maximized?: boolean }
const stateFile = () => path.join(app.getPath("userData"), "window-state.json");

function loadWinState(): WinState {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), "utf8")) as WinState;
    // Only restore a position that is still on a connected display.
    const visible = s.x != null && s.y != null && screen.getAllDisplays().some(({ workArea: a }) =>
      s.x! >= a.x - 50 && s.y! >= a.y - 50 && s.x! < a.x + a.width - 100 && s.y! < a.y + a.height - 100);
    return visible ? s : { width: s.width, height: s.height, maximized: s.maximized };
  } catch {
    return { width: 1440, height: 920 };
  }
}

function saveWinState() {
  if (!win) return;
  const b = win.getNormalBounds();
  try { fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() })); } catch { /* ignore */ }
}

function createWindow() {
  const st = loadWinState();
  const theme = THEMES[nativeTheme.shouldUseDarkColors ? "dark" : "light"];
  win = new BrowserWindow({
    x: st.x, y: st.y, width: st.width, height: st.height,
    minWidth: 1024, minHeight: 680,
    backgroundColor: theme.bg,
    title: "NicheRadar",
    icon: path.join(__dirname, "../../build/icon.png"),
    show: false,
    // Custom title bar with the native Windows caption buttons drawn over it.
    ...(IS_WIN ? { titleBarStyle: "hidden" as const, titleBarOverlay: { color: theme.color, symbolColor: theme.symbolColor, height: TITLEBAR_HEIGHT } } : { autoHideMenuBar: true }),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  if (st.maximized) win.maximize();
  win.once("ready-to-show", () => win?.show());
  win.on("close", saveWinState);
  // Links (YouTube, Google Cloud...) always open in the real browser, never inside the app.
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
  if (!primary) return;
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
      return { ok: true, data: await signIn(engine.analytics, (url) => shell.openExternal(url)) };
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

  ipcMain.handle("export-pdf", async (_e, filename: string) => {
    const res = await dialog.showSaveDialog(win!, {
      defaultPath: path.join(app.getPath("documents"), path.basename(filename)),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (res.canceled || !res.filePath) return { ok: true, data: null };
    // The page margins are filled with the window's background colour, so print on white.
    const bg = win!.getBackgroundColor();
    win!.setBackgroundColor("#ffffff");
    try {
      const pdf = await win!.webContents.printToPDF({ printBackground: true, pageSize: "A4", margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } });
      fs.writeFileSync(res.filePath, pdf);
    } finally { win!.setBackgroundColor(bg); }
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

  ipcMain.handle("set-theme", (_e, theme: "dark" | "light") => {
    const t = THEMES[theme] ?? THEMES.dark;
    if (IS_WIN && win) win.setTitleBarOverlay({ color: t.color, symbolColor: t.symbolColor, height: TITLEBAR_HEIGHT });
    win?.setBackgroundColor(t.bg);
    return { ok: true };
  });

  ipcMain.handle("app-info", () => ({ ok: true, data: { version: app.getVersion(), platform: process.platform, packaged: app.isPackaged } }));

  if (IS_WIN) app.setAppUserModelId("app.nicheradar.desktop"); // notifications show under the app's name
  createWindow();
  setupUpdates(() => win, () => engine.store.getSettings().auto_update);
  // Weekly watchlist check: a minute after start, then every 6 hours while the app is open. It only runs once 7 days have passed.
  setTimeout(runWeeklyCheck, 60_000);
  setInterval(runWeeklyCheck, 6 * 3600_000);
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

let weeklyRunning = false;
async function runWeeklyCheck() {
  if (weeklyRunning || !engine) return;
  weeklyRunning = true;
  try {
    const r = await engine.weeklyCheck();
    if (!r.ran) return;
    win?.webContents.send("app-event", { type: "refresh" });
    if (!r.improved.length || !Notification.isSupported()) return;
    const [first] = [...r.improved].sort((a, b) => b.to - b.from - (a.to - a.from));
    const more = r.improved.length - 1;
    const n = new Notification({
      title: r.improved.length === 1 ? "A tracked topic improved" : `${r.improved.length} tracked topics improved`,
      body: `“${first.keyword}” went from ${first.from} to ${first.to}.${more ? ` ${more} more in your watchlist.` : ""}`,
      icon: path.join(__dirname, "../../build/icon.png"),
    });
    n.on("click", () => {
      if (!win) return;
      if (win.isMinimized()) win.restore();
      win.show(); win.focus();
      win.webContents.send("app-event", { type: "navigate", hash: "#/watchlist" });
    });
    n.show();
  } catch (e) {
    console.error("weekly check", e);
  } finally {
    weeklyRunning = false;
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
