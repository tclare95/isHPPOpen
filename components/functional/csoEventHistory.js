import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Form from 'react-bootstrap/Form';
import Link from 'next/link';
import PropTypes from 'prop-types';
import { outfallDetailPath } from '../../libs/csoOutfallLinks';
import useFetch from '../../libs/useFetch';
import StatusMessage from '../layout/site/StatusMessage';

// Recorded upstream spills from RDP's canonical event history (#121). Purely descriptive: it never changes
// the indicator, density chart or alerts, and an empty list is only described as far as coverage allows.

// 48 hours by default: the window of the status cards and map, read from the same RDP summary.
export const HISTORY_WINDOWS = [{ key: '48h', label: '48 hours' }, { key: '7d', label: '7 days' }, { key: '30d', label: '30 days' }];
// The route is CDN-cached for 5 minutes; refreshing on focus means a tab left open during a spill catches up on return.
const FETCH_OPTIONS = { revalidateOnFocus: true, focusThrottleInterval: 60 * 1000, revalidateOnReconnect: false, shouldRetryOnError: false, refreshInterval: 5 * 60 * 1000 };
const DETAIL_OPTIONS = { revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false };
// An older page is one point in a traversal: refreshing it in the background could only turn it into a "list changed" notice.
const PAGE_OPTIONS = DETAIL_OPTIONS;

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

export function Time({ value }) {
  return value ? <time dateTime={value}>{formatTime(value)}</time> : 'Not available';
}
Time.propTypes = { value: PropTypes.string };

export function endText(event) {
  if (event.display === 'completed') return <Time value={event.endedAt} />;
  if (event.display === 'ongoing') return 'No end reported yet: still ongoing';
  return event.endNoLaterThan
    ? <>Not reported by the provider; ended no later than <Time value={event.endNoLaterThan} /></>
    : 'Not reported by the provider';
}

export function durationText(event) {
  if (event.display === 'completed') return formatMinutes(event.durationMinutes);
  if (event.display === 'ongoing') return `${formatMinutes(event.elapsedMinutes)} so far`;
  return Number.isFinite(event.maxDurationMinutes) ? `Uncertain; at most ${formatMinutes(event.maxDurationMinutes)}` : 'Uncertain';
}

function outfallName(outfall, id) {
  return outfall?.receivingWatercourse ? `${outfall.receivingWatercourse} (${id})` : `Outfall ${id}`;
}

export function EventBadges({ event }) {
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

export function EventDetail({ event, outfall, onShowOnMap, onShowRoute, showOutfallLink = true }) {
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
      <div className="d-flex flex-wrap gap-2 mt-2">
        {showOutfallLink && event.assetId ? <Link href={outfallDetailPath(event.assetId)} className="btn btn-sm btn-outline-light">Outfall details</Link> : null}
        {onShowOnMap && outfall?.coordinates ? <Button size="sm" variant="outline-info" onClick={() => onShowOnMap(event.outfallId)}>Show outfall on map</Button> : null}
        {onShowRoute && event.assetId ? <Button size="sm" variant="outline-info" onClick={() => onShowRoute(event.assetId)}>Show downstream route</Button> : null}
      </div>
    </div>
  );
}
EventDetail.propTypes = { event: PropTypes.object.isRequired, outfall: PropTypes.object, onShowOnMap: PropTypes.func, onShowRoute: PropTypes.func, showOutfallLink: PropTypes.bool };

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
  // RDP returns each outfall's events oldest first, so a read that stops at its budget is missing that outfall's latest events.
  if (evidence.truncated) {
    const truncated = (history.outfalls ?? []).filter((outfall) => outfall.truncated);
    const after = truncated.map((outfall) => outfall.readThrough).filter(Boolean).sort()[0];
    const who = truncated.length > 1 ? `${truncated.length} outfalls` : truncated.length ? 'One outfall' : 'Some outfalls';
    messages.push({ tone: 'warning', text: `${who} had more events in this period than can be read at once, so ${truncated.length === 1 ? 'its' : 'their'} most recent events${after ? ` (after ${formatTime(after)})` : ''} are missing from this list.` });
  }
  // Not read is not the same as not monitored: those outfalls may have events that this list does not include.
  if (counts.notRead > 0) {
    const policy = history.readPolicy;
    messages.push({ tone: 'warning', text: policy?.limit
      ? `History for this period was read for ${counts.members - counts.notRead} of ${counts.members} upstream outfalls${policy.prioritisedBy === 'events_last_7d' ? ', those with spills in the last 7 days first' : ''}. The other ${counts.notRead} were not read, so any events they had are missing from this list.`
      : `History was not read for ${counts.notRead} upstream outfall${counts.notRead === 1 ? '' : 's'}; any events they had are missing from this list.` });
  }
  const unmonitored = counts.notMonitored + counts.unmapped;
  if (unmonitored > 0) messages.push({ tone: 'secondary', text: `${counts.read} of ${counts.members} upstream outfalls have event history; the other ${unmonitored} ${unmonitored === 1 ? 'is' : 'are'} not monitored for events yet.` });
  return messages;
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// Where this page sits in the list, and whether the list ends here because history ended or because of a limitation.
export function pageSummary(page) {
  if (!page || !page.returned) return null;
  const range = `Events ${page.offset + 1}–${page.offset + page.returned} of ${page.total}${page.totalIsLowerBound ? ' or more' : ''}`;
  let end = null;
  if (!page.hasOlder) {
    end = page.totalIsLowerBound
      ? 'End of the events that could be read for this period. Some outfall history was not fully read (see the notes above), so other events may exist.'
      : 'End of the recorded events for this period.';
  }
  return { range, end };
}

