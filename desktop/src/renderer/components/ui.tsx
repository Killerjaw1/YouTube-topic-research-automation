/** Shared UI building blocks: app context, toasts, modal, tooltip, badges, inputs, loading states. */

import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Reason, Status, VideoRow } from "../../core/types";
import { call, setNativeTheme } from "../api";
import { fmt, hue, store, tone } from "../format";
import { Icon, type IconName } from "./Icon";

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
interface Toast { id: number; text: string; kind: "ok" | "err" | "info" }
interface AppCtx {
  status: Status | null;
  refresh(): Promise<void>;
  toast(text: string, kind?: Toast["kind"], ms?: number): void;
  fail(e: unknown): void;
  modal(render: (close: () => void) => ReactNode, wide?: boolean): void;
  tip: { show(content: ReactNode, e: { clientX: number; clientY: number }): void; move(e: { clientX: number; clientY: number }): void; hide(): void };
  theme: ThemePref;
  setTheme(p: ThemePref): void;
  palette: { open: boolean; setOpen(v: boolean): void };
}
const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modalState, setModal] = useState<{ render: (close: () => void) => ReactNode; wide?: boolean } | null>(null);
  const [tipContent, setTipContent] = useState<ReactNode>(null);
  const [theme, setThemeState] = useState<ThemePref>(() => store<ThemePref>("theme-pref") ?? "system");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  const refresh = useCallback(async () => {
    try { setStatus(await call("status")); } catch { /* engine not ready */ }
  }, []);
  const toast = useCallback((text: string, kind: Toast["kind"] = "ok", ms = 4200) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);
  const fail = useCallback((e: unknown) => toast((e as Error)?.message ?? String(e), "err", 7000), [toast]);
  const closeModal = useCallback(() => setModal(null), []);
  const modal = useCallback((render: (close: () => void) => ReactNode, wide?: boolean) => setModal({ render, wide }), []);
  const setTheme = useCallback((p: ThemePref) => { setThemeState(p); applyTheme(p); }, []);

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
  useEffect(() => {
    if (!modalState) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeModal(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalState, closeModal]);

  return (
    <Ctx.Provider value={{ status, refresh, toast, fail, modal, tip, theme, setTheme, palette: { open: paletteOpen, setOpen: setPaletteOpen } }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}><Icon name={t.kind === "err" ? "x" : t.kind === "info" ? "info" : "check"} /><div>{t.text}</div></div>
        ))}
      </div>
      <div ref={tipRef} className={`tooltip ${tipContent ? "" : "hidden"}`}>{tipContent}</div>
      {modalState && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" role="dialog" aria-modal="true" style={modalState.wide ? { width: "min(820px, 100%)" } : undefined}>
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
  if (score == null) return <span className={`score-pill neutral ${big ? "lg" : ""}`}>–</span>;
  return <span className={`score-pill ${tone(score)} ${big ? "lg" : ""}`}>{Math.round(score)}</span>;
}

const SIZE_LABEL = { small: "Small", mid: "Mid-size", big: "Large", unknown: "Hidden" } as const;
const SIZE_COLOR = { small: "var(--s-small)", mid: "var(--s-mid)", big: "var(--s-big)", unknown: "var(--faint)" } as const;
export function SizeBadge({ v }: { v: VideoRow }) {
  const s = v.size ?? "unknown";
  return <span className="size-tag"><i style={{ background: SIZE_COLOR[s] }} />{SIZE_LABEL[s]}</span>;
}

export function FormatBadge({ format }: { format: string | null | undefined }) {
  return format === "short"
    ? <span className="badge short"><Icon name="phone" />Short</span>
    : <span className="badge long"><Icon name="play" />Long</span>;
}

