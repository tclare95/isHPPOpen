import { useEffect, useState } from "react";
import Link from "next/link";
import PropTypes from "prop-types";
import useFetch from "../../../libs/useFetch";
import { SWR_15_MINUTES, SWR_EDITORIAL } from "../../../libs/dataFreshness";
import StatusMessage from "../site/StatusMessage";
import {
  HPP_THRESHOLD_METRES,
  formatLevelMetres,
  formatReadingAge,
  getLatestLevelReading,
  getLevelFreshness,
  getRecordedHppStatus,
  isClosedForEventOn,
  readingDisagreesWithStatus,
} from "../../../libs/hpp/hppHomeStatus";
import {
  describeGuideLevel,
  describeNearbyGauges,
  describeNextDayForecast,
  describeTrend,
  formatClockTime,
  formatTrend,
  levelSeriesFrom,
  readingNoticeState,
} from "../../../libs/currentConditions";

// The clock is read after mount, so the server and browser render the same first frame.
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

const formatDay = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" })
    : null;
};

const formatMetres = (value) => `${value.toFixed(2)} m`;

function Tile({ id, title, children }) {
  return (
    <article className="conditions-tile" aria-labelledby={id}>
      <h3 id={id} className="conditions-tile__title">{title}</h3>
      {children}
    </article>
  );
}

Tile.propTypes = { id: PropTypes.string.isRequired, title: PropTypes.node.isRequired, children: PropTypes.node };

// When a reading was observed, as visibly as the reading itself. The age is always shown; an old one is a warning.
function ObservedAt({ observedAt, now, prefix = "Observed" }) {
  const text = `${prefix} ${formatClockTime(observedAt, now)} (${formatReadingAge(observedAt, now)} ago)`;
  return readingNoticeState(observedAt, now) === "stale"
    ? <StatusMessage state="stale" className="conditions-age mt-1">{`${text}, so it may be out of date.`}</StatusMessage>
    : <p className="conditions-age mb-1">{text}</p>;
}

ObservedAt.propTypes = {
  observedAt: PropTypes.instanceOf(Date).isRequired,
  now: PropTypes.instanceOf(Date).isRequired,
  prefix: PropTypes.string,
};

// The authoritative recorded status (with event restrictions first), exactly as the title above decides it.
function HppStatusTile({ statusData, statusPending, eventClosed, eventsUnchecked, now }) {
  let body;
  if (eventClosed) {
    body = (
      <>
        <p className="conditions-value text-danger mb-1">Closed for an event</p>
        <p className="conditions-detail mb-0">An event on the course today restricts access.</p>
      </>
    );
  } else if (!now || statusPending) {
    body = <StatusMessage state="loading">Loading HPP status…</StatusMessage>;
  } else {
    const recorded = statusData ? getRecordedHppStatus(statusData) : "unavailable";
    if (recorded === "unavailable") {
      body = <StatusMessage state="unavailable">HPP&apos;s recorded status is unavailable right now. It is not inferred from the river level.</StatusMessage>;
    } else if (recorded === "unknown") {
      body = <StatusMessage state="unavailable">No recorded HPP status is available, so it is unknown.</StatusMessage>;
    } else {
      const since = formatDay(statusData.lastChangedAt ?? statusData.lastChangedDate);
      body = (
        <>
          <p className={`conditions-value mb-1 ${recorded === "open" ? "text-success" : "text-danger"}`}>
            {recorded === "open" ? "Open" : "Closed (water levels)"}
          </p>
          <p className="conditions-detail mb-1">
            {since ? `Recorded by the HPP status check since ${since}.` : "Recorded by the HPP status check."}
          </p>
        </>
      );
    }
  }

  return (
    <Tile id="conditions-hpp" title="HPP status">
      {body}
      {eventsUnchecked && !eventClosed ? (
        <p className="conditions-detail mb-0">Today&apos;s events could not be checked, so the course may still be closed for an event.</p>
      ) : null}
    </Tile>
  );
}

HppStatusTile.propTypes = {
  statusData: PropTypes.object,
  statusPending: PropTypes.bool,
  eventClosed: PropTypes.bool,
  eventsUnchecked: PropTypes.bool,
  now: PropTypes.instanceOf(Date),
};

