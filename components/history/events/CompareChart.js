"use client";

import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { COLWICK_HISTORY } from "../../../libs/history/config";
import { READING_FLAG } from "../../../libs/history/digest";
import { formatDateTime, formatLevel } from "../../../libs/history/present";
import { niceStep, runs, useElementWidth } from "../LevelChart";

const HOUR_MS = 3600000;
const DAY_MS = 24 * HOUR_MS;
const MARGIN = { top: 14, right: 14, bottom: 30, left: 46 };
const LANE = 7;
const LANE_GAP = 4;
const maxGap = COLWICK_HISTORY.maxSupportedGapMs;

// "−2 d", "0", "+12 h": time from each event's alignment point.
export function relativeLabel(ms) {
  if (ms === 0) return "0";
  const sign = ms < 0 ? "−" : "+";
  const abs = Math.abs(ms);
  return abs % DAY_MS === 0 ? `${sign}${abs / DAY_MS} d` : `${sign}${Math.round(abs / HOUR_MS)} h`;
}

export function relativeTicks(from, to, width) {
  const maxTicks = Math.max(2, Math.floor(width / 64));
  const step = [6 * HOUR_MS, 12 * HOUR_MS, DAY_MS, 2 * DAY_MS, 5 * DAY_MS, 7 * DAY_MS, 14 * DAY_MS]
    .find((candidate) => (to - from) / candidate <= maxTicks) ?? 14 * DAY_MS;
  const ticks = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) ticks.push(t);
  return ticks;
}

// Unsupported intervals (> 30 min without an eligible reading) within a series' window.
function seriesGaps(points, from, to) {
  const result = [];
  let previous = from;
  for (const point of points) {
    if (point.t - previous > maxGap) result.push([previous, point.t]);
    previous = point.t;
  }
  if (to - previous > maxGap) result.push([previous, to]);
  return result;
}

/**
 * Two events' observed readings overlaid on a shared "time from alignment point" axis.
 * Each series keeps its own gaps (lines break, hatched lane), provisional styling and actual
 * dates (tooltip). Lanes under the plot show each event's charted window and its first-to-last
 * reading at or above the threshold.
 */
