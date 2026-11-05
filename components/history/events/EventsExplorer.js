"use client";

import { useState } from "react";
import Link from "next/link";
import PropTypes from "prop-types";
import { useRouter, useSearchParams } from "next/navigation";
import Container from "react-bootstrap/Container";
import Form from "react-bootstrap/Form";
import useFetch from "../../../libs/useFetch";
import { COLWICK_HISTORY } from "../../../libs/history/config";
import { eventDateRange, eventDurationText } from "../../../libs/history/eventPresent";
import { eventsInPeriod } from "../../../libs/history/events";
import { COVERAGE_TEXT, formatDate, formatDuration, formatLevel, monthName, shortMonthName } from "../../../libs/history/present";
import { currentLondonMonth, monthBounds, yearBounds } from "../../../libs/history/ukCalendar";
import { ErrorNotice, HISTORY_SWR, LoadingBlock, useSlow } from "../StatusBlocks";
import EventList from "./EventList";
import EventTimeline from "./EventTimeline";
import NotClosuresNote from "./NotClosuresNote";

const threshold = `${COLWICK_HISTORY.thresholdMetres.toFixed(1)} m`;
const SORTS = {
  newest: { label: "Newest first", compare: (a, b) => Date.parse(b.firstAboveAt) - Date.parse(a.firstAboveAt) },
  oldest: { label: "Oldest first", compare: (a, b) => Date.parse(a.firstAboveAt) - Date.parse(b.firstAboveAt) },
  peak: { label: "Highest peak", compare: (a, b) => b.peak.value - a.peak.value },
  duration: { label: "Longest at or above", compare: (a, b) => b.aboveMs - a.aboveMs },
};

// Reads ?year=&month=&sort=&brief= with safe fallbacks (all years, newest first).
export function readEventFilters(params, current) {
  const year = Number(params.get("year"));
  const validYear = Number.isInteger(year) && year >= COLWICK_HISTORY.firstYear && year <= current.year ? year : null;
  const month = Number(params.get("month"));
  const validMonth = validYear && Number.isInteger(month) && month >= 1 && month <= 12 &&
    !(validYear === current.year && month > current.month) ? month : null;
  const sort = SORTS[params.get("sort")] ? params.get("sort") : "newest";
  return { year: validYear, month: validMonth, sort, hideBrief: params.get("brief") === "hide" };
}

function Tile({ value, label, detail }) {
  return (
    <div className="history-tile">
      <div className="history-tile__value">{value}</div>
      <div className="history-tile__label">{label}</div>
      {detail ? <div className="history-tile__detail">{detail}</div> : null}
    </div>
  );
}

Tile.propTypes = { value: PropTypes.node.isRequired, label: PropTypes.string.isRequired, detail: PropTypes.node };

