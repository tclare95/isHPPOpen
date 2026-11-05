"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import Button from "react-bootstrap/Button";
import { COLWICK_HISTORY } from "../../libs/history/config";
import { READING_FLAG } from "../../libs/history/digest";
import { formatDateTime, formatDayKey, formatLevel } from "../../libs/history/present";
import { londonMidnightUtc, londonParts } from "../../libs/history/ukCalendar";

const HOUR_MS = 3600000;
const DAY_MS = 24 * HOUR_MS;
const MARGIN = { top: 14, right: 14, bottom: 30, left: 46 };
const MIN_ZOOM_MS = 2 * HOUR_MS;

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

function niceStep(span, target) {
  const raw = span / Math.max(1, target);
  return [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2].find((step) => step >= raw) ?? 2;
}

const SHORT_MONTH = new Intl.DateTimeFormat("en-GB", { timeZone: COLWICK_HISTORY.timeZone, month: "short" });
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { timeZone: COLWICK_HISTORY.timeZone, day: "numeric", month: "short" });
const HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: COLWICK_HISTORY.timeZone, hour: "2-digit", minute: "2-digit" });

export function timeTicks(from, to, width) {
  const span = to - from;
  const maxTicks = Math.max(2, Math.floor(width / 64));
  const start = londonParts(from);
  const ticks = [];
  if (span > 120 * DAY_MS) {
    for (let i = 0; i < 400; i++) {
      const t = londonMidnightUtc(start.year, start.month + i, 1);
      if (t > to) break;
      if (t >= from) ticks.push({ t, label: SHORT_MONTH.format(t) });
    }
    const every = Math.ceil(ticks.length / maxTicks);
    return ticks.filter((_, index) => index % every === 0);
  }
  if (span > 2 * DAY_MS) {
    const days = Math.ceil(span / DAY_MS);
    const every = [1, 2, 3, 5, 7, 10, 14].find((step) => days / step <= maxTicks) ?? 14;
    for (let i = 0; i <= days + 1; i++) {
      const t = londonMidnightUtc(start.year, start.month, start.day + i);
      if (t > to) break;
      const day = londonParts(t).day;
      if (t >= from && (every === 1 || (day - 1) % every === 0)) ticks.push({ t, label: DAY_MONTH.format(t) });
    }
    return ticks;
  }
  const every = [1, 2, 3, 6, 12].find((step) => span / (step * HOUR_MS) <= maxTicks) ?? 12;
  for (let t = Math.ceil(from / HOUR_MS) * HOUR_MS; t <= to; t += HOUR_MS) {
    if (londonParts(t).hour % every === 0) ticks.push({ t, label: londonParts(t).hour === 0 ? DAY_MONTH.format(t) : HOUR.format(t) });
  }
  return ticks;
}

