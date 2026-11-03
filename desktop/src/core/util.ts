/** Small helpers shared by the engine (no Node or DOM dependencies). */

export const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Quartiles like Python's statistics.quantiles(n=4) (exclusive method). */
export function quartiles(values: number[]): [number, number, number] {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  const at = (p: number) => {
    const pos = p * (n + 1) - 1;
    const lo = Math.max(0, Math.min(n - 1, Math.floor(pos)));
    const hi = Math.max(0, Math.min(n - 1, lo + 1));
    return s[lo] + (s[hi] - s[lo]) * Math.max(0, Math.min(1, pos - Math.floor(pos)));
  };
  return [at(0.25), at(0.5), at(0.75)];
}

export const round = (v: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/** Stable 64-bit-ish string hash (two FNV-1a passes) for cache keys and demo seeds. */
export function hash(text: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) ^ (h2 >>> 15);
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

/** Deterministic PRNG (mulberry32) seeded from any strings. */
export function rng(...parts: unknown[]) {
  let a = parseInt(hash(parts.map(String).join("|")).slice(0, 8), 16) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    random: next,
    uniform: (lo: number, hi: number) => lo + (hi - lo) * next(),
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    choice: <T>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)],
    gauss: (mu = 0, sigma = 1) => {
      const u = Math.max(next(), 1e-12), v = next();
      return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    shuffle: <T>(arr: T[]) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

/** YYYY-MM-DD in Pacific time - the YouTube API quota resets at midnight PT. */
export function quotaDay(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

export function fmtNum(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "?";
  const units: [number, string][] = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [d, u] of units) {
    if (Math.abs(n) >= d) return (n / d).toFixed(1).replace(/\.0$/, "") + u;
  }
  return String(Math.round(n));
}

export function csv(rows: Record<string, unknown>[], cols: string[]): string {
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}
