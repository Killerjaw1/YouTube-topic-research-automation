/**
 * The component kit. Every screen is built from these; none of them hard-codes a colour, font or size
 * (all of that lives in tokens in styles.css).
 */

import { type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode, useEffect, useRef, useState } from "react";
import { hue } from "../format";
import { Icon, type IconName } from "./Icon";

export type Tone = "ok" | "warn" | "danger" | "idle" | "accent";

// ------------------------------------------------------------------ Button
type BtnVariant = "default" | "primary" | "ghost" | "danger";
interface BtnOwn { variant?: BtnVariant; size?: "sm" | "lg"; icon?: IconName; iconOnly?: boolean; busy?: boolean; pressed?: boolean; label?: string }
type BtnProps = BtnOwn & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { children?: ReactNode; href?: undefined };
type LinkBtnProps = BtnOwn & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & { children?: ReactNode; href: string };

function btnClass(o: BtnOwn, extra?: string) {
  return ["btn", o.variant && o.variant !== "default" ? o.variant : "", o.size ?? "", o.iconOnly ? "icon" : "", extra ?? ""].filter(Boolean).join(" ");
}

/** 30px button. Variants: primary, ghost, danger; sizes sm (26px) and lg (36px); `busy` shows a spinner. */
export function Button(props: BtnProps | LinkBtnProps) {
  const { variant, size, icon, iconOnly, busy, pressed, label, children, className, ...rest } = props as BtnProps & { href?: string };
  const inner = <>{busy ? <span className="spinner" /> : icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}{!iconOnly && children}</>;
  const cls = btnClass({ variant, size, iconOnly }, className);
  const a11y = { "aria-label": iconOnly ? label : undefined, title: label, "aria-pressed": pressed === undefined ? undefined : pressed, "aria-busy": busy || undefined };
  if ((rest as { href?: string }).href !== undefined) return <a className={cls} {...a11y} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>{inner}</a>;
  const b = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return <button type={b.type ?? "button"} className={cls} {...a11y} {...b} disabled={b.disabled || busy}>{inner}</button>;
}

