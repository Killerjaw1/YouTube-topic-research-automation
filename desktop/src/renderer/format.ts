/** Display formatting for the UI. */


export function fmt(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  const a = Math.abs(n);
  for (const [d, u] of [[1e9, "B"], [1e6, "M"], [1e3, "K"]] as const) {
    if (a >= d) return (n / d).toFixed(a / d >= 100 ? 0 : digits).replace(/\.0$/, "") + u;
  }
  return Math.round(n).toLocaleString();
}

export function fmtAge(days: number | null | undefined): string {
  if (days == null) return "–";
  if (days < 1) return "today";
  if (days < 30) return Math.round(days) + "d";
  if (days < 365) return Math.round(days / 30) + "mo";
  return (days / 365).toFixed(days < 730 ? 1 : 0).replace(/\.0$/, "") + "y";
}

export function fmtDur(s: number | null | undefined): string {
  if (!s) return "";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return (h ? `${h}:${String(m).padStart(2, "0")}` : String(m)) + ":" + String(sec).padStart(2, "0");
}

/** Relative time: "just now", "12 min ago", "2 h ago", "Yesterday 14:30", "Mon 09:10", "3 Oct". */
export function ago(ts: number): string {
  const d = new Date(ts * 1000), now = new Date();
  const s = (now.getTime() - d.getTime()) / 1000;
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  if (s < 60) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= startOfToday) return Math.round(s / 3600) + " h ago";
  if (d.getTime() >= startOfToday - 86400000) return `Yesterday ${time}`;
  if (s < 86400 * 6) return `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
  return d.toLocaleDateString([], { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

export type UiTone = "ok" | "accent" | "warn" | "danger" | "idle";

/** Score → UI tone. 70+ strong, 55-69 good, 40-54 needs an angle, below 40 weak. */
export function tone(score: number | null | undefined): UiTone {
  if (score == null) return "idle";
  return score >= 70 ? "ok" : score >= 55 ? "accent" : score >= 40 ? "warn" : "danger";
}

/** The engine's report tone ("great" | "good" | "warn" | "bad") → UI tone. */
export function reportTone(t: string | undefined): UiTone {
  return ({ great: "ok", good: "accent", warn: "warn", bad: "danger" } as Record<string, UiTone>)[t ?? ""] ?? "idle";
}

export const TONE_COLOR: Record<string, string> = { ok: "var(--ok)", accent: "var(--accent)", warn: "var(--warn)", danger: "var(--danger)", idle: "var(--idle)" };

export function hue(str: string): number {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function store<T>(key: string, val?: T): T | undefined {
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem("nr-" + key) ?? "null") ?? undefined;
    localStorage.setItem("nr-" + key, JSON.stringify(val));
  } catch { /* storage unavailable */ }
  return val;
}
