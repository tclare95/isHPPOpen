import { useEffect, useState } from "react";
import Link from "next/link";
import useFetch from "../../libs/useFetch";
import PropTypes from "prop-types";
import { SWR_15_MINUTES } from "../../libs/dataFreshness";
import {
  HPP_THRESHOLD_METRES,
  formatLevelMetres,
  formatReadingAge,
  getLatestLevelReading,
  getLevelFreshness,
  getRecordedHppStatus,
  isClosedForEventOn,
  readingDisagreesWithStatus,
} from "../../libs/hpp/hppHomeStatus";

const getDaysSince = (dateInput, now) => {
  const parsedDate = dateInput ? new Date(dateInput) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  const utcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const utcDate = Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate());

  return Math.max(0, Math.floor((utcToday - utcDate) / (1000 * 60 * 60 * 24)));
};

// The clock is read after mount, so the server and browser render the same
// first frame even when their dates differ.
function useClientNow() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 60 * 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  return now;
}

function StatusHeading({ children }) {
  return <h2 className="font-weight-bold m-3">{children}</h2>;
}

StatusHeading.propTypes = { children: PropTypes.node };

function EvidenceNote({ recordedStatus, reading, freshness, now }) {
  if (reading && freshness === "stale") {
    return (
      <p className="small fst-italic mb-1">
        This is the last recorded status. The latest river reading is {formatReadingAge(reading.observedAt, now)} old,
        so it may be out of date.
      </p>
    );
  }

  if (readingDisagreesWithStatus(recordedStatus, reading, freshness)) {
    const side = recordedStatus === "open" ? "at or above" : "below";
    return (
      <p className="small fst-italic mb-1">
        The latest reading ({formatLevelMetres(reading.level)}) is {side} {HPP_THRESHOLD_METRES} m. The status changes
        when the next 15-minute status check records it.
      </p>
    );
  }

  return null;
}

EvidenceNote.propTypes = {
  recordedStatus: PropTypes.string,
  reading: PropTypes.shape({ level: PropTypes.number, observedAt: PropTypes.instanceOf(Date) }),
  freshness: PropTypes.string,
  now: PropTypes.instanceOf(Date),
};

// Shows the authoritative recorded HPP status from /api/hppstatus (#89).
// Event restrictions take precedence. The level reading only flags stale or
// not-yet-recorded evidence; it never decides open or closed here.
export default function OpenTitle({ cachedEvents = [] }) {
  const { data: levelData } = useFetch("/api/levels", SWR_15_MINUTES);
  const { data: statusData, isPending: statusPending } = useFetch("/api/hppstatus", SWR_15_MINUTES);
  const now = useClientNow();

  if (now && isClosedForEventOn(cachedEvents, now)) {
    return (
      <StatusHeading>
        HPP is <span className="text-danger">Closed</span> for an event
      </StatusHeading>
    );
  }

  if (!now || statusPending) {
    return (
      <div role="status" aria-live="polite">
        Loading HPP status…
      </div>
    );
  }

  // A failed request, or the route's fallback payload, is unavailable: not open, closed or unknown.
  const recordedStatus = statusData ? getRecordedHppStatus(statusData) : "unavailable";

  if (recordedStatus === "unavailable") {
    return (
      <StatusHeading>
        HPP status is <span className="text-warning">currently unavailable</span>
      </StatusHeading>
    );
  }

  if (recordedStatus === "unknown") {
    return (
      <StatusHeading>
        HPP status is <span className="text-warning">Unknown</span>
      </StatusHeading>
    );
  }

  const reading = getLatestLevelReading(levelData);
  const freshness = getLevelFreshness(levelData, reading, now);
  const note = <EvidenceNote recordedStatus={recordedStatus} reading={reading} freshness={freshness} now={now} />;

  if (recordedStatus === "closed") {
    const daysClosed = getDaysSince(statusData.effectiveLastOpenAt ?? statusData.effectiveLastOpenDate, now);
    return (
      <>
        <StatusHeading>
          HPP is <span className="text-danger">Closed</span> because of water levels
        </StatusHeading>
        {daysClosed === null ? null : (
          <h6 className="font-weight-lighter fst-italic">
            HPP has been closed for {daysClosed} {daysClosed === 1 ? "day" : "days"} due to high water levels.{" "}
            <Link href="#stats">(tap to see more)</Link>
          </h6>
        )}
        {note}
      </>
    );
  }

  return (
    <>
      <StatusHeading>
        HPP is (probably) <span className="text-success">Open</span>
      </StatusHeading>
      {note}
    </>
  );
}

OpenTitle.propTypes = {
  cachedEvents: PropTypes.arrayOf(
    PropTypes.shape({
      event_start_date: PropTypes.string,
      event_end_date: PropTypes.string,
    })
  ),
};
