"use client";

import Link from "next/link";
import PropTypes from "prop-types";
import { COLWICK_HISTORY } from "../../../libs/history/config";
import { eventDateRange, eventDurationText, LIMITATION_TEXT } from "../../../libs/history/eventPresent";
import { formatDateTime, formatLevel } from "../../../libs/history/present";

const threshold = COLWICK_HISTORY.thresholdMetres;

// Bars share one scale across the whole list so events can be compared at a glance.
export default function EventList({ events, maxPeak, maxAboveMs, periodLabel, compact = false }) {
  if (!events.length) return null;
  return (
    <ol className={`events-list${compact ? " events-list--compact" : ""}`}>
      {events.map((event) => (
        <li key={event.id}>
          <Link href={`/history/events/${event.id}`} className="events-row">
            <span className="events-row__when">
              <span className="events-row__title">{eventDateRange(event)}</span>
              <span className="events-row__badges">
                {event.beforePeriod ? <span className="events-badge events-badge--edge">Began before {periodLabel}</span> : null}
                {event.afterPeriod ? <span className="events-badge events-badge--edge">Continues after {periodLabel}</span> : null}
                {event.brief ? <span className="events-badge">Brief</span> : null}
                {event.limitations.map((item) => <span key={item} className="events-badge events-badge--warning">{LIMITATION_TEXT[item]}</span>)}
              </span>
            </span>
            <span className="events-row__metric">
              <span className="events-row__value">{formatLevel(event.peak.value)}<span className="events-row__unit"> peak</span></span>
              <span className="events-row__bar" aria-hidden="true">
                <span className="events-row__fill events-row__fill--peak" style={{ width: `${Math.max(3, ((event.peak.value - threshold) / (maxPeak - threshold)) * 100)}%` }} />
              </span>
              {compact ? null : <span className="events-row__detail">{formatDateTime(event.peak.at)}</span>}
            </span>
            <span className="events-row__metric">
              <span className="events-row__value">{eventDurationText(event)}</span>
              <span className="events-row__bar" aria-hidden="true">
                <span className="events-row__fill" style={{ width: `${Math.max(3, (event.aboveMs / maxAboveMs) * 100)}%` }} />
              </span>
              {compact ? null : <span className="events-row__detail">at or above {threshold.toFixed(1)} m</span>}
            </span>
            <span className="events-row__chevron" aria-hidden="true">›</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

EventList.propTypes = {
  events: PropTypes.array.isRequired,
  maxPeak: PropTypes.number.isRequired,
  maxAboveMs: PropTypes.number.isRequired,
  periodLabel: PropTypes.string,
  compact: PropTypes.bool,
};
