"use client";

import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { COLWICK_HISTORY } from "../../../libs/history/config";
import { eventDateRange, eventSummaryLine, LIMITATION_TEXT } from "../../../libs/history/eventPresent";
import { formatDateTime } from "../../../libs/history/present";
import { londonMidnightUtc } from "../../../libs/history/ukCalendar";

const MARGIN = { top: 16, right: 12, bottom: 28, left: 44 };
const HIT_PX = 14;

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

// Every identified event across all history: a stem from the 2.2 m reference up to the
// observed peak, and a footprint along the reference showing its observed span. Events
// outside the selected period are dimmed; incomplete events have a hollow head and a
// dashed stem (shape, not colour, carries completeness).
export default function EventTimeline({ events, from, to, selected, onSelect }) {
  const [ref, width] = useElementWidth();
  const [hover, setHover] = useState(null);
  const height = width && width < 576 ? 200 : 240;
  const threshold = COLWICK_HISTORY.thresholdMetres;
  const maxPeak = Math.max(threshold + 0.5, ...events.map((event) => event.peak.value));
  const yMax = Math.ceil(maxPeak * 2) / 2;
  const innerW = Math.max(10, width - MARGIN.left - MARGIN.right);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const x = (t) => MARGIN.left + ((t - from) / (to - from)) * innerW;
  const y = (v) => MARGIN.top + (1 - (v - threshold) / (yMax - threshold)) * innerH;
  const inScope = (event) => !selected || (Date.parse(event.firstAboveAt) < selected[1] && Date.parse(event.lastAboveAt) >= selected[0]);

  const firstYear = new Date(from).getUTCFullYear();
  const lastYear = new Date(to).getUTCFullYear();
  const years = [];
  for (let year = firstYear; year <= lastYear + 1; year++) {
    const t = londonMidnightUtc(year, 1, 1);
    if (t >= from && t <= to) years.push({ year, t });
  }
  const labelEvery = innerW / Math.max(1, years.length) < 34 ? 2 : 1;
  // The reference itself, then round half-metres above it.
  const yTicks = [threshold];
  for (let v = Math.floor(threshold * 2) / 2 + 0.5; v <= yMax + 1e-9; v += 0.5) {
    if (v - threshold >= 0.15) yTicks.push(Math.round(v * 10) / 10);
  }

  const locate = (event) => {
    const px = event.clientX - event.currentTarget.getBoundingClientRect().left;
    let best = null;
    for (const item of events) {
      const distance = Math.abs(x(Date.parse(item.peak.at)) - px);
      if (distance <= HIT_PX && (!best || distance < best.distance || (distance === best.distance && item.peak.value > best.item.peak.value))) {
        best = { item, distance };
      }
    }
    return best?.item ?? null;
  };

  const hoverX = hover ? x(Date.parse(hover.peak.at)) : 0;
  return (
    <figure className="events-timeline mb-0">
      <figcaption className="visually-hidden">
        Observed Colwick high-water events since {firstYear}: each stem rises from {threshold.toFixed(1)} m to the event&apos;s highest observed reading. The event list below gives the same information.
      </figcaption>
      <div ref={ref} className="events-timeline__canvas" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} aria-hidden="true"
            onPointerMove={(event) => setHover(locate(event))}
            onPointerLeave={() => setHover(null)}
            onClick={(event) => { const item = locate(event); if (item) onSelect(item.id); }}
            style={{ cursor: hover ? "pointer" : "default" }}>
            {selected ? (
              <rect x={x(Math.max(from, selected[0]))} width={Math.max(2, x(Math.min(to, selected[1])) - x(Math.max(from, selected[0])))}
                y={MARGIN.top} height={innerH} className="events-timeline__scope" />
            ) : null}
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={MARGIN.left} x2={MARGIN.left + innerW} y1={y(v)} y2={y(v)} className={v === threshold ? "history-chart__threshold" : "history-chart__grid"} />
                <text x={MARGIN.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="history-chart__axis">{v.toFixed(1)}</text>
              </g>
            ))}
            {years.map(({ year, t }, index) => (
              <g key={year}>
                <line x1={x(t)} x2={x(t)} y1={MARGIN.top} y2={MARGIN.top + innerH} className="history-chart__grid" />
                {index % labelEvery === 0 ? <text x={x(t) + 3} y={height - 9} className="history-chart__axis">{year}</text> : null}
              </g>
            ))}
            {events.map((event) => {
              const px = x(Date.parse(event.peak.at));
              const active = inScope(event);
              const isHover = hover?.id === event.id;
              return (
                <g key={event.id} className={`events-timeline__event${active ? "" : " is-dimmed"}${isHover ? " is-hover" : ""}${event.complete ? "" : " is-incomplete"}`}>
                  <rect x={x(Date.parse(event.firstAboveAt))} width={Math.max(1.5, x(Date.parse(event.lastAboveAt)) - x(Date.parse(event.firstAboveAt)))}
                    y={y(threshold) - 2} height="4" rx="1" className="events-timeline__span" />
                  <line x1={px} x2={px} y1={y(threshold)} y2={y(event.peak.value)} className="events-timeline__stem" />
                  <circle cx={px} cy={y(event.peak.value)} r={isHover ? 5.5 : 4} className="events-timeline__head" />
                </g>
              );
            })}
            {hover ? <line x1={hoverX} x2={hoverX} y1={MARGIN.top} y2={MARGIN.top + innerH} className="history-chart__crosshair" /> : null}
          </svg>
        )}
        {hover ? (
          <div className="history-chart__tooltip" role="status" style={{ left: Math.min(Math.max(hoverX + 12, 8), width - 230) }}>
            <strong>{eventDateRange(hover)}</strong>
            <span>{eventSummaryLine(hover)}</span>
            <span className="history-chart__tooltip-muted">Peak {formatDateTime(hover.peak.at)}</span>
            {hover.limitations.length ? <span className="history-chart__tooltip-muted">{hover.limitations.map((item) => LIMITATION_TEXT[item]).join(" · ")}</span> : null}
            <span className="history-chart__tooltip-muted">Click to open</span>
          </div>
        ) : null}
      </div>
    </figure>
  );
}

EventTimeline.propTypes = {
  events: PropTypes.array.isRequired,
  from: PropTypes.number.isRequired,
  to: PropTypes.number.isRequired,
  selected: PropTypes.arrayOf(PropTypes.number),
  onSelect: PropTypes.func.isRequired,
};
