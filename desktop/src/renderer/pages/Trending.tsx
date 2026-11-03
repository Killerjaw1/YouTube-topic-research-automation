import { useEffect, useMemo, useState } from "react";
import type { VideoRow } from "../../core/types";
import { call } from "../api";
import { Button, Card, ChipGroup } from "../components/kit";
import { analyzeLink, DemoBanner, Empty, go, Loading, PageHead, type Route, useApp } from "../components/ui";
import { VideoTable } from "../components/VideoTable";
import { fmt } from "../format";

export const REGIONS: [string, string][] = [["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"], ["IN", "India"],
  ["PK", "Pakistan"], ["DE", "Germany"], ["FR", "France"], ["ES", "Spain"], ["IT", "Italy"], ["BR", "Brazil"], ["MX", "Mexico"], ["JP", "Japan"],
  ["KR", "South Korea"], ["ID", "Indonesia"], ["PH", "Philippines"], ["NG", "Nigeria"], ["ZA", "South Africa"], ["AE", "UAE"], ["SA", "Saudi Arabia"],
  ["TR", "Turkey"], ["NL", "Netherlands"], ["SE", "Sweden"], ["PL", "Poland"], ["BD", "Bangladesh"], ["EG", "Egypt"], ["VN", "Vietnam"], ["TH", "Thailand"]];

type TFilter = "all" | "small" | "short";

export function TrendingPage({ route }: { route: Route }) {
  const { status, refresh } = useApp();
  const [region, setRegion] = useState(route.params.get("region") || status?.region || "US");
  const [cat, setCat] = useState(route.params.get("cat") ?? "");
  const [cats, setCats] = useState<{ id: string; title: string }[]>([]);
  const [state, setState] = useState<{ loading?: boolean; data?: { videos: VideoRow[]; title_words: { word: string; count: number }[]; small_max: number }; error?: string }>({ loading: true });
  const [vf, setVF] = useState<TFilter>("all");
  const match = (k: TFilter) => (v: VideoRow) => k === "all" || (k === "short" ? v.format === "short" : v.size === k);
  const filter = useMemo(() => match(vf), [vf]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = () => {
    setState({ loading: true });
    call("trending", route.params.get("region") || status?.region || "US", route.params.get("cat") ?? "")
      .then((data) => { setState({ data }); refresh(); })
      .catch((e) => setState({ error: e.message }));
  };
  useEffect(() => { call("categories").then(setCats).catch(() => undefined); }, []);
  useEffect(load, []); // eslint-disable-line

  const vids = state.data?.videos ?? [];
  const counts = { all: vids.length, small: vids.filter(match("small")).length, short: vids.filter(match("short")).length };
  return (
    <>
      <PageHead title="Trending" desc="YouTube’s trending chart for a country and category, with videos from small channels picked out. Each update uses about 2 quota units." />
      <DemoBanner />
      <Card className="mb">
        <div className="row">
          <select className="select" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Country">{REGIONS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
          <select className="select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
          <Button variant="primary" icon="refresh" onClick={() => go(`#/trending?region=${region}&cat=${cat}`)}>Show trending</Button>
        </div>
      </Card>
      {state.loading && <Loading title="Loading trending videos" rows={6} />}
      {state.error && <Empty icon="warn" title="Trending videos couldn’t be loaded" actions={<Button onClick={load}>Try again</Button>}>{state.error}</Empty>}
      {state.data && <>
        <div className="kpis three mb">
          <div className="kpi"><span className="label">Trending videos</span><div className="value">{vids.length}</div><div className="secondary">In chart order</div></div>
          <div className="kpi"><span className="label">From small channels</span><div className="value">{counts.small}</div><div className="secondary">Under {fmt(state.data.small_max)} subscribers</div></div>
          <div className="kpi"><span className="label">Shorts</span><div className="value">{counts.short}</div><div className="secondary">60 seconds or less, or tagged #shorts</div></div>
        </div>
        {state.data.title_words.length > 0 && (
          <Card className="mb" title="Recurring themes" sub="Words that appear in several trending titles. Choose one to analyze it.">
            <div className="chips">{state.data.title_words.map((w) => <a key={w.word} className="chip" href={analyzeLink(w.word)}>{w.word}<span className="count">{w.count}</span></a>)}</div>
          </Card>
        )}
        <Card flush title="Trending now" sub="Select a video for details.">
          <div className="card-toolbar">
            <ChipGroup value={vf} onChange={setVF} counts={counts} options={[["all", "All"], ["small", "Small channels"], ["short", "Shorts"]]} />
          </div>
          <VideoTable videos={vids} showRank filter={filter} />
        </Card>
      </>}
    </>
  );
}
