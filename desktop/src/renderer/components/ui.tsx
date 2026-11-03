/** App context (theme, toasts, dialogs, detail panel, tooltip) and app-specific building blocks on top of the kit. */

import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Reason, Status as AppStatus, VideoRow } from "../../core/types";
import { call, setNativeTheme } from "../api";
import { fmt, reportTone, store, tone } from "../format";
import { Icon, type IconName } from "./Icon";
import { Banner, Button, ChipGroup, EmptyState, Segmented, Status, Switch, Tag, Thumbnail, type Tone } from "./kit";

// ------------------------------------------------------------------ routing
export interface Route { page: string; id?: string; params: URLSearchParams }

export function parseRoute(): Route {
  const h = location.hash.replace(/^#\/?/, "");
  const [path, qs] = h.split("?");
  const [page, id] = (path || "dashboard").split("/");
  return { page: page || "dashboard", id, params: new URLSearchParams(qs || "") };
}

export const go = (hash: string) => { location.hash = hash; };
export const analyzeLink = (q: string, depth?: string) => `#/analyze?run=1&q=${encodeURIComponent(q)}${depth ? `&depth=${depth}` : ""}`;

// -------------------------------------------------------------------- theme
export type ThemePref = "system" | "dark" | "light";
const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: light)") : null;
export const resolveTheme = (p: ThemePref): "dark" | "light" => (p === "system" ? (media?.matches ? "light" : "dark") : p);
export function applyTheme(p: ThemePref) {
  const t = resolveTheme(p);
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("nr-theme", t); } catch { /* ignore */ }
  store("theme-pref", p);
  setNativeTheme(t);
}

// ------------------------------------------------------------------ context
type ToastKind = "ok" | "err" | "info";
interface Toast { id: number; title: string; body?: string; kind: ToastKind }
interface AppCtx {
  status: AppStatus | null;
  refresh(): Promise<void>;
  /** Shows a toast with a tone dot, a title and an optional body. */
  toast(title: string, kind?: ToastKind, body?: string): void;
  fail(e: unknown, title?: string): void;
  modal(render: (close: () => void) => ReactNode, wide?: boolean): void;
  panel: { node: ReactNode; open(node: ReactNode, key?: string): void; close(): void; key: string | null };
  tip: { show(content: ReactNode, e: { clientX: number; clientY: number }): void; move(e: { clientX: number; clientY: number }): void; hide(): void };
  theme: ThemePref;
  setTheme(p: ThemePref): void;
  palette: { open: boolean; setOpen(v: boolean): void };
}
const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);

const TOAST_TONE: Record<ToastKind, Tone> = { ok: "ok", err: "danger", info: "accent" };

