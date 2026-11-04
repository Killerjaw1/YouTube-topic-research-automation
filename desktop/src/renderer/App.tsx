import { type ReactNode, useEffect, useRef, useState } from "react";
import { isWindows, onAppEvent, profiles, type UpdateState, updates } from "./api";
import { switchChannelDialog } from "./components/Channels";
import { CommandPalette, type NavItem } from "./components/CommandPalette";
import { Icon } from "./components/Icon";
import { Button, Dialog, Status, type Tone } from "./components/kit";
import { Onboarding } from "./components/Onboarding";
import { Kbd, parseRoute, type Route, useApp } from "./components/ui";
import { fmt } from "./format";
import { AnalyticsPage } from "./pages/Analytics";
import { AnalyzePage, ReportPage } from "./pages/Analyze";
import { ComparePage } from "./pages/Compare";
import { Dashboard } from "./pages/Dashboard";
import { DiscoverPage } from "./pages/Discover";
import { HistoryPage } from "./pages/History";
import { IdeasPage } from "./pages/Ideas";
import { OptimizerPage } from "./pages/Optimizer";
import { OutliersPage } from "./pages/Outliers";
import { SettingsPage } from "./pages/Settings";
import { TrendingPage } from "./pages/Trending";
import { WatchlistPage } from "./pages/Watchlist";
import { CompetitorsPage } from "./pages/Competitors";
import { PlannerPage } from "./pages/Planner";

const SECTIONS: [string, NavItem[]][] = [
  ["Research", [
    { id: "dashboard", label: "Overview", icon: "home", shortcut: "Ctrl 1" },
    { id: "analyze", label: "Analyze topic", icon: "search", shortcut: "Ctrl 2" },
    { id: "discover", label: "Discover ideas", icon: "compass", shortcut: "Ctrl 3" },
    { id: "outliers", label: "Outliers", icon: "rocket", shortcut: "Ctrl 4" },
    { id: "trending", label: "Trending", icon: "flame", shortcut: "Ctrl 5" },
    { id: "competitors", label: "Competitors", icon: "users" },
  ]],
  ["Plan", [
    { id: "watchlist", label: "Watchlist", icon: "eye", shortcut: "Ctrl 6" },
    { id: "compare", label: "Compare", icon: "columns" },
    { id: "optimizer", label: "Upload optimizer", icon: "wand", shortcut: "Ctrl 7" },
    { id: "ideas", label: "Idea board", icon: "board", shortcut: "Ctrl 8" },
    { id: "planner", label: "Planner", icon: "calendar" },
  ]],
  ["Channel", [
    { id: "analytics", label: "Analytics", icon: "chart", shortcut: "Ctrl 9" },
    { id: "history", label: "History", icon: "clock" },
  ]],
];
const NAV = SECTIONS.flatMap(([, items]) => items);
const SETTINGS: NavItem = { id: "settings", label: "Settings", icon: "gear", shortcut: "Ctrl ," };

/** Page renderers. `narrow` pages (settings) use the 720px body; the rest use the wide body. */
const PAGES: Record<string, { render(r: Route): ReactNode; narrow?: boolean }> = {
  dashboard: { render: () => <Dashboard /> },
  analyze: { render: (r) => <AnalyzePage route={r} /> },
  report: { render: (r) => <ReportPage id={Number(r.id)} /> },
  discover: { render: (r) => <DiscoverPage route={r} /> },
  outliers: { render: (r) => <OutliersPage route={r} /> },
  trending: { render: (r) => <TrendingPage route={r} /> },
  competitors: { render: (r) => <CompetitorsPage route={r} /> },
  watchlist: { render: () => <WatchlistPage /> },
  compare: { render: (r) => <ComparePage route={r} /> },
  optimizer: { render: (r) => <OptimizerPage route={r} /> },
  ideas: { render: () => <IdeasPage /> },
  planner: { render: () => <PlannerPage /> },
  analytics: { render: (r) => <AnalyticsPage route={r} /> },
  history: { render: () => <HistoryPage /> },
  settings: { render: () => <SettingsPage />, narrow: true },
};