const HISTORY_ERRORS = {
  409: "The recorded events changed while you were browsing (for example, a spill's times were corrected or a late report arrived), so this page cannot continue without risking repeated or skipped events.",
  410: 'This list was opened a while ago and has expired.',
};

function PageNavigation({ page, canGoNewer, onNewer, onOlder, onNewest }) {
  const summary = pageSummary(page);
  return (
    <nav className="cso-history-pager mt-3" aria-label="Spill history pages">
      {summary ? <p className="small mb-2">{summary.range}{summary.end ? <><br />{summary.end}</> : null}</p> : null}
      {page?.newerSinceStart > 0 ? <p className="small mb-2">{plural(page.newerSinceStart, 'newer event')} {page.newerSinceStart === 1 ? 'has' : 'have'} been recorded since you started browsing.</p> : null}
      {canGoNewer || page?.hasOlder ? (
        <div className="d-flex flex-wrap gap-2">
          {canGoNewer ? <Button size="sm" variant="outline-light" onClick={onNewest}>Newest events</Button> : null}
          {canGoNewer ? <Button size="sm" variant="outline-light" onClick={onNewer}>Newer events</Button> : null}
          {page?.hasOlder ? <Button size="sm" variant="outline-info" onClick={onOlder}>Older events</Button> : null}
        </div>
      ) : null}
    </nav>
  );
}
PageNavigation.propTypes = { page: PropTypes.object, canGoNewer: PropTypes.bool, onNewer: PropTypes.func, onOlder: PropTypes.func, onNewest: PropTypes.func };

