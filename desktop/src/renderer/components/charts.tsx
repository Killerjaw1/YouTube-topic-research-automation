/**
 * Hand-rolled SVG charts. Series colors are the validated blue / aqua / orange trio (CVD-safe in
 * both themes), with shape as a second encoding (circle / square / triangle) and a legend.
 */

import { type ReactNode, useRef, useState } from "react";
import type { VideoRow } from "../../core/types";
import { fmt, fmtAge, fmtDur, TONE_COLOR, tone } from "../format";
import { openExternal } from "../api";
import { useApp } from "./ui";

export function ScoreRing({ score }: { score: number }) {
  const r = 42, C = 2 * Math.PI * r;
  return (
    <div className="ring" role="img" aria-label={`Opportunity score ${score} of 100`}>
      <svg viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} stroke="var(--bg-active)" strokeWidth="6" fill="none" />
        <circle cx="48" cy="48" r={r} stroke={TONE_COLOR[tone(score)]} strokeWidth="6" fill="none" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)} style={{ transition: "stroke-dashoffset .6s" }} />
      </svg>
      <div className="num"><div><b>{score}</b><span>/ 100</span></div></div>
    </div>
  );
}

/** Tiny trend line for tables (single series, last point marked). */
export function Sparkline({ values, width = 84, height = 22 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span className="muted small">{values.length ? "1 check" : "–"}</span>;
  const lo = Math.min(...values, 0), hi = Math.max(...values, 100);
  const X = (i: number) => 2 + (i / (values.length - 1)) * (width - 4);
  const Y = (v: number) => height - 2 - ((v - lo) / Math.max(hi - lo, 1)) * (height - 4);
  const d = values.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label={`Score trend, latest ${last}`}>
      <path d={d} fill="none" stroke="var(--text-2)" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={X(values.length - 1)} cy={Y(last)} r="2.5" fill={TONE_COLOR[tone(last)]} />
    </svg>
  );
}

const SERIES = { small: "var(--series-1)", mid: "var(--series-2)", big: "var(--series-3)", unknown: "var(--idle)" } as const;

function Dl({ rows }: { rows: [string, ReactNode][] }) {
  return <dl>{rows.map(([k, v]) => [<dt key={k + "t"}>{k}</dt>, <dd key={k + "d"}>{v}</dd>])}</dl>;
}

