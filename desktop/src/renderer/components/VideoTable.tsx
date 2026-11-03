import { useMemo, useState } from "react";
import type { VideoRow } from "../../core/types";
import { fmt, fmtAge, fmtDur } from "../format";
import { Button, DetailPanel, EmptyState, Facts, StateCard, Tag } from "./kit";
import { FormatBadge, SizeBadge, Thumb, useApp } from "./ui";

type Key = "rank" | "title" | "subs" | "views" | "vpd" | "outlier" | "age_days" | "format";

/** Sortable results table. Selecting a row opens its details on the right. */
export function VideoTable({ videos, showRank = false, filter }: { videos: VideoRow[]; showRank?: boolean; filter?: (v: VideoRow) => boolean }) {
  const { panel } = useApp();
  const [sortKey, setSortKey] = useState<Key>(showRank ? "rank" : "views");
  const [dir, setDir] = useState(showRank ? 1 : -1);
  const cols: [Key, string, string][] = [
    ...(showRank ? [["rank", "#", "num"] as [Key, string, string]] : []),
    ["title", "Video", ""], ["subs", "Subscribers", "num"], ["views", "Views", "num"], ["vpd", "Views/day", "num"],
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
  const select = (v: VideoRow) => panel.open(<VideoDetail v={v} onClose={panel.close} />, "video:" + v.id);
  if (!list.length) return <EmptyState card={false} icon="search" title="No videos match this filter">Choose another filter to see more results.</EmptyState>;
  return (
    <div className="table-wrap" style={{ maxHeight: 640 }}>
      <table className="data">
        <thead><tr>{cols.map(([k, l, c]) => (
          <th key={k} className={`sortable ${c}`} onClick={() => sortBy(k)} aria-sort={sortKey === k ? (dir > 0 ? "ascending" : "descending") : "none"}>
            {l}{sortKey === k && <span className="arrow">{dir > 0 ? "▲" : "▼"}</span>}
          </th>
        ))}</tr></thead>
        <tbody>{list.map((v) => (
          <tr key={v.id} className="clickable" tabIndex={0} aria-selected={panel.key === "video:" + v.id}
            onClick={() => select(v)} onKeyDown={(e) => { if (e.key === "Enter") select(v); }}>
            {showRank && <td className="num muted">{v.rank ?? <Tag title="From the most-viewed recent uploads, not the main search">Recent</Tag>}</td>}
            <td>
              <div className="vid-cell">
                <Thumb v={v} />
                <div style={{ minWidth: 0 }}>
                  <div className="title">{v.title}</div>
                  <div className="secondary">{v.channel_title}<SizeBadge v={v} />{v.breakout && <Tag tone="warn">Breakout</Tag>}</div>
                </div>
              </div>
            </td>
            <td className="num">{v.subs == null ? <span className="muted">Hidden</span> : fmt(v.subs)}</td>
            <td className="num">{fmt(v.views)}</td>
            <td className="num">{fmt(v.vpd)}</td>
            <td className="num">{v.outlier == null ? "–" : <span className={v.outlier >= 3 ? "delta up" : ""}>{v.outlier >= 100 ? Math.round(v.outlier) : v.outlier.toFixed(1)}×</span>}</td>
            <td className="num">{fmtAge(v.age_days)}</td>
            <td><FormatBadge format={v.format} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/** Details for one ranking video, shown in the right-hand panel. */
export function VideoDetail({ v, onClose }: { v: VideoRow; onClose(): void }) {
  return (
    <DetailPanel title={v.title} sub={v.channel_title} onClose={onClose}
      footer={<Button variant="primary" icon="external" href={v.url} target="_blank" rel="noopener">Open on YouTube</Button>}>
      <Thumb v={v} large />
      <div className="row">
        <SizeBadge v={v} /><FormatBadge format={v.format} />{v.rank != null && <Tag>Rank {v.rank}</Tag>}
      </div>
      {v.breakout && <StateCard tone="warn" icon="rocket" title="Small-channel breakout">This video reached far beyond its channel’s usual audience, so YouTube recommended it to new viewers.</StateCard>}
      <div>
        <span className="section-label">Performance</span>
        <Facts rows={[
          ["Views", fmt(v.views)], ["Views per day", fmt(v.vpd)], ["Views ÷ subscribers", v.outlier == null ? "–" : v.outlier < 0.01 ? "under 0.01×" : `${v.outlier}×`],
          ["Versus channel average", v.multiple == null ? "–" : v.multiple < 0.01 ? "under 0.01×" : `${v.multiple}×`], ["Likes and comments", `${v.engagement}% of views`],
        ]} />
      </div>
      <div>
        <span className="section-label">Video</span>
        <Facts rows={[["Published", `${fmtAge(v.age_days)} ago`], ["Length", fmtDur(v.duration_s) || "–"], ["Channel subscribers", v.subs == null ? "Hidden" : fmt(v.subs)], ["Channel videos", fmt(v.channel_videos)]]} />
      </div>
      {v.tags.length > 0 && (
        <div><span className="section-label">Tags</span><div className="chips">{v.tags.slice(0, 16).map((t) => <Tag key={t}>{t}</Tag>)}</div></div>
      )}
    </DetailPanel>
  );
}
