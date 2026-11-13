import { useId, useMemo, useState } from 'react';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Form from 'react-bootstrap/Form';
import PropTypes from 'prop-types';
import useFetch from '../../libs/useFetch';

// Recorded upstream spills from RDP's canonical event history (#121). Purely descriptive: it never changes
// the indicator, density chart or alerts, and an empty list is only described as far as coverage allows.

export const HISTORY_WINDOWS = [{ key: '24h', label: '24 hours' }, { key: '7d', label: '7 days' }, { key: '30d', label: '30 days' }];
const FETCH_OPTIONS = { revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false, refreshInterval: 15 * 60 * 1000 };
const DETAIL_OPTIONS = { revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false };

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function formatTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? DATE_FORMAT.format(date) : 'Not available';
}

export function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) return 'Not available';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  return [days ? `${days} d` : null, hours ? `${hours} hr` : null, `${mins} min`].filter(Boolean).slice(0, 2).join(' ');
}

const LIFECYCLE = {
  ongoing: { label: 'Ongoing', bg: 'danger', text: undefined },
  completed: { label: 'Completed', bg: 'secondary', text: undefined },
  end_not_reported: { label: 'End not reported', bg: 'warning', text: 'dark' },
  unresolved: { label: 'Unresolved', bg: 'warning', text: 'dark' },
};

function Time({ value }) {
  return value ? <time dateTime={value}>{formatTime(value)}</time> : 'Not available';
}
Time.propTypes = { value: PropTypes.string };

function endText(event) {
  if (event.display === 'completed') return <Time value={event.endedAt} />;
  if (event.display === 'ongoing') return 'No end reported yet: still ongoing';
  return event.endNoLaterThan
    ? <>Not reported by the provider; ended no later than <Time value={event.endNoLaterThan} /></>
    : 'Not reported by the provider';
}

function durationText(event) {
  if (event.display === 'completed') return formatMinutes(event.durationMinutes);
  if (event.display === 'ongoing') return `${formatMinutes(event.elapsedMinutes)} so far`;
  return Number.isFinite(event.maxDurationMinutes) ? `Uncertain; at most ${formatMinutes(event.maxDurationMinutes)}` : 'Uncertain';
}

function outfallName(outfall, id) {
  return outfall?.receivingWatercourse ? `${outfall.receivingWatercourse} (${id})` : `Outfall ${id}`;
}

function EventBadges({ event }) {
  const lifecycle = LIFECYCLE[event.display] ?? LIFECYCLE.unresolved;
  return (
    <span className="d-inline-flex flex-wrap gap-1">
      <Badge bg={lifecycle.bg} text={lifecycle.text}>{lifecycle.label}</Badge>
      {event.corrected ? <Badge bg="info" text="dark">Corrected</Badge> : null}
      {event.underReview ? <Badge bg="warning" text="dark">Under review</Badge> : null}
      {event.startedBeforeWindow ? <Badge bg="dark" className="border">Started before this period</Badge> : null}
    </span>
  );
}
EventBadges.propTypes = { event: PropTypes.object.isRequired };

function intervalText(interval) {
  if (!interval) return 'None';
  const end = interval.endedAt ? formatTime(interval.endedAt)
    : interval.status === 'ongoing' ? 'ongoing' : interval.endNoLaterThan ? `end not reported (no later than ${formatTime(interval.endNoLaterThan)})` : 'end not reported';
  return `${formatTime(interval.startedAt)} → ${end}`;
}

function RevisionHistory({ revisions, truncated }) {
  if (!revisions.length) return <p className="small mb-0">No revision records were returned.</p>;
  return (
    <>
      <ol className="cso-revisions small mb-1">
        {revisions.map((row) => (
          <li key={row.revision}>
            <strong>Revision {row.revision}: {row.changeLabel}</strong>{row.correction ? <Badge bg="info" text="dark" className="ms-1">Correction</Badge> : null}{row.reconciliation === 'operator_resolved' ? ' (after manual review)' : ''}
            <br />Recorded <Time value={row.recordedAt} />; provider data fetched <Time value={row.sourceFetchedAt} />
            {row.previous && row.changed.length ? <><br /><span className="water-quality-muted">Before:</span> {intervalText(row.previous)}</> : null}
            <br /><span className="water-quality-muted">{row.previous ? 'After:' : 'Recorded as:'}</span> {intervalText(row.current)}
          </li>
        ))}
      </ol>
      {truncated ? <p className="small mb-0">Older revisions exist but are not shown.</p> : null}
    </>
  );
}
RevisionHistory.propTypes = { revisions: PropTypes.array.isRequired, truncated: PropTypes.bool };