export default function CompareChart({ series, title, anchorLabel }) {
  const [containerRef, width] = useElementWidth();
  const [hover, setHover] = useState(null);
  const threshold = COLWICK_HISTORY.thresholdMetres;
  const plotHeight = width && width < 576 ? 230 : 310;
  const lanesHeight = series.length * (LANE + LANE_GAP) + 4;
  const height = plotHeight + lanesHeight;

  const prepared = useMemo(() => series.map((item) => {
    const points = item.readings.map(([seconds, value, flag]) => ({ t: seconds * 1000 - item.anchor, at: seconds * 1000, v: value, flag }));
    const from = item.window.from - item.anchor;
    const to = item.window.to - item.anchor;
    return {
      ...item,
      points,
      from,
      to,
      gaps: seriesGaps(points, from, to),
      qualified: runs(points, maxGap, (p) => p.flag !== READING_FLAG.PROVISIONAL),
      provisional: runs(points, maxGap, (p) => p.flag === READING_FLAG.PROVISIONAL),
    };
  }), [series]);

  const viewFrom = Math.min(...prepared.map((item) => item.from));
  const viewTo = Math.max(viewFrom + HOUR_MS, ...prepared.map((item) => item.to));
  const values = [threshold, ...prepared.flatMap((item) => item.points.map((p) => p.v))].filter(Number.isFinite);
  const yStep = niceStep(Math.max(...values) - Math.min(...values) || 1, 5);
  const yMin = Math.floor((Math.min(...values) - yStep * 0.2) / yStep) * yStep;
  const yMax = Math.ceil((Math.max(...values) + yStep * 0.2) / yStep) * yStep;

  const innerW = Math.max(10, width - MARGIN.left - MARGIN.right);
  const innerH = plotHeight - MARGIN.top - MARGIN.bottom;
  const x = (t) => MARGIN.left + ((t - viewFrom) / (viewTo - viewFrom)) * innerW;
  const y = (v) => MARGIN.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  const tAt = (px) => viewFrom + ((px - MARGIN.left) / innerW) * (viewTo - viewFrom);
  const line = (run) => run.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const yTicks = [];
  for (let v = yMin; v <= yMax + 1e-9; v += yStep) yTicks.push(Math.round(v * 100) / 100);
  const ticks = width ? relativeTicks(viewFrom, viewTo, innerW) : [];

  function nearest(px) {
    const t = tAt(px);
    const found = prepared.map((item) => {
      let best = null;
      for (const point of item.points) {
        if (!best || Math.abs(point.t - t) < Math.abs(best.t - t)) best = point;
      }
      return best && Math.abs(best.t - t) <= HOUR_MS ? { key: item.key, label: item.label, className: item.className, point: best } : { key: item.key, label: item.label, className: item.className, point: null };
    });
    return found.some((item) => item.point) ? { t, items: found } : null;
  }
  const localX = (event) => event.clientX - event.currentTarget.getBoundingClientRect().left;
  const hoverX = hover ? x(hover.t) : null;
  const laneTop = plotHeight;

  return (
    <figure className="history-chart mb-0">
      <div className="history-chart__toolbar">
        <figcaption className="history-chart__title">{title}</figcaption>
      </div>
      <div ref={containerRef} className="history-chart__canvas" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={title}
            onPointerMove={(event) => setHover(nearest(localX(event)))} onPointerDown={(event) => setHover(nearest(localX(event)))}
            onPointerLeave={() => setHover(null)}>
            <defs>
              <pattern id="compare-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="rgba(255,255,255,0.03)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(214,224,230,0.45)" strokeWidth="2" />
              </pattern>
              <clipPath id="compare-plot"><rect x={MARGIN.left} y={MARGIN.top} width={innerW} height={innerH} /></clipPath>
            </defs>
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={MARGIN.left} x2={MARGIN.left + innerW} y1={y(v)} y2={y(v)} className="history-chart__grid" />
                <text x={MARGIN.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="history-chart__axis">{v.toFixed(yStep < 0.1 ? 2 : 1)}</text>
              </g>
            ))}
            {ticks.map((t) => (
              <text key={t} x={x(t)} y={plotHeight - 8} textAnchor="middle" className="history-chart__axis">{relativeLabel(t)}</text>
            ))}
            <g clipPath="url(#compare-plot)">
              {viewFrom <= 0 && viewTo >= 0 ? <line x1={x(0)} x2={x(0)} y1={MARGIN.top} y2={MARGIN.top + innerH} className="events-compare__anchor" /> : null}
              {prepared.map((item) => (
                <g key={item.key} className={item.className}>
                  {item.qualified.map((run) => <path key={run[0].t} d={line(run)} className="events-compare__line" />)}
                  {item.provisional.map((run) => <path key={`p${run[0].t}`} d={line(run)} className="events-compare__line events-compare__line--provisional" />)}
                  {item.peak ? <circle cx={x(item.peak.t)} cy={y(item.peak.v)} r="4.5" className="events-compare__peak" /> : null}
                </g>
              ))}
              <line x1={MARGIN.left} x2={MARGIN.left + innerW} y1={y(threshold)} y2={y(threshold)} className="history-chart__threshold" />
              {hover ? (
                <g>
                  <line x1={hoverX} x2={hoverX} y1={MARGIN.top} y2={MARGIN.top + innerH} className="history-chart__crosshair" />
                  {hover.items.filter((item) => item.point).map((item) => (
                    <circle key={item.key} cx={x(item.point.t)} cy={y(item.point.v)} r="4" className={`${item.className} events-compare__dot`} />
                  ))}
                </g>
              ) : null}
            </g>
            {viewFrom <= 0 && viewTo >= 0 ? <text x={x(0) + 4} y={MARGIN.top + 10} className="history-chart__axis">{anchorLabel}</text> : null}
            <text x={MARGIN.left + innerW - 4} y={y(threshold) - 6} textAnchor="end" className="history-chart__threshold-label">{threshold.toFixed(1)} m HPP level rule</text>
            {prepared.map((item, index) => {
              const top = laneTop + index * (LANE + LANE_GAP);
              return (
                <g key={`lane-${item.key}`} className={item.className} aria-hidden="true">
                  <rect x={x(item.from)} width={Math.max(1, x(item.to) - x(item.from))} y={top} height={LANE} className="events-compare__lane" />
                  {item.span ? <rect x={x(item.span.from)} width={Math.max(2, x(item.span.to) - x(item.span.from))} y={top} height={LANE} className="events-compare__lane-span" /> : null}
                  {item.gaps.map(([a, b]) => <rect key={a} x={x(a)} width={Math.max(1, x(b) - x(a))} y={top} height={LANE} fill="url(#compare-hatch)" />)}
                </g>
              );
            })}
          </svg>
        )}
        {hover ? (
          <div className="history-chart__tooltip" role="status" style={{ left: Math.min(Math.max(hoverX + 12, 8), Math.max(8, width - 230)) }}>
            <strong>{relativeLabel(Math.round(hover.t / (15 * 60000)) * 15 * 60000)} from {anchorLabel}</strong>
            {hover.items.map((item) => (
              <span key={item.key}>
                <span className={`events-compare__swatch ${item.className}`} aria-hidden="true" /> {item.label}:{" "}
                {item.point
                  ? <>{formatLevel(item.point.v)} at {formatDateTime(item.point.at)}{item.point.flag === READING_FLAG.PROVISIONAL ? " (provisional)" : ""}</>
                  : "no reading"}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </figure>
  );
}

CompareChart.propTypes = {
  series: PropTypes.arrayOf(PropTypes.shape({
    key: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    className: PropTypes.string.isRequired,
    anchor: PropTypes.number.isRequired,
    window: PropTypes.shape({ from: PropTypes.number.isRequired, to: PropTypes.number.isRequired }).isRequired,
    readings: PropTypes.array.isRequired,
    span: PropTypes.shape({ from: PropTypes.number, to: PropTypes.number }),
    peak: PropTypes.shape({ t: PropTypes.number, v: PropTypes.number }),
  })).isRequired,
  title: PropTypes.string.isRequired,
  anchorLabel: PropTypes.string.isRequired,
};
