"use client";

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import Accordion from 'react-bootstrap/Accordion';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import PropTypes from 'prop-types';
import SourceHealthBadge from '../../components/functional/sourceHealthBadge';
import WaterQualityIndicator from '../../components/functional/vomitfactor';
import WaterQualityInterpretation from '../../components/functional/waterQualityInterpretation';
import RiverContext from '../../components/functional/riverContext';
import CsoEventHistory from '../../components/functional/csoEventHistory';
import CsoCatchmentMonitoring from '../../components/functional/csoCatchmentMonitoring';
import AboutTheData from '../../components/functional/aboutTheData';
import PageHeader from '../../components/layout/site/PageHeader';
import StatusMessage from '../../components/layout/site/StatusMessage';
import useFetch from '../../libs/useFetch';
import { SWR_15_MINUTES } from '../../libs/dataFreshness';

const WaterQualityMap = dynamic(() => import('../../components/functional/csoMap'), { ssr: false, loading: () => <p>Loading map…</p> });
const CsoChart = dynamic(() => import('../../components/functional/csoChart'), { ssr: false, loading: () => <p>Loading chart…</p> });
const WaterQualityAssessmentChart = dynamic(() => import('../../components/functional/waterQualityAssessmentChart'), { ssr: false, loading: () => <p>Loading chart…</p> });
// Current spill status follows RDP's 5-minute summary and the route's 5-minute cache, not the 15-minute editorial cadence.
const STATUS_FETCH = { ...SWR_15_MINUTES, refreshInterval: 5 * 60 * 1000 };
// The archived Sewage Map density view (RDP assessment in use): the last 30 days the legacy writer recorded.
const ARCHIVE_HOURS = 720;

function formatUpdated(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : 'Unavailable';
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

function SummaryCard({ value, label, detail }) {
  return <Card className="water-quality-stat h-100"><Card.Body><div className="water-quality-stat__value">{value}</div><Card.Title as="h3">{label}</Card.Title><Card.Text>{detail}</Card.Text></Card.Body></Card>;
}

SummaryCard.propTypes = { value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]), label: PropTypes.string.isRequired, detail: PropTypes.string.isRequired };

