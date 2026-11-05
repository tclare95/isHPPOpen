"use client";

import PropTypes from "prop-types";
import { COLWICK_HISTORY } from "../../libs/history/config";
import { formatLevel } from "../../libs/history/present";

// One-dimensional distribution: p10–p90 and p25–p75 bands, median, the 2.2 m rule and a
// highlighted value. Every mark is labelled in text below for non-visual readers.
export default function SeasonalStrip({ position, value, valueLabel }) {
  const threshold = COLWICK_HISTORY.thresholdMetres;
  const lo = Math.min(position.min, value ?? Infinity, threshold) - 0.05;
  const hi = Math.max(position.max, value ?? -Infinity, threshold) + 0.05;
  const pct = (v) => `${((v - lo) / (hi - lo)) * 100}%`;
  return (
    <div className="history-strip" aria-hidden="true">
      <div className="history-strip__track">
        <span className="history-strip__band" style={{ left: pct(position.p10), width: `calc(${pct(position.p90)} - ${pct(position.p10)})` }} />
        <span className="history-strip__band history-strip__band--core" style={{ left: pct(position.p25), width: `calc(${pct(position.p75)} - ${pct(position.p25)})` }} />
        <span className="history-strip__median" style={{ left: pct(position.p50) }} />
        <span className="history-strip__threshold" style={{ left: pct(threshold) }} />
        {Number.isFinite(value) ? <span className="history-strip__value" style={{ left: pct(value) }} /> : null}
      </div>
      <div className="history-strip__labels">
        <span style={{ left: pct(position.p10) }}>{formatLevel(position.p10)}</span>
        <span style={{ left: pct(position.p90) }}>{formatLevel(position.p90)}</span>
        <span className="is-threshold" style={{ left: pct(threshold) }}>{threshold.toFixed(1)} m</span>
        {Number.isFinite(value) ? <span className="is-value" style={{ left: pct(value) }}>{valueLabel}</span> : null}
      </div>
    </div>
  );
}

SeasonalStrip.propTypes = {
  position: PropTypes.object.isRequired,
  value: PropTypes.number,
  valueLabel: PropTypes.string,
};
