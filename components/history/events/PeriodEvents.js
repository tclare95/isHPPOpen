"use client";

import Link from "next/link";
import PropTypes from "prop-types";
import useFetch from "../../../libs/useFetch";
import { eventsInPeriod } from "../../../libs/history/events";
import { HISTORY_SWR } from "../StatusBlocks";
import EventList from "./EventList";

// High-water events overlapping the period shown in the /history explorer (#105).
// Loads independently: a failure here never hides the period's readings.
export default function PeriodEvents({ from, to, label, year, month }) {
  const { data, error } = useFetch("/api/history/colwick/events", HISTORY_SWR);
  if (error || !data) return null;
  const all = data.events;
  const scoped = eventsInPeriod(all, from, to);
  const query = new URLSearchParams({ year: String(year) });
  if (month) query.set("month", String(month));
  return (
    <div className="mt-4">
      <h3 className="h5">High-water events in {label}</h3>
      {scoped.length ? (
        <>
          <EventList compact events={scoped} periodLabel={label}
            maxPeak={Math.max(...all.map((event) => event.peak.value))} maxAboveMs={Math.max(...all.map((event) => event.aboveMs))} />
        </>
      ) : <p className="history-muted small mb-1">None in {label}.</p>}
      <Link href={`/history/events?${query}`} className="history-back small">See all events {month ? "this month" : "this year"} →</Link>
    </div>
  );
}

PeriodEvents.propTypes = {
  from: PropTypes.number.isRequired,
  to: PropTypes.number.isRequired,
  label: PropTypes.string.isRequired,
  year: PropTypes.number.isRequired,
  month: PropTypes.number,
};
