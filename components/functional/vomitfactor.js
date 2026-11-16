import PropTypes from 'prop-types';

const VARIANTS = { lower: 'success', elevated: 'warning', high: 'danger', unavailable: 'secondary' };
const UNAVAILABLE = { level: 'unavailable', label: 'Unavailable', reasons: ['The water-quality indication is unavailable right now.'], factors: {} };

// Renders the server's assessment (`/api/waterquality/assessment` `current`) in either source mode. It never computes
// an indication itself, so the page, the front page and alerts always describe the same assessment.
export default function WaterQualityIndicator({ assessment = null, expanded = false, isPending = false }) {
  if (isPending && !assessment) return <div className="water-quality-indicator">Loading indication…</div>;
  const current = assessment?.level ? assessment : UNAVAILABLE;
  const level = VARIANTS[current.level] ? current.level : 'unavailable';
  const label = current.atLeast ? `At least ${current.label.toLowerCase()}` : current.label;
  const qualifier = current.partial ? ' (partial data)' : '';
  const reasons = (current.reasons ?? []).filter(Boolean);
  const title = `General water-quality indication: ${label}${qualifier}. ${reasons.join(' ')}`;
  return (
    <div className={`water-quality-indicator ${expanded ? 'water-quality-indicator--expanded' : ''}`} title={title} aria-label={title}>
      <span className={`water-quality-indicator__dot bg-${VARIANTS[level]}`} aria-hidden="true" />
      <span><strong>{label}</strong>{qualifier}</span>
      {expanded ? (
        <div className="water-quality-indicator__details">
          {reasons.map((reason, index) => <p key={reason} className={index === reasons.length - 1 ? 'mb-0' : 'mb-1'}>{reason}</p>)}
        </div>
      ) : null}
    </div>
  );
}

WaterQualityIndicator.propTypes = {
  assessment: PropTypes.shape({
    level: PropTypes.string,
    label: PropTypes.string,
    atLeast: PropTypes.bool,
    partial: PropTypes.bool,
    reasons: PropTypes.arrayOf(PropTypes.string),
  }),
  expanded: PropTypes.bool,
  isPending: PropTypes.bool,
};
