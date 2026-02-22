"use client";

import { useState, useContext } from "react";
import Link from "next/link";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Table from "react-bootstrap/Table";
import Card from "react-bootstrap/Card";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import useFetch from "../../libs/useFetch";
import ForecastChartWithConfidence from "../../components/functional/forecastChart";
import StabilityChart from "../../components/functional/stabilityChart";
import GraphContext from "../../libs/context/graphcontrol";

const formatMetric = (value, decimals = 3) => {
  if (value === null || value === undefined) return "N/A";
  return value.toFixed(decimals);
};

function getAccuracyRating(mae) {
  if (mae === null || mae === undefined) {
    return { label: "No data", color: "secondary" };
  }
  if (mae < 0.05) {
    return { label: "Excellent", color: "success" };
  }
  if (mae < 0.1) {
    return { label: "Good", color: "info" };
  }
  if (mae < 0.15) {
    return { label: "Fair", color: "warning" };
  }
  return { label: "Poor", color: "danger" };
}

function getStabilityRating(stabilityStd) {
  if (stabilityStd === null || stabilityStd === undefined) {
    return { label: "No data", color: "secondary", icon: "—" };
  }
  if (stabilityStd < 0.1) {
    return { label: "Stable", color: "success", icon: "✓" };
  }
  if (stabilityStd < 0.25) {
    return { label: "Variable", color: "warning", icon: "~" };
  }
  return { label: "Unstable", color: "danger", icon: "!" };
}

function getRevisionTrend(revisionTrend) {
  if (revisionTrend === null || revisionTrend === undefined) {
    return { label: "Unknown", color: "secondary", icon: "—" };
  }
  if (revisionTrend > 0.005) {
    return { label: "Rising", color: "warning", icon: "↑" };
  }
  if (revisionTrend < -0.005) {
    return { label: "Falling", color: "info", icon: "↓" };
  }
  return { label: "Stable", color: "success", icon: "→" };
}

function getRainfallRating(rainMm) {
  if (rainMm === null || rainMm === undefined) {
    return { label: "No data", color: "secondary", icon: "—" };
  }
  if (rainMm < 2) {
    return { label: "Dry", color: "success", icon: "☀" };
  }
  if (rainMm < 10) {
    return { label: "Light", color: "info", icon: "🌧" };
  }
  if (rainMm < 25) {
    return { label: "Moderate", color: "warning", icon: "🌧" };
  }
  return { label: "Heavy", color: "danger", icon: "⛈" };
}

function formatDateTime(value) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString("en-GB");
}

function formatMeters(value, decimals = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "N/A";
  return `${parsed.toFixed(decimals)}m`;
}

function formatCentimeters(value, decimals = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "N/A";
  return `${(parsed * 100).toFixed(decimals)}cm`;
}

