import PropTypes from 'prop-types';
import { buildWaterQualityIndicator } from '../../libs/waterQualityIndicator';

const VARIANTS = { lower: 'success', elevated: 'warning', high: 'danger', unavailable: 'secondary' };

export default function WaterQualityIndicator({ levelData = [], csoData = [], expanded = false, now }) {
  const indicator = buildWaterQualityIndicator({ levelData, csoData, now: now || new Date() });
  const title = `General water-quality indication: ${indicator.label}. ${indicator.reasons.join(' ')}`;
  return (
    <div className={`water-quality-indicator ${expanded ? 'water-quality-indicator--expanded' : ''}`} title={title} aria-label={title}>
      <span className={`water-quality-indicator__dot bg-${VARIANTS[indicator.level]}`} aria-hidden="true" />
      <span><strong>{indicator.label}</strong>{indicator.partial ? ' (partial data)' : ''}</span>
      {expanded ? (
        <div className="water-quality-indicator__details">
          <p className="mb-1">{indicator.cso.reason}</p>
          <p className="mb-0">{indicator.runoff.reason}</p>
        </div>
      ) : null}
    </div>
  );
}

WaterQualityIndicator.propTypes = {
  levelData: PropTypes.array,
  csoData: PropTypes.array,
  expanded: PropTypes.bool,
  now: PropTypes.instanceOf(Date),
};