function historyPath(windowKey, outfall, cursor) {
  return `/api/waterquality/cso/events?window=${windowKey}${outfall ? `&outfall=${encodeURIComponent(outfall)}` : ''}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
}

export default function CsoEventHistory({ selectedOutfallId = '', onSelectOutfall, onShowOnMap, onShowRoute }) {
  const [windowKey, setWindowKey] = useState(HISTORY_WINDOWS[0].key);
  const [openEventId, setOpenEventId] = useState(null);
  // The cursors of the pages visited, for one query. A changed period or outfall starts again at the newest events.
  const [trail, setTrail] = useState({ query: null, cursors: [] });
  const listRef = useRef(null);
  const moved = useRef(false);
  const filterId = useId();
  const { data, error, isPending } = useFetch(historyPath(windowKey), FETCH_OPTIONS);
  const outfalls = useMemo(() => new Map((data?.outfalls ?? []).map((outfall) => [outfall.id, outfall])), [data]);
  const readable = useMemo(() => (data?.outfalls ?? []).filter((outfall) => outfall.state === 'read'), [data]);
  const filter = outfalls.get(selectedOutfallId)?.state === 'read' ? selectedOutfallId : '';
  const query = `${windowKey}|${filter}`;
  const cursors = trail.query === query ? trail.cursors : [];
  const cursor = cursors.at(-1) ?? null;
  // One outfall's events, and every older page, are paged server-side from the same bounded reads (#114 larger membership).
  const { data: pageData, error: pageError, mutate: retryPage } = useFetch(filter || cursor ? historyPath(windowKey, filter, cursor) : null, cursor ? PAGE_OPTIONS : FETCH_OPTIONS);
  // After a page change, move focus to the new list so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (moved.current && (pageData || data)) { moved.current = false; listRef.current?.focus(); }
  }, [pageData, data, cursor]);
  // A large membership lists only outfalls with events (plus the selected one); the rest are summarised in the messages.
  const options = useMemo(() => readable.filter((outfall) => !Number.isFinite(outfall.eventCount) || outfall.eventCount > 0 || outfall.id === filter),
    [readable, filter]);

  if (data && data.enabled === false) return null;

  const paged = Boolean(filter || cursor);
  const shown = paged ? pageData : data;
  const events = (shown?.events ?? []).filter((event) => !filter || event.outfallId === filter);
  const available = data?.state === 'available';
  const pageAvailable = !paged || pageData?.state === 'available';
  const go = (next) => { moved.current = true; setOpenEventId(null); setTrail({ query, cursors: next }); };
  const period = HISTORY_WINDOWS.find((option) => option.key === windowKey)?.label ?? windowKey;

  return (
    <section className="water-quality-panel mb-4" aria-labelledby="cso-history-heading" id="cso-history">
      <h2 id="cso-history-heading">Recent upstream spills</h2>
      <p className="water-quality-muted">Recorded storm overflow events at monitored upstream outfalls, newest first.</p>
      <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
        <ButtonGroup size="sm" aria-label="Spill history period">
          {HISTORY_WINDOWS.map((option) => (
            <Button key={option.key} variant={windowKey === option.key ? 'info' : 'outline-light'} aria-pressed={windowKey === option.key}
              onClick={() => { setWindowKey(option.key); setOpenEventId(null); }}>{option.label}</Button>
          ))}
        </ButtonGroup>
        {readable.length > 1 && options.length ? (
          <Form.Group controlId={filterId} className="cso-history-filter">
            <Form.Label className="small mb-1">Outfall</Form.Label>
            <Form.Select size="sm" value={filter} onChange={(e) => onSelectOutfall?.(e.target.value)}>
              <option value="">All monitored outfalls</option>
              {options.map((outfall) => <option key={outfall.id} value={outfall.id}>{outfallName(outfall, outfall.id)}{Number.isFinite(outfall.eventCount) ? ` (${outfall.eventCount})` : ''}</option>)}
            </Form.Select>
          </Form.Group>
        ) : null}
        {filter && outfalls.get(filter)?.assetId ? <Link href={outfallDetailPath(outfalls.get(filter).assetId)} className="btn btn-sm btn-outline-light">Outfall details</Link> : null}
      </div>

      {isPending && !data ? <StatusMessage state="loading" className="mb-2">Loading spill history…</StatusMessage> : null}
      {error || (data && !available) ? <StatusMessage state="unavailable">Spill history is temporarily unavailable. The rest of this page is not affected.</StatusMessage> : null}

      {available ? (
        <>
          <div role="status" aria-live="polite">
            {evidenceMessages(paged && pageData?.state === 'available' ? pageData : data).map((message) => <div key={message.text} className={`${message.tone === 'warning' ? 'history-notice history-notice--warning' : 'history-notice'} mb-2`}>{message.text}</div>)}
            {shown?.page?.windowMoved ? <div className="history-notice mb-2">The {period} period has moved on since you started browsing. It now begins <Time value={shown.window.from} />, so events that ended before then are no longer listed.</div> : null}
          </div>
          {paged && !pageData && !pageError ? <StatusMessage state="loading" className="mb-2">Loading events…</StatusMessage> : null}
          {paged && (pageError || (pageData && !pageAvailable)) ? (
            <div className="history-notice history-notice--warning mb-2" role="status">
              <p className="mb-2">{HISTORY_ERRORS[pageError?.status] ?? 'These events could not be loaded right now.'}</p>
              <div className="d-flex flex-wrap gap-2">
                {cursor ? <Button size="sm" variant="outline-light" onClick={() => go([])}>Back to the newest events</Button> : null}
                {!HISTORY_ERRORS[pageError?.status] ? <Button size="sm" variant="outline-light" onClick={() => retryPage()}>Try again</Button> : null}
              </div>
            </div>
          ) : null}
          {filter && pageAvailable && pageData && !events.length && !cursor ? <StatusMessage state="empty">No reported events for this outfall in the available data.</StatusMessage> : null}
          {events.length && pageAvailable ? (
            <ol ref={listRef} tabIndex={-1} className="cso-event-list list-unstyled mb-0" aria-label={`Recorded spills, ${pageSummary(shown.page)?.range ?? `${events.length} shown`}`}>
              {events.map((event) => {
                const outfall = outfalls.get(event.outfallId);
                const open = openEventId === event.eventId;
                const panelId = `cso-event-${event.eventId}`;
                return (
                  <li key={event.eventId} className="cso-event">
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
                    {open ? <div id={panelId}><EventDetail event={event} outfall={outfall} onShowOnMap={onShowOnMap} onShowRoute={onShowRoute} /></div> : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
          {shown && pageAvailable ? (
            <PageNavigation page={shown.page} canGoNewer={cursors.length > 0}
              onNewer={() => go(cursors.slice(0, -1))} onOlder={() => go([...cursors, shown.page.nextCursor])} onNewest={() => go([])} />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

CsoEventHistory.propTypes = {
  selectedOutfallId: PropTypes.string,
  onSelectOutfall: PropTypes.func,
  onShowOnMap: PropTypes.func,
  onShowRoute: PropTypes.func,
};
