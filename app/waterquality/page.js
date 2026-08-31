"use client";

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import Accordion from 'react-bootstrap/Accordion';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import PropTypes from 'prop-types';
import SourceHealthBadge from '../../components/functional/sourceHealthBadge';
import WaterQualityIndicator from '../../components/functional/vomitfactor';
import useFetch from '../../libs/useFetch';
import { SWR_15_MINUTES } from '../../libs/dataFreshness';

const WaterQualityMap = dynamic(() => import('../../components/functional/csoMap'), { ssr: false, loading: () => <p>Loading map…</p> });
const CsoChart = dynamic(() => import('../../components/functional/csoChart'), { ssr: false, loading: () => <p>Loading chart…</p> });

function formatUpdated(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : 'Unavailable';
}

function SummaryCard({ value, label, detail }) {
  return <Card className="water-quality-stat h-100"><Card.Body><div className="water-quality-stat__value">{value}</div><Card.Title as="h3">{label}</Card.Title><Card.Text>{detail}</Card.Text></Card.Body></Card>;
}

SummaryCard.propTypes = { value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]), label: PropTypes.string.isRequired, detail: PropTypes.string.isRequired };

export default function WaterQualityPage() {
  const [chartHours, setChartHours] = useState(120);
  const { data: summaryData, error: summaryError, isPending: summaryPending } = useFetch('/api/waterquality', SWR_15_MINUTES);
  const { data: densityData, error: densityError, isPending: densityPending } = useFetch('/api/waterquality/csodensity?hours=120', SWR_15_MINUTES);
  const { data: levelData, error: levelError, isPending: levelPending } = useFetch('/api/levels', SWR_15_MINUTES);
  const current = summaryData?.waterQualityData ?? null;
  const counts = current?.statusSummary || {};
  const unavailable = Number(counts.offline || 0) + Number(counts.unknown || 0);
  const densityRows = Array.isArray(densityData) ? densityData : [];
  const levels = levelData?.level_data || [];

  return (
    <main className="water-quality-page text-white">
      <Container className="py-4 py-lg-5">
        <div className="mb-4">
          <Link href="/" className="water-quality-back">← Back to home</Link>
          <h1 className="display-5 fw-bold mt-4">Water quality indication</h1>
          <p className="lead water-quality-intro col-lg-8">A general indication based on upstream storm-overflow activity and how quickly the river is rising. It is not a measurement of bacteria or a guarantee that the water is safe.</p>
        </div>

        <Card className="water-quality-hero mb-4">
          <Card.Body className="p-4">
            <Row className="align-items-center g-4">
              <Col lg={7}>
                <p className="text-uppercase small fw-semibold text-info mb-2">Overall indication</p>
                <WaterQualityIndicator levelData={levels} csoData={densityRows} expanded />
              </Col>
              <Col lg={5}>
                <p className="mb-1"><strong>Observed:</strong> {formatUpdated(current?.ScrapeTimestamp)}</p>
                <p className="small water-quality-muted mb-2">Sources normally update around every 15 minutes.</p>
                <SourceHealthBadge health={current?.health} />
                {(summaryError || densityError || levelError) ? <div className="alert alert-warning mt-3 mb-0">Some supporting data is unavailable, so the indication may be incomplete.</div> : null}
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {summaryPending ? <p>Loading current CSO status…</p> : summaryError ? <div className="alert alert-danger">Current CSO status is unavailable. Historical activity may still be shown below.</div> : (
          <Row className="g-3 mb-4">
            <Col md={4}><SummaryCard value={counts.currentlySpilling ?? '—'} label="Currently spilling" detail="Upstream locations reporting an active spill." /></Col>
            <Col md={4}><SummaryCard value={counts.recentlyStopped48h ?? '—'} label="Stopped in 48 hours" detail="The latest spill has ended, but its contents may still be travelling downstream." /></Col>
            <Col md={4}><SummaryCard value={unavailable} label="Status unavailable" detail="Locations with offline, stale, missing or unrecognised status data." /></Col>
          </Row>
        )}

        <Row className="g-4 mb-4">
          <Col lg={6}><section className="water-quality-panel h-100"><h2>Upstream activity map</h2><p className="water-quality-muted">Current spills and recently stopped events that can contribute downstream.</p><WaterQualityMap locations={current?.locations || []} health={current?.health} isPending={summaryPending} error={summaryError} /></section></Col>
          <Col lg={6}><section className="water-quality-panel h-100"><h2>Activity over time</h2><p className="water-quality-muted">Hourly upstream CSO activity density with the indicator reference levels.</p><CsoChart data={densityRows} error={densityError} isPending={densityPending} hours={chartHours} onHoursChange={setChartHours} /></section></Col>
        </Row>

        <Accordion className="mb-4">
          <Accordion.Item eventKey="0">
            <Accordion.Header>How to interpret this indication</Accordion.Header>
            <Accordion.Body className="text-start">
              <p>Higher recent CSO activity suggests a greater upstream wastewater influence. A rapidly rising river can also bring agricultural and urban runoff. The page uses whichever factor gives the higher indication.</p>
              <p>The CSO bands are relative to the previous year of data. They do not measure discharge volume, pathogens, agricultural pollution or pollution from systems outside Severn Trent&apos;s network.</p>
              <p className="mb-0">Use normal paddling precautions, pay attention to how you feel and avoid swallowing river water. This information is directional guidance only.</p>
            </Accordion.Body>
          </Accordion.Item>
        </Accordion>
        <p className="text-center"><Link href="/alerts" className="text-info">Email me when CSO activity becomes elevated</Link></p>
        {levelPending ? <span className="visually-hidden">Loading river levels</span> : null}
      </Container>
    </main>
  );
}
