/** Exposes a narrow, typed bridge to the renderer. The UI never gets Node or Electron directly. */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("nicheradar", {
  call: (method: string, ...args: unknown[]) => ipcRenderer.invoke("engine", method, args),
  connectAnalytics: () => ipcRenderer.invoke("analytics:connect"),
  saveFile: (filename: string, text: string) => ipcRenderer.invoke("save-file", filename, text),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  openDataFolder: () => ipcRenderer.invoke("open-data-folder"),
  platform: process.platform,
});
