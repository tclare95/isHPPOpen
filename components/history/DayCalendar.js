"use client";

import PropTypes from "prop-types";
import { COLWICK_HISTORY } from "../../libs/history/config";
import { formatDayKey, formatDuration, formatLevel } from "../../libs/history/present";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Classifies a UK day by its supported observed time relative to the 2.2 m rule.
export function dayState(day) {
  if (day.elapsedMs === 0) return "future";
  const supported = day.aboveMs + day.belowMs;
  if (supported < day.elapsedMs * 0.5) return "unknown";
  if (day.aboveMs > 0 && day.belowMs === 0) return "above";
  if (day.aboveMs > 0) return "mixed";
  return "below";
}

const STATE_TEXT = {
  above: "At or above 2.2 m all supported day",
  mixed: "Reached 2.2 m for part of the day",
  below: "Below 2.2 m",
  unknown: "Mostly unknown (gaps)",
  future: "Not yet elapsed",
};

export default function DayCalendar({ days, selected, onSelect }) {
  if (!days.length) return null;
  const [year, month, day] = days[0].date.split("-").map(Number);
  const lead = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  const threshold = `${COLWICK_HISTORY.thresholdMetres.toFixed(1)} m`;

  return (
    <div>
      <div className="history-calendar" role="group" aria-label="Days of the month by river level relative to 2.2 m">
        {WEEKDAYS.map((name) => <div key={name} className="history-calendar__weekday" aria-hidden="true">{name}</div>)}
        {Array.from({ length: lead }, (_, index) => <div key={`lead${index}`} aria-hidden="true" />)}
        {days.map((item) => {
          const state = dayState(item);
          const label = `${formatDayKey(item.date)}: ${STATE_TEXT[state]}${item.aboveMs ? `, ${formatDuration(item.aboveMs)} at or above ${threshold}` : ""}${item.max !== null ? `, peak ${formatLevel(item.max)}` : ""}`;
          return (
            <button key={item.date} type="button" title={label} aria-label={label}
              aria-pressed={selected === item.date} disabled={state === "future" || item.n === 0}
              className={`history-day history-day--${state}${selected === item.date ? " is-selected" : ""}`}
              onClick={() => onSelect(selected === item.date ? null : item.date)}>
              <span className="history-day__date">{Number(item.date.slice(8))}</span>
              <span className="history-day__value">{item.max !== null ? item.max.toFixed(2) : "–"}</span>
              {item.aboveMs > 0 && state !== "above" ? <span className="history-day__note">{formatDuration(item.aboveMs)}</span> : null}
            </button>
          );
        })}
      </div>
      <ul className="history-legend" aria-label="Calendar key">
        {["below", "mixed", "above", "unknown"].map((state) => (
          <li key={state}><span className={`history-legend__swatch history-day--${state}`} aria-hidden="true" />{STATE_TEXT[state]}</li>
        ))}
      </ul>
      <p className="history-muted small mb-0">Each day shows its peak reading. Select a day to zoom the chart to its individual 15-minute readings.</p>
    </div>
  );
}

DayCalendar.propTypes = {
  days: PropTypes.array.isRequired,
  selected: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
};
