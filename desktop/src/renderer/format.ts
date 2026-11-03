/** Display formatting for the UI. */

import type { Tone } from "../core/types";

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

export function ago(ts: number): string {
  const s = Date.now() / 1000 - ts;
  if (s < 60) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  if (s < 86400 * 30) return Math.round(s / 86400) + " d ago";
  return new Date(ts * 1000).toLocaleDateString();
}

export function tone(score: number | null | undefined): Tone | "neutral" {
  if (score == null) return "neutral";
  return score >= 70 ? "great" : score >= 55 ? "good" : score >= 40 ? "warn" : "bad";
}

export const TONE_COLOR: Record<string, string> = { great: "var(--great)", good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)", neutral: "var(--muted)" };

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
