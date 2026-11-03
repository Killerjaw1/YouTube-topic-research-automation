/**
 * The UI's single door to the engine.
 * - In the desktop app it goes over IPC to the main process (real YouTube data).
 * - In `npm run web` there is no Electron, so the engine runs right here in the browser
 *   on demo data, stored in localStorage.
 */

import { Engine, type EngineMethod } from "../core/engine";
import { type Persist, Store } from "../core/store";

declare const __WEB_DEMO__: boolean;

interface Bridge {
  call(method: string, ...args: unknown[]): Promise<{ ok: boolean; data?: any; error?: string; kind?: string }>;
  connectAnalytics(): Promise<{ ok: boolean; data?: any; error?: string }>;
  saveFile(filename: string, text: string): Promise<{ ok: boolean; data?: string | null }>;
  openExternal(url: string): Promise<unknown>;
  openDataFolder(): Promise<unknown>;
  exportPdf(filename: string): Promise<{ ok: boolean; data?: string | null }>;
  setTheme(theme: "dark" | "light"): Promise<unknown>;
  appInfo(): Promise<{ ok: boolean; data: { version: string; platform: string; packaged: boolean } }>;
  updates: {
    state(): Promise<{ ok: boolean; data: UpdateState }>;
    check(): Promise<{ ok: boolean; data: UpdateState }>;
    install(): Promise<unknown>;
    onChange(cb: (s: UpdateState) => void): () => void;
  };
  platform: string;
}

export type UpdateState =
  | { state: "idle" | "checking" | "none" | "unsupported" }
  | { state: "available" | "downloading"; version?: string; percent?: number }
  | { state: "ready"; version: string }
  | { state: "error"; message: string };

const bridge: Bridge | undefined = (window as any).nicheradar;
export const isDesktop = Boolean(bridge);
export const isWindows = bridge?.platform === "win32";

class LocalStoragePersist implements Persist {
  location = "this browser (demo)";
  private key = (n: string) => "nr-web:" + n;
  read(n: string) { try { return localStorage.getItem(this.key(n)) ?? undefined; } catch { return undefined; } }
  write(n: string, t: string) { try { localStorage.setItem(this.key(n), t); } catch { /* full or blocked: demo only */ } }
  remove(n: string) { try { localStorage.removeItem(this.key(n)); } catch { /* ignore */ } }
  list(prefix: string) {
    try { return Object.keys(localStorage).filter((k) => k.startsWith(this.key(prefix))).map((k) => k.slice(7)); } catch { return []; }
  }
}

let local: Engine | null = null;
function localEngine() {
  if (!local) local = new Engine(new Store(new LocalStoragePersist()), { desktop: false });
  return local;
}

export class ApiError extends Error {
  constructor(message: string, public kind?: string) { super(message); }
}

/** Typed call into the engine: `call("analyze", "budget pc", "deep")`. */
export async function call<M extends EngineMethod>(method: M, ...args: Parameters<Engine[M]>): Promise<Awaited<ReturnType<Engine[M]>>> {
  if (bridge) {
    const res = await bridge.call(method, ...args);
    if (!res.ok) throw new ApiError(res.error ?? "Something went wrong", res.kind);
    return res.data;
  }
  try {
    return await (localEngine()[method] as any)(...args);
  } catch (e: any) {
    throw new ApiError(e?.message ?? String(e), e?.kind);
  }
}

export async function connectAnalytics() {
  if (!bridge) throw new ApiError("Connecting YouTube Analytics works in the desktop app.");
  const res = await bridge.connectAnalytics();
  if (!res.ok) throw new ApiError(res.error ?? "Couldn't connect");
  return res.data;
}

/** Save a CSV: a Save dialog in the desktop app, a download in the browser. */
export async function saveFile(file: { filename: string; text: string }): Promise<string | null> {
  if (bridge) return (await bridge.saveFile(file.filename, file.text)).data ?? null;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([file.text], { type: "text/csv;charset=utf-8" }));
  a.download = file.filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return file.filename;
}

export function openExternal(url: string) {
  if (bridge) bridge.openExternal(url);
  else window.open(url, "_blank", "noopener");
}

export function openDataFolder() {
  bridge?.openDataFolder();
}

/** Saves the current view as a PDF in the desktop app; opens the print dialog in the browser. */
export async function exportPdf(filename: string): Promise<string | null> {
  if (bridge) return (await bridge.exportPdf(filename)).data ?? null;
  window.print();
  return null;
}

export function setNativeTheme(theme: "dark" | "light") {
  bridge?.setTheme(theme);
}

export const updates = {
  supported: Boolean(bridge),
  async state(): Promise<UpdateState> { return bridge ? (await bridge.updates.state()).data : { state: "unsupported" }; },
  async check(): Promise<UpdateState> { return bridge ? (await bridge.updates.check()).data : { state: "unsupported" }; },
  install() { bridge?.updates.install(); },
  onChange(cb: (s: UpdateState) => void) { return bridge ? bridge.updates.onChange(cb) : () => undefined; },
};

export async function appVersion(): Promise<string> {
  if (!bridge) return "web preview";
  try { return (await bridge.appInfo()).data.version; } catch { return ""; }
}

export const webDemo = typeof __WEB_DEMO__ !== "undefined" && __WEB_DEMO__;