export default function ForecastInfoPage() {
  const [forecastSource, setForecastSource] = useState("s3");
  const [showConfidence, setShowConfidence] = useState(true);
  const [showStats, setShowStats] = useState(false);
  const [showStability, setShowStability] = useState(false);

  const { data: levelData, isPending: levelPending } = useFetch("/api/levels");
  const { data: s3Data, isPending: s3Pending } = useFetch("/api/s3forecast");
  const { data: accuracyData, isPending: accuracyPending } = useFetch("/api/forecastaccuracy");
  const { data: stabilityData, isPending: stabilityPending } = useFetch("/api/forecaststability");

  const { lowerBound, upperBound, updateBounds } = useContext(GraphContext);
  const isPending = levelPending || s3Pending;

  let selectedForecast = s3Data?.forecast_data || [];
  if (forecastSource === "ea") {
    selectedForecast = levelData?.forecast_data || [];
  }

  const s3ForecastRows = Array.isArray(s3Data?.forecast_data) ? s3Data.forecast_data : [];
  const firstS3Forecast = s3ForecastRows[0] || null;
  const lastS3Forecast = s3ForecastRows.length ? s3ForecastRows[s3ForecastRows.length - 1] : null;
  const forecastGeneratedAt = s3Data?.metadata?.forecast_time || firstS3Forecast?.forecast_time || null;
  const currentLevelAtForecast = s3Data?.metadata?.current_level ?? firstS3Forecast?.current_level ?? null;

  const horizonValues = s3ForecastRows
    .map((row) => Number(row?.horizon_hours))
    .filter((value) => Number.isFinite(value));
  const maxHorizon = horizonValues.length ? Math.max(...horizonValues) : null;

  const forecastValues = s3ForecastRows
    .map((row) => Number(row?.forecast_reading))
    .filter((value) => Number.isFinite(value));
  const predictedMin = forecastValues.length ? Math.min(...forecastValues) : null;
  const predictedMax = forecastValues.length ? Math.max(...forecastValues) : null;
  let predictedAvg = null;
  if (forecastValues.length) {
    predictedAvg = forecastValues.reduce((sum, value) => sum + value, 0) / forecastValues.length;
  }

  let predictedRange = null;
  if (Number.isFinite(predictedMin) && Number.isFinite(predictedMax)) {
    predictedRange = predictedMax - predictedMin;
  }

  const stableRows = Array.isArray(stabilityData?.stability_data) ? stabilityData.stability_data : [];
  const baseForecastTime = forecastGeneratedAt ? new Date(forecastGeneratedAt) : null;
  const normalizedStabilityRows = stableRows
    .map((row) => {
      const targetDate = new Date(row?.target_time);
      const hasTargetDate = !Number.isNaN(targetDate.getTime());
      const computedHorizon = hasTargetDate && baseForecastTime && !Number.isNaN(baseForecastTime.getTime())
        ? (targetDate - baseForecastTime) / (1000 * 60 * 60)
        : null;
      return {
        ...row,
        horizon_hours: Number.isFinite(computedHorizon) ? computedHorizon : null,
      };
    })
    .filter((row) => row?.target_time);

  const stabilityValues = normalizedStabilityRows
    .map((row) => Number(row?.stability_std))
    .filter((value) => Number.isFinite(value));
  let avgStability = null;
  if (stabilityValues.length) {
    avgStability = stabilityValues.reduce((sum, value) => sum + value, 0) / stabilityValues.length;
  }
  const stabilitySummary = getStabilityRating(avgStability);

  const rainfallTargets = [12, 24, 48, 72].map((hours) => {
    const withRain = normalizedStabilityRows.filter(
      (row) => Number.isFinite(Number(row?.horizon_hours)) && Number.isFinite(Number(row?.rain_forecast_mm))
    );

    let closest = null;
    for (const row of withRain) {
      if (!closest) {
        closest = row;
        continue;
      }

      const currentDiff = Math.abs(Number(row.horizon_hours) - hours);
      const bestDiff = Math.abs(Number(closest.horizon_hours) - hours);
      if (currentDiff < bestDiff) {
        closest = row;
      }
    }

    let rain = null;
    if (closest) {
      rain = Number(closest.rain_forecast_mm);
    }

    return { hours, rain };
  });

  return (
    <Container fluid className="bg-dark min-vh-100">
      <Container className="text-white py-4">
        <Row className="mb-4">
          <Col className="text-center">
            <h1>River Level Forecast</h1>
            <Link href="/" className="text-info">← Back to Main Page</Link>
          </Col>
        </Row>

        <Row className="justify-content-center mb-3">
          <Col xs="auto">
            <ButtonGroup size="sm">
              <Button
                variant={forecastSource === "s3" ? "primary" : "outline-primary"}
                onClick={() => setForecastSource("s3")}
              >
                New Forecast
              </Button>
              <Button
                variant={forecastSource === "ea" ? "primary" : "outline-primary"}
                onClick={() => setForecastSource("ea")}
              >
                EA Forecast
              </Button>
            </ButtonGroup>
          </Col>
        </Row>

        {forecastSource === "s3" && (
          <Row className="justify-content-center mb-3">
            <Col xs="auto">
              <Form.Check
                type="switch"
                id="confidence-toggle"
                label="Show 95% confidence interval"
                checked={showConfidence}
                onChange={(e) => setShowConfidence(e.target.checked)}
                className="text-white"
              />
            </Col>
          </Row>
        )}

        {forecastSource === "s3" && s3Data?.metadata && (
          <Row className="justify-content-center mb-3">
            <Col xs="auto">
              <small className="text-muted">
                Forecast generated: {new Date(s3Data.metadata.forecast_time).toLocaleString()}
              </small>
            </Col>
          </Row>
        )}

        <Row className="justify-content-center mb-4">
          <Col>
            {isPending ? (
              <div className="text-center py-4"><Spinner animation="border" role="status" /></div>
            ) : levelData?.level_data ? (
              <div className="text-center">
                <ForecastChartWithConfidence
                  graphData={levelData.level_data}
                  graphForeCastData={selectedForecast}
                  lowerBound={lowerBound}
                  upperBound={upperBound}
                  accuracyData={forecastSource === "s3" ? accuracyData?.accuracy_data : null}
                  showConfidence={forecastSource === "s3" && showConfidence}
                />
                <Button className="mt-2" size="sm" data-lowerbound="0.98" data-upperbound="2.2" onClick={updateBounds}>
                  Reset graph to HPP guidelines
                </Button>
              </div>
            ) : (
              <p className="text-center">No data available</p>
            )}
          </Col>
        </Row>

        <Row className="justify-content-center mb-4">
          <Col md={10} lg={8}>
            <Card bg="dark" border="info" text="white">
              <Card.Header className="bg-info"><h5 className="mb-0">Forecast Accuracy</h5></Card.Header>
              <Card.Body>
                {accuracyPending ? (
                  <div className="text-center py-3"><Spinner animation="border" role="status" size="sm" /></div>
                ) : accuracyData?.accuracy_data?.length > 0 ? (
                  <>
                    <p className="text-muted mb-3"><small>Last evaluated: {new Date(accuracyData.evaluation_time).toLocaleString()}</small></p>
                    <Table variant="dark" striped bordered hover responsive size="sm">
                      <thead>
                        <tr>
                          <th>Horizon</th><th>Quality</th><th>MAE (m)</th><th>RMSE (m)</th><th>Bias (m)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accuracyData.accuracy_data.map((row) => {
                          const quality = getAccuracyRating(row.mae);
                          return (
                            <tr key={row.horizon_hours}>
                              <td><strong>{row.horizon_hours}h</strong></td>
                              <td><Badge bg={quality.color}>{quality.label}</Badge></td>
                              <td>{formatMetric(row.mae)}</td>
                              <td>{formatMetric(row.rmse)}</td>
                              <td>{row.bias !== null ? <span className={row.bias > 0 ? "text-warning" : "text-info"}>{row.bias > 0 ? "+" : ""}{formatMetric(row.bias)}</span> : "N/A"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </>
                ) : (
                  <p className="mb-0">No accuracy data available</p>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {forecastSource === "s3" && (
          <Row className="justify-content-center mb-4">
            <Col md={10} lg={8}>
              <Card bg="dark" border="secondary" text="white">
                <Card.Header className="d-flex justify-content-between align-items-center" style={{ cursor: "pointer" }} onClick={() => setShowStats(!showStats)}>
                  <h5 className="mb-0">Stats</h5><span>{showStats ? "▼" : "▶"}</span>
                </Card.Header>
                {showStats && (
                  <Card.Body>
                    {s3Pending ? (
                      <Spinner animation="border" role="status" size="sm" />
                    ) : (
                      <>
                        <h6 className="text-info fw-bold">Current Forecast</h6>
                        <Table variant="dark" size="sm" bordered>
                          <tbody>
                            <tr><td className="text-white-50">Forecast generated</td><td className="text-white">{formatDateTime(forecastGeneratedAt)}</td></tr>
                            <tr><td className="text-white-50">River level at forecast time</td><td className="text-white">{formatMeters(currentLevelAtForecast)}</td></tr>
                            <tr><td className="text-white-50">Data points</td><td className="text-white">{s3ForecastRows.length}</td></tr>
                            <tr>
                              <td className="text-white-50">Forecast range</td>
                              <td className="text-white">{`${formatDateTime(firstS3Forecast?.forecast_date)} → ${formatDateTime(lastS3Forecast?.forecast_date)}`}</td>
                            </tr>
                            <tr><td className="text-white-50">Max horizon</td><td className="text-white">{Number.isFinite(maxHorizon) ? `${maxHorizon} hours` : "N/A"}</td></tr>
                          </tbody>
                        </Table>

                        <h6 className="text-info fw-bold mt-4">Prediction Statistics</h6>
                        <Table variant="dark" size="sm" bordered>
                          <tbody>
                            <tr><td className="text-white-50">Predicted minimum</td><td className="text-white">{formatMeters(predictedMin)}</td></tr>
                            <tr><td className="text-white-50">Predicted maximum</td><td className="text-white">{formatMeters(predictedMax)}</td></tr>
                            <tr><td className="text-white-50">Predicted range</td><td className="text-white">{formatMeters(predictedRange)}</td></tr>
                            <tr><td className="text-white-50">Average prediction</td><td className="text-white">{formatMeters(predictedAvg)}</td></tr>
                          </tbody>
                        </Table>

                        <h6 className="text-info fw-bold mt-4">Accuracy Details</h6>
                        <Table variant="dark" striped bordered hover responsive size="sm">
                          <thead>
                            <tr>
                              <th>Horizon</th>
                              <th>MAE</th>
                              <th>RMSE</th>
                              <th>Bias</th>
                              <th>Max Error</th>
                              <th>Samples</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(accuracyData?.accuracy_data || []).map((row) => (
                              <tr key={`accuracy-detail-${row.horizon_hours}`}>
                                <td>{row.horizon_hours}h</td>
                                <td>{formatMetric(row.mae)}</td>
                                <td>{formatMetric(row.rmse)}</td>
                                <td>{row.bias === null || row.bias === undefined ? "N/A" : formatMetric(row.bias)}</td>
                                <td>{row.max_error === null || row.max_error === undefined ? "N/A" : formatMetric(row.max_error)}</td>
                                <td>{Number.isFinite(Number(row.predictions_compared)) ? row.predictions_compared : "N/A"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </>
                    )}
                  </Card.Body>
                )}
              </Card>
            </Col>
          </Row>
        )}

        {forecastSource === "s3" && (
          <Row className="justify-content-center mb-4">
            <Col md={10} lg={8}>
              <Card bg="dark" border="info" text="white">
                <Card.Header className="d-flex justify-content-between align-items-center" style={{ cursor: "pointer" }} onClick={() => setShowStability(!showStability)}>
                  <div className="d-flex align-items-center gap-2">
                    <h5 className="mb-0">Forecast Stability</h5>
                    <Badge bg={stabilitySummary.color}>{`${stabilitySummary.icon} ${stabilitySummary.label}`}</Badge>
                  </div>
                  <span>{showStability ? "▼" : "▶"}</span>
                </Card.Header>
                {showStability && (
                  <Card.Body>
                    {stabilityPending ? (
                      <div className="text-center py-3"><Spinner animation="border" role="status" size="sm" /></div>
                    ) : (
                      <>
                        <p className="text-white-50 mb-3">
                          Stability shows how consistent the forecast has been over the last 12 hours.
                          Low stability means the model is confident; high stability means predictions have been changing.
                        </p>

                        <h6 className="text-info fw-bold">Prediction Evolution</h6>
                        <p className="text-white-50 mb-3">
                          Shows how predictions for each target time have changed over the last 6 hours.
                          The solid line is the current forecast; dashed lines show what was predicted earlier.
                        </p>
                        {normalizedStabilityRows.length > 0 && <StabilityChart stabilityData={normalizedStabilityRows} />}

                        <h6 className="text-info fw-bold mt-4">
                          Rainfall Forecast {rainfallTargets.some((entry) => Number.isFinite(entry.rain)) && (
                            <Badge bg={getRainfallRating(rainfallTargets.find((entry) => Number.isFinite(entry.rain))?.rain).color} className="ms-2">
                              {getRainfallRating(rainfallTargets.find((entry) => Number.isFinite(entry.rain))?.rain).icon} {getRainfallRating(rainfallTargets.find((entry) => Number.isFinite(entry.rain))?.rain).label}
                            </Badge>
                          )}
                        </h6>
                        <p className="text-white-50">Cumulative rainfall forecast across the Trent catchment. Higher rainfall increases forecast uncertainty.</p>

                        <Row className="g-2 mb-3">
                          {rainfallTargets.map((entry) => {
                            const rainfall = getRainfallRating(entry.rain);
                            return (
                              <Col key={`rain-${entry.hours}`} xs={12} sm={6} md={3}>
                                <Card bg="secondary" text="white" className="h-100">
                                  <Card.Body className="py-2 px-2 text-center">
                                    <div className="text-white-50 small">{entry.hours} hours</div>
                                    <Badge bg={rainfall.color} className="w-100">{`${rainfall.icon} ${Number.isFinite(entry.rain) ? `${entry.rain.toFixed(1)}mm` : "N/A"}`}</Badge>
                                  </Card.Body>
                                </Card>
                              </Col>
                            );
                          })}
                        </Row>

                        <h6 className="text-info fw-bold mt-4">Stability by Horizon</h6>
                        <Table variant="dark" striped bordered hover responsive size="sm">
                          <thead>
                            <tr>
                              <th>Target Time</th>
                              <th>Horizon</th>
                              <th>Prediction</th>
                              <th>Stability</th>
                            </tr>
                          </thead>
                          <tbody>
                            {normalizedStabilityRows.slice(0, 12).map((row) => {
                              const stability = getStabilityRating(row.stability_std);
                              return (
                                <tr key={`horizon-${row.target_time}-${row.horizon_hours ?? "na"}`}>
                                  <td>{formatDateTime(row.target_time)}</td>
                                  <td>{Number.isFinite(row.horizon_hours) ? `${row.horizon_hours.toFixed(2)}h` : "N/A"}</td>
                                  <td>{formatMeters(row.forecast_current)}</td>
                                  <td><Badge bg={stability.color}>{`${stability.icon} ${formatCentimeters(row.stability_std)}`}</Badge></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </Table>

                        <h6 className="text-info fw-bold mt-4">Revision Trends</h6>
                        <p className="text-white-50 small">
                          ↑ Rising = model is revising predictions upward · ↓ Falling = revising downward · → Stable = consistent predictions
                        </p>
                        <Table variant="dark" striped bordered hover responsive size="sm">
                          <thead>
                            <tr>
                              <th>Target Time</th>
                              <th>Current</th>
                              <th>Stability (σ)</th>
                              <th>Range</th>
                              <th>Trend</th>
                            </tr>
                          </thead>
                          <tbody>
                            {normalizedStabilityRows.slice(0, 12).map((row) => {
                              const trend = getRevisionTrend(row.revision_trend);
                              return (
                                <tr key={`trend-${row.target_time}-${row.horizon_hours ?? "na"}`}>
                                  <td>{formatDateTime(row.target_time)}</td>
                                  <td>{formatMeters(row.forecast_current)}</td>
                                  <td><Badge bg={getStabilityRating(row.stability_std).color}>{formatCentimeters(row.stability_std)}</Badge></td>
                                  <td>{formatCentimeters(row.stability_range)}</td>
                                  <td><Badge bg={trend.color}>{`${trend.icon} ${trend.label}`}</Badge></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </Table>

                        <div className="border border-info rounded p-2 mb-3 small">
                          <strong>Stability thresholds:</strong>{" "}
                          <Badge bg="success" className="ms-1">&lt;10cm</Badge>
                          <span className="ms-1">Stable</span>
                          <Badge bg="warning" className="ms-2">10-25cm</Badge>
                          <span className="ms-1">Variable</span>
                          <Badge bg="danger" className="ms-2">&gt;25cm</Badge>
                          <span className="ms-1">Unstable</span>
                        </div>

                        <Card bg="warning" text="dark">
                          <Card.Header className="fw-bold">⚠️ Limitations</Card.Header>
                          <Card.Body>
                            <ul className="mb-0">
                              <li>The forecast is a prediction and may not account for sudden changes</li>
                              <li>Extreme weather events may cause larger variations</li>
                            </ul>
                          </Card.Body>
                        </Card>
                      </>
                    )}
                  </Card.Body>
                )}
              </Card>
            </Col>
          </Row>
        )}
      </Container>
    </Container>
  );
}
