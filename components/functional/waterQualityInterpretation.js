import PropTypes from 'prop-types';

// "How to interpret this indication" for whichever assessment the server is using (RDP_WQ_ASSESSMENT).
export default function WaterQualityInterpretation({ assessment = null }) {
  const method = assessment?.source === 'rdp' ? assessment.method : null;
  if (!method) {
    return (
      <>
        <p>Higher recent CSO activity suggests a greater upstream wastewater influence. A rapidly rising river can also bring agricultural and urban runoff. The page uses whichever factor gives the higher indication.</p>
        <p>The CSO bands are relative to the previous year of data. They do not measure discharge volume, pathogens, agricultural pollution or pollution from systems outside Severn Trent&apos;s network.</p>
        <p className="mb-0">Use normal paddling precautions, pay attention to how you feel and avoid swallowing river water. This information is directional guidance only.</p>
      </>
    );
  }
  const { bands, recentHours, runoff } = method;
  const members = assessment.evidence?.membership?.members;
  return (
    <>
      <p><strong>What it measures.</strong> How many storm overflows in River Data Platform&apos;s reviewed set of {Number.isFinite(members) ? `${members} ` : ''}outfalls upstream of HPP spilled in the previous {recentHours} hours or are spilling now, and whether the river at Colwick is higher than at the same time the day before. Sewage can take a day or more to travel down the catchment, so recent spills still count after they stop.</p>
      <ul>
        <li><strong>Elevated:</strong> {bands.elevated.recent} or more outfalls spilled in the previous {recentHours} hours, {bands.elevated.spillingNow} or more are spilling now, or the river is {runoff.elevatedRiseMetres.toFixed(2)} m or more higher than a day earlier.</li>
        <li><strong>High:</strong> {bands.high.recent} or more spilled, {bands.high.spillingNow} or more spilling now, or a rise of {runoff.highRiseMetres.toFixed(2)} m or more.</li>
        <li><strong>Lower:</strong> below all of these, with enough evidence to say so. The page uses whichever factor gives the higher indication.</li>
      </ul>
      <p><strong>What it does not mean.</strong> {assessment.explanation?.doesNotMean} Lower is not &quot;clean&quot; and High is not a measured hazard. Spill duration and volume, rainfall runoff from farmland and roads, and overflows outside the reviewed set are not counted.</p>
      <p><strong>Missing evidence.</strong> An offline or stale monitor, a gap in collection or a spill without a reported end is never counted as &quot;no spill&quot;. &quot;At least&quot; and &quot;partial data&quot; mean activity may be higher than shown. If too much evidence is missing to rule out a higher level, the indication is Unavailable rather than Lower.</p>
      <p><strong>Method.</strong> Version {method.version}. Earlier readings used Sewage Map&apos;s density and are shown separately on their own scale.</p>
      <p className="mb-0">Use normal paddling precautions, pay attention to how you feel and avoid swallowing river water. This information is directional guidance only.</p>
    </>
  );
}

WaterQualityInterpretation.propTypes = { assessment: PropTypes.object };
