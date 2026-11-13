import Accordion from 'react-bootstrap/Accordion';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import Table from 'react-bootstrap/Table';
import PropTypes from 'prop-types';
import useFetch from '../../libs/useFetch';
import { formatTime } from './csoEventHistory';

// Whole-catchment storm overflow monitoring from RDP's reviewed collection set (#114). Descriptive only: it never
// changes the indication, the density chart, the calibrated thresholds or alerts, and its counts are not the
// Sewage Map density shown in "Activity over time".

const FETCH_OPTIONS = { revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false, refreshInterval: 15 * 60 * 1000 };
const NUMBER = new Intl.NumberFormat('en-GB');
const n = (value) => (Number.isFinite(value) ? NUMBER.format(value) : '—');
const plural = (count, one, many = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`;

export const STATE_LABELS = {
  active: 'Spilling now (fresh report)',
  recent: 'Stopped within 48 hours',
  not_spilling: 'Not spilling (fresh report)',
  offline: 'Monitor offline',
  stale: 'Report out of date',
  unresolved: 'Unresolved or conflicting',
  no_observations: 'No reports yet',
  unavailable: 'Could not be read',
  not_read: 'Not read (incomplete collection)',
};
const EVIDENCE_STATES = ['active', 'recent', 'not_spilling'];
const UNKNOWN_STATES = ['offline', 'stale', 'unresolved', 'no_observations', 'unavailable', 'not_read'];
const BAR_CLASSES = { active: 'bg-danger', recent: 'bg-warning', not_spilling: 'bg-success' };

export function formatAge(seconds) {
  if (!Number.isFinite(seconds)) return 'unknown';
  if (seconds < 90) return `${Math.round(seconds)} s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 360) / 10} hr`;
}

function locationsText(count) {
  const extra = count.withoutLocation ? `, ${plural(count.withoutLocation, 'outfall')} without a published location` : '';
  return `${plural(count.locations, 'distinct location')}${extra}`;
}

function Stat({ value, label, detail }) {
  return <Card className="water-quality-stat h-100"><Card.Body><div className="water-quality-stat__value">{value}</div><Card.Title as="h3">{label}</Card.Title><Card.Text>{detail}</Card.Text></Card.Body></Card>;
}
Stat.propTypes = { value: PropTypes.node, label: PropTypes.string.isRequired, detail: PropTypes.string.isRequired };

function EvidenceBar({ states, total }) {
  if (!total) return null;
  const segments = [...EVIDENCE_STATES, 'unknown'].map((key) => ({
    key, count: key === 'unknown' ? UNKNOWN_STATES.reduce((sum, state) => sum + states[state], 0) : states[key],
  })).filter((segment) => segment.count > 0);
  const label = segments.map((segment) => `${segment.key === 'unknown' ? 'No usable current report' : STATE_LABELS[segment.key]}: ${n(segment.count)}`).join('; ');
  return (
    <div className="d-flex rounded overflow-hidden mb-2 cso-catchment-bar" role="img" aria-label={`Current evidence across ${n(total)} outfalls. ${label}`} style={{ height: '0.9rem' }}>
      {segments.map((segment) => (
        <div key={segment.key} className={BAR_CLASSES[segment.key] ?? 'bg-secondary'} style={{ width: `${(segment.count / total) * 100}%` }} />
      ))}
    </div>
  );
}
EvidenceBar.propTypes = { states: PropTypes.object.isRequired, total: PropTypes.number.isRequired };

export function readMessages(data) {
  const messages = [];
  const { read, selection, summary } = data;
  if (read.missing > 0) {
    messages.push({ tone: 'warning', text: `${plural(read.missing, 'outfall')} could not be collected from River Data Platform this time (${read.stopReason === 'deadline' ? 'the read took too long' : read.stopReason === 'page_budget' ? 'the set is larger than this page reads' : 'a page failed to load'}). They are counted as not read, not as clear.` });
  }
  if (read.partialPages > 0 || summary.states.unavailable > 0) messages.push({ tone: 'warning', text: `${plural(summary.states.unavailable, 'outfall')} could not be read by River Data Platform and ${summary.states.unavailable === 1 ? 'is' : 'are'} shown as unknown.` });
  if (read.duplicates > 0) messages.push({ tone: 'warning', text: `${plural(read.duplicates, 'duplicate outfall entry', 'duplicate outfall entries')} were ignored.` });
  if (read.catalogueError) messages.push({ tone: 'secondary', text: 'Outfall locations are unavailable right now, so distinct locations cannot be counted.' });
  if (!selection.matchesReviewed) messages.push({ tone: 'secondary', text: `River Data Platform reports ${n(selection.reportedTotal)} outfalls in this set; the reviewed set has ${n(data.set.expectedOutfalls)}.` });
  if (summary.coverage.notCollected + summary.coverage.partlyCollected > 0) {
    messages.push({ tone: 'secondary', text: `Collection was incomplete in the last ${data.window.hours} hours for ${plural(summary.coverage.notCollected + summary.coverage.partlyCollected, 'outfall')} (${n(summary.coverage.gapCount)} gaps). Spills during a gap may not have been recorded.` });
  }
  return messages;
}

function Comparison({ comparison }) {
  if (comparison.state !== 'available') return <p className="mb-0">The comparison with the existing density history is unavailable right now.</p>;
  const { memberAgreement: agreement } = comparison;
  return (
    <>
      <p>Each row is one existing density observation, at its own observation time, next to what River Data Platform recorded at that same moment. The two columns use different catchment boundaries, outfall lists and denominators, so they are <strong>not interchangeable</strong>. The indicator reference levels ({comparison.legacyThresholds.elevated} and {comparison.legacyThresholds.high}) apply to the existing density only.</p>
      {agreement ? <p className="small">Outfalls on the existing list, compared at the same time: both spilling {n(agreement.bothSpilling)}; existing only {n(agreement.legacyOnly)}; River Data Platform only {n(agreement.rdpOnly)}; neither {n(agreement.neither)}; River Data Platform end not reported {n(agreement.rdpUncertain)}; not comparable {n(agreement.notComparable)}.</p>
        : <p className="small">Per-outfall status from the existing list is not available for this period, so only density is compared.</p>}
      {comparison.rows.length ? (
        <div className="table-responsive">
          <Table size="sm" variant="dark" className="mb-0 small">
            <caption className="text-light">{plural(comparison.observations, 'hourly observation')}; River Data Platform collected at {n(comparison.rdpCollectedObservations)} of them.</caption>
            <thead>
              <tr>
                <th scope="col">Observed</th>
                <th scope="col">Existing density (per km²)</th>
                <th scope="col">Existing upstream count</th>
                <th scope="col">Existing list: spilling / reporting</th>
                <th scope="col">RDP outfalls collected</th>
                <th scope="col">RDP spilling outfalls</th>
                <th scope="col">RDP spilling locations</th>
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => (
                <tr key={row.observedAt}>
                  <td><time dateTime={row.observedAt}>{formatTime(row.observedAt)}</time></td>
                  <td>{Number.isFinite(row.legacy.numberCSOsPerKm2) ? row.legacy.numberCSOsPerKm2.toFixed(4) : '—'}</td>
                  <td>{n(row.legacy.numberUpstreamCSOs)}</td>
                  <td>{row.members.reporting === null ? `— of ${n(row.members.listed)}` : `${n(row.members.spilling)} / ${n(row.members.reporting)} of ${n(row.members.listed)}`}</td>
                  <td>{row.rdp.collectedOutfalls ? n(row.rdp.collectedOutfalls) : 'Not collected'}</td>
                  <td>{row.rdp.collectedOutfalls ? (row.rdp.spillingOutfalls.lower === row.rdp.spillingOutfalls.upper ? n(row.rdp.spillingOutfalls.lower) : `${n(row.rdp.spillingOutfalls.lower)}–${n(row.rdp.spillingOutfalls.upper)}`) : '—'}</td>
                  <td>{row.rdp.collectedOutfalls ? n(row.rdp.spillingLocations) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : <p className="mb-0">No existing density observations fall inside this period.</p>}
    </>
  );
}
Comparison.propTypes = { comparison: PropTypes.object.isRequired };

export default function CsoCatchmentMonitoring() {
  const { data, error, isPending } = useFetch('/api/waterquality/cso/catchment', FETCH_OPTIONS);
  if (data && data.enabled === false) return null;
  const ready = data && (data.state === 'available' || data.state === 'partial');

  return (
    <section className="water-quality-panel mb-4" aria-labelledby="cso-catchment-heading" id="cso-catchment">
      <h2 id="cso-catchment-heading">Whole-catchment monitoring</h2>
      <p className="water-quality-muted">Storm overflows across the {data?.set?.label ?? 'river catchment upstream of Holme Pierrepont'}, as monitored by River Data Platform. This is extra evidence only: it does not change the indication, chart or alerts above.</p>

      {isPending && !data ? <p role="status">Loading catchment monitoring…</p> : null}
      {error || (data && !ready) ? (
        <div className="alert alert-secondary" role="status">
          {data?.reason === 'set_not_enabled' ? 'Catchment monitoring is not enabled on this environment yet.' : 'Catchment monitoring is temporarily unavailable.'} The rest of this page is not affected.
        </div>
      ) : null}

      {ready ? (() => {
        const { summary } = data;
        const loc = summary.locations;
        return (
          <>
            <p className="mb-2"><strong>{n(summary.freshReports)} of {n(summary.total)}</strong> outfalls have a fresh report. <strong>{n(summary.unknown)}</strong> have no usable current report and are unknown, not clear.</p>
            <EvidenceBar states={summary.states} total={summary.total} />
            <div role="status" aria-live="polite">
              {readMessages(data).map((message) => <div key={message.text} className={`alert alert-${message.tone} py-2 mb-2`}>{message.text}</div>)}
            </div>
            <Row className="g-3 my-1">
              <Col sm={6} lg={3}><Stat value={n(summary.total)} label="Monitored outfalls" detail={`At ${locationsText(loc.all)}; ${plural(loc.all.outfallsAtSharedLocations, 'outfall')} share a location with another.`} /></Col>
              <Col sm={6} lg={3}><Stat value={n(summary.states.active)} label="Spilling now" detail={`Fresh spilling reports at ${locationsText(loc.active)}.`} /></Col>
              <Col sm={6} lg={3}><Stat value={n(summary.events.outfallsWithEvents)} label={`Spills in ${data.window.hours} hours`} detail={`Outfalls with a recorded spill (${plural(summary.events.events, 'event')}; ${n(summary.events.unresolvedEnd)} without a reported end). ${n(summary.states.recent)} stopped recently.`} /></Col>
              <Col sm={6} lg={3}><Stat value={n(summary.unknown)} label="Unknown" detail="Offline, out of date, unresolved, unreadable or not yet reporting." /></Col>
            </Row>
            <Row className="g-3">
              <Col md={6}>
                <h3 className="h6">Why some outfalls are unknown</h3>
                <ul className="small mb-0">
                  {UNKNOWN_STATES.filter((state) => summary.states[state] > 0).map((state) => <li key={state}>{STATE_LABELS[state]}: {n(summary.states[state])}</li>)}
                  {summary.unknown === 0 ? <li>None</li> : null}
                </ul>
              </Col>
              <Col md={6}>
                <h3 className="h6">Collection in the last {data.window.hours} hours</h3>
                <ul className="small mb-0">
                  <li>Collected throughout: {n(summary.coverage.collectedThroughout)}; partly: {n(summary.coverage.partlyCollected)}; not collected: {n(summary.coverage.notCollected)}</li>
                  {summary.coverage.earliestCollectedFrom ? <li>Collection began <time dateTime={summary.coverage.earliestCollectedFrom}>{formatTime(summary.coverage.earliestCollectedFrom)}</time></li> : null}
                  <li>Typical report age {formatAge(summary.lag.sourceAgeSeconds.median)} (oldest {formatAge(summary.lag.sourceAgeSeconds.max)}); read {formatAge(summary.lag.readAgeSeconds)} ago</li>
                  <li>Reporting completeness is unverified: the provider publishes only each outfall&apos;s latest event.</li>
                </ul>
              </Col>
            </Row>
            {data.highlights.outfalls.length ? (
              <details className="mt-3">
                <summary>Outfalls spilling now or stopped within 48 hours ({n(summary.states.active + summary.states.recent)})</summary>
                <ul className="small mt-2 mb-0">
                  {data.highlights.outfalls.map((outfall) => (
                    <li key={outfall.assetId}>
                      {outfall.name || outfall.receivingWatercourse || 'Outfall'} ({outfall.externalId}): {STATE_LABELS[outfall.state]}
                      {outfall.latestEventStart ? <>, started <time dateTime={outfall.latestEventStart}>{formatTime(outfall.latestEventStart)}</time></> : null}
                      {outfall.sharesLocationWith ? ` · same location as ${plural(outfall.sharesLocationWith, 'other outfall')}` : null}
                    </li>
                  ))}
                  {data.highlights.truncated ? <li>Further outfalls are not listed here.</li> : null}
                </ul>
              </details>
            ) : null}
            <Accordion className="mt-3">
              <Accordion.Item eventKey="comparison">
                <Accordion.Header>Compare with the existing density history (read-only)</Accordion.Header>
                <Accordion.Body className="text-start"><Comparison comparison={data.comparison} /></Accordion.Body>
              </Accordion.Item>
            </Accordion>
            <p className="small water-quality-muted mt-3 mb-0">
              Source: {data.attribution || `${data.set.providerLabel} storm overflow reports`}, collected by River Data Platform about every 15 minutes (reviewed set {data.set.relationshipSet} {data.set.relationshipVersion}).
              {' '}Outfalls at identical published coordinates count as one location; counts here are not the density used by the indication.
            </p>
          </>
        );
      })() : null}
    </section>
  );
}