function EventDetail({ event, outfall, onShowOnMap }) {
  const { data, error, isPending } = useFetch(`/api/waterquality/cso/events/${event.eventId}`, DETAIL_OPTIONS);
  const detail = data?.event ? data : null;
  const shown = detail?.event ?? event;
  const place = detail?.outfall ?? outfall;
  return (
    <div className="cso-event-detail mt-2">
      <dl className="row small mb-2">
        <dt className="col-sm-4">Outfall</dt><dd className="col-sm-8">{place?.name || `Outfall ${event.outfallId}`} <span className="water-quality-muted">({event.assetId})</span></dd>
        <dt className="col-sm-4">Receiving water</dt><dd className="col-sm-8">{place?.receivingWatercourse || 'Not reported'}</dd>
        <dt className="col-sm-4">Reported start</dt><dd className="col-sm-8"><Time value={shown.startedAt} /></dd>
        <dt className="col-sm-4">Reported end</dt><dd className="col-sm-8">{endText(shown)}</dd>
        <dt className="col-sm-4">Duration</dt><dd className="col-sm-8">{durationText(shown)}</dd>
        <dt className="col-sm-4">Current state</dt><dd className="col-sm-8"><EventBadges event={shown} /></dd>
        <dt className="col-sm-4">Source</dt>
        <dd className="col-sm-8">
          {place?.providerLabel || 'Water company'} storm overflow data via River Data Platform
          {detail ? <>; {detail.attribution.method === 'historical_import' ? 'imported from official historical returns' : 'reconstructed from live provider status checks'}</> : null}
        </dd>
      </dl>
      {isPending ? <p className="small mb-0" role="status">Loading revision history…</p> : null}
      {error ? <p className="small mb-0" role="status">Revision history is unavailable right now. The times above are the latest recorded version.</p> : null}
      {detail ? (
        <>
          <h4 className="h6 mb-1">Revision history</h4>
          <RevisionHistory revisions={detail.revisions} truncated={detail.revisionsTruncated} />
          {detail.openHolds.length ? <p className="small mt-1 mb-0">{detail.openHolds.length} conflicting provider report{detail.openHolds.length === 1 ? ' is' : 's are'} awaiting review; times may change.</p> : null}
        </>
      ) : null}
      {onShowOnMap && outfall?.coordinates ? <Button size="sm" variant="outline-info" className="mt-2" onClick={() => onShowOnMap(event.outfallId)}>Show outfall on map</Button> : null}
    </div>
  );
}
EventDetail.propTypes = { event: PropTypes.object.isRequired, outfall: PropTypes.object, onShowOnMap: PropTypes.func };

// One plain-language statement of what the list can and cannot support.
export function evidenceMessages(history) {
  const { evidence, window } = history;
  const counts = evidence.outfalls;
  const messages = [];
  const period = HISTORY_WINDOWS.find((option) => option.key === window.key)?.label ?? window.key;
  if (evidence.conclusion === 'not_monitored') {
    messages.push({ tone: 'warning', text: 'None of the upstream outfalls are monitored for event history yet, so no spill history can be shown.' });
    return messages;
  }
  if (evidence.conclusion === 'no_reported_events') {
    messages.push({ tone: 'info', text: `No reported events in the available data for the last ${period}. Water company reporting is not independently verified, so this is not proof that no spills occurred.` });
  }
  if (evidence.conclusion === 'coverage_incomplete') {
    messages.push({ tone: 'warning', text: `No events were found, but monitoring coverage is incomplete, so spills may have gone unrecorded.` });
  }
  if (evidence.conclusion !== 'unavailable' && evidence.coverage.gapCount > 0) {
    messages.push({ tone: 'warning', text: `Monitoring coverage is incomplete: about ${Math.round(evidence.coverage.collectedFraction * 100)}% of this period was collected (${evidence.coverage.gapCount} gap${evidence.coverage.gapCount === 1 ? '' : 's'}).` });
  }
  if (window.key === '30d' && evidence.conclusion !== 'unavailable' && !evidence.coverage.sufficient) {
    messages.push({ tone: 'warning', text: 'Event monitoring does not yet cover enough of the last 30 days for a full 30-day history. The list shows what was recorded.' });
  }
  if (counts.failed > 0) messages.push({ tone: 'warning', text: `History could not be loaded for ${counts.failed} outfall${counts.failed === 1 ? '' : 's'}; their events are missing from this list.` });
  if (evidence.truncated) messages.push({ tone: 'warning', text: 'Some outfalls had more events than can be shown here; the oldest events in this period are missing.' });
  const unmonitored = counts.notMonitored + counts.unmapped + counts.notRead;
  if (unmonitored > 0) messages.push({ tone: 'secondary', text: `${counts.read} of ${counts.members} upstream outfalls have event history; the other ${unmonitored} ${unmonitored === 1 ? 'is' : 'are'} not monitored for events yet.` });
  return messages;
}

