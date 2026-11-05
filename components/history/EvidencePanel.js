"use client";

import PropTypes from "prop-types";
import Accordion from "react-bootstrap/Accordion";
import { COLWICK_HISTORY } from "../../libs/history/config";
import { COVERAGE_TEXT, formatDateTime, formatDuration } from "../../libs/history/present";

// Provenance, quality and interpretation notes for the selected period.
export default function EvidencePanel({ summary, coverage, readAt, readingsLabel = "Readings in period" }) {
  const r = summary?.readings ?? {};
  const threshold = `${COLWICK_HISTORY.thresholdMetres.toFixed(1)} m`;
  return (
    <section className="history-panel" aria-labelledby="history-evidence">
      <h2 id="history-evidence" className="h5">About this data</h2>
      <dl className="history-facts">
        <div><dt>Measurement</dt><dd>EA Colwick (station {COLWICK_HISTORY.providerStationId}) river level, {COLWICK_HISTORY.unit} (metres above stage datum), 15-minute readings, via the River Data Platform</dd></div>
        <div><dt>{readingsLabel}</dt><dd>{(r.returned ?? 0).toLocaleString("en-GB")} returned · {(r.qualified ?? 0).toLocaleString("en-GB")} qualified{r.edited ? ` (${r.edited.toLocaleString("en-GB")} provider-edited)` : ""} · {(r.provisional ?? 0).toLocaleString("en-GB")} provisional · {(r.excluded ?? 0).toLocaleString("en-GB")} excluded{r.revised ? ` · ${r.revised.toLocaleString("en-GB")} revised since first stored` : ""}</dd></div>
        <div><dt>Longest gap</dt><dd>{summary ? formatDuration(summary.largestGapMs) : "—"}</dd></div>
        <div><dt>Coverage review</dt><dd>{COVERAGE_TEXT[coverage] ?? COVERAGE_TEXT.unknown}</dd></div>
        {readAt ? <div><dt>Read from source</dt><dd>{formatDateTime(readAt)}</dd></div> : null}
      </dl>
      <Accordion className="history-accordion">
        <Accordion.Item eventKey="threshold">
          <Accordion.Header>River level conditions are not HPP closures</Accordion.Header>
          <Accordion.Body>
            <p>HPP uses a river-level rule at Colwick: below {threshold} the level is below the threshold; at or above {threshold} the threshold is met. These pages describe what the <em>observed river level</em> did. They are not a record of when the course actually opened or closed.</p>
            <p className="mb-0">HPP can close for other reasons (events, maintenance, water quality, staff decisions), and the live status uses its own evidence and timing. The operational status history on the home page is kept separately and is not changed by anything here.</p>
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey="time">
          <Accordion.Header>How time at or above {threshold} is counted</Accordion.Header>
          <Accordion.Body>
            <p>Each reading is an instant. Time between two readings at most 30 minutes apart is shared between them: the first half takes the earlier reading&apos;s side of the threshold, the second half the later one&apos;s. No level is interpolated.</p>
            <p className="mb-0">Longer gaps, excluded readings and time before the first or after the latest reading count as <strong>unknown</strong>, never as below or above. Percentages are of supported time only, and are withheld when observations support less than half of a period.</p>
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey="quality">
          <Accordion.Header>Quality, provider edits and provisional data</Accordion.Header>
          <Accordion.Body>
            <p><strong>Qualified</strong> readings were checked by the Environment Agency (Hydrology quality “Good”), and some were edited by the provider after they were first published. History therefore shows today&apos;s official values, which may differ from what was displayed live at the time.</p>
            <p><strong>Provisional</strong> readings are live telemetry or values not yet checked (dashed line). They are summarised but never used to define what is typical.</p>
            <p className="mb-0"><strong>Excluded</strong> readings (marked suspect, missing or with an unrecognised quality) are treated as gaps. Seasonal comparisons use only completed months whose qualified readings support at least 90% of the month, and need at least 5 such years.</p>
          </Accordion.Body>
        </Accordion.Item>
      </Accordion>
    </section>
  );
}

EvidencePanel.propTypes = {
  summary: PropTypes.object,
  coverage: PropTypes.string,
  readAt: PropTypes.string,
  readingsLabel: PropTypes.string,
};