export function AppProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modalState, setModal] = useState<{ render: (close: () => void) => ReactNode; wide?: boolean } | null>(null);
  const [panelNode, setPanelNode] = useState<{ node: ReactNode; key: string | null } | null>(null);
  const [tipContent, setTipContent] = useState<ReactNode>(null);
  const [theme, setThemeState] = useState<ThemePref>(() => store<ThemePref>("theme-pref") ?? "system");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  const refresh = useCallback(async () => {
    try { setStatus(await call("status")); } catch { /* engine not ready */ }
  }, []);
  const toast = useCallback((title: string, kind: ToastKind = "ok", body?: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, title, body, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "err" ? 7000 : 4200);
  }, []);
  const fail = useCallback((e: unknown, title = "That didn’t work") => toast(title, "err", (e as Error)?.message ?? String(e)), [toast]);
  const closeModal = useCallback(() => setModal(null), []);
  const modal = useCallback((render: (close: () => void) => ReactNode, wide?: boolean) => setModal({ render, wide }), []);
  const setTheme = useCallback((p: ThemePref) => { setThemeState(p); applyTheme(p); }, []);
  const openPanel = useCallback((node: ReactNode, key?: string) => setPanelNode({ node, key: key ?? null }), []);
  const closePanel = useCallback(() => setPanelNode(null), []);

  const place = (e: { clientX: number; clientY: number }) => {
    const el = tipRef.current;
    if (!el) return;
    const pad = 14, w = el.offsetWidth, h = el.offsetHeight;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > innerWidth - 8) x = e.clientX - w - pad;
    if (y + h > innerHeight - 8) y = e.clientY - h - pad;
    el.style.left = x + "px";
    el.style.top = y + "px";
  };
  const tip = {
    show: (content: ReactNode, e: { clientX: number; clientY: number }) => { setTipContent(content); requestAnimationFrame(() => place(e)); },
    move: place,
    hide: () => setTipContent(null),
  };

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system" || !media) return;
    const on = () => applyTheme("system");
    media.addEventListener("change", on);
    return () => media.removeEventListener("change", on);
  }, [theme]);
  // The detail panel belongs to the page it was opened from.
  useEffect(() => {
    const onHash = () => setPanelNode(null);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (modalState) closeModal();
      else if (panelNode && !paletteOpen) closePanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalState, panelNode, paletteOpen, closeModal, closePanel]);
  // Move focus into a dialog when it opens, and back where it was when it closes.
  useEffect(() => {
    if (!modalState) return;
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => {
      const el = dialogRef.current?.querySelector<HTMLElement>("[autofocus], input, textarea, select, .dialog-foot .primary, button");
      el?.focus();
    }, 0);
    return () => prev?.focus?.();
  }, [modalState]);

  return (
    <Ctx.Provider value={{
      status, refresh, toast, fail, modal, tip, theme, setTheme,
      panel: { node: panelNode?.node ?? null, key: panelNode?.key ?? null, open: openPanel, close: closePanel },
      palette: { open: paletteOpen, setOpen: setPaletteOpen },
    }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast"><span className={`dot ${TOAST_TONE[t.kind]}`} /><div><b>{t.title}</b>{t.body && <span>{t.body}</span>}</div></div>
        ))}
      </div>
      <div ref={tipRef} className={`tooltip ${tipContent ? "" : "hidden"}`}>{tipContent}</div>
      {modalState && (
        <div className="dialog-back" onMouseDown={(e) => e.target === e.currentTarget && closeModal()}>
          <div ref={dialogRef} className={`dialog ${modalState.wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            {modalState.render(closeModal)}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

// ------------------------------------------------------------------ pieces
export function PageHead({ title, desc, children }: { title: string; desc?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{desc && <p>{desc}</p>}</div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

export function Kbd({ keys }: { keys: string }) {
  return <kbd>{keys}</kbd>;
}

export function ScorePill({ score, big }: { score: number | null | undefined; big?: boolean }) {
  return <span className={`score ${tone(score)} ${big ? "lg" : ""}`} aria-label={score == null ? "Not scored" : `Score ${Math.round(score)}`}>{score == null ? "–" : Math.round(score)}</span>;
}

/** A verdict as status: a tone dot plus the verdict words. */
export function Verdict({ tone: t, score, children }: { tone?: string; score?: number | null; children: ReactNode }) {
  return <Status tone={t ? reportTone(t) : tone(score)}>{children}</Status>;
}

const SIZE = { small: ["Small", "var(--series-1)"], mid: ["Mid-size", "var(--series-2)"], big: ["Large", "var(--series-3)"], unknown: ["Hidden", "var(--idle)"] } as const;
/** Channel size class; the swatch matches the scatter chart's series colour. */
export function SizeBadge({ v }: { v: VideoRow }) {
  const [label, color] = SIZE[v.size ?? "unknown"];
  return <span className="status"><span className="dot" style={{ background: color, borderRadius: 2 }} />{label}</span>;
}

export function FormatBadge({ format }: { format: string | null | undefined }) {
  return <Tag>{format === "short" ? "Short" : format === "both" ? "Both" : "Long"}</Tag>;
}

export function Thumb({ v, large }: { v: { thumbnail?: string; title?: string; id?: string; channel_title?: string; size?: string }; large?: boolean }) {
  const cat = v.size === "small" ? "cat-3" : v.size === "big" ? "cat-2" : v.size === "mid" ? "cat-1" : undefined;
  return <Thumbnail src={v.thumbnail} title={v.title || v.id} name={v.channel_title} category={cat} large={large} />;
}

/** Placeholder while something loads: a status line, a thin progress bar and skeleton rows. */
export function Loading({ title, steps = [], rows = 4 }: { title: string; steps?: string[]; rows?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (i >= steps.length - 1) return;
    const t = setTimeout(() => setI(i + 1), 1100);
    return () => clearTimeout(t);
  }, [i, steps.length]);
  return (
    <div className="card loading-card" aria-busy="true" aria-live="polite">
      <div className="msg"><span className="spinner" /><span>{steps.length ? steps[i] : title}</span></div>
      <div className="progress-line indeterminate mb"><i /></div>
      <div className="stack tight">
        {Array.from({ length: rows }, (_, k) => <div key={k} className="skeleton" style={{ height: 12, width: `${92 - k * 13}%` }} />)}
      </div>
    </div>
  );
}

/** Empty state: an icon, a title, one sentence and an optional action. */
export function Empty({ icon, title, children, actions }: { icon: IconName; title: string; children?: ReactNode; actions?: ReactNode }) {
  return <EmptyState icon={icon} title={title} action={actions}>{children}</EmptyState>;
}

export function DemoBanner() {
  const { status } = useApp();
  if (!status?.demo) return null;
  return (
    <Banner tone="warn" title="Showing sample data"
      actions={status.desktop ? <Button size="sm" href="#/settings">Add API key</Button> : undefined}>
      {status.desktop ? "Add a YouTube Data API key to research real topics." : "This browser preview runs on sample data. The desktop app researches real topics."}
    </Banner>
  );
}

export function Reasons({ items }: { items: { type: Reason["type"] | "warn"; text: string; fix?: string }[] }) {
  const icon: Record<string, IconName> = { good: "check", bad: "x", warn: "warn", info: "info" };
  return (
    <ul className="reasons">
      {items.map((x, i) => (
        <li key={i} className={x.type}>
          <Icon name={icon[x.type]} />
          <span>{x.text}{x.fix && <span className="fix">{x.fix}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

export function Checklist({ items }: { items: string[] }) {
  return <ol className="steps-list">{items.map((t) => <li key={t}><span>{t}</span></li>)}</ol>;
}

export function CopyButton({ text, what = "Copied", label, size = "sm" }: { text: string | (() => string); what?: string; label?: string; size?: "sm" }) {
  const { toast } = useApp();
  const copy = async () => {
    const value = typeof text === "function" ? text() : text;
    try { await navigator.clipboard.writeText(value); } catch {
      const ta = document.createElement("textarea");
      ta.value = value; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      ta.remove();
    }
    toast(what);
  };
  return label
    ? <Button size={size} icon="copy" onClick={copy}>{label}</Button>
    : <Button size={size} variant="ghost" iconOnly icon="copy" label="Copy" onClick={copy} />;
}

export const Seg = Segmented;
export const Chips = ChipGroup;

export function Toggle({ checked, onChange, children }: { checked: boolean; onChange(v: boolean): void; children: ReactNode }) {
  return (
    <label className="toggle">
      <Switch checked={checked} onChange={onChange} label={typeof children === "string" ? children : "Toggle"} />
      <span>{children}</span>
    </label>
  );
}

export function Delta({ value, suffix = "" }: { value: number | null | undefined; suffix?: string }) {
  if (value == null || !Number.isFinite(value) || value === 0) return <span className="delta">–</span>;
  return <span className={`delta ${value > 0 ? "up" : "down"}`}>{value > 0 ? "+" : "−"}{Math.abs(Math.round(value))}{suffix}</span>;
}

// -------------------------------------------------------------- search box
export function SearchBox({ value = "", onSubmit, placeholder = "Enter a topic or video idea", button = "Analyze", autoFocus }:
  { value?: string; onSubmit(q: string): void; placeholder?: string; button?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState(value);
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setQ(value), [value]);

  const load = (text: string) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (text.trim().length < 2) { setItems([]); return; }
      try { setItems((await call("suggest", text.trim())).slice(0, 8)); } catch { setItems([]); }
      setActive(-1);
    }, 200);
  };
  const submit = (text: string) => { setOpen(false); if (text.trim()) onSubmit(text.trim()); };

  return (
    <form className="search-hero" autoComplete="off" role="search" onSubmit={(e) => { e.preventDefault(); submit(active >= 0 ? items[active] : q); }}>
      <Icon name="search" className="search-icon" />
      <input className="input" data-search value={q} placeholder={placeholder} maxLength={200} required autoFocus={autoFocus} aria-label="Topic"
        aria-autocomplete="list" aria-expanded={open && items.length > 0}
        onChange={(e) => { setQ(e.target.value); setOpen(true); load(e.target.value); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === "ArrowDown") { setActive(Math.min(items.length - 1, active + 1)); e.preventDefault(); }
          else if (e.key === "ArrowUp") { setActive(Math.max(-1, active - 1)); e.preventDefault(); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      <Button type="submit" variant="primary">{button}</Button>
      {open && items.length > 0 && (
        <div className="suggest-box" role="listbox">
          {items.map((s, i) => (
            <button key={s} type="button" role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); setQ(s); submit(s); }}><Icon name="search" />{s}</button>
          ))}
        </div>
      )}
    </form>
  );
}

export const compact = fmt;