function lowerBound(points, t) {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Splits points wherever consecutive times are further apart than maxGap.
function runs(points, maxGap, accept = () => true) {
  const result = [];
  let current = [];
  points.forEach((point, index) => {
    const previous = points[index - 1];
    if (!accept(point) || (previous && point.t - previous.t > maxGap)) {
      if (current.length) result.push(current);
      current = [];
    }
    if (accept(point)) current.push(point);
  });
  if (current.length) result.push(current);
  return result;
}

export default function LevelChart({ mode, from, to, end, days = [], readings = [], band = [], zoom = null, onZoomChange, title }) {
  const [containerRef, width] = useElementWidth();
  const [hover, setHover] = useState(null);
  const [brush, setBrush] = useState(null);
  const threshold = COLWICK_HISTORY.thresholdMetres;
  const height = width && width < 576 ? 250 : 330;
  const [viewFrom, viewTo] = zoom ?? [from, to];

  const points = useMemo(() => (mode === "month"
    ? readings.map(([seconds, value, flag]) => ({ t: seconds * 1000, v: value, flag }))
    : days.map((day) => {
      const [y, m, d] = day.date.split("-").map(Number);
      const dayStart = londonMidnightUtc(y, m, d);
      return { t: dayStart + 12 * HOUR_MS, date: day.date, v: day.mean, min: day.min, max: day.max, from: dayStart, to: londonMidnightUtc(y, m, d + 1) };
    })), [mode, readings, days]);

  const maxGap = mode === "month" ? COLWICK_HISTORY.maxSupportedGapMs : DAY_MS * 1.5;
  const visible = points.filter((p) => p.t >= viewFrom - maxGap && p.t <= viewTo + maxGap && p.v !== null);
  const visibleBand = band.filter((b) => b.t >= viewFrom - DAY_MS && b.t <= viewTo + DAY_MS && b.p10 !== null);

  const values = [threshold, ...visible.flatMap((p) => [p.v, p.min, p.max]), ...visibleBand.flatMap((b) => [b.p10, b.p90])]
    .filter(Number.isFinite);
  const yStep = niceStep(Math.max(...values) - Math.min(...values) || 1, 5);
  const yMin = Math.floor((Math.min(...values) - yStep * 0.2) / yStep) * yStep;
  const yMax = Math.ceil((Math.max(...values) + yStep * 0.2) / yStep) * yStep;

  const innerW = Math.max(10, width - MARGIN.left - MARGIN.right);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const x = (t) => MARGIN.left + ((t - viewFrom) / (viewTo - viewFrom)) * innerW;
  const y = (v) => MARGIN.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  const tAt = (px) => viewFrom + ((px - MARGIN.left) / innerW) * (viewTo - viewFrom);
  const line = (run, key = "v") => run.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
  const area = (run, lowKey, highKey) => `${line(run, highKey)}L${[...run].reverse().map((p) => `${x(p.t).toFixed(1)},${y(p[lowKey]).toFixed(1)}`).join("L")}Z`;

  // Unsupported intervals inside the elapsed period are drawn explicitly, never joined.
  const gaps = useMemo(() => {
    const result = [];
    if (mode === "month") {
      let previous = from;
      for (const point of points) {
        if (point.t - previous > COLWICK_HISTORY.maxSupportedGapMs) result.push([previous, point.t]);
        previous = point.t;
      }
      if (end - previous > COLWICK_HISTORY.maxSupportedGapMs) result.push([previous, end]);
    } else {
      for (const point of points) if (point.v === null && point.from < end) result.push([point.from, Math.min(point.to, end)]);
    }
    return result;
  }, [mode, points, from, end]);

  const ticks = width ? timeTicks(viewFrom, viewTo, innerW) : [];
  const yTicks = [];
  for (let v = yMin; v <= yMax + 1e-9; v += yStep) yTicks.push(Math.round(v * 100) / 100);

  function nearest(px) {
    if (!visible.length) return null;
    const t = tAt(px);
    const index = lowerBound(visible, t);
    const candidates = [visible[index - 1], visible[index]].filter(Boolean);
    const point = candidates.sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];
    if (Math.abs(point.t - t) > (mode === "month" ? HOUR_MS : DAY_MS)) return null;
    const typical = band.length ? band[Math.max(0, lowerBound(band, point.t + 1) - 1)] : null;
    return { point, typical };
  }

  const localX = (event) => event.clientX - event.currentTarget.getBoundingClientRect().left;
  const onPointerMove = (event) => {
    const px = localX(event);
    if (brush) setBrush({ ...brush, x2: px });
    setHover(nearest(px));
  };
  const onPointerDown = (event) => {
    if (event.pointerType === "mouse" && onZoomChange) setBrush({ x1: localX(event), x2: localX(event) });
    else setHover(nearest(localX(event)));
  };
  const onPointerUp = () => {
    if (brush && Math.abs(brush.x2 - brush.x1) > 8) {
      const a = Math.max(from, tAt(Math.min(brush.x1, brush.x2)));
      const b = Math.min(to, tAt(Math.max(brush.x1, brush.x2)));
      if (b - a >= MIN_ZOOM_MS) onZoomChange([a, b]);
    }
    setBrush(null);
  };

  const hoverX = hover ? x(hover.point.t) : null;
  const provisionalRuns = mode === "month" ? runs(visible, maxGap, (p) => p.flag === READING_FLAG.PROVISIONAL) : [];
  const qualifiedRuns = mode === "month" ? runs(visible, maxGap, (p) => p.flag !== READING_FLAG.PROVISIONAL) : runs(visible, maxGap);

  return (
    <figure className="history-chart mb-0">
      <div className="history-chart__toolbar">
        <figcaption className="history-chart__title">{title}</figcaption>
        {zoom ? <Button size="sm" variant="outline-light" onClick={() => onZoomChange(null)}>Reset zoom</Button> : null}
      </div>
      <div ref={containerRef} className="history-chart__canvas" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={title}
            onPointerMove={onPointerMove} onPointerDown={onPointerDown} onPointerUp={onPointerUp}
            onPointerLeave={() => { setHover(null); setBrush(null); }}>
            <defs>
              <pattern id="history-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="rgba(255,255,255,0.03)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(214,224,230,0.28)" strokeWidth="2" />
              </pattern>
              <clipPath id="history-plot"><rect x={MARGIN.left} y={MARGIN.top} width={innerW} height={innerH} /></clipPath>
            </defs>
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={MARGIN.left} x2={MARGIN.left + innerW} y1={y(v)} y2={y(v)} className="history-chart__grid" />
                <text x={MARGIN.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="history-chart__axis">{v.toFixed(yStep < 0.1 ? 2 : 1)}</text>
              </g>
            ))}
            {ticks.map((tick) => (
              <text key={tick.t} x={x(tick.t)} y={height - 8} textAnchor="middle" className="history-chart__axis">{tick.label}</text>
            ))}
            <g clipPath="url(#history-plot)">
              {gaps.map(([a, b]) => (
                <rect key={a} x={x(a)} width={Math.max(1, x(b) - x(a))} y={MARGIN.top} height={innerH} fill="url(#history-hatch)" />
              ))}
              {end < to ? <rect x={x(end)} width={Math.max(0, x(to) - x(end))} y={MARGIN.top} height={innerH} className="history-chart__future" /> : null}
              {runs(visibleBand, DAY_MS * 1.5).map((run) => (
                <g key={run[0].t}>
                  <path d={area(run, "p10", "p90")} className="history-chart__band" />
                  <path d={line(run, "p50")} className="history-chart__band-median" />
                </g>
              ))}
              {mode === "year" && qualifiedRuns.map((run) => <path key={`r${run[0].t}`} d={area(run, "min", "max")} className="history-chart__range" />)}
              {qualifiedRuns.map((run) => <path key={run[0].t} d={line(run)} className="history-chart__line" />)}
              {provisionalRuns.map((run) => <path key={`p${run[0].t}`} d={line(run)} className="history-chart__line history-chart__line--provisional" />)}
              <line x1={MARGIN.left} x2={MARGIN.left + innerW} y1={y(threshold)} y2={y(threshold)} className="history-chart__threshold" />
              {brush ? <rect x={Math.min(brush.x1, brush.x2)} width={Math.abs(brush.x2 - brush.x1)} y={MARGIN.top} height={innerH} className="history-chart__brush" /> : null}
              {hover ? (
                <g>
                  <line x1={hoverX} x2={hoverX} y1={MARGIN.top} y2={MARGIN.top + innerH} className="history-chart__crosshair" />
                  <circle cx={hoverX} cy={y(hover.point.v)} r="4.5" className="history-chart__dot" />
                </g>
              ) : null}
            </g>
            <text x={MARGIN.left + innerW - 4} y={y(threshold) - 6} textAnchor="end" className="history-chart__threshold-label">{threshold.toFixed(1)} m HPP level rule</text>
          </svg>
        )}
        {hover ? (
          <div className="history-chart__tooltip" role="status" style={{ left: Math.min(Math.max(hoverX + 12, 8), width - 220) }}>
            {mode === "month" ? (
              <>
                <strong>{formatLevel(hover.point.v)}</strong>
                <span>{formatDateTime(hover.point.t)}</span>
                <span>{hover.point.flag === READING_FLAG.PROVISIONAL ? "Provisional (not yet qualified)" : hover.point.flag === READING_FLAG.EDITED ? "Qualified · provider-edited" : "Qualified"}</span>
              </>
            ) : (
              <>
                <strong>{formatDayKey(hover.point.date)}</strong>
                <span>Range {formatLevel(hover.point.min)} – {formatLevel(hover.point.max)}</span>
                <span>Mean {formatLevel(hover.point.v)}</span>
              </>
            )}
            {hover.typical?.p10 != null ? <span className="history-chart__tooltip-muted">Typical {formatLevel(hover.typical.p10)} – {formatLevel(hover.typical.p90)}</span> : null}
          </div>
        ) : null}
      </div>
    </figure>
  );
}

LevelChart.propTypes = {
  mode: PropTypes.oneOf(["year", "month"]).isRequired,
  from: PropTypes.number.isRequired,
  to: PropTypes.number.isRequired,
  end: PropTypes.number.isRequired,
  days: PropTypes.array,
  readings: PropTypes.array,
  band: PropTypes.array,
  zoom: PropTypes.arrayOf(PropTypes.number),
  onZoomChange: PropTypes.func,
  title: PropTypes.string.isRequired,
};
