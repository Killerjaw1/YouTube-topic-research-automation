/**
 * The few token values the Electron main process needs before any CSS loads
 * (window background and the native Windows caption buttons). They mirror
 * --bg-chrome, --bg-app and --text-2 in src/renderer/styles.css; keep the two in step.
 */
export const CHROME = {
  dark: { chrome: "#0c0d0f", app: "#111214", symbol: "#a3a3ab" },
  light: { chrome: "#f4f4f5", app: "#ffffff", symbol: "#52525b" },
} as const;

export const TITLEBAR_HEIGHT = 44;
