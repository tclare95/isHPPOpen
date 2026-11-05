"use client";

import PropTypes from "prop-types";
import { COLWICK_HISTORY } from "../../libs/history/config";
import { describeYears, formatDateTime, formatLevel, formatPercent, monthName, seasonalPosition } from "../../libs/history/present";
import SeasonalStrip from "./SeasonalStrip";

// Today's live Colwick reading against the same calendar month in reference years.
export default function TodayContext({ overview, overviewError, latest, levelsError, currentMonth, onExplore }) {
  const seasonal = overview?.seasonal?.[currentMonth - 1];
  const value = latest?.value;
  const position = seasonalPosition(seasonal, value);
  const name = monthName(currentMonth);

  let body;
  if (overviewError) {
    body = <p className="history-muted mb-0">Seasonal context is unavailable right now. Current status, forecasts and alerts are not affected.</p>;
  } else if (!overview) {
    body = <p className="history-muted mb-0" aria-live="polite">Loading seasonal context…</p>;
  } else if (!seasonal?.available) {
    body = <p className="mb-0">There is not yet enough comparable qualified history to say what is typical for {name} ({seasonal?.referenceYears.length ?? 0} reference years; at least 5 needed).</p>;
  } else if (!Number.isFinite(value)) {
    body = <p className="mb-0">{levelsError ? "The current level is unavailable" : "Waiting for the current level"}. In {name} {describeYears(seasonal.referenceYears)} the level was usually between {formatLevel(seasonal.quantiles[10])} and {formatLevel(seasonal.quantiles[90])}.</p>;
  } else {
    body = (
      <>
        <p className={`history-context__label history-context__label--${position.tone}`}>{position.label} for {name}</p>
        <p className="mb-2">The latest reading is higher than about <strong>{position.rank}%</strong> of qualified {name} readings from {describeYears(seasonal.referenceYears)} ({seasonal.referenceYears.length} years, {seasonal.readingCount.toLocaleString("en-GB")} readings). Typical {name} range (10th–90th percentile): {formatLevel(position.p10)} – {formatLevel(position.p90)}, median {formatLevel(position.p50)}.</p>
        <SeasonalStrip position={position} value={value} valueLabel={`Now ${formatLevel(value)}`} />
        <p className="history-muted small mb-0 mt-2">In those {name}s the level was at or above {COLWICK_HISTORY.thresholdMetres.toFixed(1)} m for {formatPercent(seasonal.aboveShare)} of supported time.</p>
      </>
    );
  }

  return (
    <section className="history-panel history-context" aria-labelledby="history-today">
      <div className="history-context__head">
        <div>
          <p className="history-eyebrow mb-1">Today in context</p>
          <h2 id="history-today" className="h4 mb-0">{Number.isFinite(value) ? formatLevel(value) : "Current level"} at Colwick</h2>
          {latest?.observedAt ? <p className="history-muted small mb-0">Observed {formatDateTime(latest.observedAt)} · live, provisional reading</p> : null}
        </div>
        <button type="button" className="btn btn-outline-info btn-sm" onClick={onExplore}>Explore {name}</button>
      </div>
      {body}
    </section>
  );
}

TodayContext.propTypes = {
  overview: PropTypes.object,
  overviewError: PropTypes.object,
  latest: PropTypes.shape({ value: PropTypes.number, observedAt: PropTypes.string }),
  levelsError: PropTypes.object,
  currentMonth: PropTypes.number.isRequired,
  onExplore: PropTypes.func.isRequired,
};