export default function WaterQualityPage() {
  const [chartHours, setChartHours] = useState(120);
  const [riverDirection, setRiverDirection] = useState('off');
  const [historyOutfallId, setHistoryOutfallId] = useState('');
  const [mapFocusId, setMapFocusId] = useState(null);
  const [showArchive, setShowArchive] = useState(false);
  const { data: riverData, error: riverError, isPending: riverPending } = useFetch(
    riverDirection === 'off' ? null : `/api/waterquality/river?direction=${riverDirection}`,
    { revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false });
  const riverTrace = !riverError && riverData?.direction === riverDirection ? riverData.trace : null;
  // Optional overlay, fetched only when switched on and refreshed every 5 minutes (RDP's own refresh interval) so the
  // drawn routes follow source events. A failure or a disabled overlay leaves the rest of the map unchanged.
  const [impactOn, setImpactOn] = useState(false);
  // One highlighted route, chosen from the overlay list, a map marker or the spill history.
  const [impactId, setImpactId] = useState('');
  const showRoute = (assetId) => { setImpactOn(true); setImpactId(assetId); };
  const { data: impactData, error: impactFetchError, isPending: impactPending } = useFetch(
    impactOn ? '/api/waterquality/river/impact' : null,
    { refreshInterval: 300000, revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false });
  const impactError = impactFetchError ?? (impactData && !impactData.enabled ? new Error('Downstream impact is not enabled') : null);
  const { data: summaryData, error: summaryError, isPending: summaryPending } = useFetch('/api/waterquality', STATUS_FETCH);
  // The indication and its history come from the server in every RDP_WQ_ASSESSMENT mode. Only the legacy assessment, or
  // the archived view of it, reads the Sewage Map density series; the two are never drawn on one axis.
  const { data: assessment, error: assessmentError, isPending: assessmentPending } = useFetch(`/api/waterquality/assessment?hours=${chartHours}`, SWR_15_MINUTES);
  const rdpAssessment = assessment?.source === 'rdp';
  const densityPath = !assessment ? null : !rdpAssessment ? '/api/waterquality/csodensity?hours=120' : showArchive ? `/api/waterquality/csodensity?hours=${ARCHIVE_HOURS}&interval=60` : null;
  const { data: densityData, error: densityError, isPending: densityPending } = useFetch(densityPath, SWR_15_MINUTES);
  const current = summaryData?.waterQualityData ?? null;
  const counts = current?.statusSummary || {};
  // A fresh "not spilling" report with no recent provider-reported spill is not unavailable data, but RDP coverage is
  // unverified, so it is still never presented as clear (#114: most of the 592 RDP members are in this state).
  const noRecentSpill = (current?.locations ?? []).filter((location) => location.statusReason === 'not_spilling_no_recent_event').length;
  const unavailable = Math.max(0, Number(counts.offline || 0) + Number(counts.unknown || 0) - noRecentSpill);
  // RDP reported no usable CSO status at all (#68): never present the counts as zero spills.
  const csoStatusUnavailable = current?.health?.cso?.available === false;
  // RDP answered, but no upstream outfall has a fresh report (for example every report is out of date): the counts would all
  // be zero, which reads as "nothing spilling". Say it is unavailable instead.
  const rdpStatus = current?.health?.cso?.origin === 'rdp';
  const freshReports = Number(counts.currentlySpilling || 0) + Number(counts.recentlyStopped48h || 0) + noRecentSpill;
  const noFreshStatus = rdpStatus && !csoStatusUnavailable && (current?.locations?.length ?? 0) > 0 && freshReports === 0;
  const statusAsOf = current?.health?.cso?.read?.retrievedAt ?? null;
  const densityRows = Array.isArray(densityData) ? densityData : [];
  const observedAt = assessment?.current?.observedAt ?? current?.ScrapeTimestamp;

  return (
    <main className="water-quality-page text-white">
      <Container className="py-4 py-lg-5">
        <PageHeader title="Water quality indication"
          lead="A general indication based on recent upstream storm-overflow activity and whether the river is rising. It is not a measurement of bacteria or a guarantee that the water is safe." />

        <Card className="water-quality-hero mb-4">
          <Card.Body className="p-4">
            <Row className="align-items-center g-4">
              <Col lg={7}>
                <p className="text-uppercase small fw-semibold text-info mb-2">Overall indication</p>
                <WaterQualityIndicator assessment={assessment?.current ?? null} isPending={assessmentPending} expanded />
              </Col>
              <Col lg={5}>
                <p className="mb-1"><strong>Observed:</strong> {formatUpdated(observedAt)}</p>
                <p className="small water-quality-muted mb-2">Spill status is checked about every 5 minutes; other sources about every 15 minutes.</p>
                <SourceHealthBadge health={assessment?.health ?? current?.health} />
                {(summaryError || assessmentError) ? <div className="site-state site-state--unavailable mt-3">Some supporting data is unavailable, so the indication may be incomplete.</div> : null}
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {summaryPending ? <StatusMessage state="loading" className="mb-4">Loading current CSO status…</StatusMessage> : summaryError ? <StatusMessage state="error" className="mb-4">Current CSO status is unavailable. Historical activity may still be shown below.</StatusMessage> : csoStatusUnavailable || noFreshStatus ? (
          <StatusMessage state="unavailable" className="mb-4">Current CSO status is temporarily unavailable{noFreshStatus ? ': no upstream outfall has an up-to-date report' : ''}. No upstream location is shown as spilling or as clear until it can be checked again. Historical activity may still be shown below.</StatusMessage>
        ) : (
          <Row className="g-3 mb-4">
            <Col md={4}><SummaryCard value={counts.currentlySpilling ?? '—'} label="Currently spilling" detail="Upstream locations reporting an active spill." /></Col>
            <Col md={4}><SummaryCard value={counts.recentlyStopped48h ?? '—'} label="Stopped in 48 hours" detail="The latest spill has ended, but its contents may still be travelling downstream." /></Col>
            <Col md={4}><SummaryCard value={unavailable} label="Status unavailable" detail="Locations with offline, stale, missing or unrecognised status data." /></Col>
            <Col xs={12}><p className="small water-quality-muted mb-0">
              {noRecentSpill ? `${noRecentSpill} other upstream location${noRecentSpill === 1 ? '' : 's'}: not spilling, no spill in the last 48 hours. ` : ''}
              {statusAsOf ? <>Status as of <time dateTime={statusAsOf}>{formatUpdated(statusAsOf)}</time>; the map shows the same reports.</> : null}
            </p></Col>
          </Row>
        )}

        <Row className="g-4 mb-4">
          <Col lg={6}><section className="water-quality-panel h-100" id="cso-map-panel"><h2>Upstream activity map</h2><p className="water-quality-muted">Current spills and recently stopped events that can contribute downstream.</p><RiverContext direction={riverDirection} onDirectionChange={setRiverDirection} context={riverData} error={riverError} isPending={riverPending} />
            <Form.Check type="switch" id="cso-impact-toggle" className="small mb-2" checked={impactOn} onChange={(e) => { setImpactOn(e.target.checked); if (!e.target.checked) setImpactId(''); }}
              label="Reported downstream spill impact" />
            <WaterQualityMap locations={current?.locations || []} relatedLocations={current?.relatedLocations ?? null} membership={current?.membership ?? null} health={current?.health} isPending={summaryPending} error={summaryError} riverTrace={riverTrace} focusId={mapFocusId} onShowHistory={(id) => { setHistoryOutfallId(id); scrollToSection('cso-history'); }}
              impactEnabled={impactOn} impact={impactData?.enabled ? impactData.impact : null} impactPending={impactOn && impactPending} impactError={impactOn ? impactError : null}
              impactSelectedId={impactId} onImpactSelect={setImpactId} onShowRoute={showRoute} /></section></Col>
          <Col lg={6}><section className="water-quality-panel h-100"><h2>Activity over time</h2>
            {rdpAssessment ? (
              <>
                <p className="water-quality-muted">Reviewed upstream storm overflows that spilled in the previous {assessment.method?.recentHours ?? 48} hours, hour by hour, with the indication&apos;s reference levels.</p>
                <WaterQualityAssessmentChart assessment={assessment} error={assessmentError} isPending={assessmentPending} hours={chartHours} onHoursChange={setChartHours} />
                <Form.Check type="switch" id="wq-archive-toggle" className="small mt-3" checked={showArchive} onChange={(e) => setShowArchive(e.target.checked)}
                  label="Show the archived Sewage Map density (previous method)" />
                {showArchive ? (
                  <div className="mt-2" data-testid="wq-archive">
                    <p className="small water-quality-muted">Sewage Map CSO activity per km², the previous measure. Its scale and reference levels differ from the counts above.</p>
                    <CsoChart data={densityRows} error={densityError} isPending={densityPending} hours={ARCHIVE_HOURS} windows={[]} />
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p className="water-quality-muted">Hourly upstream CSO activity density with the indicator reference levels.</p>
                <CsoChart data={densityRows} error={densityError ?? assessmentError} isPending={densityPending || assessmentPending} hours={chartHours} onHoursChange={setChartHours} />
              </>
            )}
          </section></Col>
        </Row>

        <CsoEventHistory selectedOutfallId={historyOutfallId} onSelectOutfall={setHistoryOutfallId}
          onShowOnMap={(id) => { setMapFocusId(id); scrollToSection('cso-map-panel'); }}
          onShowRoute={(assetId) => { showRoute(assetId); scrollToSection('cso-map-panel'); }} />

        <CsoCatchmentMonitoring />

        <Accordion className="mb-4">
          <Accordion.Item eventKey="0">
            <Accordion.Header>How to interpret this indication</Accordion.Header>
            <Accordion.Body className="text-start"><WaterQualityInterpretation assessment={assessment ?? null} /></Accordion.Body>
          </Accordion.Item>
          <Accordion.Item eventKey="about">
            <Accordion.Header>About the data</Accordion.Header>
            <Accordion.Body className="text-start small"><AboutTheData membership={current?.membership ?? null} assessment={assessment ?? null} /></Accordion.Body>
          </Accordion.Item>
        </Accordion>
        <p className="text-center"><Link href="/alerts" className="text-info">Email me when CSO activity becomes elevated</Link></p>
      </Container>
    </main>
  );
}
