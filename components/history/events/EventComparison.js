"use client";

import Link from "next/link";
import PropTypes from "prop-types";
import { useRouter, useSearchParams } from "next/navigation";
import Container from "react-bootstrap/Container";
import Form from "react-bootstrap/Form";
import useFetch from "../../../libs/useFetch";
import { COLWICK_HISTORY } from "../../../libs/history/config";
import {
  ALIGN, ALIGN_TEXT, alignAnchor, compareHref, comparisonDifferences, comparisonRows, readCompareParams,
} from "../../../libs/history/eventCompare";
import { describeEnd, describeStart, eventDateRange, LIMITATION_TEXT } from "../../../libs/history/eventPresent";
import { parseEventId } from "../../../libs/history/events";
import { formatDateTime, formatLevel } from "../../../libs/history/present";
import { ErrorNotice, HISTORY_SWR, LoadingBlock, useSlow } from "../StatusBlocks";
import PageHeader from "../../layout/site/PageHeader";
import CompareChart from "./CompareChart";

const threshold = `${COLWICK_HISTORY.thresholdMetres.toFixed(1)} m`;
const SLOTS = [
  { key: "a", name: "First event", className: "events-compare--a" },
  { key: "b", name: "Second event", className: "events-compare--b" },
];

function Picker({ slot, value, events, onChange }) {
  const known = events.some((event) => event.id === value);
  return (
    <Form.Group className="events-compare__picker" controlId={`compare-${slot.key}`}>
      <Form.Label className="small mb-1"><span className={`events-compare__swatch ${slot.className}`} aria-hidden="true" /> {slot.name}</Form.Label>
      <Form.Select className="history-picker__year" value={known ? value : ""} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">Choose an event…</option>
        {events.map((event) => (
          <option key={event.id} value={event.id}>{eventDateRange(event)} · peak {formatLevel(event.peak.value)}{event.complete ? "" : " · not fully observed"}</option>
        ))}
      </Form.Select>
    </Form.Group>
  );
}

Picker.propTypes = { slot: PropTypes.object.isRequired, value: PropTypes.string, events: PropTypes.array.isRequired, onChange: PropTypes.func.isRequired };

function EventCard({ slot, data }) {
  const { event, rank } = data;
  const start = describeStart(event.start);
  const end = describeEnd(event.end);
  return (
    <div className={`events-compare__card ${slot.className}`}>
      <div className="history-muted small"><span className={`events-compare__swatch ${slot.className}`} aria-hidden="true" /> {slot.name}</div>
      <h2 className="h5 mb-1"><Link href={`/history/events/${event.id}`} className="events-compare__title">{eventDateRange(event)}</Link></h2>
      <div className="events-row__badges mb-2">
        {event.limitations.length
          ? event.limitations.map((item) => <span key={item} className="events-badge events-badge--warning">{LIMITATION_TEXT[item]}</span>)
          : <span className="events-badge events-badge--ok">Fully observed</span>}
        {event.brief ? <span className="events-badge">Brief</span> : null}
      </div>
      <ul className="events-compare__facts">
        <li><strong>{start.title}.</strong> {start.text}</li>
        <li><strong>{event.peak.complete ? "Peak" : "Highest observed"}</strong> {formatLevel(event.peak.value)} at {formatDateTime(event.peak.at)}{event.peak.provisional ? " (provisional)" : ""}.</li>
        <li><strong>{end.title}.</strong> {end.text}</li>
      </ul>
      <p className="history-muted small mb-0">
        {rank.byPeak} of {rank.of} by highest reading · {rank.byDuration} of {rank.of} by time at or above (events identified in current history)
      </p>
    </div>
  );
}

EventCard.propTypes = { slot: PropTypes.object.isRequired, data: PropTypes.object.isRequired };

// Why a selection cannot be compared, with a request to choose a replacement.
function SelectionNotice({ data, ids }) {
  if (data.sameEvent) {
    const event = data.events[0].event;
    return (
      <p className="history-notice history-notice--warning" role="alert">
        Both selections now resolve to the same event ({eventDateRange(event)}), because provider revisions moved or merged events.
        Choose a different event for one of them.
      </p>
    );
  }
  return data.events.map((slot, index) => (slot.found ? null : (
    <p key={SLOTS[index].key} className="history-notice history-notice--warning" role="alert">
      The {SLOTS[index].name.toLowerCase()} (link: {formatDateTime(parseEventId(ids[index]))}) no longer matches any high-water event
      in the current history. Provider revisions can move or remove events. Choose a replacement.
    </p>
  )));
}

