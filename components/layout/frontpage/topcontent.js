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

function formatRiverLevel(recentLevel, isPending, levelError) {
  if (isPending) {
    return { value: "0.00", unit: "M" };
  }

  if (levelError) {
    return { value: "unavailable", unit: "" };
  }

  return {
    value: (Math.round((recentLevel + Number.EPSILON) * 100) / 100).toFixed(2),
    unit: "M",
  };
}

function getRiverAgeLabel(isPending, levelError, hoursOld) {
  if (isPending) {
    return "Loading";
  }

  if (levelError) {
    return "currently unavailable";
  }

  return hoursOld;
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
  const { data: csoDensityData } = useFetch("/api/waterquality/csodensity", SWR_15_MINUTES);

  const levelReadings = levelData?.level_data ?? [];
  const recentEntry = isPending ? null : levelReadings[0];
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const readingTime = recentEntry?.reading_date ? new Date(recentEntry.reading_date) : currentTime;
  const recentLevel = recentEntry ? recentEntry.reading_level : 0;
  const { lowerBound, upperBound, updateBounds } = useContext(GraphContext);
  const csoData = Array.isArray(csoDensityData) ? csoDensityData : [];
  const hasOperationalError = Boolean(levelError || forecastError || accuracyError);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60 * 1000);

    return () => clearInterval(timer);
  }, []);

  const readingTimeValue = readingTime.getTime();
  const hoursOld = Number.isNaN(readingTimeValue)
    ? 0
    : Math.floor((currentTime.getTime() - readingTimeValue) / 1000 / 60 / 60);
  const riverLevelDisplay = formatRiverLevel(recentLevel, isPending, levelError);
  const riverAgeLabel = getRiverAgeLabel(isPending, levelError, hoursOld);

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
            The River Level is {riverLevelDisplay.value} {riverLevelDisplay.unit}
          </h3>
          <a href="#waterquality">
            {isPending || levelError ? null : (
              <VomitFactor levelData={levelReadings} csoData={csoData} />
            )}
          </a>
        </Col>
      </Row>
      <Row className="justify-content-center">
        {isPending ? (
          <Spinner animation="border" role="status" />
        ) : (
          <WeirLevels currentLevel={recentLevel} />
        )}
      </Row>
      <Row className="justify-content-center ">
        <p>
          The river level data is{" "}
          {riverAgeLabel}{" "}
          hours old. Generally HPP white water course is open below 2.2 meters
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