/** Channel subscribers vs video views (log-log), with the "views = 3x subs" breakout line. */
export function Scatter({ videos, smallMax, bigMin }: { videos: VideoRow[]; smallMax: number; bigMin: number }) {
  const { tip } = useApp();
  const [hover, setHover] = useState<number | null>(null);
  const pts = videos.filter((v) => v.subs != null && v.views > 0);
  if (pts.length < 3) return <div className="empty-state"><b>Not enough data to chart</b><p>Too few results had public subscriber counts.</p></div>;
  const W = 860, H = 360, ml = 58, mr = 18, mt = 14, mb = 40;
  const lx = (v: number) => Math.log10(Math.max(v, 10));
  const xs = pts.map((p) => lx(p.subs!)), ys = pts.map((p) => lx(p.views));
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs));
  const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
  const X = (v: number) => ml + ((lx(v) - x0) / Math.max(x1 - x0, 1)) * (W - ml - mr);
  const Y = (v: number) => H - mb - ((lx(v) - y0) / Math.max(y1 - y0, 1)) * (H - mt - mb);
  const decadesX = Array.from({ length: x1 - x0 + 1 }, (_, i) => 10 ** (x0 + i));
  const decadesY = Array.from({ length: y1 - y0 + 1 }, (_, i) => 10 ** (y0 + i));
  const la = Math.max(x0, y0 - Math.log10(3)), lb = Math.min(x1, y1 - Math.log10(3));
  const sx = X(smallMax);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Scatter of channel subscribers versus video views">
        <g>
          {decadesX.map((d) => <line key={"gx" + d} className="gridline" x1={X(d)} x2={X(d)} y1={mt} y2={H - mb} />)}
          {decadesY.map((d) => <line key={"gy" + d} className="gridline" x1={ml} x2={W - mr} y1={Y(d)} y2={Y(d)} />)}
        </g>
        <g className="axis">
          {decadesX.map((d) => <text key={"tx" + d} x={X(d)} y={H - mb + 18} textAnchor="middle">{fmt(d)}</text>)}
          {decadesY.map((d) => <text key={"ty" + d} x={ml - 8} y={Y(d) + 4} textAnchor="end">{fmt(d)}</text>)}
          <text x={(W + ml) / 2} y={H - 4} textAnchor="middle">Channel subscribers (log scale)</text>
          <text transform={`translate(14 ${(H - mb + mt) / 2}) rotate(-90)`} textAnchor="middle">Video views (log)</text>
        </g>
        {lb > la && (
          <g>
            <line className="refline" x1={X(10 ** la)} y1={Y(3 * 10 ** la)} x2={X(10 ** lb)} y2={Y(3 * 10 ** lb)} />
            <text className="reflabel" x={X(10 ** lb) - 4} y={Y(3 * 10 ** lb) - 8} textAnchor="end">views = 3× subs</text>
          </g>
        )}
        {sx > ml && sx < W - mr && (
          <g>
            <line x1={sx} x2={sx} y1={mt} y2={H - mb} stroke="var(--series-1)" strokeWidth="1" strokeDasharray="2 4" opacity=".6" />
            <text className="reflabel" x={sx + 5} y={mt + 12}>small-channel limit</text>
          </g>
        )}
        <g>{pts.map((p) => p.breakout && <circle key={"r" + p.id} className="ring-mark" cx={X(p.subs!)} cy={Y(p.views)} r={10} />)}</g>
        <g>
          {pts.map((p, i) => {
            const x = X(p.subs!), y = Y(p.views), fill = SERIES[p.size ?? "unknown"];
            const cls = `pt ${hover !== null && hover !== i ? "dim" : ""}`;
            const events = {
              onMouseEnter: (e: React.MouseEvent) => {
                setHover(i);
                tip.show(<><div className="tt-title">{p.title}</div><Dl rows={[["Channel", p.channel_title], ["Subscribers", fmt(p.subs)], ["Views", fmt(p.views)],
                  ["Views ÷ subs", `${p.outlier}×`], ["Age", fmtAge(p.age_days)], ["Format", p.format === "short" ? "Short" : "Long"]]} /></>, e);
              },
              onMouseMove: tip.move,
              onMouseLeave: () => { setHover(null); tip.hide(); },
              onClick: () => openExternal(p.url),
            };
            if (p.size === "big") return <path key={p.id} className={cls} fill={fill} d={`M${x} ${y - 6.5} L${x + 6} ${y + 4.5} L${x - 6} ${y + 4.5} Z`} {...events} />;
            if (p.size === "mid") return <rect key={p.id} className={cls} fill={fill} x={x - 5} y={y - 5} width={10} height={10} rx={2} {...events} />;
            return <circle key={p.id} className={cls} fill={fill} cx={x} cy={y} r={5.5} {...events} />;
          })}
        </g>
      </svg>
      <div className="legend">
        <span><svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="var(--series-1)" /></svg>Small channels (under {fmt(smallMax)})</span>
        <span><svg viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" rx="2" fill="var(--series-2)" /></svg>Mid-size</span>
        <span><svg viewBox="0 0 12 12"><path d="M6 0.5 L11.5 11 L0.5 11 Z" fill="var(--series-3)" /></svg>Large channels ({fmt(bigMin)}+)</span>
        <span><svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--warn)" strokeWidth="2" /></svg>Breakout</span>
      </div>
    </div>
  );
}