export default function CsoEventHistory({ selectedOutfallId = '', onSelectOutfall, onShowOnMap }) {
  const [windowKey, setWindowKey] = useState('24h');
  const [openEventId, setOpenEventId] = useState(null);
  const filterId = useId();
  const { data, error, isPending } = useFetch(`/api/waterquality/cso/events?window=${windowKey}`, FETCH_OPTIONS);
  const outfalls = useMemo(() => new Map((data?.outfalls ?? []).map((outfall) => [outfall.id, outfall])), [data]);
  const readable = useMemo(() => (data?.outfalls ?? []).filter((outfall) => outfall.state === 'read'), [data]);

  if (data && data.enabled === false) return null;

  const filter = outfalls.get(selectedOutfallId)?.state === 'read' ? selectedOutfallId : '';
  const events = (data?.events ?? []).filter((event) => !filter || event.outfallId === filter);
  const available = data?.state === 'available';

  return (
    <section className="water-quality-panel mb-4" aria-labelledby="cso-history-heading" id="cso-history">
      <h2 id="cso-history-heading">Recent upstream spills</h2>
      <p className="water-quality-muted">Recorded storm overflow events at monitored upstream outfalls, newest first. This history does not change the indication above.</p>
      <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
        <ButtonGroup size="sm" aria-label="Spill history period">
          {HISTORY_WINDOWS.map((option) => (
            <Button key={option.key} variant={windowKey === option.key ? 'info' : 'outline-light'} aria-pressed={windowKey === option.key}
              onClick={() => { setWindowKey(option.key); setOpenEventId(null); }}>{option.label}</Button>
          ))}
        </ButtonGroup>
        {readable.length > 1 ? (
          <Form.Group controlId={filterId} className="cso-history-filter">
            <Form.Label className="small mb-1">Outfall</Form.Label>
            <Form.Select size="sm" value={filter} onChange={(e) => onSelectOutfall?.(e.target.value)}>
              <option value="">All monitored outfalls</option>
              {readable.map((outfall) => <option key={outfall.id} value={outfall.id}>{outfallName(outfall, outfall.id)}</option>)}
            </Form.Select>
          </Form.Group>
        ) : null}
      </div>

      {isPending && !data ? <p role="status">Loading spill history…</p> : null}
      {error || (data && !available) ? <div className="alert alert-secondary" role="status">Spill history is temporarily unavailable. The rest of this page is not affected.</div> : null}

      {available ? (
        <>
          <div role="status" aria-live="polite">
            {evidenceMessages(data).map((message) => <div key={message.text} className={`alert alert-${message.tone} py-2 mb-2`}>{message.text}</div>)}
          </div>
          {filter && !events.length && data.events.length ? <p>No reported events for this outfall in the available data.</p> : null}
          {events.length ? (
            <ol className="cso-event-list list-unstyled mb-0" aria-label={`Recorded spills, ${events.length} shown`}>
              {events.map((event) => {
                const outfall = outfalls.get(event.outfallId);
                const open = openEventId === event.eventId;
                const panelId = `cso-event-${event.eventId}`;
                return (
                  <li key={event.eventId} className={`cso-event cso-event--${event.display}`}>
                    <button type="button" className="cso-event__summary" aria-expanded={open} aria-controls={panelId}
                      onClick={() => setOpenEventId(open ? null : event.eventId)}>
                      <span className="cso-event__place">{outfallName(outfall, event.outfallId)}</span>
                      <EventBadges event={event} />
                      <span className="cso-event__times small">
                        Started <Time value={event.startedAt} />
                        {event.display === 'completed' ? <> · ended <Time value={event.endedAt} /></> : null}
                        {' · '}{durationText(event)}
                        {event.revision > 1 ? <> · revision {event.revision}</> : null}
                      </span>
                    </button>
                    {open ? <div id={panelId}><EventDetail event={event} outfall={outfall} onShowOnMap={onShowOnMap} /></div> : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
          <p className="small water-quality-muted mt-3 mb-0">
            Source: {data.sources?.length ? data.sources.map((source) => source.attribution || source.providerLabel).join('; ') : 'water company storm overflow reports'}, collected by River Data Platform about every 15 minutes.
            {' '}Times are as reported by the provider; an end time is never estimated. Earlier versions of an event stay in its revision history.
          </p>
        </>
      ) : null}
    </section>
  );
}

CsoEventHistory.propTypes = {
  selectedOutfallId: PropTypes.string,
  onSelectOutfall: PropTypes.func,
  onShowOnMap: PropTypes.func,
};