export function ShortcutsDialog({ close }: { close(): void }) {
  const rows: [string, string][] = [
    ["Ctrl K", "Search, analyze a topic or jump to any page"],
    ["/", "Move to the search box on this page"],
    ["Ctrl 1 – 9", "Go to a section"],
    ["Ctrl ,", "Open settings"],
    ["Ctrl /", "Show these shortcuts"],
    ["Esc", "Close a dialog or the details panel"],
  ];
  return (
    <Dialog title="Keyboard shortcuts" desc="Everything in NicheRadar works from the keyboard." footer={<Button variant="primary" onClick={close}>Done</Button>}>
      <div className="list">
        {rows.map(([k, v]) => <div key={k} className="list-row" style={{ padding: "8px 0" }}><span className="body t2">{v}</span><Kbd keys={k} /></div>)}
      </div>
    </Dialog>
  );
}

/** One line of app status, shared by the title bar and the sidebar card. */
function useAppStatus(): { tone: Tone; line: string; detail: string; upd: UpdateState } {
  const { status } = useApp();
  const [upd, setUpd] = useState<UpdateState>({ state: "idle" });
  useEffect(() => {
    updates.state().then(setUpd).catch(() => undefined);
    return updates.onChange(setUpd);
  }, []);
  if (!status) return { tone: "idle", line: "Starting…", detail: "", upd };
  const left = Math.max(status.quota_limit - status.quota_used, 0);
  if (status.demo) return { tone: "warn", line: "Sample data", detail: status.desktop ? "Add an API key to use live data" : "Browser preview", upd };
  if (left === 0) return { tone: "danger", line: "Daily quota used", detail: "Resets at midnight Pacific time", upd };
  return { tone: left < status.quota_limit * 0.15 ? "warn" : "ok", line: "Live YouTube data", detail: `${fmt(left)} of ${fmt(status.quota_limit)} quota left today`, upd };
}

