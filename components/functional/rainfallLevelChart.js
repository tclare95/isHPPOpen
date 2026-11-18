"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { describeConvention, formatLabelTime, formatMm } from "../../libs/rainfall/present";

// Two stacked panels on one shared time axis: observed rainfall (15-minute totals, bars) above and Colwick level
// (line) below. Each panel has its own value axis; they never share one. Plotted together for context only.

const PERIOD_MS = 15 * 60000;
const HOUR_MS = 3600000;
const MARGIN = { left: 48, right: 12 };
const RAIN_HEIGHT = 130;
const LEVEL_HEIGHT = 130;
const PANEL_GAP = 26;
const TOP = 8;
const AXIS = 28;
const LEVEL_BREAK_MS = 45 * 60000;
const LONDON_HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hourCycle: "h23" });

function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const update = () => setWidth(element.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function niceCeiling(value, step) {
  return Math.max(step, Math.ceil(value / step) * step);
}

export function timeAxisTicks(fromMs, toMs, width) {
  const hours = (toMs - fromMs) / HOUR_MS;
  const step = [3, 6, 12, 24].find((candidate) => (hours / candidate) * 70 <= width) ?? 24;
  const ticks = [];
  for (let t = Math.ceil(fromMs / HOUR_MS) * HOUR_MS; t <= toMs; t += HOUR_MS) {
    const hour = Number(LONDON_HOUR.format(t));
    if (hour % step === 0) ticks.push({ t, label: formatLabelTime(t, hour === 0 || step >= 12) });
  }
  return ticks;
}

export function levelPath(points, x, y) {
  let path = "";
  points.forEach((point, index) => {
    const joined = index > 0 && point.t - points[index - 1].t <= LEVEL_BREAK_MS;
    path += `${joined ? "L" : "M"}${x(point.t).toFixed(1)},${y(point.value).toFixed(1)}`;
  });
  return path;
}

export default function RainfallLevelChart({ gauge, levelReadings, fromMs, toMs }) {
  const [ref, measured] = useElementWidth();
  const [hover, setHover] = useState(null);
  const width = Math.max(240, measured || 640);
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const rainTop = TOP;
  const levelTop = TOP + RAIN_HEIGHT + PANEL_GAP;
  const height = levelTop + LEVEL_HEIGHT + AXIS;
  const x = (t) => MARGIN.left + ((t - fromMs) / (toMs - fromMs)) * plotWidth;
  const periodWidth = (PERIOD_MS / (toMs - fromMs)) * plotWidth;

  const model = useMemo(() => {
    const intervals = (gauge.intervals ?? [])
      .map((row) => ({ ...row, t: Date.parse(row.label) }))
      .filter((row) => row.t >= fromMs && row.t < toMs);
    const gaps = (gauge.gaps ?? []).map((gap) => ({ ...gap, from: Date.parse(gap.fromLabel), to: Date.parse(gap.toLabel) }))
      .filter((gap) => gap.to >= fromMs && gap.from < toMs);
    const anchor = Date.parse(gauge.windowsEndAt);
    const pendingFrom = gauge.windowsEndAtLatestReport && Number.isFinite(anchor) ? anchor + PERIOD_MS : null;
    const level = levelReadings.filter((point) => point.t >= fromMs && point.t <= toMs);
    const rainMax = niceCeiling(Math.max(0, ...intervals.map((row) => row.totalMm ?? 0)), 0.5);
    const values = level.map((point) => point.value);
    const levelMin = values.length ? Math.min(...values) : 0;
    const levelMax = values.length ? Math.max(...values) : 1;
    const pad = Math.max(0.05, (levelMax - levelMin) * 0.1);
    return { intervals, gaps, pendingFrom, level, rainMax, levelDomain: [levelMin - pad, levelMax + pad] };
  }, [gauge, levelReadings, fromMs, toMs]);

  const rainY = (mm) => rainTop + RAIN_HEIGHT - (mm / model.rainMax) * RAIN_HEIGHT;
  const [levelLow, levelHigh] = model.levelDomain;
  const levelY = (value) => levelTop + LEVEL_HEIGHT - ((value - levelLow) / (levelHigh - levelLow)) * LEVEL_HEIGHT;
  const ticks = timeAxisTicks(fromMs, toMs, plotWidth);
  const rainTicks = [0, model.rainMax / 2, model.rainMax];
  const levelTicks = [levelLow, (levelLow + levelHigh) / 2, levelHigh];

  function onPointerMove(event) {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * width;
    if (px < MARGIN.left || px > width - MARGIN.right) return setHover(null);
    const t = fromMs + ((px - MARGIN.left) / plotWidth) * (toMs - fromMs);
    const label = Math.round(t / PERIOD_MS) * PERIOD_MS;
    const interval = model.intervals.find((row) => row.t === label) ?? null;
    const nearest = model.level.reduce((best, point) => (!best || Math.abs(point.t - t) < Math.abs(best.t - t) ? point : best), null);
    const level = nearest && Math.abs(nearest.t - t) <= PERIOD_MS ? nearest : null;
    const pending = model.pendingFrom !== null && label >= model.pendingFrom;
    return setHover({ label, interval, level, pending, px: x(label) });
  }

  return (
    <div ref={ref} className="history-chart__canvas rainfall-chart">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
        aria-label={`Observed rainfall at ${gauge.name} in 15-minute totals, above Colwick river level, over the same period`}
        onPointerMove={onPointerMove} onPointerLeave={() => setHover(null)}>
        <defs>
          <pattern id="rainfall-unverified" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="4" className="rainfall-chart__bar--unverified-bg" />
            <line x1="0" y1="0" x2="0" y2="4" className="rainfall-chart__hatch" />
          </pattern>
        </defs>

        {/* Rainfall panel */}
        {rainTicks.map((tick) => (
          <g key={`r${tick}`}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={rainY(tick)} y2={rainY(tick)} className="history-chart__grid" />
            <text x={MARGIN.left - 6} y={rainY(tick) + 4} textAnchor="end" className="history-chart__axis">{tick.toFixed(tick % 1 ? 2 : 0)}</text>
          </g>
        ))}
        <text x={MARGIN.left} y={rainTop + 10} className="history-chart__axis rainfall-chart__panel-label" dx="4">mm per 15 min · {gauge.name}</text>
        {model.gaps.map((gap) => (
          <rect key={`g${gap.fromLabel}`} data-testid="rainfall-gap" x={x(Math.max(fromMs, gap.from - PERIOD_MS / 2))} y={rainTop}
            width={Math.max(1, x(Math.min(toMs, gap.to + PERIOD_MS / 2)) - x(Math.max(fromMs, gap.from - PERIOD_MS / 2)))} height={RAIN_HEIGHT}
            className="rainfall-chart__gap" />
        ))}
        {model.pendingFrom !== null && model.pendingFrom < toMs ? (
          <rect data-testid="rainfall-pending" x={x(model.pendingFrom - PERIOD_MS / 2)} y={rainTop}
            width={Math.max(1, x(toMs) - x(model.pendingFrom - PERIOD_MS / 2))} height={RAIN_HEIGHT} className="rainfall-chart__pending" />
        ) : null}
        {model.intervals.filter((row) => row.eligible && row.totalMm > 0).map((row) => {
          // Verified rows span their physical period; unverified rows are centred on the label and hatched.
          const start = row.periodStart ? x(Date.parse(row.periodStart)) : x(row.t) - periodWidth / 2;
          const barWidth = Math.max(1, periodWidth - (periodWidth > 3 ? 1 : 0));
          return (
            <rect key={row.label} data-testid="rainfall-bar" data-verified={row.periodStart ? "true" : "false"}
              x={start} y={rainY(row.totalMm)} width={barWidth} height={Math.max(1, rainTop + RAIN_HEIGHT - rainY(row.totalMm))}
              className={row.periodStart ? "rainfall-chart__bar" : "rainfall-chart__bar rainfall-chart__bar--unverified"}
              fill={row.periodStart ? undefined : "url(#rainfall-unverified)"} />
          );
        })}
        <line x1={MARGIN.left} x2={width - MARGIN.right} y1={rainTop + RAIN_HEIGHT} y2={rainTop + RAIN_HEIGHT} className="rainfall-chart__baseline" />

        {/* Level panel */}
        {levelTicks.map((tick) => (
          <g key={`l${tick}`}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={levelY(tick)} y2={levelY(tick)} className="history-chart__grid" />
            <text x={MARGIN.left - 6} y={levelY(tick) + 4} textAnchor="end" className="history-chart__axis">{tick.toFixed(2)}</text>
          </g>
        ))}
        <text x={MARGIN.left} y={levelTop + 10} className="history-chart__axis rainfall-chart__panel-label" dx="4">Colwick level (m)</text>
        {model.level.length ? (
          <path d={levelPath(model.level, x, levelY)} className="history-chart__line" data-testid="level-line" />
        ) : (
          <text x={MARGIN.left + plotWidth / 2} y={levelTop + LEVEL_HEIGHT / 2} textAnchor="middle" className="history-chart__axis">
            Colwick level unavailable for this period
          </text>
        )}

        {/* Shared time axis */}
        {ticks.map((tick) => (
          <g key={tick.t}>
            <line x1={x(tick.t)} x2={x(tick.t)} y1={rainTop} y2={levelTop + LEVEL_HEIGHT} className="history-chart__grid" />
            <text x={x(tick.t)} y={height - 8} textAnchor="middle" className="history-chart__axis">{tick.label}</text>
          </g>
        ))}

        {hover ? <line x1={hover.px} x2={hover.px} y1={rainTop} y2={levelTop + LEVEL_HEIGHT} className="history-chart__crosshair" /> : null}
      </svg>
      {hover ? (
        <div className="history-chart__tooltip" style={hover.px > width / 2 ? { right: width - hover.px + 8 } : { left: hover.px + 8 }}>
          <strong>Label {formatLabelTime(hover.label, true)}</strong>
          <span>
            {hover.interval
              ? hover.interval.eligible ? `${formatMm(hover.interval.totalMm)} in 15 min` : "Reported but not usable (missing amount)"
              : hover.pending ? "Not reported yet" : "Missing (not zero)"}
          </span>
          {hover.interval ? <span className="history-chart__tooltip-muted">{describeConvention(hover.interval.labelConvention)}</span> : null}
          {hover.interval?.revised ? <span className="history-chart__tooltip-muted">Corrected by the source since first received</span> : null}
          <span>{hover.level ? `Colwick ${hover.level.value.toFixed(2)} m` : "No Colwick reading at this time"}</span>
        </div>
      ) : null}
    </div>
  );
}

RainfallLevelChart.propTypes = {
  gauge: PropTypes.shape({
    name: PropTypes.string.isRequired,
    intervals: PropTypes.arrayOf(PropTypes.object),
    gaps: PropTypes.arrayOf(PropTypes.object),
    windowsEndAt: PropTypes.string,
    windowsEndAtLatestReport: PropTypes.bool,
  }).isRequired,
  levelReadings: PropTypes.arrayOf(PropTypes.shape({ t: PropTypes.number, value: PropTypes.number })).isRequired,
  fromMs: PropTypes.number.isRequired,
  toMs: PropTypes.number.isRequired,
};
