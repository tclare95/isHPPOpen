import { Row, ProgressBar } from "react-bootstrap";
import StatusMessage from "../../layout/site/StatusMessage";
import Link from "next/link";
import SourceHealthBadge from "../../functional/sourceHealthBadge";
import useFetch from "../../../libs/useFetch";
import { SWR_15_MINUTES } from "../../../libs/dataFreshness";
import HistoricalConditions from "./historicalConditions";
import { getRecordedHppStatus } from "../../../libs/hpp/hppHomeStatus";

const toPercent = (value, total) => {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  const raw = Math.round((value / total) * 100);
  return Math.max(0, Math.min(100, raw));
};

const formatDisplayDate = (dateInput) => {
  if (!dateInput) {
    return "Unknown";
  }

  const parsedDate = new Date(dateInput);
  if (Number.isNaN(parsedDate.getTime())) {
    return "Unknown";
  }

  return parsedDate.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getDaysAgo = (dateInput) => {
  if (!dateInput) {
    return null;
  }

  const parsedDate = new Date(dateInput);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  const today = new Date();
  const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const utcDate = Date.UTC(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());

  return Math.max(0, Math.floor((utcToday - utcDate) / (1000 * 60 * 60 * 24)));
};

export default function StatusArea() {
  const {
    data: statusData,
    error: statusError,
    isPending: statusPending,
  } = useFetch("/api/hppstatus", SWR_15_MINUTES);

  // Checked before the pending state: a failed first request has no data and must not spin forever.
  if (statusError && !statusData) {
    return (
      <div id="stats">
        <StatusMessage state="error" className="mb-3">We couldn&apos;t load closure stats right now. Please try again shortly.</StatusMessage>
        <HistoricalConditions />
      </div>
    );
  }

  if (statusPending || !statusData) {
    return (
      <div className="text-white mb-3" id="stats">
        <StatusMessage state="loading">Loading HPP closure stats…</StatusMessage>
      </div>
    );
  }

  const recordedStatus = getRecordedHppStatus(statusData);
  // The route's fallback payload (status store unreachable) is not an empty history.
  if (recordedStatus === "unavailable") {
    return (
      <div className="text-white" id="stats">
        <StatusMessage state="unavailable" className="mb-3">HPP status and closure stats are unavailable right now. Please try again shortly.</StatusMessage>
        <HistoricalConditions />
      </div>
    );
  }

  const currentStatus = { open: "Open", closed: "Closed" }[recordedStatus] ?? "Unknown";
  const lastOpenDate = statusData.lastChangedAt ?? statusData.lastChangedDate;
  const lastOpenDaysAgo = getDaysAgo(lastOpenDate);
  let lastOpenAgoText = "";
  if (lastOpenDaysAgo !== null) {
    let dayLabel = "days";
    if (lastOpenDaysAgo === 1) {
      dayLabel = "day";
    }
    lastOpenAgoText = ` (${lastOpenDaysAgo} ${dayLabel} ago)`;
  }

  // No records, or a missing count, is not "closed for 0 days".
  const closureWindows = statusData.isEmpty ? [] : [
    { days: 7, closures: statusData.closuresInLast7Days },
    { days: 28, closures: statusData.closuresInLast28Days },
    { days: 182, closures: statusData.closuresInLast182Days },
  ].filter(({ closures }) => Number.isFinite(closures));

  return (
    <>
    <section className="history-panel text-white text-center" id="stats" aria-labelledby="stats-heading">
      <Row className="justify-content-center">
        <h2 id="stats-heading" className="h4">HPP closure stats</h2>
        <p>
          Current status: <span className="fw-bold">{currentStatus}</span><SourceHealthBadge health={statusData.health} />
        </p>
        <p><Link className="text-info" href="/alerts">Email me when HPP opens or closes</Link></p>
        {statusData.isEmpty && (
          <StatusMessage state="empty" className="mb-3">No historical closure records are available yet.</StatusMessage>
        )}
        <p className="history-muted small">Counts river-level closures only.</p>
      </Row>
      <Row className="justify-content-center">
        {recordedStatus === "closed" && (
          <p>
            HPP was last open on: {formatDisplayDate(lastOpenDate)}
            {lastOpenAgoText}
          </p>
        )}
      </Row>
      {closureWindows.length > 0 && (
        <Row className="justify-content-center mt-4">
          <div className="text-center w-100">
            <p className="fw-bold mb-1">HPP has been closed for:</p>
            <p className="small mb-4">From HPP&apos;s recorded status changes.</p>
            {closureWindows.map(({ days, closures }) => {
              const roundedClosures = Math.max(0, Math.min(days, Math.round(closures)));
              const percentage = toPercent(roundedClosures, days);

              return (
              <Row className="justify-content-center mb-3" key={days}>
                <div className="text-center w-100">
                  <p>
                    <span className="fw-bold">{roundedClosures}</span>
                    {` of the last ${days} days (`}
                    <span className="fw-bold">{`${percentage}%`}</span>
                    {`)`}
                  </p>
                  <ProgressBar
                    variant="danger"
                    now={percentage}
                    className="w-50 mx-auto"
                    label={`${percentage}%`}
                    aria-label={`HPP closed ${percentage}% of the last ${days} days`}
                  />
                </div>
              </Row>
              );
            })}
          </div>
        </Row>
      )}
    </section>
    <HistoricalConditions />
    </>
  );
}
