/** Ctrl+K command palette: jump to any page, analyze a topic, or reopen a recent report. */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ScanMeta } from "../../core/types";
import { call } from "../api";
import { Icon, type IconName } from "./Icon";
import { analyzeLink, go, useApp } from "./ui";

export interface NavItem { id: string; label: string; icon: IconName; shortcut?: string }

interface Item { key: string; group: string; label: string; icon: IconName; hint?: string; run(): void }

export function CommandPalette({ nav }: { nav: NavItem[] }) {
  const { palette, setTheme, theme } = useApp();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<ScanMeta[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!palette.open) return;
    setQ(""); setActive(0);
    call("listScans").then((s) => setRecent(s.slice(0, 30))).catch(() => undefined);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [palette.open]);

  const items = useMemo<Item[]>(() => {
    const text = q.trim();
    const t = text.toLowerCase();
    const close = () => palette.setOpen(false);
    const out: Item[] = [];
    if (text) {
      out.push({ key: "analyze", group: "Actions", label: `Analyze “${text}”`, icon: "target", hint: "Enter", run: () => { close(); go(analyzeLink(text)); } });
      out.push({ key: "outliers", group: "Actions", label: `Find outliers for “${text}”`, icon: "rocket", run: () => { close(); go(`#/outliers?q=${encodeURIComponent(text)}`); } });
      out.push({ key: "discover", group: "Actions", label: `Discover ideas around “${text}”`, icon: "compass", run: () => { close(); go(`#/discover?seed=${encodeURIComponent(text)}`); } });
    }
    for (const n of nav) {
      if (!t || n.label.toLowerCase().includes(t)) out.push({ key: "nav-" + n.id, group: "Go to", label: n.label, icon: n.icon, hint: n.shortcut, run: () => { close(); go(`#/${n.id}`); } });
    }
    const themes: [typeof theme, string][] = [["system", "Use system theme"], ["dark", "Use dark theme"], ["light", "Use light theme"]];
    for (const [v, l] of themes) {
      if (v !== theme && (!t || l.toLowerCase().includes(t) || "theme".includes(t))) out.push({ key: "theme-" + v, group: "Preferences", label: l, icon: v === "light" ? "sun" : "moon", run: () => { close(); setTheme(v); } });
    }
    for (const r of recent.filter((s) => !t || s.query.toLowerCase().includes(t)).slice(0, 8)) {
      out.push({ key: "scan-" + r.id, group: "Recent reports", label: r.query, icon: r.kind === "outliers" ? "rocket" : "file",
        hint: r.score != null ? String(r.score) : undefined, run: () => { close(); go(`#/report/${r.id}`); } });
    }
    return out;
  }, [q, nav, recent, theme, palette, setTheme]);

  useEffect(() => { setActive(0); }, [q]);
  if (!palette.open) return null;

  let lastGroup = "";
  return (
    <div className="palette-back" onMouseDown={(e) => e.target === e.currentTarget && palette.setOpen(false)}>
      <div className="palette" role="dialog" aria-label="Command palette">
        <input ref={inputRef} value={q} placeholder="Type a topic to analyze, or search pages and reports" onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") palette.setOpen(false);
            else if (e.key === "ArrowDown") { setActive((a) => Math.min(items.length - 1, a + 1)); e.preventDefault(); }
            else if (e.key === "ArrowUp") { setActive((a) => Math.max(0, a - 1)); e.preventDefault(); }
            else if (e.key === "Enter") items[active]?.run();
          }} />
        <div className="results">
          {items.map((it, i) => {
            const head = it.group !== lastGroup ? <div className="group">{it.group}</div> : null;
            lastGroup = it.group;
            return (
              <div key={it.key}>
                {head}
                <button className={`item ${i === active ? "active" : ""}`} onMouseEnter={() => setActive(i)} onClick={it.run}>
                  <Icon name={it.icon} /><span className="ellipsis">{it.label}</span>{it.hint && <span className="hint">{it.hint}</span>}
                </button>
              </div>
            );
          })}
          {!items.length && <div className="empty" style={{ padding: 20 }}>No matches</div>}
        </div>
        <div className="foot"><span><kbd>↑</kbd> <kbd>↓</kbd> to move</span><span><kbd>Enter</kbd> to select</span><span><kbd>Esc</kbd> to close</span></div>
      </div>
    </div>
  );
}
