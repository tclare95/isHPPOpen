"use client";

import Link from "next/link";
import Accordion from "react-bootstrap/Accordion";
import Spinner from "react-bootstrap/Spinner";
import ShareBars from "../../history/ShareBars";
import useFetch from "../../../libs/useFetch";
import { COLWICK_HISTORY, SUPPORT_TIERS } from "../../../libs/history/config";
import { describeSupport, describeYears, shortMonthName } from "../../../libs/history/present";

const HISTORY_SWR = { revalidateOnFocus: false, refreshInterval: 0, shouldRetryOnError: false };
const threshold = `${COLWICK_HISTORY.thresholdMetres.toFixed(1)} m`;

// Replaces the former hard-coded 2012–2026 closure tables (reconciled in
// docs/HISTORICAL_RIVER_CONDITIONS.md) with measured, level-derived figures from RDP.
// Loads independently: a failure here never affects the live status above it.
export default function HistoricalConditions() {
  const { data, error, isPending } = useFetch("/api/history/colwick/overview", HISTORY_SWR);

  let content;
  if (error) {
    content = <p className="history-muted mb-0">Historical river-level statistics are unavailable right now. Live status and alerts are not affected.</p>;
  } else if (isPending) {
    content = <p className="mb-0" aria-live="polite"><Spinner animation="border" size="sm" className="me-2" />Loading historical river-level statistics…</p>;
  } else {
    const seasonal = data.seasonal.filter((item) => item.available);
    const years = [...new Set(seasonal.flatMap((item) => item.referenceYears))];
    content = (
      <>
        <p className="history-muted small">Share of observed time the Colwick river level was at or above HPP&apos;s {threshold} level rule. These describe river levels only: they are not a record of when HPP actually closed.</p>
        <Accordion className="history-accordion">
          <Accordion.Item eventKey="months">
            <Accordion.Header>By month ({describeYears(years)})</Accordion.Header>
            <Accordion.Body>
              <ShareBars caption={`Share of supported time at or above ${threshold} by calendar month, ${describeYears(years)}`}
                rows={data.seasonal.map((item) => ({
                  key: item.month, label: shortMonthName(item.month),
                  summary: { aboveShare: item.aboveShare, supportRatio: item.available ? 1 : 0, support: item.available ? SUPPORT_TIERS.FULL : SUPPORT_TIERS.NONE },
                  detail: item.available ? `${item.referenceYears.length} years` : "Not enough data",
                }))} />
            </Accordion.Body>
          </Accordion.Item>
          <Accordion.Item eventKey="years">
            <Accordion.Header>Year by year</Accordion.Header>
            <Accordion.Body>
              <ShareBars caption={`Share of supported time at or above ${threshold} by year`}
                rows={data.yearly.map((item) => ({
                  key: item.year, label: String(item.year), summary: item.summary,
                  detail: !item.summary ? "Could not be read"
                    : describeSupport(item.summary).showShare
                      ? `${item.summary.daysAtOrAbove} days reached ${threshold}${item.summary.support !== SUPPORT_TIERS.FULL || item.inProgress ? " · partial" : ""}`
                      : item.summary.support === SUPPORT_TIERS.NONE ? "No observations" : "Limited data",
                }))} />
            </Accordion.Body>
          </Accordion.Item>
        </Accordion>
      </>
    );
  }

  return (
    <section className="history-panel history-home mt-4" aria-labelledby="historical-conditions">
      <div className="d-flex flex-wrap justify-content-between align-items-baseline gap-2 mb-2">
        <h3 id="historical-conditions" className="h5 mb-0">Historical river-level conditions</h3>
        <Link href="/history" className="text-info">Explore river history →</Link>
      </div>
      {content}
    </section>
  );
}
