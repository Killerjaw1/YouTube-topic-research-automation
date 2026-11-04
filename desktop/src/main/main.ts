/** Electron main process: window, IPC bridge to the engine, files, PDF export, Google sign-in, updates. */

import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, Notification, safeStorage, screen, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { Engine, ENGINE_METHODS, type EngineMethod } from "../core/engine";
import { Store } from "../core/store";
import { CHROME, TITLEBAR_HEIGHT } from "../shared/chrome";
import { claude } from "./ai";
import { signIn } from "./oauth";
import { FilePersist, osCipher } from "./persist";
import { MAIN, Profiles } from "./profiles";
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
  loadApp();
}

/** Load the app at its start page (also used after switching channel, so no page re-runs from its old address). */
function loadApp() {
  if (!win) return;
  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(() => {
  if (!primary) return;
  Menu.setApplicationMenu(null);
  const dataDir = process.env.NICHERADAR_HOME || path.join(app.getPath("userData"), "data");
  const cipher = osCipher(safeStorage);
  const mainStore = new Store(new FilePersist(dataDir), cipher);
  const profiles = new Profiles(dataDir);
  const makeEngine = (id: string) => new Engine(id === MAIN ? mainStore : new Store(new FilePersist(profiles.dir(id)), cipher, mainStore),
    { desktop: true, ai: claude, fetcher: (url, init) => net.fetch(url, init) });
  engine = makeEngine(profiles.active);

  // Channel profiles: switching swaps the engine and reloads the window so every page starts fresh.
  const switchTo = (id: string) => { profiles.setActive(id); engine = makeEngine(id); loadApp(); };
  const wrap = (fn: (...a: any[]) => unknown) => async (_e: unknown, ...a: any[]) => {
    try { return { ok: true, data: await fn(...a) }; } catch (e: any) { return { ok: false, error: e?.message ?? String(e) }; }
  };
  ipcMain.handle("profiles:list", wrap(() => profiles.list()));
  ipcMain.handle("profiles:create", wrap((name: string) => { const p = profiles.create(String(name ?? "")); switchTo(p.id); return p; }));
  ipcMain.handle("profiles:switch", wrap((id: string) => { if (id !== profiles.active) switchTo(String(id)); return profiles.list(); }));
  ipcMain.handle("profiles:rename", wrap((id: string, name: string) => { profiles.rename(String(id), String(name ?? "")); return profiles.list(); }));
  ipcMain.handle("profiles:remove", wrap((id: string) => {
    const wasActive = profiles.active === id;
    profiles.remove(String(id));
    if (wasActive) switchTo(MAIN);
    return profiles.list();
  }));
  // After a channel is added in Settings, name its profile after it unless the user already named it.
  ipcMain.handle("profiles:autoname", wrap((title: string) => {
    const p = profiles.list().list.find((x) => x.id === profiles.active);
    if (p && title && /^(Main channel|Channel \d+)$/.test(p.name)) profiles.rename(p.id, String(title));
    return profiles.list();
  }));

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
    await shell.openPath(engine.store.location);
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
  // Background checks: weekly watchlist re-score, Monday summary and early-hit alerts.
  setTimeout(runBackgroundChecks, 60_000);
  setInterval(runBackgroundChecks, 6 * 3600_000);
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

/** A Windows notification that opens a page in NicheRadar when clicked. */
function notify(title: string, body: string, hash: string) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: path.join(__dirname, "../../build/icon.png") });
  n.on("click", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
    win.webContents.send("app-event", { type: "navigate", hash });
  });
  n.show();
}

const fmtN = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n)));

/**
 * Background checks while the app is open (a minute after start, then every 6 hours): the weekly watchlist
 * re-score, the Monday summary, and early-hit alerts for new uploads. Each one does nothing unless it's due.
 */
let backgroundRunning = false;
async function runBackgroundChecks() {
  if (backgroundRunning || !engine) return;
  backgroundRunning = true;
  try {
    try {
      const r = await engine.weeklyCheck();
      if (r.ran) {
        win?.webContents.send("app-event", { type: "refresh" });
        if (r.improved.length) {
          const [first] = [...r.improved].sort((a, b) => b.to - b.from - (a.to - a.from));
          const more = r.improved.length - 1;
          notify(r.improved.length === 1 ? "A tracked topic improved" : `${r.improved.length} tracked topics improved`,
            `“${first.keyword}” went from ${first.from} to ${first.to}.${more ? ` ${more} more in your watchlist.` : ""}`, "#/watchlist");
        }
      }
    } catch (e) { console.error("weekly check", e); }
    try {
      const s = await engine.summaryIfDue();
      if (s) {
        const change = s.views_change == null ? "" : ` (${s.views_change >= 0 ? "+" : "−"}${Math.abs(s.views_change)}%)`;
        const best = s.best ? ` Best: “${s.best.title.slice(0, 50)}”.` : "";
        notify("Your week on YouTube", `${fmtN(s.views)} views${change}, ${s.subs >= 0 ? "+" : "−"}${Math.abs(s.subs)} subscribers.${best}`, "#/");
      }
    } catch (e) { console.error("weekly summary", e); }
    try {
      for (const h of (await engine.earlyHitCheck()).slice(0, 2)) {
        notify("A new upload is taking off", `“${h.title.slice(0, 60)}” already has ${fmtN(h.views)} views in ${h.hours} hours, ${h.multiple}× your typical video. Make a follow-up while it’s hot.`, "#/analytics");
      }
    } catch (e) { console.error("early hits", e); }
  } finally {
    backgroundRunning = false;
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
