"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Col from 'react-bootstrap/Col';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import PropTypes from 'prop-types';
import useFetch from '../../libs/useFetch';
import { outfallDetailPath, outfallMapPath } from '../../libs/csoOutfallLinks';
import PageHeader from '../layout/site/PageHeader';
import StatusMessage from '../layout/site/StatusMessage';
import { durationText, EventBadges, EventDetail, formatMinutes, formatTime, HISTORY_WINDOWS, Time } from './csoEventHistory';
import { IMPACT_CAVEAT } from './csoImpactOverlay';
import { RELATIONSHIP_LABELS } from '../../libs/csoMembershipText';

// One storm overflow in focus (Wave C / C4). Descriptive only: it never changes the indicator, thresholds or alerts, and
// it never presents an absent, stale or unread report as "not spilling" or an empty list as "no spills".

const FETCH_OPTIONS = { revalidateOnFocus: true, focusThrottleInterval: 60 * 1000, revalidateOnReconnect: false, shouldRetryOnError: false, refreshInterval: 5 * 60 * 1000, keepPreviousData: true };

export const STATUS_LABELS = {
  active: { label: 'Currently spilling', bg: 'danger' },
  recent: { label: 'Spill stopped in the last 48 hours', bg: 'warning', text: 'dark' },
  offline: { label: 'Monitor reported offline', bg: 'secondary' },
};

// Why a status is not a confirmed spill or stop. None of these says the outfall is clear.
export const STATUS_REASONS = {
  not_spilling_no_recent_event: 'The latest report says not spilling, with no reported spill in the last 48 hours.',
  stale: 'The latest report is out of date, so the current state is unknown.',
  offline: 'The monitor reported itself offline.',
  contradictory: 'The provider report and the platform’s assessment disagree, so the current state is unknown.',
  not_monitored: 'This outfall is not in the monitored collection, so there is no current report.',
  status_not_read: 'The current report could not be read.',
  status_unavailable: 'The current report could not be read.',
  unavailable: 'The provider has no usable current report.',
  no_status_record: 'No current report has been recorded for this outfall.',
  events_unavailable: 'Its recent events could not be read, so whether a spill recently stopped is unknown.',
  events_truncated: 'Its recent events could not all be read, so whether a spill recently stopped is unknown.',
  event_held: 'Its latest spill has conflicting reports awaiting review.',
  event_end_not_reported: 'The provider did not report when its latest spill ended.',
  event_ongoing: 'Its latest spill has no reported end, but the current report is not spilling.',
  event_unresolved: 'Its latest spill has no reported end.',
  identity_missing: 'The outfall is not in the published catalogue, so its report cannot be read.',
  identity_ambiguous: 'The provider ID matches more than one catalogue outfall, so its report cannot be read.',
};

const RELATIONSHIP_TEXT = {
  confirmed: 'Confirmed upstream of HPP.',
  candidate: `${RELATIONSHIP_LABELS.candidate}. Not on the confirmed upstream list.`,
  'catchment-only': `${RELATIONSHIP_LABELS['catchment-only']}. Not linked to the river network.`,
  legacy: 'On the HPP upstream list from the Sewage Map.',
};

function formatCoordinate(value) {
  return Number.isFinite(value) ? value.toFixed(5) : '—';
}

function formatAge(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return `${formatMinutes(Math.round(seconds / 60))} old`;
}

const shortVersion = (value) => (typeof value === 'string' ? value.slice(0, 12) : null);

