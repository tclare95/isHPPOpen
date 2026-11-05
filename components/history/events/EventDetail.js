"use client";

import { useState } from "react";
import Link from "next/link";
import PropTypes from "prop-types";
import Container from "react-bootstrap/Container";
import useFetch from "../../../libs/useFetch";
import { COLWICK_HISTORY } from "../../../libs/history/config";
import {
  describeEnd, describePeak, describeStart, eventDateRange, eventDurationText, gapReasonText, LIMITATION_TEXT,
} from "../../../libs/history/eventPresent";
import { parseEventId } from "../../../libs/history/events";
import { formatDate, formatDateTime, formatDuration, formatLevel } from "../../../libs/history/present";
import { londonParts } from "../../../libs/history/ukCalendar";
import LevelChart from "../LevelChart";
import { ErrorNotice, HISTORY_SWR, LoadingBlock, useSlow } from "../StatusBlocks";

const threshold = `${COLWICK_HISTORY.thresholdMetres.toFixed(1)} m`;
const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] ?? "th"}`;

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

function Step({ tone, title, when, children }) {
  return (
    <li className={`events-story__step events-story__step--${tone}`}>
      <span className="events-story__dot" aria-hidden="true" />
      <div>
        <div className="events-story__title">{title}{when ? <span className="events-story__when"> · {when}</span> : null}</div>
        <div className="events-story__text">{children}</div>
      </div>
    </li>
  );
}

Step.propTypes = { tone: PropTypes.string.isRequired, title: PropTypes.string.isRequired, when: PropTypes.string, children: PropTypes.node };

function Neighbour({ item, direction }) {
  if (!item) return <span />;
  return (
    <Link href={`/history/events/${item.id}`} className={`events-nav__link events-nav__link--${direction}`}>
      <span className="history-muted small">{direction === "previous" ? "← Previous event" : "Next event →"}</span>
      <span>{formatDate(item.firstAboveAt)} · peak {formatLevel(item.peak)}</span>
    </Link>
  );
}

Neighbour.propTypes = { item: PropTypes.object, direction: PropTypes.oneOf(["previous", "next"]).isRequired };

export default function EventDetail({ id }) {
  const { data, error, isPending } = useFetch(`/api/history/colwick/events/${encodeURIComponent(id)}`, HISTORY_SWR);
  const slow = useSlow(isPending);
  const [zoom, setZoom] = useState(null);

  if (error || !data) {
    const notFound = error?.payload?.error?.details?.reason === "not_found";
    return (
      <main className="history-page text-white">
        <Container className="py-4 py-lg-5">
          <Link href="/history/events" className="history-back">← All high-water events</Link>
          <h1 className="display-6 fw-bold mt-3 mb-4">High-water event</h1>
          {notFound ? (
            <div className="history-empty">
              <h2 className="h5">Event not found</h2>
              <p className="mb-0"><Link href="/history/events" className="history-back">Browse all events</Link></p>
            </div>
          ) : error ? <ErrorNotice error={error} what="high-water event" /> : <LoadingBlock label="Loading event readings…" slow={slow} />}
        </Container>
      </main>
    );
  }

  const { event, rank, window: view } = data;
  const from = Date.parse(view.from);
  const to = Date.parse(view.to);
  const firstAbove = Date.parse(event.firstAboveAt);
  const lastAbove = Date.parse(event.lastAboveAt);
  const start = describeStart(event.start);
  const end = describeEnd(event.end);
  const startParts = londonParts(firstAbove);
  const r = event.readings;

  return (
    <main className="history-page text-white">
      <Container className="py-4 py-lg-5">
        <header className="mb-4">
          <Link href={`/history/events?year=${startParts.year}`} className="history-back">← High-water events in {startParts.year}</Link>
          <p className="history-eyebrow mt-3 mb-1">Observed high-water event · Colwick</p>
          <h1 className="display-6 fw-bold mb-2">{eventDateRange(event)}</h1>
          <p className="lead history-intro mb-0">
            Peaked at {formatLevel(event.peak.value)} on {formatDate(event.peak.at)}; at or above {threshold} for {eventDurationText(event)}.
          </p>
          {event.limitations.length ? (
            <p className="events-row__badges mt-2 mb-0">{event.limitations.map((item) => <span key={item} className="events-badge events-badge--warning">{LIMITATION_TEXT[item]}</span>)}</p>
          ) : <p className="events-row__badges mt-2 mb-0"><span className="events-badge events-badge--ok">Fully observed</span></p>}
        </header>

        {data.match === "moved" ? (
          <p className="history-notice history-notice--warning">This event now starts at {formatDateTime(event.firstAboveAt)} (link: {formatDateTime(parseEventId(id))}).</p>
        ) : null}

        <section className="history-panel" aria-labelledby="event-chart">
          <h2 id="event-chart" className="visually-hidden">Readings around this event</h2>
          <div className="history-tiles">
            <Tile value={formatLevel(event.peak.value)} label={event.peak.complete ? "Peak" : "Highest observed"}
              detail={<>{formatDateTime(event.peak.at)}<br />{rank.byPeak === 1 ? "Highest" : `${ordinal(rank.byPeak)} highest`} of {rank.of} events identified</>} />
            <Tile value={formatDuration(event.aboveMs)} label={`At or above ${threshold}`}
              detail={`${rank.byDuration === 1 ? "Longest" : `${ordinal(rank.byDuration)} longest`} of ${rank.of}`} />
            <Tile value={formatDuration(event.riseMs)} label="Rise to peak" />
            <Tile value={event.end.ongoing ? "—" : formatDuration(event.fallMs)} label="Peak to recovery" detail={event.end.ongoing ? "No end yet" : undefined} />
          </div>
          <LevelChart mode="month" from={from} to={to} end={to} readings={data.readings} zoom={zoom} onZoomChange={setZoom}
            highlights={[{ from: firstAbove, to: lastAbove, className: "events-chart__span" }]}
            markers={[{ t: Date.parse(event.peak.at), v: event.peak.value, label: `${event.peak.complete ? "Peak" : "Highest observed"} ${formatLevel(event.peak.value)}` }]}
            title={`Colwick level around this event (15-minute readings, ${COLWICK_HISTORY.unit})`} />
          <ul className="history-legend" aria-label="Chart key">
            <li><span className="history-legend__line" aria-hidden="true" />Observed level</li>
            {r.provisional ? <li><span className="history-legend__line history-legend__line--provisional" aria-hidden="true" />Provisional</li> : null}
            <li><span className="history-legend__swatch events-legend__span" aria-hidden="true" />First to last reading at or above {threshold}</li>
            <li><span className="history-legend__line history-legend__line--threshold" aria-hidden="true" />{threshold} HPP level rule</li>
            <li><span className="history-legend__swatch history-legend__swatch--gap" aria-hidden="true" />No supported readings</li>
          </ul>
          {view.trimmed ? <p className="history-muted small mb-0">Only the first part of this event is charted.</p> : null}
          {view.monthsFailed.length ? <p className="history-notice history-notice--warning mt-2 mb-0">Some months around this event could not be read.</p> : null}
        </section>

        <div className="events-columns">
          <section className="history-panel" aria-labelledby="event-story">
            <h2 id="event-story" className="h5">Timeline</h2>
            <ol className="events-story">
              <Step tone={start.tone} title={start.title}>{start.text}</Step>
              <Step tone={event.peak.complete ? "observed" : "gap"} title={event.peak.complete ? "Peak" : "Highest observed reading"} when={formatDateTime(event.peak.at)}>
                {formatLevel(event.peak.value)}{event.peak.provisional ? " (provisional)" : ""}{describePeak(event) ? `. ${describePeak(event)}` : ""}
              </Step>
              <Step tone={end.tone} title={end.title}>{end.text}</Step>
            </ol>
          </section>

          <section className="history-panel" aria-labelledby="event-within">
            <h2 id="event-within" className="h5">During the event</h2>
            {!event.dips.length && !event.gaps.length ? (
              <p className="mb-0">Stayed at or above {threshold} throughout.</p>
            ) : (
              <ul className="events-within">
                {event.dips.map((dip) => (
                  <li key={dip.from}><span className="events-badge">Below {threshold}</span> {formatDuration(dip.ms)} from {formatDateTime(dip.from)}</li>
                ))}
                {event.gaps.map((gap) => (
                  <li key={gap.from}><span className="events-badge events-badge--warning">No readings</span> {formatDuration(gap.ms)} from {formatDateTime(gap.from)} ({gapReasonText(gap.reason)})</li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <nav className="events-nav" aria-label="Other events">
          <Neighbour item={data.previous} direction="previous" />
          <Link href={`/history?year=${startParts.year}&month=${startParts.month}`} className="events-nav__center history-back">View month</Link>
          <Neighbour item={data.next} direction="next" />
        </nav>

        <p className="history-muted small mb-0">
          EA Colwick (station {COLWICK_HISTORY.providerStationId}), {COLWICK_HISTORY.unit} · {r.total.toLocaleString("en-GB")} readings
          {r.edited ? ` · ${r.edited.toLocaleString("en-GB")} provider-edited` : ""}{r.provisional ? ` · ${r.provisional.toLocaleString("en-GB")} provisional` : ""}{r.excluded ? ` · ${r.excluded.toLocaleString("en-GB")} excluded` : ""}
        </p>
      </Container>
    </main>
  );
}

EventDetail.propTypes = { id: PropTypes.string.isRequired };
