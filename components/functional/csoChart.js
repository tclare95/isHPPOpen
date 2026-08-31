import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import Button from 'react-bootstrap/Button';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import PropTypes from 'prop-types';
import { WATER_QUALITY_CALIBRATION } from '../../libs/waterQualityIndicator';

const Chart = dynamic(() => import('react-google-charts').then((mod) => mod.Chart), { ssr: false });

function hourlyRows(data, hours) {
  const valid = data.map((row) => ({ date: new Date(row?.timestamp), value: Number(row?.numberCSOsPerKm2) }))
    .filter((row) => !Number.isNaN(row.date.getTime()) && Number.isFinite(row.value)).sort((a, b) => a.date - b.date);
  const newest = valid.at(-1)?.date;
  if (!newest) return [];
  const cutoff = newest.getTime() - hours * 60 * 60 * 1000;
  const buckets = new Map();
  valid.filter((row) => row.date.getTime() >= cutoff).forEach((row) => {
    const key = Math.floor(row.date.getTime() / 3600000) * 3600000;
    const bucket = buckets.get(key) || { sum: 0, count: 0 };
    bucket.sum += row.value;
    bucket.count += 1;
    buckets.set(key, bucket);
  });
  return [...buckets.entries()].map(([time, bucket]) => [new Date(time), bucket.sum / bucket.count, WATER_QUALITY_CALIBRATION.waterQuality.elevatedDensity, WATER_QUALITY_CALIBRATION.waterQuality.highDensity]);
}

export default function CsoChart({ data = [], error = null, isPending = false, hours = 120, onHoursChange = () => {} }) {
  const rows = useMemo(() => hourlyRows(data, hours), [data, hours]);
  if (isPending) return <p>Loading chart…</p>;
  if (error) return <p>Unable to load chart data right now.</p>;
  if (!rows.length) return <p>No chart data is available.</p>;
  const latest = rows.at(-1)?.[1];
  const previous = rows.at(-2)?.[1];
  const trend = !Number.isFinite(previous) ? 'Current trend unavailable' : latest > previous * 1.05 ? 'Activity is rising' : latest < previous * 0.95 ? 'Activity is falling' : 'Activity is broadly steady';
  return (
    <div>
      <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
        <p className="mb-0"><strong>{trend}</strong><br /><span className="small water-quality-muted">Latest hourly density: {latest.toFixed(3)}</span></p>
        <ButtonGroup size="sm" aria-label="Chart time window">
          <Button variant={hours === 24 ? 'info' : 'outline-light'} onClick={() => onHoursChange(24)}>24 hours</Button>
          <Button variant={hours === 120 ? 'info' : 'outline-light'} onClick={() => onHoursChange(120)}>5 days</Button>
        </ButtonGroup>
      </div>
      <Chart width="100%" height={320} chartType="LineChart" loader={<div>Loading chart…</div>}
        data={[[{ type: 'datetime', label: 'Date' }, { type: 'number', label: 'Activity density' }, { type: 'number', label: 'Elevated threshold' }, { type: 'number', label: 'High threshold' }], ...rows]}
        options={{ legend: { position: 'bottom' }, chartArea: { top: 15, right: 15, bottom: 65, left: 55 }, hAxis: { format: hours === 24 ? 'ha' : 'd MMM', title: 'Observed time' }, vAxis: { title: 'CSO activity / km²', minValue: 0 }, colors: ['#37a9e1', '#ffc107', '#dc3545'], series: { 0: { lineWidth: 3 }, 1: { lineDashStyle: [5, 5], lineWidth: 1 }, 2: { lineDashStyle: [5, 5], lineWidth: 1 } } }} />
      <p className="small water-quality-muted">This is an upstream downstream-impact proxy, not a count of CSOs physically at HPP.</p>
    </div>
  );
}

CsoChart.propTypes = { data: PropTypes.array, error: PropTypes.object, isPending: PropTypes.bool, hours: PropTypes.number, onHoursChange: PropTypes.func };
