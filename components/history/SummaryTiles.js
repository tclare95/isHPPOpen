"use client";

import PropTypes from "prop-types";
import { COLWICK_HISTORY } from "../../libs/history/config";
import { describeSupport, formatDate, formatDuration, formatLevel, formatPercent } from "../../libs/history/present";

function Tile({ value, label, detail }) {
  return (
    <div className="history-tile">
      <div className="history-tile__value">{value}</div>
      <div className="history-tile__label">{label}</div>
      {detail ? <div className="history-tile__detail">{detail}</div> : null}
    </div>
  );
}

Tile.propTypes = { value: PropTypes.node.isRequired, label: PropTypes.string.isRequired, detail: PropTypes.node };

// Headline figures for a period. Percentages always name their denominator (supported
// observed time) and are withheld when support is too limited.
export default function SummaryTiles({ summary, typicalShare, typicalLabel }) {
  const support = describeSupport(summary);
  const threshold = `${COLWICK_HISTORY.thresholdMetres.toFixed(1)} m`;
  const share = support.showShare ? formatPercent(summary.aboveShare) : "—";
  return (
    <div className="history-tiles">
      <Tile value={share} label={`Time at or above ${threshold}`}
        detail={support.showShare
          ? <>{formatDuration(summary.aboveMs)} of {formatDuration(summary.supportedMs)} supported time{Number.isFinite(typicalShare) ? <><br />{typicalLabel}: {formatPercent(typicalShare)}</> : null}</>
          : `${formatDuration(summary.aboveMs)} observed at or above; percentage withheld`} />
      <Tile value={String(summary.daysAtOrAbove)} label={`Days reaching ${threshold}`}
        detail={`Days with any reading at or above ${threshold}, of ${summary.daysWithData} days with readings`} />
      <Tile value={formatLevel(summary.max?.value)} label="Highest reading" detail={summary.max ? formatDate(summary.max.at) : "No readings"} />
      <Tile value={summary.supportRatio === null ? "—" : formatPercent(summary.supportRatio)} label="Observation support"
        detail={summary.unknownMs > 0 ? `${formatDuration(summary.unknownMs)} unknown (gaps or excluded readings)` : "No unsupported gaps"} />
    </div>
  );
}

SummaryTiles.propTypes = {
  summary: PropTypes.object.isRequired,
  typicalShare: PropTypes.number,
  typicalLabel: PropTypes.string,
};
