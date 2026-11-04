/**
 * Local storage: settings, secrets, API response cache, quota ledger, scans and ideas.
 *
 * Storage is plain JSON documents behind a tiny `Persist` interface, so the same
 * store runs on disk in the desktop app (one file per document, written atomically)
 * and in memory/localStorage for the browser demo (`npm run web`).
 */

import { DEFAULT_SETTINGS, IDEA_STATUSES, type Idea, type Scan, type ScanMeta, type SecretName, type Settings, type TrackPoint, type Tracked } from "./types";
import { hash, quotaDay } from "./util";

export interface Persist {
  read(name: string): string | undefined;
  write(name: string, text: string): void;
  remove(name: string): void;
  list(prefix: string): string[];
  readonly location: string;
}

/** Encrypts secrets at rest (Electron safeStorage on the desktop; identity in the demo). */
export interface Cipher {
  encrypt(plain: string): string;
  decrypt(stored: string): string;
}

const plainCipher: Cipher = { encrypt: (s) => s, decrypt: (s) => s };

interface Index {
  nextScan: number;
  nextIdea: number;
  scans: ScanMeta[];
  ideas: Idea[];
  quota: Record<string, number>;
  tracked?: Tracked[];
}

export class MemoryPersist implements Persist {
  location = "memory";
  private data = new Map<string, string>();
  read(name: string) { return this.data.get(name); }
  write(name: string, text: string) { this.data.set(name, text); }
  remove(name: string) { this.data.delete(name); }
  list(prefix: string) { return [...this.data.keys()].filter((k) => k.startsWith(prefix)); }
}

/** A YYYY-MM-DD date, or null. */
const validDay = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);

export class Store {
  private index: Index;
  private settingsCache: Settings | null = null;

  constructor(private persist: Persist, private cipher: Cipher = plainCipher) {
    this.index = this.readJson<Index>("index.json") ?? { nextScan: 1, nextIdea: 1, scans: [], ideas: [], quota: {} };
  }

  get location() { return this.persist.location; }

  private readJson<T>(name: string): T | undefined {
    const text = this.persist.read(name);
    if (text == null) return undefined;
    try { return JSON.parse(text) as T; } catch { return undefined; }
  }
  private writeJson(name: string, value: unknown) { this.persist.write(name, JSON.stringify(value)); }
  private saveIndex() { this.writeJson("index.json", this.index); }

  // ------------------------------------------------------------ small documents
  /** A small JSON document by name (goals, competitors, templates...), or `fallback` if it doesn't exist. */
  getDoc<T>(name: string, fallback: T): T {
    if (!/^[a-z0-9_-]+$/.test(name)) throw new Error("bad document name");
    return this.readJson<T>(`docs/${name}.json`) ?? fallback;
  }

  setDoc(name: string, value: unknown) {
    if (!/^[a-z0-9_-]+$/.test(name)) throw new Error("bad document name");
    this.writeJson(`docs/${name}.json`, value);
  }

  // ------------------------------------------------------------- settings
  getSettings(): Settings {
    if (!this.settingsCache) this.settingsCache = { ...DEFAULT_SETTINGS, ...(this.readJson<Partial<Settings>>("settings.json") ?? {}) };
    return { ...this.settingsCache };
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const next = this.getSettings();
    for (const [k, v] of Object.entries(patch)) {
      if (k in DEFAULT_SETTINGS) (next as any)[k] = v;
    }
    this.settingsCache = next;
    this.writeJson("settings.json", next);
    return { ...next };
  }

  // -------------------------------------------------------------- secrets
  getSecret(name: SecretName): string {
    const all = this.readJson<Record<string, string>>("secrets.json") ?? {};
    if (!all[name]) return "";
    try { return this.cipher.decrypt(all[name]); } catch { return ""; }
  }

  setSecret(name: SecretName, value: string | null) {
    const all = this.readJson<Record<string, string>>("secrets.json") ?? {};
    if (value) all[name] = this.cipher.encrypt(value);
    else delete all[name];
    this.writeJson("secrets.json", all);
  }

  // ---------------------------------------------------------------- cache
  cacheGet<T>(key: string, maxAgeMs: number): T | undefined {
    const doc = this.readJson<{ t: number; v: T }>(`cache/${hash(key)}.json`);
    if (!doc || Date.now() - doc.t > maxAgeMs) return undefined;
    return doc.v;
  }

  cacheSet(key: string, value: unknown) {
    this.writeJson(`cache/${hash(key)}.json`, { t: Date.now(), v: value });
  }

  cacheClear(): number {
    const names = this.persist.list("cache/");
    names.forEach((n) => this.persist.remove(n));
    return names.length;
  }

