import { type ReactNode, useEffect, useRef, useState } from "react";
import { isWindows, type UpdateState, updates } from "./api";
import { CommandPalette, type NavItem } from "./components/CommandPalette";
import { Icon } from "./components/Icon";
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

const SECTIONS: [string, NavItem[]][] = [
  ["Research", [
    { id: "dashboard", label: "Overview", icon: "home", shortcut: "Ctrl 1" },
    { id: "analyze", label: "Analyze topic", icon: "search", shortcut: "Ctrl 2" },
    { id: "discover", label: "Discover ideas", icon: "compass", shortcut: "Ctrl 3" },
    { id: "outliers", label: "Outliers", icon: "rocket", shortcut: "Ctrl 4" },
    { id: "trending", label: "Trending", icon: "flame", shortcut: "Ctrl 5" },
  ]],
  ["Plan", [
    { id: "watchlist", label: "Watchlist", icon: "eye", shortcut: "Ctrl 6" },
    { id: "compare", label: "Compare", icon: "columns" },
    { id: "optimizer", label: "Upload optimizer", icon: "wand", shortcut: "Ctrl 7" },
    { id: "ideas", label: "Idea board", icon: "board", shortcut: "Ctrl 8" },
  ]],
  ["Channel", [
    { id: "analytics", label: "Analytics", icon: "chart", shortcut: "Ctrl 9" },
    { id: "history", label: "History", icon: "clock" },
  ]],
];
const NAV = SECTIONS.flatMap(([, items]) => items);
const SETTINGS: NavItem = { id: "settings", label: "Settings", icon: "gear", shortcut: "Ctrl ," };

const PAGES: Record<string, (r: Route) => ReactNode> = {
  dashboard: () => <Dashboard />,
  analyze: (r) => <AnalyzePage route={r} />,
  report: (r) => <ReportPage id={Number(r.id)} />,
  discover: (r) => <DiscoverPage route={r} />,
  outliers: (r) => <OutliersPage route={r} />,
  trending: (r) => <TrendingPage route={r} />,
  watchlist: () => <WatchlistPage />,
  compare: (r) => <ComparePage route={r} />,
  optimizer: (r) => <OptimizerPage route={r} />,
  ideas: () => <IdeasPage />,
  analytics: (r) => <AnalyticsPage route={r} />,
  history: () => <HistoryPage />,
  settings: () => <SettingsPage />,
};

function ShortcutsHelp() {
  const rows: [string, string][] = [
    ["Ctrl K", "Command palette: analyze a topic or jump anywhere"],
    ["/", "Focus the search box on the current page"],
    ["Ctrl 1 – 9", "Go to a section"],
    ["Ctrl ,", "Settings"],
    ["Ctrl /", "Show keyboard shortcuts"],
    ["Esc", "Close a dialog"],
  ];
  return (
    <table className="data"><tbody>
      {rows.map(([k, v]) => <tr key={k}><td style={{ width: 120 }}><Kbd keys={k} /></td><td className="t2">{v}</td></tr>)}
    </tbody></table>
  );
}

function StatusBar() {
  const { status, modal } = useApp();
  const [upd, setUpd] = useState<UpdateState>({ state: "idle" });
  useEffect(() => {
    updates.state().then(setUpd).catch(() => undefined);
    return updates.onChange(setUpd);
  }, []);
  if (!status) return <footer className="statusbar" />;
  const left = Math.max(status.quota_limit - status.quota_used, 0);
  return (
    <footer className="statusbar">
      <span className="item"><span className={`dot ${status.demo ? "demo" : "live"}`} />{status.demo ? "Sample data" : "Live YouTube data"}</span>
      {!status.demo && <span className="item tabular">Quota {fmt(left)} of {fmt(status.quota_limit)} left today</span>}
      {status.analytics_connected && <span className="item"><Icon name="chart" />Analytics connected</span>}
      <span className="spacer" />
      {upd.state === "downloading" && <span className="item">Downloading update {upd.percent ?? 0}%</span>}
      {upd.state === "ready" && <button className="item" onClick={() => updates.install()}><Icon name="update" />Restart to update to {upd.version}</button>}
      <button className="item" onClick={() => modal((close) => <><h3>Keyboard shortcuts</h3><ShortcutsHelp /><div className="foot"><button className="btn" onClick={close}>Close</button></div></>)}>
        <Icon name="command" />Shortcuts
      </button>
      <span className="item">v{status.version}</span>
    </footer>
  );
}

