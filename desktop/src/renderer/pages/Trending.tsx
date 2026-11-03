import { useEffect, useMemo, useState } from "react";
import type { VideoRow } from "../../core/types";
import { call } from "../api";
import { Icon } from "../components/Icon";
import { analyzeLink, Chips, DemoBanner, Empty, go, Loading, PageHead, type Route, useApp } from "../components/ui";
import { VideoTable } from "../components/VideoTable";
import { fmt } from "../format";

export const REGIONS: [string, string][] = [["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"], ["IN", "India"],
  ["PK", "Pakistan"], ["DE", "Germany"], ["FR", "France"], ["ES", "Spain"], ["IT", "Italy"], ["BR", "Brazil"], ["MX", "Mexico"], ["JP", "Japan"],
  ["KR", "South Korea"], ["ID", "Indonesia"], ["PH", "Philippines"], ["NG", "Nigeria"], ["ZA", "South Africa"], ["AE", "UAE"], ["SA", "Saudi Arabia"],
  ["TR", "Turkey"], ["NL", "Netherlands"], ["SE", "Sweden"], ["PL", "Poland"], ["BD", "Bangladesh"], ["EG", "Egypt"], ["VN", "Vietnam"], ["TH", "Thailand"]];

export function TrendingPage({ route }: { route: Route }) {
  const { status, refresh } = useApp();
  const [region, setRegion] = useState(route.params.get("region") || status?.region || "US");
  const [cat, setCat] = useState(route.params.get("cat") ?? "");
  const [cats, setCats] = useState<{ id: string; title: string }[]>([]);
  const [state, setState] = useState<{ loading?: boolean; data?: { videos: VideoRow[]; title_words: { word: string; count: number }[]; small_max: number }; error?: string }>({ loading: true });
  const [vf, setVF] = useState<"all" | "small" | "short">("all");
  const filter = useMemo(() => (v: VideoRow) => vf === "all" || (vf === "short" ? v.format === "short" : v.size === vf), [vf]);

  useEffect(() => { call("categories").then(setCats).catch(() => undefined); }, []);
  useEffect(() => {
    call("trending", route.params.get("region") || status?.region || "US", route.params.get("cat") ?? "")
      .then((data) => { setState({ data }); refresh(); })
      .catch((e) => setState({ error: e.message }));
  }, []); // eslint-disable-line

  const vids = state.data?.videos ?? [];
  return (
    <>
      <PageHead title="Trending" desc="YouTube's trending chart by country and category, with small-channel videos highlighted. ≈2 quota units." />
      <DemoBanner />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <select className="select" value={region} onChange={(e) => setRegion(e.target.value)}>{REGIONS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
          <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
          <button className="btn primary" onClick={() => go(`#/trending?region=${region}&cat=${cat}`)}>Update</button>
        </div>
      </div>
      {state.loading && <Loading title="Loading trending videos" rows={6} />}
      {state.error && <Empty icon="x" title="Couldn't load trending">{state.error}</Empty>}
      {state.data && <>
        <div className="kpis" style={{ marginBottom: 16, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <div className="kpi"><div className="label">Trending videos</div><div className="value">{vids.length}</div></div>
          <div className="kpi"><div className="label">From small channels</div><div className="value">{vids.filter((v) => v.size === "small").length}</div><div className="foot">Under {fmt(state.data.small_max)} subscribers</div></div>
          <div className="kpi"><div className="label">Shorts</div><div className="value">{vids.filter((v) => v.format === "short").length}</div></div>
        </div>
        {state.data.title_words.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Recurring themes</h3><p className="sub">Words that appear across several trending titles. Select one to analyze it.</p>
            <div className="chips">{state.data.title_words.map((w) => <a key={w.word} className="chip" href={analyzeLink(w.word)}>{w.word} <b>{w.count}</b></a>)}</div>
          </div>
        )}
        <div className="card flush">
          <div className="card-head" style={{ alignItems: "center" }}><div><h3>Trending now</h3><p className="sub">In chart order</p></div>
            <Chips value={vf} onChange={setVF} options={[["all", "All"], ["small", "Small channels"], ["short", "Shorts"]]} /></div>
          <VideoTable videos={vids} showRank filter={filter} />
        </div>
      </>}
    </>
  );
}
