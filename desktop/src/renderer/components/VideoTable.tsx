import { useMemo, useState } from "react";
import type { VideoRow } from "../../core/types";
import { fmt, fmtAge } from "../format";
import { FormatBadge, SizeBadge, Thumb } from "./ui";

type Key = "rank" | "title" | "subs" | "views" | "vpd" | "outlier" | "age_days" | "format";

export function VideoTable({ videos, showRank = false, filter }: { videos: VideoRow[]; showRank?: boolean; filter?: (v: VideoRow) => boolean }) {
  const [sortKey, setSortKey] = useState<Key>(showRank ? "rank" : "views");
  const [dir, setDir] = useState(showRank ? 1 : -1);
  const cols: [Key, string, string][] = [
    ...(showRank ? [["rank", "#", "num"] as [Key, string, string]] : []),
    ["title", "Video", ""], ["subs", "Channel subs", "num"], ["views", "Views", "num"], ["vpd", "Views/day", "num"],
    ["outlier", "Views ÷ subs", "num"], ["age_days", "Age", "num"], ["format", "Format", ""],
  ];
  const list = useMemo(() => videos.filter(filter ?? (() => true)).sort((a, b) => {
    let x: any = a[sortKey], y: any = b[sortKey];
    if (x == null) x = sortKey === "rank" ? 1e9 : -1;
    if (y == null) y = sortKey === "rank" ? 1e9 : -1;
    return typeof x === "string" ? x.localeCompare(y) * dir : (x - y) * dir;
  }), [videos, filter, sortKey, dir]);

  const sortBy = (k: Key) => {
    if (k === sortKey) setDir(-dir);
    else { setSortKey(k); setDir(["rank", "title", "age_days"].includes(k) ? 1 : -1); }
  };
  if (!list.length) return <div className="empty">No videos match this filter.</div>;
  return (
    <div className="table-wrap" style={{ maxHeight: 620 }}>
      <table className="data">
        <thead><tr>{cols.map(([k, l, c]) => (
          <th key={k} className={`sortable ${c}`} onClick={() => sortBy(k)}>{l}{sortKey === k && <span className="arrow">{dir > 0 ? "▲" : "▼"}</span>}</th>
        ))}</tr></thead>
        <tbody>{list.map((v) => (
          <tr key={v.id}>
            {showRank && <td className="num muted">{v.rank ?? <span className="badge neutral" title="From the most-viewed recent uploads, not the main search">recent</span>}</td>}
            <td>
              <div className="vid-cell">
                <a href={v.url} target="_blank" rel="noopener"><Thumb v={v} /></a>
                <div style={{ minWidth: 0 }}>
                  <a href={v.url} target="_blank" rel="noopener"><div className="t">{v.breakout && <span className="breakout-star" title="Small-channel breakout">★ </span>}{v.title}</div></a>
                  <div className="small muted row" style={{ gap: 6, marginTop: 3 }}>{v.channel_title} <SizeBadge v={v} /></div>
                </div>
              </div>
            </td>
            <td className="num">{v.subs == null ? <span className="muted">hidden</span> : fmt(v.subs)}</td>
            <td className="num">{fmt(v.views)}</td>
            <td className="num">{fmt(v.vpd)}</td>
            <td className="num">{v.outlier == null ? "–" : <b style={{ color: v.outlier >= 3 ? "var(--great)" : "inherit" }}>{v.outlier >= 100 ? Math.round(v.outlier) : v.outlier.toFixed(1)}×</b>}</td>
            <td className="num">{fmtAge(v.age_days)}</td>
            <td><FormatBadge format={v.format} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