export function App() {
  const { status, palette, modal, refresh, panel } = useApp();
  const [route, setRoute] = useState(parseRoute);
  // A page is rebuilt only when the user navigates (hashchange). Pages that record their state in the
  // address with history.replaceState (a search topic, for example) must not be remounted by it.
  const [visit, setVisit] = useState(0);
  const [onboarding, setOnboarding] = useState<boolean | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const app = useAppStatus();
  // The active channel profile's name, shown in the sidebar until a YouTube channel is added to it.
  const [profileName, setProfileName] = useState<string | null>(null);
  useEffect(() => {
    if (!profiles.supported) return;
    profiles.run("list").then((p) => { const n = p.list.find((x) => x.id === p.active)?.name; setProfileName(p.list.length > 1 && n ? n : null); }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const onHash = () => { setRoute(parseRoute()); setVisit((n) => n + 1); setNavOpen(false); mainRef.current?.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => { if (status && onboarding === null) setOnboarding(!status.onboarded); }, [status, onboarding]);
  // The main process asks to open a page (a notification was clicked) or to reload counts (the weekly check ran).
  useEffect(() => onAppEvent((e) => {
    if (e.type === "navigate") location.hash = e.hash;
    else if (e.type === "refresh") refresh();
  }), [refresh]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); palette.setOpen(!palette.open); return; }
      if (mod && e.key === ",") { e.preventDefault(); location.hash = "#/settings"; return; }
      if (mod && e.key === "/") { e.preventDefault(); modal((close) => <ShortcutsDialog close={close} />); return; }
      if (mod && /^[1-9]$/.test(e.key)) {
        const target = NAV.find((n) => n.shortcut === `Ctrl ${e.key}`);
        if (target) { e.preventDefault(); location.hash = `#/${target.id}`; }
        return;
      }
      if (e.key === "/" && !typing) {
        const el = document.querySelector<HTMLInputElement>("[data-search], .page input.input");
        if (el) { e.preventDefault(); el.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [palette, modal]);

  const page = PAGES[route.page] ? route.page : "dashboard";
  const active = page === "report" ? "analyze" : page;
  const label = [...NAV, SETTINGS].find((n) => n.id === active)?.label ?? "Overview";
  useEffect(() => { document.title = `${label} · NicheRadar`; }, [label]);
  const ch = status?.my_channel;
  const count = (id: string) => (id === "ideas" ? status?.counts.ideas : id === "watchlist" ? status?.counts.tracked : id === "history" ? status?.counts.scans : undefined);
  const navLink = (n: NavItem) => (
    <a key={n.id} href={`#/${n.id}`} aria-current={active === n.id ? "page" : undefined} title={n.shortcut ? `${n.label} (${n.shortcut.replace(" ", "+")})` : n.label}>
      <Icon name={n.icon} /><span>{n.label}</span>{count(n.id) ? <span className="count">{count(n.id)}</span> : null}
    </a>
  );

  return (
    <div className="shell">
      <header className={`titlebar ${isWindows ? "has-overlay" : ""}`}>
        <div className="brand">
          <span className="nav-toggle"><Button iconOnly icon={navOpen ? "close" : "menu"} label={navOpen ? "Close navigation" : "Open navigation"} variant="ghost" size="sm" onClick={() => setNavOpen(!navOpen)} aria-expanded={navOpen} /></span>
          <img src="./logo.svg" alt="" /><span className="brand-name">NicheRadar</span>
        </div>
        <div className="center">
          <button className="search-trigger" onClick={() => palette.setOpen(true)} aria-label="Search or analyze a topic (Ctrl+K)">
            <Icon name="search" size={14} /><span>Search or analyze a topic</span><Kbd keys="Ctrl K" />
          </button>
        </div>
        <div className="right">
          {app.upd.state === "ready"
            ? <Button size="sm" variant="primary" icon="update" onClick={() => updates.install()}>Restart to update</Button>
            : <Status tone={app.tone}>{app.line}</Status>}
        </div>
      </header>

      <div className="frame">
        <div className={`scrim ${navOpen ? "open" : ""}`} onClick={() => setNavOpen(false)} />
        <aside className={`sidebar ${navOpen ? "open" : ""}`}>
          <nav className="nav" aria-label="Main">
            {SECTIONS.map(([section, items]) => [<div key={section} className="label">{section}</div>, ...items.map(navLink)])}
          </nav>
          <div className="sidebar-foot">
            <a className="status-card" href="#/settings" title="Data source and quota">
              <span className="line"><span className={`dot ${app.tone}`} />{app.line}</span>
              {app.detail && <span className="secondary">{app.detail}</span>}
              {status && !status.demo && <div className="meter"><i className={app.tone} style={{ width: `${Math.max(0, 100 - (status.quota_used / status.quota_limit) * 100)}%` }} /></div>}
            </a>
            {profiles.supported ? (
              <button type="button" className="status-card" title="Switch channel" onClick={() => switchChannelDialog(modal)}>
                <span className="line"><span className="avatar sm">{ch?.thumb ? <img src={ch.thumb} alt="" /> : <Icon name="user" size={12} />}</span>
                  <span className="ellipsis grow">{ch ? ch.title : profileName ?? "Add your channel"}</span><Icon name="swap" size={14} /></span>
                <span className="secondary" style={{ paddingLeft: 32 }}>{ch ? `${fmt(ch.subs)} subscribers` : profileName ? "Add the channel in Settings" : "Scores adapt to your size"}</span>
              </button>
            ) : (
              <a className="status-card" href="#/settings" title="Your channel">
                <span className="line"><span className="avatar sm">{ch?.thumb ? <img src={ch.thumb} alt="" /> : <Icon name="user" size={12} />}</span>
                  <span className="ellipsis">{ch ? ch.title : "Add your channel"}</span></span>
                <span className="secondary" style={{ paddingLeft: 32 }}>{ch ? `${fmt(ch.subs)} subscribers` : "Scores adapt to your size"}</span>
              </a>
            )}
            <nav className="nav">{navLink(SETTINGS)}</nav>
          </div>
        </aside>

        <div className="workspace">
          <main className="main" ref={mainRef}>
            <div className={`page ${PAGES[page].narrow ? "narrow" : ""}`} key={visit}>{PAGES[page].render(route)}</div>
          </main>
          {panel.node}
        </div>
      </div>

      <CommandPalette nav={[...NAV, SETTINGS]} />
      {onboarding && <Onboarding onDone={() => { setOnboarding(false); refresh(); }} />}
    </div>
  );
}