export default function EventComparison() {
  const params = useSearchParams();
  const router = useRouter();
  const selection = readCompareParams(params);
  const ids = [selection.a, selection.b];
  const distinct = Boolean(selection.a && selection.b && selection.a !== selection.b);
  const index = useFetch("/api/history/colwick/events", HISTORY_SWR);
  const compare = useFetch(distinct ? `/api/history/colwick/events/compare?a=${encodeURIComponent(selection.a)}&b=${encodeURIComponent(selection.b)}` : null, HISTORY_SWR);
  const slow = useSlow(distinct && compare.isPending);

  const go = (next) => {
    const merged = { ...selection, ...next };
    router.replace(compareHref(merged.a, merged.b, merged.align), { scroll: false });
  };

  const events = [...(index.data?.events ?? [])].sort((a, b) => Date.parse(b.firstAboveAt) - Date.parse(a.firstAboveAt));
  const data = compare.data;
  const ready = distinct && data?.ready;
  const moved = ready ? data.events.filter((slot) => slot.match === "moved") : [];
  const anchorLabel = ALIGN_TEXT[selection.align];

  return (
    <main className="history-page text-white">
      <Container className="py-4 py-lg-5">
        <p className="mb-2"><Link href="/history/events" className="history-back">← All high-water events</Link></p>
        <PageHeader title="Compare high-water events" lead={`Two observed Colwick high-water events side by side: their readings, highest levels and time at or above ${threshold}.`} />

        <section className="history-panel" aria-labelledby="compare-choose">
          <h2 id="compare-choose" className="visually-hidden">Choose events</h2>
          {index.error ? <ErrorNotice error={index.error} what="list of high-water events" /> : null}
          <div className="events-compare__pickers">
            {SLOTS.map((slot, i) => (
              <Picker key={slot.key} slot={slot} value={ids[i]} events={events} onChange={(id) => go({ [slot.key]: id })} />
            ))}
          </div>
          {selection.invalid.a || selection.invalid.b ? (
            <p className="history-notice history-notice--warning mt-3 mb-0" role="alert">
              {selection.invalid.a && selection.invalid.b ? "Neither event link is" : `The ${selection.invalid.a ? "first" : "second"} event link is not`} a valid event. Choose an event.
            </p>
          ) : null}
          {selection.a && selection.a === selection.b ? (
            <p className="history-notice history-notice--warning mt-3 mb-0" role="alert">Both selections are the same event. Choose a different event to compare with.</p>
          ) : null}
          {!distinct && !(selection.a && selection.a === selection.b) ? (
            <p className="history-muted small mt-3 mb-0">Choose two events. You can also start from any event&apos;s page.</p>
          ) : null}
        </section>

        {distinct && compare.error ? <ErrorNotice error={compare.error} what="event comparison" /> : null}
        {distinct && !compare.error && !data ? <LoadingBlock label="Loading both events' readings…" slow={slow} /> : null}
        {distinct && data && !data.ready ? <SelectionNotice data={data} ids={ids} /> : null}

        {ready ? (
          <>
            {moved.length ? (
              <div className="history-notice history-notice--warning mb-3">
                {moved.map((slot) => (
                  <p key={slot.requested} className="mb-1">
                    The link {formatDateTime(parseEventId(slot.requested))} now resolves to the event starting {formatDateTime(slot.event.firstAboveAt)}.
                  </p>
                ))}
                <Link href={compareHref(data.events[0].event.id, data.events[1].event.id, selection.align)} className="history-back">Update this comparison&apos;s link</Link>
              </div>
            ) : null}

            <div className="events-compare__cards">
              {data.events.map((slot, i) => <EventCard key={SLOTS[i].key} slot={SLOTS[i]} data={slot} />)}
            </div>

            <section className="history-panel" aria-labelledby="compare-chart">
              <h2 id="compare-chart" className="visually-hidden">Overlaid readings</h2>
              <div className="events-compare__align" role="group" aria-label="Align curves at">
                <span className="history-muted small">Align at</span>
                {[ALIGN.PEAK, ALIGN.START].map((align) => (
                  <button key={align} type="button" className={`history-chip${selection.align === align ? " is-active" : ""}`} aria-pressed={selection.align === align}
                    onClick={() => go({ align })}>{align === ALIGN.PEAK ? "Highest readings" : `First at or above ${threshold}`}</button>
                ))}
              </div>
              <CompareChart anchorLabel={anchorLabel}
                title={`Colwick level, time from each event's ${anchorLabel} (15-minute readings, ${COLWICK_HISTORY.unit})`}
                series={data.events.map((slot, i) => {
                  const anchor = alignAnchor(slot.event, selection.align);
                  return {
                    key: SLOTS[i].key, label: eventDateRange(slot.event), className: SLOTS[i].className, anchor,
                    window: { from: Date.parse(slot.window.from), to: Date.parse(slot.window.to) },
                    readings: slot.readings,
                    span: { from: Date.parse(slot.event.firstAboveAt) - anchor, to: Date.parse(slot.event.lastAboveAt) - anchor },
                    peak: { t: Date.parse(slot.event.peak.at) - anchor, v: slot.event.peak.value },
                  };
                })} />
              <ul className="history-legend" aria-label="Chart key">
                {data.events.map((slot, i) => (
                  <li key={SLOTS[i].key}><span className={`events-compare__legend-line ${SLOTS[i].className}`} aria-hidden="true" />{eventDateRange(slot.event)}</li>
                ))}
                {data.events.some((slot) => slot.event.readings.provisional) ? <li><span className="events-compare__legend-line events-compare__legend-line--provisional" aria-hidden="true" />Provisional (dashed)</li> : null}
                <li><span className="history-legend__line history-legend__line--threshold" aria-hidden="true" />{threshold} HPP level rule</li>
                <li><span className="events-compare__legend-bar" aria-hidden="true" />Lower bars: charted readings, solid from first to last at or above</li>
                <li><span className="history-legend__swatch history-legend__swatch--gap" aria-hidden="true" />No supported readings</li>
              </ul>
              <p className="history-muted small mb-0">
                Each curve is drawn against time from its own {anchorLabel}; hover or tap for each reading&apos;s actual date.
                This lines up the observed shapes only: it is not a travel time or a prediction.
              </p>
              {data.events.map((slot, i) => (slot.window.trimmed ? (
                <p key={`t${SLOTS[i].key}`} className="history-muted small mt-1 mb-0">Only the first part of the {SLOTS[i].name.toLowerCase()} is charted.</p>
              ) : null))}
              {data.events.some((slot) => slot.window.monthsFailed.length) || data.monthsFailed.length ? (
                <p className="history-notice history-notice--warning mt-2 mb-0">Some months around these events could not be read, so parts of the record may be missing.</p>
              ) : null}
            </section>

            <section className="history-panel" aria-labelledby="compare-table">
              <h2 id="compare-table" className="h5">Side by side</h2>
              <table className="events-compare__table">
                <thead>
                  <tr>
                    <th scope="col"><span className="visually-hidden">Measure</span></th>
                    {SLOTS.map((slot) => <th key={slot.key} scope="col"><span className={`events-compare__swatch ${slot.className}`} aria-hidden="true" /> {slot.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows(data.events[0].event, data.events[1].event).map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}{row.note ? <span className="history-muted small d-block fw-normal">{row.note}</span> : null}</th>
                      {row.values.map((value, i) => <td key={SLOTS[i].key}>{value}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3 className="h6 mt-3">What the readings support</h3>
              <ul className="events-within" aria-label="Differences">
                {comparisonDifferences(data.events[0].event, data.events[1].event).map((line) => <li key={line}>{line}</li>)}
              </ul>
            </section>

            <p className="history-muted small mb-0">
              EA Colwick (station {COLWICK_HISTORY.providerStationId}), {COLWICK_HISTORY.unit}. Events are recalculated from the current history,
              so corrections can move or re-rank them. River-level evidence only, not HPP closures or flood records.
            </p>
          </>
        ) : null}
      </Container>
    </main>
  );
}
