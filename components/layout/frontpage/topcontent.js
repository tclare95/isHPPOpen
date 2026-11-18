import { useState, useEffect, useContext } from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Button from "react-bootstrap/Button";
import OpenTitle from "../../functional/opentitle";
import useFetch from "../../../libs/useFetch";
import VomitFactor from "../../functional/vomitfactor";
import WeirLevels from "../../functional/weirlevels";
import ForecastChartWithConfidence from "../../functional/forecastChart";
import Spinner from "react-bootstrap/Spinner";
import GraphContext from "../../../libs/context/graphcontrol";
import Link from "next/link";
import PropTypes from "prop-types";
import { SWR_15_MINUTES } from "../../../libs/dataFreshness";
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

function describeReadingAge(reading, freshness, currentTime) {
  if (!reading) {
    return "The latest river level reading is unavailable right now.";
  }

  const age = `The river level reading is ${formatReadingAge(reading.observedAt, currentTime)} old`;
  return freshness === "stale" ? `${age}, so it may be out of date.` : `${age}.`;
}

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
    return <Spinner animation="border" role="status" />;
  }

  if (hasOperationalError) {
    return <p>Forecast and level data are unavailable right now.</p>;
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
          <h3>
            The River Level is {riverLevelDisplay}
          </h3>
          <a href="#waterquality">
            {!reading ? null : (
              <VomitFactor assessment={waterQualityAssessment?.current ?? null} isPending={assessmentPending} />
            )}
          </a>
        </Col>
      </Row>
      <Row className="justify-content-center">
        {isPending ? <Spinner animation="border" role="status" /> : null}
        {reading ? <WeirLevels currentLevel={reading.level} /> : null}
      </Row>
      <Row className="justify-content-center ">
        <p>
          {isPending ? null : `${describeReadingAge(reading, freshness, currentTime)} `}
          Generally HPP white water course is open below 2.2 meters
          on the gauge. Check the graph below for trends and a 36 hour river
          level forecast.
        </p>
        <p>
          Need some new paddling kit or forgotten something? Check out{" "}
          <a
            href="https://www.flowkayaks.co.uk/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Flow Kayaks
          </a>{" "}
          who are just over the river.
        </p>
        <p>
          Check below the graph for details about the availability of slots
          during sessions, and events that may affect the status of the course.
        </p>
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
        </Col>
      </Row>
    </div>
  );
}

TopContent.propTypes = {
  cachedEvents: PropTypes.array,
};