// -------------------------------------------------------------------- Card
export function Card({ title, sub, actions, flush, children, className = "", id }:
  { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; flush?: boolean; children?: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`card ${flush ? "flush" : ""} ${className}`} id={id}>
      {(title || actions) && (
        <div className="card-head">
          <div>{title && <h2>{title}</h2>}{sub && <p className="sub">{sub}</p>}</div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ status
const TONE_ICON: Record<Tone, IconName> = { ok: "check", warn: "warn", danger: "x", idle: "info", accent: "info" };

export function Status({ tone = "idle", children }: { tone?: Tone; children: ReactNode }) {
  return <span className="status"><span className={`dot ${tone}`} />{children}</span>;
}

export function Tag({ tone, children, title }: { tone?: Tone | "cat-1" | "cat-2" | "cat-3" | "cat-4"; children: ReactNode; title?: string }) {
  return <span className={`tag ${tone && tone !== "idle" ? tone : ""}`} title={title}>{children}</span>;
}

export function StateCard({ tone = "accent", icon, title, children }: { tone?: Tone; icon?: IconName; title: ReactNode; children?: ReactNode }) {
  return (
    <div className={`state-card ${tone}`}>
      <Icon name={icon ?? TONE_ICON[tone]} size={18} fill />
      <div><b>{title}</b>{children && <span>{children}</span>}</div>
    </div>
  );
}

export function Banner({ tone = "warn", icon, title, children, actions }: { tone?: Tone; icon?: IconName; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={`banner ${tone}`} role="status">
      <Icon name={icon ?? (tone === "warn" ? "warn" : "info")} size={18} fill={tone === "warn"} />
      <div className="text"><b>{title}</b>{children && <span>{children}</span>}</div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action, card = true }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode; card?: boolean }) {
  const body = (
    <div className="empty-state">
      <Icon name={icon} size={24} />
      <b>{title}</b>
      {children && <p>{children}</p>}
      {action && <div className="actions">{action}</div>}
    </div>
  );
  return card ? <div className="card empty-card">{body}</div> : body;
}

// ---------------------------------------------------------------- controls
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange(v: boolean): void; label: string; disabled?: boolean }) {
  return (
    <span className="switch">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
    </span>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }:
  { value: T; options: [NoInfer<T>, string][]; onChange(v: NoInfer<T>): void; label?: string }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map(([v, l]) => <button key={String(v)} type="button" role="tab" aria-selected={v === value} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

export function Chip({ pressed, count, onClick, children }: { pressed?: boolean; count?: number; onClick?(): void; children: ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick}>
      {children}{count !== undefined && <span className="count">{count}</span>}
    </button>
  );
}

export function ChipGroup<T extends string>({ value, options, onChange, counts }:
  { value: T; options: [NoInfer<T>, string][]; onChange(v: NoInfer<T>): void; counts?: Partial<Record<NoInfer<T>, number>> }) {
  return (
    <div className="chips" role="group">
      {options.map(([v, l]) => <Chip key={v} pressed={v === value} count={counts?.[v]} onClick={() => onChange(v)}>{l}</Chip>)}
    </div>
  );
}

// ------------------------------------------------------------ setting rows
export function SettingsGroup({ id, title, desc, children }: { id?: string; title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <section className="settings-group" id={id}>
      <h2>{title}</h2>
      {desc && <p>{desc}</p>}
      <div className="card">{children}</div>
    </section>
  );
}

export function SettingRow({ title, desc, children, stacked }: { title: ReactNode; desc?: ReactNode; children?: ReactNode; stacked?: boolean }) {
  return (
    <div className={`setting-row ${stacked ? "stacked" : ""}`}>
      <div className="text"><b>{title}</b>{desc && <span>{desc}</span>}</div>
      {children && <div className="control">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- list row
export function ListRow({ leading, title, secondary, end, onClick, href, selected, className = "" }:
  { leading?: ReactNode; title: ReactNode; secondary?: ReactNode; end?: ReactNode; onClick?(): void; href?: string; selected?: boolean; className?: string }) {
  const content = <>{leading}<div className="body"><div className="title">{title}</div>{secondary && <div className="secondary">{secondary}</div>}</div>{end && <div className="end">{end}</div>}</>;
  if (href) return <a className={`list-row ${className}`} href={href} aria-selected={selected}>{content}</a>;
  return (
    <div className={`list-row ${onClick ? "clickable" : ""} ${className}`} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} aria-selected={selected}
      onClick={onClick} onKeyDown={(e) => { if (onClick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick(); } }}>
      {content}
    </div>
  );
}

// --------------------------------------------------------------- thumbnail
const CATS = ["cat-1", "cat-2", "cat-3", "cat-4"] as const;
/** A video tile: the thumbnail, or the channel's initials on a tinted background with a thin category strip. */
export function Thumbnail({ src, title, name, category, large }: { src?: string; title?: string; name?: string; category?: string; large?: boolean }) {
  const cat = category ?? CATS[hue(title || name || "?") % 4];
  const initials = (name || title || "?").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className={`thumb ${large ? "lg" : ""}`} style={src ? undefined : { background: `color-mix(in srgb, var(--${cat}) 20%, var(--bg-sunken))`, color: `var(--${cat})` }}>
      {src ? <img src={src} alt="" loading="lazy" /> : <span className="initials">{initials}</span>}
      {!src && <span className="banner-strip" style={{ background: `var(--${cat})` }} />}
    </div>
  );
}

// ------------------------------------------------------------------- menu
export type MenuItem = { label: string; icon?: IconName; onSelect(): void; danger?: boolean } | "sep";

export function Menu({ items, label = "More actions", icon = "more", size }: { items: MenuItem[]; label?: string; icon?: IconName; size?: "sm" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>(".menu button") ?? [])];
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        btns[(i + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length]?.focus();
        e.preventDefault();
      }
    };
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", key);
    setTimeout(() => ref.current?.querySelector<HTMLButtonElement>(".menu button")?.focus(), 0);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      <Button iconOnly icon={icon} label={label} size={size} variant="ghost" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} />
      {open && (
        <div className="menu" role="menu">
          {items.map((it, i) => it === "sep" ? <div key={i} className="menu-sep" /> : (
            <button key={it.label} role="menuitem" className={it.danger ? "danger" : ""} onClick={() => { setOpen(false); it.onSelect(); }}>
              {it.icon && <Icon name={it.icon} />}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ dialog
/** Dialog content. The backdrop, Escape and focus come from the app's `modal()`. */
export function Dialog({ title, desc, children, footer }: { title: string; desc?: ReactNode; children?: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <div className="dialog-head"><h2 id="dialog-title">{title}</h2>{desc && <p>{desc}</p>}</div>
      {children && <div className="dialog-body">{children}</div>}
      {footer && <div className="dialog-foot">{footer}</div>}
    </>
  );
}

// ------------------------------------------------------------ detail panel
export function DetailPanel({ title, sub, onClose, children, footer, actions }:
  { title: ReactNode; sub?: ReactNode; onClose(): void; children: ReactNode; footer?: ReactNode; actions?: ReactNode }) {
  return (
    <aside className="detail-panel" aria-label="Details">
      <div className="panel-head">
        <div><h2>{title}</h2>{sub && <div className="secondary">{sub}</div>}</div>
        {actions}
        <Button iconOnly icon="close" label="Close details" variant="ghost" size="sm" onClick={onClose} />
      </div>
      <div className="panel-body">{children}</div>
      {footer && <div className="panel-foot">{footer}</div>}
    </aside>
  );
}

export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return <dl className="facts">{rows.map(([k, v]) => [<dt key={k + "t"}>{k}</dt>, <dd key={k + "d"}>{v}</dd>])}</dl>;
}