function ColwickTile({ levelData, levelPending, recordedStatus, now }) {
  let body;
  if (levelPending || !now) {
    body = <StatusMessage state="loading">Loading the latest Colwick level…</StatusMessage>;
  } else {
    const reading = getLatestLevelReading(levelData);
    if (!reading) {
      body = <StatusMessage state="unavailable">The latest Colwick level is unavailable right now.</StatusMessage>;
    } else {
      const trend = describeTrend(levelSeriesFrom(levelData));
      const freshness = getLevelFreshness(levelData, reading, now);
      const guide = describeGuideLevel(reading.level);
      body = (
        <>
          <p className="conditions-value mb-1">{formatLevelMetres(reading.level)}</p>
          <ObservedAt observedAt={reading.observedAt} now={now} />
          <p className="conditions-detail mb-1" data-trend={trend.state}>{formatTrend(trend)}</p>
          <p className="conditions-detail mb-0">
            {guide === "below" ? "Below" : "At or above"} HPP&apos;s {HPP_THRESHOLD_METRES} m guide level.
          </p>
          {readingDisagreesWithStatus(recordedStatus, reading, freshness) ? (
            <StatusMessage state="stale" className="mt-2">
              {`This reading is ${guide === "below" ? "below" : "at or above"} ${HPP_THRESHOLD_METRES} m but HPP's recorded status is still ${recordedStatus}. The recorded status stands until the next status check records a change.`}
            </StatusMessage>
          ) : null}
        </>
      );
    }
  }

  return <Tile id="conditions-colwick" title="Colwick level now">{body}</Tile>;
}

ColwickTile.propTypes = {
  levelData: PropTypes.object,
  levelPending: PropTypes.bool,
  recordedStatus: PropTypes.string,
  now: PropTypes.instanceOf(Date),
};

const formatRange = (point) => (
  point.rangeLow === null || point.rangeHigh === null
    ? null
    : `${formatMetres(Math.max(0, point.rangeLow))}–${formatMetres(point.rangeHigh)}`
);

const DIRECTION_TEXT = {
  rise: "Predicted to rise",
  fall: "Predicted to fall",
  steady: "Predicted to stay about the same",
};

const GUIDE_TEXT = {
  "predicted-at-or-above": `The forecast predicts Colwick reaching ${HPP_THRESHOLD_METRES} m. That is a prediction, not an announced closure.`,
  "range-reaches": `The upper end of the indicative range reaches ${HPP_THRESHOLD_METRES} m. That is a possibility, not an announced closure.`,
  "predicted-below": `The forecast predicts Colwick falling below ${HPP_THRESHOLD_METRES} m. That is a prediction: HPP reopens only when the status check records it.`,
};

function ForecastTile({ forecastData, forecastPending, accuracyData, accuracyPending, recordedStatus, now }) {
  let body;
  if (forecastPending || !now) {
    body = <StatusMessage state="loading">Loading the forecast…</StatusMessage>;
  } else {
    const forecast = describeNextDayForecast(forecastData, accuracyData?.accuracy_data, now, { recordedStatus });
    if (forecast.state === "unavailable") {
      body = <StatusMessage state="unavailable">The forecast is unavailable right now.</StatusMessage>;
    } else if (forecast.state === "no-coverage") {
      body = <StatusMessage state="stale">The latest forecast does not cover the next 24 hours, so there is no prediction to show.</StatusMessage>;
    } else {
      const extreme = forecast.direction === "fall" ? forecast.low : forecast.peak;
      const range = formatRange(extreme);
      body = (
        <>
          <p className="conditions-value conditions-value--small mb-1">{DIRECTION_TEXT[forecast.direction]}</p>
          <p className="conditions-detail mb-1">
            {`${forecast.direction === "fall" ? "Lowest" : "Highest"} about ${formatMetres(extreme.value)} around ${formatClockTime(extreme.at, now)}`}
            {range ? ` (indicative range ${range}).` : "."}
          </p>
          {range ? null : (
            <p className="conditions-detail mb-1">
              {accuracyPending ? "Loading the indicative range…" : "The indicative range is unavailable right now."}
            </p>
          )}
          {forecast.guide ? <p className="conditions-detail conditions-note mb-1">{GUIDE_TEXT[forecast.guide]}</p> : null}
          {forecast.notice ? (
            <StatusMessage state="stale" className="mt-1">{forecast.notice}</StatusMessage>
          ) : forecast.madeAt ? (
            <p className="conditions-age mb-1">{`Forecast made ${formatClockTime(forecast.madeAt, now)} (${formatReadingAge(forecast.madeAt, now)} ago)`}</p>
          ) : null}
        </>
      );
    }
  }

  return (
    <Tile id="conditions-forecast" title="Next 24 hours (model forecast)">
      {body}
      <p className="conditions-detail mb-0">A model prediction for Colwick, not an HPP decision.</p>
    </Tile>
  );
}

ForecastTile.propTypes = {
  forecastData: PropTypes.object,
  forecastPending: PropTypes.bool,
  accuracyData: PropTypes.object,
  accuracyPending: PropTypes.bool,
  recordedStatus: PropTypes.string,
  now: PropTypes.instanceOf(Date),
};

