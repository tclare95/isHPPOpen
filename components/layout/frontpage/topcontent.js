import { useState, useEffect, useContext } from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Button from "react-bootstrap/Button";
import OpenTitle from "../../functional/opentitle";
import useFetch from "../../../libs/useFetch";
import VomitFactor from "../../functional/vomitfactor";
import WeirLevels from "../../functional/weirlevels";
import ForecastChartWithConfidence from "../../functional/forecastChart";
import GraphContext from "../../../libs/context/graphcontrol";
import Link from "next/link";
import PropTypes from "prop-types";
import { SWR_15_MINUTES } from "../../../libs/dataFreshness";
import StatusMessage from "../../layout/site/StatusMessage";
import {
  formatLevelMetres,
  formatReadingAge,
  getLatestLevelReading,
  getLevelFreshness,
} from "../../../libs/hpp/hppHomeStatus";

// A loading, failed or empty level read is never shown as a number (no "0.00 m").
function formatRiverLevel(reading, isPending) {
  if (isPending) {
    return "loading";
  }

  if (!reading) {
    return "unavailable";
  }

  return formatLevelMetres(reading.level);
}

function ReadingAge({ reading, freshness, currentTime }) {
  if (!reading) {
    return <StatusMessage state="unavailable" className="d-inline-block mb-2">The latest river level reading is unavailable right now.</StatusMessage>;
  }

  const age = `The river level reading is ${formatReadingAge(reading.observedAt, currentTime)} old`;
  return freshness === "stale"
    ? <StatusMessage state="stale" className="d-inline-block mb-2">{`${age}, so it may be out of date.`}</StatusMessage>
    : <p className="history-muted small mb-2">{`${age}.`}</p>;
}

ReadingAge.propTypes = {
  reading: PropTypes.shape({ level: PropTypes.number, observedAt: PropTypes.instanceOf(Date) }),
  freshness: PropTypes.string,
  currentTime: PropTypes.instanceOf(Date).isRequired,
};

function renderForecastContent({
  isPending,
  forecastPending,
  hasOperationalError,
  lowerBound,
  upperBound,
  levelReadings,
  s3Forecast,
  accuracyData,
}) {
  if (isPending || forecastPending) {
    return <StatusMessage state="loading">Loading the river level chart…</StatusMessage>;
  }

  if (hasOperationalError) {
    return <StatusMessage state="unavailable">Forecast and level data are unavailable right now.</StatusMessage>;
  }

  return (
    <ForecastChartWithConfidence
      lowerBound={lowerBound}
      upperBound={upperBound}
      graphData={levelReadings}
      graphForeCastData={s3Forecast?.forecast_data || []}
      accuracyData={accuracyData?.accuracy_data || []}
      showConfidence
    />
  );
}

export default function TopContent(props) {
  const { data: levelData, error: levelError, isPending } = useFetch("/api/levels", SWR_15_MINUTES);
  const {
    data: s3Forecast,
    error: forecastError,
    isPending: forecastPending,
  } = useFetch("/api/s3forecast", SWR_15_MINUTES);
  const { data: accuracyData, error: accuracyError } = useFetch("/api/forecastaccuracy", SWR_15_MINUTES);
  // The same server-side assessment as /waterquality (RDP_WQ_ASSESSMENT); never computed in the browser.
  const { data: waterQualityAssessment, isPending: assessmentPending } = useFetch("/api/waterquality/assessment", SWR_15_MINUTES);

  const levelReadings = levelData?.level_data ?? [];
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const reading = isPending ? null : getLatestLevelReading(levelData);
  const freshness = getLevelFreshness(levelData, reading, currentTime);
  const { lowerBound, upperBound, updateBounds } = useContext(GraphContext);
  const hasOperationalError = Boolean(levelError || forecastError || accuracyError);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60 * 1000);

    return () => clearInterval(timer);
  }, []);

  const riverLevelDisplay = formatRiverLevel(reading, isPending);

  return (
    <div className="text-white text-center">
      <Row className="justify-content-center">
        <Col className="text-center">
          <h1>Is HPP Open?</h1>
          <OpenTitle cachedEvents={props.cachedEvents} />
        </Col>
      </Row>
      <Row className="align-items-center">
        <Col>
          <h2 className="h3">
            The river level is {riverLevelDisplay}
          </h2>
          <a href="#waterquality">
            {!reading ? null : (
              <VomitFactor assessment={waterQualityAssessment?.current ?? null} isPending={assessmentPending} />
            )}
          </a>
        </Col>
      </Row>
      <Row className="justify-content-center">
        {isPending ? <StatusMessage state="loading" className="d-inline-block w-auto">Loading the latest river level…</StatusMessage> : null}
        {reading ? <WeirLevels currentLevel={reading.level} /> : null}
      </Row>
      <Row className="justify-content-center">
        <Col xs={12}>
          {isPending ? null : <ReadingAge reading={reading} freshness={freshness} currentTime={currentTime} />}
          <p>
            HPP is generally open when the gauge is below 2.2 m. The chart shows recent levels and a 36-hour forecast.
          </p>
        </Col>
      </Row>
      <Row className="justify-content-center text-white mt-2" id="chart">
        <Col className="justify-content-center text-center">
          {renderForecastContent({
            isPending,
            forecastPending,
            hasOperationalError,
            lowerBound,
            upperBound,
            levelReadings,
            s3Forecast,
            accuracyData,
          })}
          <p className="mt-2 small">
            <Link href="/forecastinfo">About this forecast</Link>
          </p>
          <Button
            className=" mt-2"
            data-lowerbound="0.98"
            data-upperbound="2.2"
            onClick={updateBounds}
          >
            Reset graph to HPP guidelines
          </Button>
          <p className="history-muted small mt-3">
            Need kit? <a href="https://www.flowkayaks.co.uk/" target="_blank" rel="noopener noreferrer">Flow Kayaks</a> is just over the river.
          </p>
        </Col>
      </Row>
    </div>
  );
}

TopContent.propTypes = {
  cachedEvents: PropTypes.array,
};