export function Thumb({ v, className = "thumb" }: { v: { thumbnail?: string; title?: string; id?: string; channel_title?: string }; className?: string }) {
  if (v.thumbnail) return <img className={className} src={v.thumbnail} alt="" loading="lazy" />;
  const h = hue(v.title || v.id || "?");
  const initials = (v.channel_title || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return <div className={className} style={{ background: `linear-gradient(135deg,hsl(${h} 28% 30%),hsl(${(h + 30) % 360} 30% 20%))` }}>{initials}</div>;
}

/** Skeleton placeholder with a status line. `steps` cycle as a progress message. */
export function Loading({ title, steps = [], rows = 4 }: { title: string; steps?: string[]; rows?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (i >= steps.length - 1) return;
    const t = setTimeout(() => setI(i + 1), 1100);
    return () => clearTimeout(t);
  }, [i, steps.length]);
  return (
    <div className="card loading-card" aria-busy="true">
      <div className="msg"><div className="spinner" /><span>{steps.length ? steps[i] : title}</span></div>
      <div className="progress-line indeterminate" style={{ marginBottom: 16 }}><i /></div>
      <div className="stack" style={{ gap: 10 }}>
        {Array.from({ length: rows }, (_, k) => <div key={k} className="skeleton" style={{ height: 14, width: `${92 - k * 13}%` }} />)}
      </div>
    </div>
  );
}

export function Empty({ icon, title, children, actions }: { icon: IconName; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="card empty">
      <Icon name={icon} /><b>{title}</b>
      <div>{children}</div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function DemoBanner() {
  const { status } = useApp();
  if (!status?.demo) return null;
  return (
    <div className="banner">
      <Icon name="info" />
      <div className="grow">
        <b>Sample data. </b>
        {status.desktop ? "Results are simulated until you add a YouTube Data API key." : "This browser preview uses simulated data. Install the desktop app to research real topics."}
      </div>
      {status.desktop && <a className="btn xs" href="#/settings">Add API key</a>}
    </div>
  );
}

export function Reasons({ items }: { items: { type: Reason["type"]; text: string; fix?: string }[] }) {
  return (
    <ul className="reasons">
      {items.map((x, i) => (
        <li key={i} className={x.type}>
          <Icon name={x.type === "good" ? "check" : x.type === "bad" ? "x" : "info"} />
          <span>{x.text}{x.fix && <span className="fix">{x.fix}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

export function Checklist({ items }: { items: string[] }) {
  return <ol className="steps-list">{items.map((t) => <li key={t}><span>{t}</span></li>)}</ol>;
}

export function CopyButton({ text, what = "Copied", label, className = "btn xs ghost" }: { text: string | (() => string); what?: string; label?: string; className?: string }) {
  const { toast } = useApp();
  const copy = async () => {
    const value = typeof text === "function" ? text() : text;
    try { await navigator.clipboard.writeText(value); } catch {
      const ta = document.createElement("textarea");
      ta.value = value; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      ta.remove();
    }
    toast(`${what} to clipboard`);
  };
  return <button type="button" className={className} onClick={copy} title="Copy to clipboard"><Icon name="copy" />{label}</button>;
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [NoInfer<T>, string][]; onChange(v: NoInfer<T>): void }) {
  return (
    <div className="seg" role="tablist">
      {options.map(([v, l]) => <button key={String(v)} type="button" role="tab" aria-selected={v === value} className={v === value ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

export function Chips<T extends string>({ value, options, onChange }: { value: T; options: [NoInfer<T>, string][]; onChange(v: NoInfer<T>): void }) {
  return (
    <div className="chips">
      {options.map(([v, l]) => <button key={v} type="button" className={`chip ${v === value ? "on" : ""}`} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

export function Toggle({ checked, onChange, children }: { checked: boolean; onChange(v: boolean): void; children: ReactNode }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="sw" />
      <span>{children}</span>
    </label>
  );
}

export function Delta({ value, suffix = "" }: { value: number | null | undefined; suffix?: string }) {
  if (value == null || !Number.isFinite(value) || value === 0) return <span className="delta muted">–</span>;
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
        onChange={(e) => { setQ(e.target.value); setOpen(true); load(e.target.value); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === "ArrowDown") { setActive(Math.min(items.length - 1, active + 1)); e.preventDefault(); }
          else if (e.key === "ArrowUp") { setActive(Math.max(-1, active - 1)); e.preventDefault(); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      <button className="btn primary" type="submit">{button}</button>
      {open && items.length > 0 && (
        <div className="suggest-box" role="listbox">
          {items.map((s, i) => (
            <button key={s} type="button" role="option" aria-selected={i === active} className={i === active ? "active" : ""}
              onMouseDown={(e) => { e.preventDefault(); setQ(s); submit(s); }}><Icon name="search" />{s}</button>
          ))}
        </div>
      )}
    </form>
  );
}

export const compact = fmt;
