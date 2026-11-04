/** Exposes a narrow, typed bridge to the renderer. The UI never gets Node or Electron directly. */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("nicheradar", {
  call: (method: string, ...args: unknown[]) => ipcRenderer.invoke("engine", method, args),
  connectAnalytics: () => ipcRenderer.invoke("analytics:connect"),
  saveFile: (filename: string, text: string) => ipcRenderer.invoke("save-file", filename, text),
  openTextFile: () => ipcRenderer.invoke("open-text-file"),
  exportPdf: (filename: string) => ipcRenderer.invoke("export-pdf", filename),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  openDataFolder: () => ipcRenderer.invoke("open-data-folder"),
  setTheme: (theme: "dark" | "light") => ipcRenderer.invoke("set-theme", theme),
  appInfo: () => ipcRenderer.invoke("app-info"),
  updates: {
    state: () => ipcRenderer.invoke("update:state"),
    check: () => ipcRenderer.invoke("update:check"),
    install: () => ipcRenderer.invoke("update:install"),
    onChange: (cb: (s: unknown) => void) => {
      const fn = (_e: unknown, s: unknown) => cb(s);
      ipcRenderer.on("update", fn);
      return () => ipcRenderer.removeListener("update", fn);
    },
  },
  profiles: {
    list: () => ipcRenderer.invoke("profiles:list"),
    create: (name: string) => ipcRenderer.invoke("profiles:create", name),
    switch: (id: string) => ipcRenderer.invoke("profiles:switch", id),
    rename: (id: string, name: string) => ipcRenderer.invoke("profiles:rename", id, name),
    remove: (id: string) => ipcRenderer.invoke("profiles:remove", id),
    autoname: (title: string) => ipcRenderer.invoke("profiles:autoname", title),
  },
  /** Messages from the main process: { type: "navigate", hash } or { type: "refresh" }. */
  onEvent: (cb: (e: unknown) => void) => {
    const fn = (_e: unknown, ev: unknown) => cb(ev);
    ipcRenderer.on("app-event", fn);
    return () => ipcRenderer.removeListener("app-event", fn);
  },
  platform: process.platform,
});