/** Bar chart: the latest bar in full accent, earlier bars at 50%, the value above the tallest bar. */
export function BarChart({ data, unit = "views", latestLabel = "Latest day", earlierLabel = "Earlier days", compact }:
  { data: { label: string; value: number; tip: ReactNode }[]; unit?: string; latestLabel?: string; earlierLabel?: string; compact?: boolean }) {
  const { tip } = useApp();
  if (!data.length) return <div className="empty-state"><b>No data for this period</b></div>;
  // Compact charts (detail panel) use a smaller canvas so text stays at 11px when scaled.
  const W = compact ? 380 : 720, H = compact ? 150 : 210, ml = 32, mb = 22, mt = 20, mr = 4;
  const max = Math.max(...data.map((d) => d.value), 1);
  const nice = 10 ** Math.floor(Math.log10(max)), top = Math.ceil(max / nice) * nice;
  const bw = (W - ml - mr) / data.length, gap = Math.max(Math.min(4, bw * 0.25), bw - 36);
  const Y = (v: number) => H - mb - (v / top) * (H - mt - mb);
  const step = Math.ceil(data.length / (compact ? 4 : 7));
  const peak = data.reduce((a, d, i) => (d.value > data[a].value ? i : a), 0);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Bar chart of ${unit}; highest ${fmt(data[peak].value)} on ${data[peak].label}`}>
        <g className="axis">
          {[0, 0.5, 1].map((f) => <g key={f}><line className="gridline" x1={ml} x2={W - mr} y1={Y(top * f)} y2={Y(top * f)} /><text x={ml - 6} y={Y(top * f) + 4} textAnchor="end">{fmt(top * f)}</text></g>)}
        </g>
        <g className="axis">
          {data.map((d, i) => {
            const x = ml + i * bw + gap / 2, w = Math.max(bw - gap, 1), y = Y(d.value), h = H - mb - y;
            const r = Math.min(3, w / 2, h);
            const path = h > 0 ? `M${x} ${H - mb} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${H - mb} Z` : "";
            return (
              <g key={i} onMouseEnter={(e) => tip.show(d.tip, e)} onMouseMove={tip.move} onMouseLeave={tip.hide}>
                <rect x={ml + i * bw} y={mt} width={bw} height={H - mt - mb} fill="transparent" />
                <path className={`bar ${i === data.length - 1 ? "current" : ""}`} d={path} />
                {i === peak && <text className="value-label" x={x + w / 2} y={y - 6} textAnchor="middle">{fmt(d.value)}</text>}
                {i % step === 0 && <text x={x + w / 2} y={H - 6} textAnchor="middle">{d.label.slice(5)}</text>}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="legend"><span><span className="dot accent" />{latestLabel}</span><span><span className="dot accent" style={{ opacity: 0.5 }} />{earlierLabel}</span></div>
    </div>
  );
}

/** Audience retention curve with crosshair + tooltip. */
export function RetentionChart({ points, durationS, compact }: { points: { x: number; y: number }[]; durationS?: number; compact?: boolean }) {
  const { tip } = useApp();
  const svgRef = useRef<SVGSVGElement>(null);
  const [cur, setCur] = useState<{ x: number; y: number } | null>(null);
  if (!points.length) return <div className="empty-state"><b>No retention data yet</b><p>YouTube needs more views before it can show this.</p></div>;
  const W = compact ? 380 : 760, H = compact ? 190 : 260, ml = 38, mr = 8, mt = 10, mb = 24;
  const ymax = Math.max(1, ...points.map((p) => p.y)) * 1.05;
  const X = (x: number) => ml + x * (W - ml - mr), Y = (y: number) => H - mb - (y / ymax) * (H - mt - mb);
  const d = points.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(" ");
  const area = `${d} L${X(points[points.length - 1].x)} ${Y(0)} L${X(points[0].x)} ${Y(0)} Z`;
  const label = (x: number) => (durationS ? fmtDur(Math.round(x * durationS)) : `${Math.round(x * 100)}%`);
  const yTicks: number[] = [];
  for (let v = 0; v <= ymax; v += 0.25) yTicks.push(v);
  return (
    <div className="chart">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Audience retention curve">
        <g className="axis">
          {yTicks.map((v) => <g key={v}><line className="gridline" x1={ml} x2={W - mr} y1={Y(v)} y2={Y(v)} /><text x={ml - 6} y={Y(v) + 4} textAnchor="end">{Math.round(v * 100)}%</text></g>)}
          {[0, 0.25, 0.5, 0.75, 1].map((x) => <text key={x} x={X(x)} y={H - 8} textAnchor="middle">{label(x)}</text>)}
        </g>
        <path d={area} fill="var(--accent)" opacity=".1" />
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        {cur && <>
          <line x1={X(cur.x)} x2={X(cur.x)} y1={mt} y2={H - mb} stroke="var(--text-3)" strokeWidth="1" opacity=".6" />
          <circle cx={X(cur.x)} cy={Y(cur.y)} r="5" fill="var(--accent)" stroke="var(--bg-raised)" strokeWidth="2" />
        </>}
        <rect x={ml} y={mt} width={W - ml - mr} height={H - mt - mb} fill="transparent"
          onMouseMove={(e) => {
            const box = svgRef.current!.getBoundingClientRect();
            const fx = Math.min(1, Math.max(0, (((e.clientX - box.left) / box.width) * W - ml) / (W - ml - mr)));
            const p = points.reduce((a, b) => (Math.abs(b.x - fx) < Math.abs(a.x - fx) ? b : a));
            setCur(p);
            tip.show(<><b>{label(p.x)} into the video</b><Dl rows={[["Still watching", `${Math.round(p.y * 100)}%`]]} /></>, e);
          }}
          onMouseLeave={() => { setCur(null); tip.hide(); }} />
      </svg>
    </div>
  );
}

export { Dl };
