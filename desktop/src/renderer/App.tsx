import { type ReactNode, useEffect, useState } from "react";
import { Icon, type IconName } from "./components/Icon";
import { parseRoute, type Route, useApp } from "./components/ui";
import { fmt } from "./format";
import { AnalyticsPage } from "./pages/Analytics";
import { AnalyzePage, ReportPage } from "./pages/Analyze";
import { Dashboard } from "./pages/Dashboard";
import { DiscoverPage } from "./pages/Discover";
import { HistoryPage } from "./pages/History";
import { IdeasPage } from "./pages/Ideas";
import { OptimizerPage } from "./pages/Optimizer";
import { OutliersPage } from "./pages/Outliers";
import { SettingsPage } from "./pages/Settings";
import { TrendingPage } from "./pages/Trending";

const NAV: [string, string, IconName, string?][] = [
  ["dashboard", "Dashboard", "home", "Research"],
  ["analyze", "Analyze topic", "search"],
  ["discover", "Discover ideas", "compass"],
  ["outliers", "Outlier finder", "rocket"],
  ["trending", "Trending", "flame"],
  ["optimizer", "Upload optimizer", "wand", "Create"],
  ["ideas", "Idea board", "board"],
  ["analytics", "My analytics", "chart", "Channel"],
  ["history", "History", "clock"],
  ["settings", "Settings", "gear", "App"],
];

const PAGES: Record<string, { title: string; render(r: Route): ReactNode }> = {
  dashboard: { title: "Dashboard", render: () => <Dashboard /> },
  analyze: { title: "Analyze topic", render: (r) => <AnalyzePage route={r} /> },
  report: { title: "Topic report", render: (r) => <ReportPage id={Number(r.id)} /> },
  discover: { title: "Discover ideas", render: (r) => <DiscoverPage route={r} /> },
  outliers: { title: "Outlier finder", render: (r) => <OutliersPage route={r} /> },
  trending: { title: "Trending", render: (r) => <TrendingPage route={r} /> },
  optimizer: { title: "Upload optimizer", render: (r) => <OptimizerPage route={r} /> },
  ideas: { title: "Idea board", render: () => <IdeasPage /> },
  analytics: { title: "My analytics", render: (r) => <AnalyticsPage route={r} /> },
  history: { title: "History", render: () => <HistoryPage /> },
  settings: { title: "Settings", render: () => <SettingsPage /> },
};

function Quota() {
  const { status } = useApp();
  if (!status) return null;
  const left = Math.max(status.quota_limit - status.quota_used, 0);
  return (
    <div className="quota">
      <div className="quota-top"><span>YouTube quota today</span><b>{status.demo ? "∞" : fmt(left) + " left"}</b></div>
      <div className="meter"><i style={{ width: `${Math.min(100, (status.quota_used / status.quota_limit) * 100)}%` }} /></div>
      <small>{status.demo ? "Demo mode uses no quota" : `${status.quota_used.toLocaleString()} / ${status.quota_limit.toLocaleString()} units · ≈${Math.floor(left / 102)} quick scans`}</small>
    </div>
  );
}

export function App() {
  const { status } = useApp();
  const [route, setRoute] = useState(parseRoute);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "dark");
  useEffect(() => {
    const onHash = () => { setRoute(parseRoute()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const page = PAGES[route.page] ? route.page : "dashboard";
  const active = page === "report" ? "analyze" : page;
  useEffect(() => { document.title = `${PAGES[page].title} · NicheRadar`; }, [page]);
  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("nr-theme", next); } catch { /* ignore */ }
    setTheme(next);
  };
  // Re-mount the page whenever the hash changes so each navigation starts fresh.
  const key = location.hash;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src="./logo.svg" alt="" />
          <div><div className="brand-name">NicheRadar</div><div className="brand-sub">Topic research for small channels</div></div>
        </div>
        <nav className="nav">
          {NAV.map(([id, label, icon, section]) => {
            const count = id === "ideas" ? status?.counts.ideas : id === "history" ? status?.counts.scans : undefined;
            return [
              section && <div key={section} className="nav-label">{section}</div>,
              <a key={id} href={`#/${id}`} className={active === id ? "active" : ""}><Icon name={icon} /><span>{label}</span>{count ? <span className="count">{count}</span> : null}</a>,
            ];
          })}
        </nav>
        <div className="sidebar-foot"><Quota /></div>
      </aside>
      <div className="main">
        <header className="topbar">
          <h1>{PAGES[page].title}</h1>
          {status?.demo && <span className="badge demo"><Icon name="info" />Demo data</span>}
          <div className="spacer" />
          <button className="btn ghost icon" onClick={toggleTheme} title="Toggle light / dark"><Icon name={theme === "light" ? "moon" : "sun"} /></button>
        </header>
        <main className="content" key={key}>{PAGES[page].render(route)}</main>
      </div>
    </div>
  );
}