function Section({ id, title, children }) {
  return (
    <section className="water-quality-panel mb-4" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}
Section.propTypes = { id: PropTypes.string.isRequired, title: PropTypes.string.isRequired, children: PropTypes.node };

function Identity({ detail }) {
  const { outfall, identity, coLocated, coLocatedTotal, publicId } = detail;
  return (
    <Section id="outfall-identity" title="Outfall">
      <dl className="row small mb-2 cso-event-detail">
        <dt className="col-sm-4">Water company</dt><dd className="col-sm-8">{outfall.providerLabel ?? 'Not available'}</dd>
        <dt className="col-sm-4">Provider outfall ID</dt><dd className="col-sm-8">{outfall.externalId}</dd>
        <dt className="col-sm-4">Platform ID</dt>
        <dd className="col-sm-8">{outfall.assetId ?? <span className="water-quality-muted">Not resolved{identity.state === 'unavailable' ? ': the catalogue is unavailable right now' : ''}</span>}</dd>
        {outfall.name ? <><dt className="col-sm-4">Name</dt><dd className="col-sm-8">{outfall.name}</dd></> : null}
        <dt className="col-sm-4">Receiving water</dt><dd className="col-sm-8">{outfall.receivingWatercourse || 'Not reported'}</dd>
        <dt className="col-sm-4">Published location</dt>
        <dd className="col-sm-8">
          {outfall.coordinates ? <>{formatCoordinate(outfall.coordinates.y)}, {formatCoordinate(outfall.coordinates.x)} <span className="water-quality-muted">(as published by the water company)</span></> : 'Not published'}
        </dd>
        <dt className="col-sm-4">Platform monitoring</dt>
        <dd className="col-sm-8">{outfall.selected === true ? 'Collected by River Data Platform' : outfall.selected === false ? 'Not collected by River Data Platform' : 'Not known'}</dd>
      </dl>
      <p className="mb-2"><Link href={outfallMapPath({ publicId })} className="btn btn-sm btn-outline-info">Show on the water-quality map</Link></p>
      {coLocated?.length ? (
        <div className="history-notice mb-0" data-testid="co-located">
          <p className="mb-1">{coLocatedTotal === 1 ? 'One other outfall shares' : `${coLocatedTotal} other outfalls share`} this published location. They share a map pin but are separate outfalls with their own reports:</p>
          <ul className="mb-0">
            {coLocated.map((other) => (
              <li key={other.assetId}>
                {other.inScope ? <Link href={outfallDetailPath(other.assetId)}>{other.externalId}</Link> : other.externalId}
                {other.receivingWatercourse ? ` (${other.receivingWatercourse})` : ''}
                {other.inScope ? (other.category && RELATIONSHIP_LABELS[other.category] ? ` · ${RELATIONSHIP_LABELS[other.category]}` : '') : ' · outside the HPP upstream list'}
              </li>
            ))}
          </ul>
          {coLocatedTotal > coLocated.length ? <p className="small mb-0">{coLocatedTotal - coLocated.length} more are not listed.</p> : null}
        </div>
      ) : null}
    </Section>
  );
}
Identity.propTypes = { detail: PropTypes.object.isRequired };

function Relationship({ relationship }) {
  return (
    <Section id="outfall-relationship" title="Relationship to HPP">
      <p className="mb-1">
        {relationship.primary ? null : <Badge bg="dark" className="border me-1">Not confirmed upstream</Badge>}
        {RELATIONSHIP_TEXT[relationship.category] ?? 'Its relationship to HPP is not known.'}
      </p>
      {relationship.basis === 'rdp' ? (
        <p className="small water-quality-muted mb-0">
          {relationship.reviewed ? 'Decided by manual review. ' : 'Assessed automatically (two independent methods). '}
          Relationship set {relationship.relationshipSet}, version {shortVersion(relationship.version)}, {relationship.approval}.
        </p>
      ) : null}
    </Section>
  );
}
Relationship.propTypes = { relationship: PropTypes.object.isRequired };

function CurrentStatus({ status }) {
  if (status.state !== 'available') {
    return (
      <Section id="outfall-status" title="Current status">
        <StatusMessage state="unavailable">Current status is unavailable right now. This outfall is not shown as spilling or as clear until it can be checked again.</StatusMessage>
      </Section>
    );
  }
  const { location, report } = status;
  const shown = STATUS_LABELS[location.status];
  const reason = location.status === 'unknown' || location.status === 'offline' ? STATUS_REASONS[location.statusReason] : null;
  return (
    <Section id="outfall-status" title="Current status">
      <p className="mb-2" data-testid="outfall-status">
        {shown ? <Badge bg={shown.bg} text={shown.text}>{shown.label}</Badge> : <Badge bg="secondary">Status unknown</Badge>}
      </p>
      {reason ? <p className="small mb-2">{reason}</p> : !shown ? <p className="small mb-2">The current state cannot be confirmed. It is not shown as spilling or as clear.</p> : null}
      <dl className="row small mb-0 cso-event-detail">
        {location.status === 'active' || location.status === 'recent' ? (
          <>
            <dt className="col-sm-4">Spill started</dt><dd className="col-sm-8"><Time value={location.latestEventStart} /></dd>
            <dt className="col-sm-4">Spill ended</dt><dd className="col-sm-8">{location.status === 'active' ? 'Ongoing' : <Time value={location.latestEventEnd} />}</dd>
            <dt className="col-sm-4">{location.status === 'active' ? 'Duration so far' : 'Duration'}</dt><dd className="col-sm-8">{formatMinutes(location.eventDurationMinutes)}</dd>
          </>
        ) : null}
        <dt className="col-sm-4">Provider report time</dt>
        <dd className="col-sm-8"><Time value={location.sourceUpdatedAt} />{report && formatAge(report.sourceAgeSeconds) ? ` (${formatAge(report.sourceAgeSeconds)})` : ''}</dd>
        <dt className="col-sm-4">Last checked</dt><dd className="col-sm-8"><Time value={location.observedAt} /></dd>
        <dt className="col-sm-4">Source</dt><dd className="col-sm-8">{status.source === 'rdp' ? 'River Data Platform' : 'Previous Sewage Map collection'}</dd>
      </dl>
    </Section>
  );
}
CurrentStatus.propTypes = { status: PropTypes.object.isRequired };

// What one outfall's list can and cannot support.
export function outfallEvidenceMessages(history) {
  const { evidence, window, outfall } = history;
  const period = HISTORY_WINDOWS.find((option) => option.key === window.key)?.label ?? window.key;
  if (evidence.conclusion === 'not_monitored') return [{ tone: 'warning', text: 'This outfall is not monitored for event history yet.' }];
  const messages = [];
  if (evidence.conclusion === 'no_reported_events') messages.push({ tone: 'info', text: `No reported spills in the last ${period}.` });
  if (evidence.conclusion === 'coverage_incomplete') messages.push({ tone: 'warning', text: 'No spills found, but monitoring coverage is incomplete.' });
  if (evidence.coverage.gapCount > 0) {
    messages.push({ tone: 'warning', text: `Monitoring coverage is incomplete: about ${Math.round(evidence.coverage.collectedFraction * 100)}% of this period was collected (${evidence.coverage.gapCount} gap${evidence.coverage.gapCount === 1 ? '' : 's'}).` });
  }
  if (window.key === '30d' && !evidence.coverage.sufficient) messages.push({ tone: 'warning', text: 'Monitoring does not yet cover the full 30 days.' });
  if (outfall?.truncated) messages.push({ tone: 'warning', text: `This outfall had more events in this period than can be read at once, so its most recent events${outfall.readThrough ? ` (after ${formatTime(outfall.readThrough)})` : ''} are missing from this list.` });
  return messages;
}

function RecordedSpills({ history, windowKey, onWindowChange }) {
  const [openEventId, setOpenEventId] = useState(null);
  if (!history.enabled) {
    return (
      <Section id="outfall-history" title="Recorded spills">
        <StatusMessage state="unavailable">Recorded spill history is not available on this site at the moment.</StatusMessage>
      </Section>
    );
  }
  return (
    <Section id="outfall-history" title="Recorded spills">
      <p className="water-quality-muted">Spill events recorded for this outfall, newest first, including corrections.</p>
      <ButtonGroup size="sm" aria-label="Recorded spill period" className="mb-3 flex-wrap">
        {HISTORY_WINDOWS.map((option) => (
          <Button key={option.key} variant={windowKey === option.key ? 'info' : 'outline-light'} aria-pressed={windowKey === option.key}
            onClick={() => { onWindowChange(option.key); setOpenEventId(null); }}>{option.label}</Button>
        ))}
      </ButtonGroup>
      {history.state !== 'available' ? <StatusMessage state="unavailable">Recorded spills are temporarily unavailable. The rest of this page is not affected.</StatusMessage> : (
        <>
          <div role="status" aria-live="polite">
            {outfallEvidenceMessages(history).map((message) => <div key={message.text} className={`${message.tone === 'warning' ? 'history-notice history-notice--warning' : 'history-notice'} mb-2`}>{message.text}</div>)}
          </div>
          {history.events.length ? (
            <ol className="cso-event-list list-unstyled mb-0" aria-label="Recorded spills for this outfall">
              {history.events.map((event) => {
                const open = openEventId === event.eventId;
                const panelId = `cso-event-${event.eventId}`;
                return (
                  <li key={event.eventId} className="cso-event">
                    <button type="button" className="cso-event__summary" aria-expanded={open} aria-controls={panelId} onClick={() => setOpenEventId(open ? null : event.eventId)}>
                      <span className="cso-event__place">Started <Time value={event.startedAt} /></span>
                      <EventBadges event={event} />
                      <span className="cso-event__times small">
                        {event.display === 'completed' ? <>Ended <Time value={event.endedAt} /> · </> : null}
                        {durationText(event)}
                        {event.revision > 1 ? <> · revised (revision {event.revision})</> : null}
                      </span>
                    </button>
                    {open ? <div id={panelId}><EventDetail event={event} outfall={null} showOutfallLink={false} /></div> : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
        </>
      )}
    </Section>
  );
}
RecordedSpills.propTypes = { history: PropTypes.object.isRequired, windowKey: PropTypes.string.isRequired, onWindowChange: PropTypes.func.isRequired };

function Connectivity({ detail }) {
  const { connectivity, relationship, outfall, publicId } = detail;
  let text;
  if (relationship.basis !== 'rdp') text = 'Not yet assessed against the River Tracer network.';
  else if (connectivity.routed === false) text = 'Not linked to the river network.';
  else if (relationship.primary) text = 'River Tracer links this outfall to the river network above HPP.';
  else text = 'River Tracer suggests a possible link to the river network, but it is not confirmed.';
  const canDraw = connectivity.impactEnabled && outfall.assetId && connectivity.routed !== false;
  return (
    <Section id="outfall-connectivity" title="Downstream connection">
      <p className="mb-2">{text}</p>
      <p className="small water-quality-muted mb-2">{IMPACT_CAVEAT}</p>
      {!connectivity.impactEnabled ? <StatusMessage state="unavailable">The downstream route map is not available on this site at the moment.</StatusMessage> : null}
      {canDraw ? (
        <>
          <p className="mb-1"><Link href={outfallMapPath({ publicId, assetId: outfall.assetId, route: true })} className="btn btn-sm btn-outline-info">Show downstream route on the map</Link></p>
          <p className="small water-quality-muted mb-0">Routes are drawn only while this outfall has a reported spill in the last 48 hours.</p>
        </>
      ) : null}
    </Section>
  );
}
Connectivity.propTypes = { detail: PropTypes.object.isRequired };

function title(detail) {
  const { outfall } = detail;
  return outfall.name || (outfall.receivingWatercourse ? `${outfall.receivingWatercourse} storm overflow` : `Storm overflow ${outfall.externalId}`);
}

export default function CsoOutfallDetail({ id }) {
  const [windowKey, setWindowKey] = useState(HISTORY_WINDOWS[0].key);
  const { data, error, isPending } = useFetch(`/api/waterquality/cso/outfalls/${encodeURIComponent(id)}?window=${windowKey}`, FETCH_OPTIONS);
  // An old or provider-only link is shown at its canonical address, so what is shared next is the stable identity.
  useEffect(() => {
    if (data?.id && data.id !== id && typeof window !== 'undefined') window.history.replaceState(null, '', outfallDetailPath(data.id));
  }, [data, id]);

  const back = <p className="mb-2"><Link href="/waterquality" className="history-back">← Water quality</Link></p>;
  if (!data) {
    return (
      <main className="water-quality-page text-white">
        <Container className="py-4 py-lg-5">
          {back}
          <PageHeader title="Storm overflow" />
          {error?.status === 404 ? (
            <div className="history-empty">
              <h2 className="h5">Outfall not found</h2>
              <p>{error.message && error.message !== 'Outfall not found' ? error.message : 'This outfall is not on the HPP upstream list, or the link is not valid.'}</p>
              <p className="mb-0"><Link href="/waterquality" className="history-back">Back to water quality</Link></p>
            </div>
          ) : error ? <StatusMessage state="error">Outfall details are unavailable right now. Please try again shortly.</StatusMessage>
            : isPending ? <StatusMessage state="loading">Loading outfall details…</StatusMessage> : null}
        </Container>
      </main>
    );
  }
  return (
    <main className="water-quality-page text-white">
      <Container className="py-4 py-lg-5">
        {back}
        <PageHeader title={title(data)}
          lead={`${data.outfall.providerLabel ?? 'Water company'} storm overflow ${data.outfall.externalId}.`} />
        <Row className="g-0 g-lg-4">
          <Col lg={6}>
            <CurrentStatus status={data.status} />
            <Identity detail={data} />
          </Col>
          <Col lg={6}>
            <Relationship relationship={data.relationship} />
            <Connectivity detail={data} />
          </Col>
        </Row>
        <RecordedSpills history={data.history} windowKey={windowKey} onWindowChange={setWindowKey} />
      </Container>
    </main>
  );
}

CsoOutfallDetail.propTypes = { id: PropTypes.string.isRequired };