function GaugesTile({ trentData, trentError, trentPending, now }) {
  let body;
  if (trentPending || !now) {
    body = <StatusMessage state="loading">Loading nearby gauges…</StatusMessage>;
  } else if (!trentData?.stations?.length) {
    body = <StatusMessage state="unavailable">Nearby gauge readings are unavailable right now.</StatusMessage>;
  } else {
    body = (
      <>
        {trentError ? (
          <p className="conditions-detail mb-1">These readings could not be refreshed just now; check each reading&apos;s age.</p>
        ) : null}
        <ul className="conditions-gauges list-unstyled mb-1">
          {describeNearbyGauges(trentData).map((gauge) => (
            <li key={gauge.key} className="conditions-gauge" data-gauge={gauge.key}>
              <div className="conditions-gauge__head">
                <span className="conditions-gauge__name">{gauge.name}</span>
                <span className="conditions-gauge__value">
                  {gauge.latest
                    ? `${gauge.measureType === "flow" ? gauge.latest.value.toFixed(1) : gauge.latest.value.toFixed(2)} ${gauge.unit}`
                    : "No recent reading"}
                </span>
              </div>
              {gauge.latest ? (
                <>
                  <p className="conditions-detail mb-0">
                    {gauge.measureType === "flow" ? "Flow" : `Level ${gauge.reference}`}. {formatTrend(gauge.trend, gauge.measureType)}.
                  </p>
                  <ObservedAt observedAt={gauge.latest.at} now={now} />
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <Tile id="conditions-gauges" title="Nearby and upstream gauges">
      {body}
      <p className="conditions-detail mb-0">
        Each gauge measures from its own datum, so compare how they are moving, not their heights.
      </p>
    </Tile>
  );
}

GaugesTile.propTypes = {
  trentData: PropTypes.object,
  trentError: PropTypes.any,
  trentPending: PropTypes.bool,
  now: PropTypes.instanceOf(Date),
};

const DETAIL_LINKS = [
  { href: "/trentweirs", label: "Trent gauges" },
  { href: "/forecastinfo", label: "Forecast detail" },
  { href: "/history", label: "River history" },
  { href: "/trentweirs#rainfall", label: "Recent rainfall" },
  { href: "/waterquality", label: "Water quality" },
];

/**
 * "Conditions now and next 24 hours": the recorded HPP status, the latest Colwick level and its recent movement,
 * the predictor forecast for the coming day and nearby gauges. Each part loads and fails on its own.
 */
export default function CurrentConditions({ cachedEvents = [], eventsUnavailable = false }) {
  const { data: statusData, isPending: statusPending } = useFetch("/api/hppstatus", SWR_15_MINUTES);
  const { data: levelData, isPending: levelPending } = useFetch("/api/levels", SWR_15_MINUTES);
  const { data: forecastData, isPending: forecastPending } = useFetch("/api/s3forecast", SWR_15_MINUTES);
  const { data: accuracyData, isPending: accuracyPending } = useFetch("/api/forecastaccuracy", SWR_15_MINUTES);
  const { data: trentData, error: trentError, isPending: trentPending } = useFetch("/api/trentweirs", SWR_15_MINUTES);
  // The same key as the title, so SWR shares one request when the cached homepage could not read events.
  const { data: liveEvents } = useFetch(eventsUnavailable ? "/api/events?limit=5" : null, SWR_EDITORIAL);
  const now = useClientNow();

  const events = eventsUnavailable ? liveEvents?.eventsArray ?? [] : cachedEvents;
  const eventsUnchecked = eventsUnavailable && !Array.isArray(liveEvents?.eventsArray);
  const eventClosed = Boolean(now) && isClosedForEventOn(events, now);
  const recordedStatus = statusPending ? null : statusData ? getRecordedHppStatus(statusData) : "unavailable";

  return (
    <section className="history-panel conditions text-white text-start" id="conditions" aria-labelledby="conditions-heading">
      <h2 id="conditions-heading" className="h4 mb-3">Conditions now and next 24 hours</h2>
      <div className="conditions-grid">
        <HppStatusTile
          statusData={statusData}
          statusPending={statusPending}
          eventClosed={eventClosed}
          eventsUnchecked={eventsUnchecked}
          now={now}
        />
        <ColwickTile levelData={levelData} levelPending={levelPending} recordedStatus={recordedStatus} now={now} />
        <ForecastTile
          forecastData={forecastData}
          forecastPending={forecastPending}
          accuracyData={accuracyData}
          accuracyPending={accuracyPending}
          recordedStatus={recordedStatus}
          now={now}
        />
        <GaugesTile trentData={trentData} trentError={trentError} trentPending={trentPending} now={now} />
      </div>
      <nav aria-label="River condition details" className="conditions-links mt-3">
        {DETAIL_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="conditions-link">{link.label}</Link>
        ))}
      </nav>
    </section>
  );
}

CurrentConditions.propTypes = {
  cachedEvents: PropTypes.arrayOf(
    PropTypes.shape({
      event_start_date: PropTypes.string,
      event_end_date: PropTypes.string,
    })
  ),
  eventsUnavailable: PropTypes.bool,
};