  // ---------------------------------------------------------------- quota
  addQuota(units: number) {
    const day = quotaDay();
    this.index.quota[day] = (this.index.quota[day] ?? 0) + units;
    const days = Object.keys(this.index.quota).sort();
    while (days.length > 60) delete this.index.quota[days.shift()!];
    this.saveIndex();
  }

  quotaUsed(): number {
    return this.index.quota[quotaDay()] ?? 0;
  }

  quotaHistory(days = 14): { day: string; units: number }[] {
    return Object.entries(this.index.quota).sort(([a], [b]) => a.localeCompare(b)).slice(-days).map(([day, units]) => ({ day, units }));
  }

  // ---------------------------------------------------------------- scans
  saveScan(kind: ScanMeta["kind"], query: string, payload: unknown, score: number | null, verdict: string | null, demo: boolean): number {
    const id = this.index.nextScan++;
    this.index.scans.unshift({ id, kind, query, created: Date.now() / 1000, score, verdict, demo });
    this.writeJson(`scans/${id}.json`, payload);
    this.saveIndex();
    return id;
  }

  listScans(kind?: ScanMeta["kind"], limit = 500): ScanMeta[] {
    return this.index.scans.filter((s) => !kind || s.kind === kind).slice(0, limit);
  }

  countScans() { return this.index.scans.length; }

  getScan(id: number): Scan | undefined {
    const meta = this.index.scans.find((s) => s.id === id);
    const payload = meta && this.readJson(`scans/${id}.json`);
    return meta && payload ? { ...meta, payload } : undefined;
  }

  updateScanPayload(id: number, payload: unknown) {
    if (this.index.scans.some((s) => s.id === id)) this.writeJson(`scans/${id}.json`, payload);
  }

  deleteScan(id: number) {
    this.index.scans = this.index.scans.filter((s) => s.id !== id);
    this.persist.remove(`scans/${id}.json`);
    this.saveIndex();
  }

  // ------------------------------------------------------------ watchlist
  listTracked(): Tracked[] {
    return [...(this.index.tracked ?? [])];
  }

  isTracked(keyword: string) {
    const k = keyword.trim().toLowerCase();
    return (this.index.tracked ?? []).some((t) => t.keyword === k);
  }

  track(keyword: string, first?: TrackPoint): Tracked {
    const k = keyword.trim().toLowerCase();
    this.index.tracked ??= [];
    let t = this.index.tracked.find((x) => x.keyword === k);
    if (!t) {
      t = { keyword: k, added: Date.now() / 1000, history: first ? [first] : [] };
      this.index.tracked.unshift(t);
      this.saveIndex();
    }
    return t;
  }

  untrack(keyword: string) {
    const k = keyword.trim().toLowerCase();
    this.index.tracked = (this.index.tracked ?? []).filter((t) => t.keyword !== k);
    this.saveIndex();
  }

  /** Records a new score for a tracked topic (keeps the last 60 checks). */
  addTrackPoint(keyword: string, point: TrackPoint) {
    const t = (this.index.tracked ?? []).find((x) => x.keyword === keyword.trim().toLowerCase());
    if (!t) return;
    t.history.push(point);
    if (t.history.length > 60) t.history.splice(0, t.history.length - 60);
    this.saveIndex();
  }

  // ---------------------------------------------------------------- ideas
  listIdeas(): Idea[] {
    return [...this.index.ideas].sort((a, b) => b.updated - a.updated);
  }

  addIdea(data: Partial<Idea>): Idea {
    const now = Date.now() / 1000;
    const idea: Idea = {
      id: this.index.nextIdea++,
      title: (data.title || data.keyword || "Untitled idea").slice(0, 300),
      keyword: (data.keyword || "").slice(0, 200),
      score: data.score ?? null,
      verdict: data.verdict ?? null,
      format: data.format ?? null,
      status: IDEA_STATUSES.includes(data.status as any) ? data.status! : "idea",
      notes: data.notes || "",
      scan_id: data.scan_id ?? null,
      planned_for: validDay(data.planned_for),
      created: now,
      updated: now,
    };
    this.index.ideas.push(idea);
    this.saveIndex();
    return idea;
  }

  updateIdea(id: number, data: Partial<Idea>): Idea | undefined {
    const idea = this.index.ideas.find((i) => i.id === id);
    if (!idea) return undefined;
    for (const k of ["title", "keyword", "notes", "status", "format", "score", "verdict"] as const) {
      if (data[k] === undefined) continue;
      if (k === "status" && !IDEA_STATUSES.includes(data.status as any)) continue;
      (idea as any)[k] = data[k];
    }
    if (data.planned_for !== undefined) idea.planned_for = validDay(data.planned_for);
    idea.updated = Date.now() / 1000;
    this.saveIndex();
    return idea;
  }

  deleteIdea(id: number) {
    this.index.ideas = this.index.ideas.filter((i) => i.id !== id);
    this.saveIndex();
  }
}
