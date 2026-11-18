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
import { describeForecast } from "../../../libs/forecastDisplay";
import { getLatestLevelReading } from "../../../libs/hpp/hppHomeStatus";
import CurrentConditions from "./currentConditions";

function renderForecastContent({
  isPending,
  forecastPending,
  lowerBound,
  upperBound,
  levelReadings,
  forecast,
  accuracyData,
  accuracyError,
}) {
  if (isPending || forecastPending) {
    return <StatusMessage state="loading">Loading the river level chart…</StatusMessage>;
  }

  // The chart needs observed levels. A failed or fallback forecast, or a failed accuracy read, only removes that
  // part of the chart and says so; it never hides the observed levels.
  if (!levelReadings.length) {
    return <StatusMessage state="unavailable">Forecast and level data are unavailable right now.</StatusMessage>;
  }

  return (
    <>
      <ForecastChartWithConfidence
        lowerBound={lowerBound}
        upperBound={upperBound}
        graphData={levelReadings}
        graphForeCastData={forecast.rows}
        accuracyData={accuracyData?.accuracy_data || []}
        showConfidence
      />
      {forecast.notice ? (
        <StatusMessage state={forecast.rows.length ? "stale" : "unavailable"} className="mt-2">{forecast.notice}</StatusMessage>
      ) : null}
      {accuracyError && !accuracyData && forecast.rows.length ? (
        <p className="history-muted small mt-2 mb-0">The forecast&apos;s confidence band is unavailable right now.</p>
      ) : null}
    </>
  );
}

export default function TopContent(props) {
  const { data: levelData, isPending } = useFetch("/api/levels", SWR_15_MINUTES);
  const {
    data: s3Forecast,
    isPending: forecastPending,
  } = useFetch("/api/s3forecast", SWR_15_MINUTES);
  const { data: accuracyData, error: accuracyError } = useFetch("/api/forecastaccuracy", SWR_15_MINUTES);
  // The same server-side assessment as /waterquality (RDP_WQ_ASSESSMENT); never computed in the browser.
  const { data: waterQualityAssessment, isPending: assessmentPending } = useFetch("/api/waterquality/assessment", SWR_15_MINUTES);

  const levelReadings = levelData?.level_data ?? [];
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const reading = isPending ? null : getLatestLevelReading(levelData);
  const { lowerBound, upperBound, updateBounds } = useContext(GraphContext);
  const forecast = describeForecast(s3Forecast, currentTime);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60 * 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="text-white text-center">
      <Row className="justify-content-center">
        <Col className="text-center">
          <h1>Is HPP Open?</h1>
          <OpenTitle cachedEvents={props.cachedEvents} eventsUnavailable={props.eventsUnavailable} />
        </Col>
      </Row>
      {/* The summary supersedes the old "The river level is …" headline and reading-age line. */}
      <CurrentConditions cachedEvents={props.cachedEvents} eventsUnavailable={props.eventsUnavailable} />
      {reading ? (
        <Row className="justify-content-center">
          <Col xs={12}>
            <a href="#waterquality">
              <VomitFactor assessment={waterQualityAssessment?.current ?? null} isPending={assessmentPending} />
            </a>
          </Col>
          <Col xs={12}>
            <WeirLevels currentLevel={reading.level} />
          </Col>
        </Row>
      ) : null}
      <section className="history-panel text-white text-center mt-3" id="chart" aria-label="River level and forecast chart">
          <p className="history-muted small">Recent Colwick levels and the 36-hour model forecast.</p>
          {renderForecastContent({
            isPending,
            forecastPending,
            lowerBound,
            upperBound,
            levelReadings,
            forecast,
            accuracyData,
            accuracyError,
          })}
          <p className="mt-2 small">
            <Link href="/forecastinfo" className="text-info">About this forecast</Link>
          </p>
          <Button
            variant="outline-light"
            size="sm"
            data-lowerbound="0.98"
            data-upperbound="2.2"
            onClick={updateBounds}
          >
            Reset graph to HPP guidelines
          </Button>
          <p className="history-muted small mt-3 mb-0">
            Need kit? <a href="https://www.flowkayaks.co.uk/" target="_blank" rel="noopener noreferrer">Flow Kayaks</a> is just over the river.
          </p>
      </section>
    </div>
  );
}

TopContent.propTypes = {
  cachedEvents: PropTypes.array,
  eventsUnavailable: PropTypes.bool,
};
