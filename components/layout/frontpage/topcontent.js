import { useState, useEffect } from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Button from "react-bootstrap/Button";
import OpenTitle from "../../functional/opentitle";
import useFetch from "../../../libs/useFetch";
import VomitFactor from "../../functional/vomitfactor";
import WeirLevels from "../../functional/weirlevels";
import ForecastChartWithConfidence from "../../functional/forecastChart";
import Spinner from "react-bootstrap/Spinner";
import { useContext } from "react";
import GraphContext from "../../../libs/context/graphcontrol";
import Link from "next/link";

const currentTime = new Date();

export default function TopContent(props) {
  const { data: levelData, error, isPending } = useFetch("/api/levels");
  const { data: s3Forecast, isPending: forecastPending } = useFetch("/api/s3forecast");
  const { data: accuracyData, isPending: accuracyPending } = useFetch("/api/forecastaccuracy");
  const { data: featureFlags, isPending: flagsPending } = useFetch("/api/featureflags");
  
  const recentEntry = !isPending && levelData.level_data?.[0];
  const readingTime = recentEntry ? new Date(recentEntry.reading_date) : new Date();
  const recentLevel = recentEntry ? recentEntry.reading_level : 0;
  const { lowerBound, upperBound, updateBounds } = useContext(GraphContext);

  const [csoData, setCsoData] = useState([]);

  useEffect(() => {
    async function fetchCsoData() {
      try {
        const response = await fetch("/api/waterquality/csodensity");
        if (!response.ok) {
          throw new Error("Failed to fetch CSO data");
        }
        const data = await response.json();
        setCsoData(data);
      } catch (error) {
        console.error("Error fetching CSO data:", error);
      }
    }

    fetchCsoData();
  }, []);

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
            The River Level is{" "}
            {isPending
              ? "0.00"
              : (Math.round((recentLevel + Number.EPSILON) * 100) / 100).toFixed(
                  2
                )}{" "}
            M
          </h3>
          <a href="#waterquality">
            {isPending ? null : (
              <VomitFactor levelData={levelData.level_data} csoData={csoData} />
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
          {isPending
            ? "Loading"
            : Math.floor(
                (currentTime.getTime() - readingTime.getTime()) / 1000 / 60 / 60
              )}{" "}
          hours old. Generally HPP white water course is open below 2.2 meters
          on the gauge. Check the graph below for trends and a 36 hour river
          level forecast.
        </p>
        <p>
          Need some new paddling kit or forgotten something? Check out{" "}
          <Link target="blank" href="https://www.flowkayaks.co.uk/">
            Flow Kayaks
          </Link>{" "}
          who are just over the river.
        </p>
        <p>
          Check below the graph for details about the availability of slots
          during sessions, and events that may affect the status of the course.
        </p>
      </Row>
      <Row className="justify-content-center text-white mt-2" id="chart">
        <Col className="justify-content-center text-center">
          {isPending || forecastPending ? (
            <Spinner animation="border" role="status" />
          ) : (
            <ForecastChartWithConfidence
              lowerBound={lowerBound}
              upperBound={upperBound}
              graphData={levelData.level_data}
              graphForeCastData={s3Forecast?.forecast_data || []}
              accuracyData={accuracyData?.accuracy_data || []}
              showConfidence={featureFlags?.SHOW_FORECAST_CONFIDENCE ?? true}
            />
          )}
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