function Spotlight({ events }) {
  const top = [...events].sort(SORTS.peak.compare).slice(0, 3);
  if (!top.length) return null;
  return (
    <section className="history-panel" aria-labelledby="events-spotlight">
      <h2 id="events-spotlight" className="h5 mb-1">Highest observed peaks</h2>
      <p className="history-muted small">Among events identified in the history available today. Corrections to the archive can change this order; it is not a flood record.</p>
      <div className="events-spotlight">
        {top.map((event, index) => (
          <Link key={event.id} href={`/history/events/${event.id}`} className="events-spotlight__card">
            <span className="events-spotlight__rank">#{index + 1}</span>
            <span className="events-spotlight__value">{formatLevel(event.peak.value)}</span>
            <span className="events-spotlight__when">{formatDate(event.peak.at)}</span>
            <span className="history-muted small">{eventDateRange(event)} · {eventDurationText(event)} at or above {threshold}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

Spotlight.propTypes = { events: PropTypes.array.isRequired };

export default function EventsExplorer() {
  const params = useSearchParams();
  const router = useRouter();
  const [current] = useState(() => currentLondonMonth());
  const filters = readEventFilters(params, current);
  const index = useFetch("/api/history/colwick/events", HISTORY_SWR);
  const slow = useSlow(index.isPending);

  const setFilters = (next) => {
    const merged = { ...filters, ...next };
    const query = new URLSearchParams();
    if (merged.year) query.set("year", String(merged.year));
    if (merged.year && merged.month) query.set("month", String(merged.month));
    if (merged.sort !== "newest") query.set("sort", merged.sort);
    if (merged.hideBrief) query.set("brief", "hide");
    const text = query.toString();
    router.replace(text ? `/history/events?${text}` : "/history/events", { scroll: false });
  };

  const data = index.data;
  const label = filters.year ? (filters.month ? `${monthName(filters.month)} ${filters.year}` : String(filters.year)) : "all years";
  const scope = filters.year ? (filters.month ? monthBounds(filters.year, filters.month) : yearBounds(filters.year)) : null;
  const all = data?.events ?? [];
  const scoped = scope ? eventsInPeriod(all, scope.from, scope.to) : all;
  const listed = scoped.filter((event) => !filters.hideBrief || !event.brief).sort(SORTS[filters.sort].compare);
  const maxPeak = Math.max(COLWICK_HISTORY.thresholdMetres + 0.5, ...all.map((event) => event.peak.value));
  const maxAboveMs = Math.max(1, ...all.map((event) => event.aboveMs));
  const highest = [...scoped].sort(SORTS.peak.compare)[0];
  const longest = [...scoped].sort(SORTS.duration.compare)[0];
  const years = [];
  for (let y = current.year; y >= COLWICK_HISTORY.firstYear; y--) years.push(y);
  const timelineFrom = yearBounds(COLWICK_HISTORY.firstYear).from;
  const timelineTo = data ? Math.max(Date.parse(data.dataEnd), timelineFrom + 1) : timelineFrom + 1;

  return (
    <main className="history-page text-white">
      <Container className="py-4 py-lg-5">
        <header className="mb-4">
          <Link href="/history" className="history-back">← River level history</Link>
          <h1 className="display-6 fw-bold mt-3 mb-2">High-water events</h1>
          <p className="lead history-intro mb-0">Past periods when the observed river level at Colwick was at or above {threshold}, HPP&apos;s level rule: when the river rose, how high it got and how long it stayed up.</p>
        </header>

        <NotClosuresNote />

        {index.error ? <ErrorNotice error={index.error} what="high-water events" /> : null}
        {!index.error && !data ? <LoadingBlock label="Finding high-water events in Colwick history…" slow={slow} /> : null}

        {data ? (
          <>
            <section className="history-panel" aria-labelledby="events-timeline">
              <h2 id="events-timeline" className="h5 mb-1">Every event since {COLWICK_HISTORY.firstYear}</h2>
              <p className="history-muted small mb-2">Each stem rises from {threshold} to the event&apos;s highest observed reading; the bar along the base spans its first to last reading at or above {threshold}. Hollow, dashed stems are events whose start, end or middle was not fully observed.</p>
              <EventTimeline events={all} from={timelineFrom} to={timelineTo}
                selected={scope ? [scope.from, scope.to] : null}
                onSelect={(id) => router.push(`/history/events/${id}`)} />
              {data.monthsFailed.length ? (
                <p className="history-notice history-notice--warning mt-2 mb-0">{data.monthsFailed.length} month{data.monthsFailed.length === 1 ? "" : "s"} could not be read yet ({data.monthsFailed.slice(0, 6).map((item) => `${shortMonthName(item.month)} ${item.year}`).join(", ")}{data.monthsFailed.length > 6 ? ", …" : ""}). Events next to them are marked as not fully observed rather than joined across; try again shortly.</p>
              ) : null}
            </section>

            {!filters.year ? <Spotlight events={all} /> : null}

            <div className="history-sticky">
              <div className="events-filters" role="group" aria-label="Filter events">
                <Form.Select aria-label="Year" className="history-picker__year" value={filters.year ?? ""}
                  onChange={(event) => setFilters({ year: event.target.value ? Number(event.target.value) : null, month: null })}>
                  <option value="">All years</option>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </Form.Select>
                <Form.Select aria-label="Sort events" className="history-picker__year" value={filters.sort}
                  onChange={(event) => setFilters({ sort: event.target.value })}>
                  {Object.entries(SORTS).map(([key, sort]) => <option key={key} value={key}>{sort.label}</option>)}
                </Form.Select>
                <Form.Check type="switch" id="events-hide-brief" className="events-filters__switch" checked={filters.hideBrief}
                  label={`Hide brief (under ${formatDuration(data.rule.briefMs)})`} onChange={(event) => setFilters({ hideBrief: event.target.checked })} />
              </div>
              {filters.year ? (
                <div className="history-picker__months mt-2">
                  <button type="button" className={`history-chip${filters.month ? "" : " is-active"}`} aria-pressed={!filters.month} onClick={() => setFilters({ month: null })}>Whole year</button>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <button key={m} type="button" className={`history-chip${filters.month === m ? " is-active" : ""}`} aria-pressed={filters.month === m}
                      disabled={filters.year === current.year && m > current.month} onClick={() => setFilters({ month: m })} aria-label={`${monthName(m)} ${filters.year}`}>
                      {shortMonthName(m)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <section className="history-panel" aria-labelledby="events-list" aria-live="polite">
              <h2 id="events-list" className="h4 mb-3">{scoped.length} event{scoped.length === 1 ? "" : "s"} in {label}</h2>
              {scoped.length ? (
                <div className="history-tiles">
                  <Tile value={String(scoped.length)} label="Events" detail={`${scoped.filter((event) => event.complete).length} fully observed`} />
                  <Tile value={formatLevel(highest.peak.value)} label="Highest observed peak" detail={formatDate(highest.peak.at)} />
                  <Tile value={formatDuration(longest.aboveMs)} label="Longest at or above" detail={eventDateRange(longest)} />
                  <Tile value={formatDuration(scoped.reduce((sum, event) => sum + event.aboveMs, 0))} label={`Total time at or above ${threshold}`}
                    detail={scope ? "Includes time outside this period for events crossing its edges" : "Supported observed time"} />
                </div>
              ) : (
                <div className="history-empty">
                  <p className="mb-0">No high-water events were identified in the observations available for {label}. If no readings have been imported for this period, the <Link href={filters.year ? `/history?year=${filters.year}${filters.month ? `&month=${filters.month}` : ""}` : "/history"} className="history-back">history explorer</Link> says so; that is not evidence the river was low.</p>
                </div>
              )}
              {listed.length < scoped.length ? <p className="history-muted small">{scoped.length - listed.length} brief event{scoped.length - listed.length === 1 ? "" : "s"} hidden.</p> : null}
              <EventList events={listed} maxPeak={maxPeak} maxAboveMs={maxAboveMs} periodLabel={label} />
              {filters.year ? (
                <p className="mt-3 mb-0"><Link href={`/history?year=${filters.year}${filters.month ? `&month=${filters.month}` : ""}`} className="history-back">See all readings for {label} in the history explorer →</Link></p>
              ) : null}
            </section>

            <section className="history-panel" aria-labelledby="events-method">
              <h2 id="events-method" className="h5">How events are identified</h2>
              <ul className="events-method mb-2">
                <li>An event is a period of Colwick readings at or above {threshold}. Readings at or above {threshold} less than {formatDuration(data.rule.mergeWindowMs)} apart belong to the same event; shorter dips below {threshold} and any missing readings in between are listed on the event page.</li>
                <li>A rise or fall counts as <strong>observed</strong> only when readings on either side of {threshold} are at most 30 minutes apart. Otherwise the event page says the start or end was not observed and shows the evidence that is available. No times or levels are interpolated.</li>
                <li>Time at or above {threshold} uses the same rule as the history explorer: supported observed time only, never time without readings.</li>
                <li>Events are recalculated from the River Data Platform&apos;s current history every time, so provider corrections can change their boundaries, peaks and order.</li>
              </ul>
              <p className="history-muted small mb-0">
                Readings available {data.firstReadingAt ? formatDate(data.firstReadingAt) : "—"} to {data.lastReadingAt ? formatDate(data.lastReadingAt) : "—"}; months with no imported readings are gaps, not low water. {COVERAGE_TEXT[data.coverage] ?? COVERAGE_TEXT.unknown}
              </p>
            </section>
          </>
        ) : null}
      </Container>
    </main>
  );
}