export function App() {
  const { status, palette, modal, refresh } = useApp();
  const [route, setRoute] = useState(parseRoute);
  const [onboarding, setOnboarding] = useState<boolean | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onHash = () => { setRoute(parseRoute()); mainRef.current?.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => { if (status && onboarding === null) setOnboarding(!status.onboarded); }, [status, onboarding]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); palette.setOpen(!palette.open); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === ",") { e.preventDefault(); location.hash = "#/settings"; return; }
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        modal((close) => <><h3>Keyboard shortcuts</h3><ShortcutsHelp /><div className="foot"><button className="btn" onClick={close}>Close</button></div></>);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) {
        const target = NAV.find((n) => n.shortcut === `Ctrl ${e.key}`);
        if (target) { e.preventDefault(); location.hash = `#/${target.id}`; }
        return;
      }
      if (e.key === "/" && !typing) {
        const el = document.querySelector<HTMLInputElement>("[data-search], .content input.input");
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

  return (
    <div className="shell">
      <header className={`titlebar ${isWindows ? "has-overlay" : ""}`}>
        <div className="brand"><img src="./logo.svg" alt="" /><span className="brand-name">NicheRadar</span></div>
        <div className="center">
          <button className="palette-trigger" onClick={() => palette.setOpen(true)} aria-label="Open command palette">
            <Icon name="search" /><span>Search or analyze a topic</span><Kbd keys="Ctrl K" />
          </button>
        </div>
        <div className="right">
          <a className="btn ghost icon" href="#/settings" title="Settings (Ctrl+,)"><Icon name="gear" /></a>
        </div>
      </header>

      <div className="body">
        <aside className="sidebar">
          <nav className="nav" aria-label="Main">
            {SECTIONS.map(([section, items]) => [
              <div key={section} className="nav-label">{section}</div>,
              ...items.map((n) => {
                const count = n.id === "ideas" ? status?.counts.ideas : n.id === "watchlist" ? status?.counts.tracked : undefined;
                return (
                  <a key={n.id} href={`#/${n.id}`} className={active === n.id ? "active" : ""} aria-current={active === n.id ? "page" : undefined}>
                    <Icon name={n.icon} /><span>{n.label}</span>
                    {count ? <span className="count">{count}</span> : n.shortcut ? <span className="shortcut">{n.shortcut}</span> : null}
                  </a>
                );
              }),
            ])}
          </nav>
          <div className="sidebar-foot">
            {status && !status.demo && (
              <div className="side-card">
                <div className="row-between"><span>API quota today</span><b className="tabular">{fmt(Math.max(status.quota_limit - status.quota_used, 0))}</b></div>
                <div className="meter" style={{ marginTop: 8 }}><i style={{ width: `${Math.min(100, (status.quota_used / status.quota_limit) * 100)}%` }} /></div>
                <small>Resets at midnight Pacific time</small>
              </div>
            )}
            <a className="side-channel" href="#/settings">
              <div className="avatar">{ch?.thumb ? <img src={ch.thumb} alt="" /> : <Icon name="user" />}</div>
              <div className="meta">{ch ? <><b>{ch.title}</b><span>{fmt(ch.subs)} subscribers</span></> : <><b>Add your channel</b><span>Calibrates scores to your size</span></>}</div>
            </a>
            <div className="nav">
              <a href="#/settings" className={active === "settings" ? "active" : ""}><Icon name="gear" /><span>Settings</span><span className="shortcut">Ctrl ,</span></a>
            </div>
          </div>
        </aside>
        <main className="main" ref={mainRef}>
          <div className="content" key={location.hash}>{PAGES[page](route)}</div>
        </main>
      </div>

      <StatusBar />
      <CommandPalette nav={[...NAV, SETTINGS]} />
      {onboarding && <Onboarding onDone={() => { setOnboarding(false); refresh(); }} />}
    </div>
  );
}
