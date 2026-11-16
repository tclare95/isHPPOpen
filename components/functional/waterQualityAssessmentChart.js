import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import Button from 'react-bootstrap/Button';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import PropTypes from 'prop-types';

const Chart = dynamic(() => import('react-google-charts').then((mod) => mod.Chart), { ssr: false });
const LEVEL_NAMES = { lower: 'Lower', elevated: 'Elevated', high: 'High', unavailable: 'Unavailable' };

// History of the RDP assessment (hpp-upstream-activity/v1): counts of reviewed upstream outfalls, never Sewage Map
// density. Hours without enough evidence are gaps, not zero. The shaded interval is what missing evidence could add.
export function assessmentRows(points = []) {
  return points.map((point) => {
    const known = point.csoLevel !== 'unavailable' && point.recent;
    return [
      new Date(point.at),
      known ? point.recent.min : null,
      known ? point.recent.min : null,
      known ? point.recent.max : null,
      known ? point.spillingNow.min : null,
    ];
  });
}

export function levelHours(points = []) {
  return points.reduce((counts, point) => ({ ...counts, [point.level]: (counts[point.level] ?? 0) + 1 }), {});
}

export default function WaterQualityAssessmentChart({ assessment = null, error = null, isPending = false, hours = 120, onHoursChange = () => {} }) {
  const points = useMemo(() => assessment?.history?.points ?? [], [assessment]);
  const rows = useMemo(() => assessmentRows(points), [points]);
  const counts = useMemo(() => levelHours(points), [points]);
  if (isPending && !assessment) return <p>Loading chart…</p>;
  if (error) return <p>Unable to load chart data right now.</p>;
  const bands = assessment?.method?.bands;
  const recentHours = assessment?.method?.recentHours ?? 48;
  const buttons = (
    <ButtonGroup size="sm" aria-label="Chart time window">
      <Button variant={hours === 24 ? 'info' : 'outline-light'} onClick={() => onHoursChange(24)}>24 hours</Button>
      <Button variant={hours === 120 ? 'info' : 'outline-light'} onClick={() => onHoursChange(120)}>5 days</Button>
    </ButtonGroup>
  );
  if (!rows.some((row) => row[1] !== null) || !bands) {
    return <div><div className="d-flex justify-content-end mb-2">{buttons}</div><p>Not enough recorded evidence is available for this period yet.</p></div>;
  }
  const data = [[
    { type: 'datetime', label: 'Observed time' },
    { type: 'number', label: `Spilled in previous ${recentHours} h` },
    { type: 'number', role: 'interval' },
    { type: 'number', role: 'interval' },
    { type: 'number', label: 'Spilling at the time' },
    { type: 'number', label: 'Elevated reference' },
    { type: 'number', label: 'High reference' },
  ], ...rows.map((row) => [...row, bands.elevated.recent, bands.high.recent])];
  const summary = Object.entries(counts).map(([level, count]) => `${LEVEL_NAMES[level] ?? level}: ${count} h`).join(' · ');
  return (
    <div>
      <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
        <p className="mb-0 small water-quality-muted">Indication by hour: {summary}</p>
        {buttons}
      </div>
      <Chart width="100%" height={320} chartType="LineChart" loader={<div>Loading chart…</div>} data={data}
        options={{ legend: { position: 'bottom' }, interpolateNulls: false, intervals: { style: 'area', fillOpacity: 0.2 },
          chartArea: { top: 15, right: 15, bottom: 65, left: 55 }, hAxis: { format: hours === 24 ? 'ha' : 'd MMM', title: 'Observed time' },
          vAxis: { title: 'Upstream outfalls', minValue: 0, format: '0' }, colors: ['#37a9e1', '#9be15d', '#ffc107', '#dc3545'],
          series: { 0: { lineWidth: 3 }, 1: { lineWidth: 2 }, 2: { lineDashStyle: [5, 5], lineWidth: 1 }, 3: { lineDashStyle: [5, 5], lineWidth: 1 } } }} />
      <p className="small water-quality-muted mb-0">Gaps are hours without enough recorded evidence. The shaded band is how many more outfalls could have spilled where evidence is missing.</p>
    </div>
  );
}

WaterQualityAssessmentChart.propTypes = {
  assessment: PropTypes.object,
  error: PropTypes.object,
  isPending: PropTypes.bool,
  hours: PropTypes.number,
  onHoursChange: PropTypes.func,
};
