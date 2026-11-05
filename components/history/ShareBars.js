"use client";

import PropTypes from "prop-types";
import { describeSupport, formatDuration, formatPercent } from "../../libs/history/present";

// Horizontal bars of the share of supported time at/above 2.2 m, one row per period.
// Rows with limited support are hatched and show no percentage; a tick marks the
// seasonal reference where one is available.
export default function ShareBars({ rows, caption, onSelect, referenceLabel }) {
  const max = Math.max(0.05, ...rows.map((row) => (describeSupport(row.summary).showShare ? row.summary.aboveShare : 0)), ...rows.map((row) => row.reference ?? 0));
  return (
    <div>
      <table className="history-bars">
        <caption className="visually-hidden">{caption}</caption>
        <thead className="visually-hidden">
          <tr><th scope="col">Period</th><th scope="col">Share of supported time at or above 2.2 m</th><th scope="col">Detail</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const support = row.summary ? describeSupport(row.summary) : null;
            const share = support?.showShare ? row.summary.aboveShare : null;
            let detail = "Could not be read";
            if (row.detail !== undefined) {
              detail = row.detail;
            } else if (row.summary) {
              detail = support.showShare
                ? `${formatDuration(row.summary.aboveMs)}${support.tone === "partial" ? " · partial data" : ""}`
                : support.tone === "none" ? "No observations" : "Limited data";
              if (row.inProgress) detail += " · in progress";
            }
            const label = onSelect
              ? <button type="button" className="history-bars__link" onClick={() => onSelect(row.key)}>{row.label}</button>
              : row.label;
            return (
              <tr key={row.key} className={row.highlight ? "is-highlighted" : undefined}>
                <th scope="row" className="history-bars__label">{label}</th>
                <td className="history-bars__track">
                  {share !== null
                    ? <span className={`history-bars__bar${support.tone === "partial" ? " is-partial" : ""}`} style={{ width: `${(share / max) * 100}%` }} />
                    : <span className="history-bars__bar is-empty" style={{ width: "100%" }} />}
                  {Number.isFinite(row.reference) ? <span className="history-bars__reference" style={{ left: `${(row.reference / max) * 100}%` }} title={`${referenceLabel}: ${formatPercent(row.reference)}`} /> : null}
                </td>
                <td className="history-bars__value">
                  <strong>{share !== null ? formatPercent(share) : "—"}</strong>
                  <span className="history-muted"> {detail}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {referenceLabel ? <p className="history-muted small mb-0"><span className="history-bars__reference-key" aria-hidden="true" /> {referenceLabel}. Hatched rows have too little supported data for a percentage.</p> : null}
    </div>
  );
}

ShareBars.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.shape({
    key: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    label: PropTypes.node.isRequired,
    summary: PropTypes.object,
    reference: PropTypes.number,
    detail: PropTypes.string,
    inProgress: PropTypes.bool,
    highlight: PropTypes.bool,
  })).isRequired,
  caption: PropTypes.string.isRequired,
  onSelect: PropTypes.func,
  referenceLabel: PropTypes.string,
};
