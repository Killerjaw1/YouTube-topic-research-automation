/** Shared UI building blocks: app context, toasts, modal, tooltip, badges, search box. */

import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Reason, Status, VideoRow } from "../../core/types";
import { call } from "../api";
import { fmt, hue, tone } from "../format";
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

// ------------------------------------------------------------------ context
interface Toast { id: number; text: string; kind: "ok" | "err" | "info" }
interface AppCtx {
  status: Status | null;
  refresh(): Promise<void>;
  toast(text: string, kind?: Toast["kind"], ms?: number): void;
  fail(e: unknown): void;
  modal(render: (close: () => void) => ReactNode, wide?: boolean): void;
  tip: { show(content: ReactNode, e: { clientX: number; clientY: number }): void; move(e: { clientX: number; clientY: number }): void; hide(): void };
}
const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modalState, setModal] = useState<{ render: (close: () => void) => ReactNode; wide?: boolean } | null>(null);
  const [tipContent, setTipContent] = useState<ReactNode>(null);
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
    if (!modalState) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeModal(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalState, closeModal]);

  return (
    <Ctx.Provider value={{ status, refresh, toast, fail, modal, tip }}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}><Icon name={t.kind === "err" ? "x" : t.kind === "info" ? "info" : "check"} /><div>{t.text}</div></div>
        ))}
      </div>
      <div ref={tipRef} className={`tooltip ${tipContent ? "" : "hidden"}`}>{tipContent}</div>
      {modalState && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" role="dialog" aria-modal="true" style={modalState.wide ? { width: "min(840px, 100%)" } : undefined}>
            {modalState.render(closeModal)}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

// ------------------------------------------------------------------ pieces
export function ScorePill({ score, big }: { score: number | null | undefined; big?: boolean }) {
  if (score == null) return <span className="score-pill" style={{ background: "var(--panel-3)" }}>–</span>;
  return <span className={`score-pill ${tone(score)}`} style={big ? { fontSize: 22, height: 46, minWidth: 64 } : undefined}>{Math.round(score)}</span>;
}

export function SizeBadge({ v }: { v: VideoRow }) {
  const s = v.size ?? "unknown";
  const label = { small: "Small", mid: "Mid", big: "Big", unknown: "Hidden" }[s];
  return <span className={`badge ${s === "unknown" ? "neutral" : s}`}>{label}</span>;
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
  return <div className={className} style={{ background: `linear-gradient(135deg,hsl(${h} 55% 38%),hsl(${(h + 40) % 360} 60% 24%))` }}>{initials}</div>;
}

export function Loading({ title, steps = [] }: { title: string; steps?: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (i >= steps.length - 1) return;
    const t = setTimeout(() => setI(i + 1), 900);
    return () => clearTimeout(t);
  }, [i, steps.length]);
  return (
    <div className="card loading-card">
      <div className="spinner" />
      <div><b>{title}</b></div>
      {steps.length > 0 && (
        <div className="steps">{steps.map((s, j) => <div key={s} className={j < i ? "done" : j === i ? "on" : ""}>{j < i ? "✓ " : j === i ? "• " : ""}{s}</div>)}</div>
      )}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return <div className="card empty"><Icon name={icon} /><b>{title}</b>{children}</div>;
}

export function DemoBanner() {
  const { status } = useApp();
  if (!status?.demo) return null;
  return (
    <div className="banner">
      <Icon name="info" />
      <div className="grow">
        <b>You're exploring with demo data. </b>
        <span className="t2">
          {status.desktop ? "Every number here is made up so you can try the app. Add a free YouTube Data API key to research real topics."
            : "This is the browser preview running on made-up data. Install the desktop app to research real YouTube topics."}
        </span>
      </div>
      {status.desktop && <a className="btn sm primary" href="#/settings">Add API key</a>}
    </div>
  );
}

export function Reasons({ items }: { items: { type: Reason["type"]; text: string }[] }) {
  return (
    <ul className="reasons">
      {items.map((x, i) => (
        <li key={i} className={x.type}><Icon name={x.type === "good" ? "check" : x.type === "bad" ? "x" : "info"} /><span>{x.text}</span></li>
      ))}
    </ul>
  );
}

export function Checklist({ items }: { items: string[] }) {
  return <Reasons items={items.map((text) => ({ type: "good", text }))} />;
}

export function CopyButton({ text, what = "Copied", label, className = "btn sm ghost" }: { text: string | (() => string); what?: string; label?: string; className?: string }) {
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
  return <button type="button" className={className} onClick={copy} title="Copy"><Icon name="copy" />{label}</button>;
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [NoInfer<T>, string][]; onChange(v: NoInfer<T>): void }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => <button key={String(v)} type="button" className={v === value ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}
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

// -------------------------------------------------------------- search box
export function SearchBox({ value = "", onSubmit, placeholder = 'Enter a topic or video idea, e.g. "budget gaming pc"', button = "Analyze" }:
  { value?: string; onSubmit(q: string): void; placeholder?: string; button?: string }) {
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
    }, 220);
  };
  const submit = (text: string) => { setOpen(false); if (text.trim()) onSubmit(text.trim()); };

  return (
    <form className="search-hero" autoComplete="off" onSubmit={(e) => { e.preventDefault(); submit(active >= 0 ? items[active] : q); }}>
      <Icon name="search" className="search-icon" />
      <input className="input" value={q} placeholder={placeholder} maxLength={200} required
        onChange={(e) => { setQ(e.target.value); setOpen(true); load(e.target.value); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === "ArrowDown") { setActive(Math.min(items.length - 1, active + 1)); e.preventDefault(); }
          else if (e.key === "ArrowUp") { setActive(Math.max(-1, active - 1)); e.preventDefault(); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      <button className="btn primary" type="submit"><Icon name="target" />{button}</button>
      {open && items.length > 0 && (
        <div className="suggest-box">
          {items.map((s, i) => (
            <button key={s} type="button" className={i === active ? "active" : ""} onMouseDown={(e) => { e.preventDefault(); setQ(s); submit(s); }}>{s}</button>
          ))}
        </div>
      )}
    </form>
  );
}

export const compact = fmt;
