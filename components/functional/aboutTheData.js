import PropTypes from 'prop-types';
import { membershipSummary } from '../../libs/csoMembershipText';

// Every data source on this page is attributed here, once, rather than under each section.
export default function AboutTheData({ membership }) {
  const set = membershipSummary(membership);
  const providers = set?.providers.length ? set.providers.join(', ') : 'Severn Trent Water';
  return (
    <ul className="mb-0">
      <li><strong>Storm overflows:</strong> {providers}, collected by River Data Platform about every 15 minutes. Spill times are as the provider reports them; an end time is never estimated.</li>
      {set ? <li><strong>Upstream outfalls:</strong> the {Number.isFinite(set.confirmed) ? `${set.confirmed} ` : ''}outfalls in River Data Platform&apos;s reviewed set {set.relationshipSet} (version {set.version}).</li> : null}
      <li><strong>Activity chart:</strong> a measure of upstream overflow activity affecting HPP, not a count of overflows at HPP itself.</li>
      <li><strong>Whole-catchment monitoring:</strong> outfalls at identical published coordinates count as one location. These counts are not used by the indication.</li>
      <li><strong>River levels:</strong> Environment Agency real-time flood-monitoring data.</li>
      <li><strong>Map:</strong> &copy; OpenStreetMap contributors; river network and downstream routes from OpenRiversNetwork via River Data Platform.</li>
    </ul>
  );
}

AboutTheData.propTypes = { membership: PropTypes.object };
