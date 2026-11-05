import { Row, ProgressBar, Alert, Spinner } from "react-bootstrap";
import Link from "next/link";
import SourceHealthBadge from "../../functional/sourceHealthBadge";
import useFetch from "../../../libs/useFetch";
import { SWR_15_MINUTES } from "../../../libs/dataFreshness";
import HistoricalConditions from "./historicalConditions";

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

  if (statusPending || statusData === undefined || statusData === null) {
    return (
      <div className="mt-4 text-white text-center" id="stats" aria-live="polite">
        <Spinner animation="border" role="status" size="sm" className="mr-2" />
        <span>Loading HPP closure stats…</span>
      </div>
    );
  }

  if (statusError) {
    return (
      <div className="mt-4" id="stats">
        <Alert variant="danger" className="text-center mb-0">
          We couldn&apos;t load closure stats right now. Please try again shortly.
        </Alert>
      </div>
    );
  }

  const hasStatus = typeof statusData.currentStatus === "boolean";
  let currentStatus = "Unknown";

  if (hasStatus) {
    if (statusData.currentStatus === true) {
      currentStatus = "Open";
    } else {
      currentStatus = "Closed";
    }
  }
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

  const closureWindows = [
    { days: 7, closures: statusData.closuresInLast7Days ?? 0 },
    { days: 28, closures: statusData.closuresInLast28Days ?? 0 },
    { days: 182, closures: statusData.closuresInLast182Days ?? 0 },
  ];

  return (
    <div
      className="mt-4 text-white text-center justify-content-center"
      id="stats"
    >
      <Row className="justify-content-center">
        <h2>HPP Closure Stats</h2>
        <p>
          Current status: <span className="font-weight-bold">{currentStatus}</span><SourceHealthBadge health={statusData.health} />
        </p>
        <p><Link className="text-info" href="/alerts">Email me when HPP opens or closes</Link></p>
        {statusData.isEmpty && (
          <Alert variant="info" className="text-center mb-0">
            No historical closure records are available yet.
          </Alert>
        )}
        <p>Note: this only accounts for river level - not any other closures</p>
      </Row>
      <Row className="justify-content-center">
        {statusData.currentStatus === false && !statusData.isEmpty && (
          <p>
            HPP was last open on: {formatDisplayDate(lastOpenDate)}
            {lastOpenAgoText}
          </p>
        )}
      </Row>
      <Row className="justify-content-center mt-4">
        <div className="text-center w-100">
          <p className="font-weight-bold mb-1">HPP has been closed for:</p>
          <p className="small mb-4">From HPP&apos;s recorded status changes.</p>
          {closureWindows.map(({ days, closures }) => {
            const roundedClosures = Math.max(0, Math.min(days, Math.round(closures)));
            const percentage = toPercent(roundedClosures, days);

            return (
            <Row className="justify-content-center mb-3" key={days}>
              <div className="text-center w-100">
                <p>
                  <span className="font-weight-bold">{roundedClosures}</span>
                  {` of the last ${days} days (`}
                  <span className="font-weight-bold">{`${percentage}%`}</span>
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
      <HistoricalConditions />
    </div>
  );
}
