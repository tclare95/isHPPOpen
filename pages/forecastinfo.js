import { useState, useContext } from "react";
import Head from "next/head";
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
import useFetch from "../libs/useFetch";
import ForecastChartWithConfidence from "../components/functional/forecastChart";
import StabilityChart from "../components/functional/stabilityChart";
import GraphContext from "../libs/context/graphcontrol";

// Helper to format numbers to fixed decimals, handling nulls
const formatMetric = (value, decimals = 3) => {
  if (value === null || value === undefined) return "N/A";
  return value.toFixed(decimals);
};

/**
 * Get a human-readable accuracy rating based on MAE
 */
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

/**
 * Get stability rating based on stability_std
 * <0.10m = Stable (good), 0.10-0.25m = Variable (caution), >0.25m = Unstable (bad)
 */
function getStabilityRating(stabilityStd) {
  if (stabilityStd === null || stabilityStd === undefined) {
    return { label: "No data", color: "secondary", icon: "—" };
  }
  if (stabilityStd < 0.10) {
    return { label: "Stable", color: "success", icon: "✓" };
  }
  if (stabilityStd < 0.25) {
    return { label: "Variable", color: "warning", icon: "~" };
  }
  return { label: "Unstable", color: "danger", icon: "!" };
}

/**
 * Get revision trend indicator based on revision_trend value
 * Positive = rising, negative = falling, near-zero = stable
 */
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

/**
 * Get rainfall intensity rating based on cumulative forecast rainfall
 * 0-2mm = Dry, 2-10mm = Light, 10-25mm = Moderate, 25+mm = Heavy
 */
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

export default function ForecastInfo() {
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

  // Select which forecast to display based on toggle
  const selectedForecast = forecastSource === "ea" 
    ? levelData?.forecast_data || []
    : s3Data?.forecast_data || [];

  return (
    <>
      <Head>
        <title>River Level Forecast | isHPPOpen</title>
        <meta
          name="description"
          content="River level forecast for Holme Pierrepont - view predictions, accuracy metrics, and compare forecast sources"
        />
      </Head>
      <Container fluid className="bg-dark min-vh-100">
        <Container className="text-white py-4">
          <Row className="mb-4">
            <Col className="text-center">
              <h1>River Level Forecast</h1>
              <Link href="/">
                <span className="text-info">← Back to Main Page</span>
              </Link>
            </Col>
          </Row>

          {/* Forecast Source Toggle */}
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

          {/* Confidence Interval Toggle - only show for S3 forecast */}
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

          {/* Metadata Display */}
          {forecastSource === "s3" && s3Data?.metadata && (
            <Row className="justify-content-center mb-3">
              <Col xs="auto">
                <small className="text-muted">
                  Forecast generated: {new Date(s3Data.metadata.forecast_time).toLocaleString()}
                </small>
              </Col>
            </Row>
          )}

          {/* Chart */}
          <Row className="justify-content-center mb-4">
            <Col>
              {isPending ? (
                <div className="text-center py-4">
                  <Spinner animation="border" role="status" />
                </div>
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
                  <Button
                    className="mt-2"
                    size="sm"
                    data-lowerbound="0.98"
                    data-upperbound="2.2"
                    onClick={updateBounds}
                  >
                    Reset graph to HPP guidelines
                  </Button>
                </div>
              ) : (
                <p className="text-center">No data available</p>
              )}
            </Col>
          </Row>

          {/* About Section */}
          <Row className="justify-content-center mb-4">
            <Col md={10} lg={8}>
              <Card bg="dark" border="secondary" text="white">
                <Card.Header>
                  <h5 className="mb-0">About the Forecast</h5>
                </Card.Header>
                <Card.Body>
                  <p>
                    The forecast model predicts river levels at Holme Pierrepont up to 36 hours
                    ahead. It is updated <strong>every hour</strong> with the latest data.
                  </p>
                  <p className="mb-2">The model uses three data sources:</p>
                  <ul>
                    <li>
                      <strong>River level data</strong> from the Environment Agency
                    </li>
                    <li>
                      <strong>Rainfall data</strong> from the Environment Agency
                    </li>
                    <li>
                      <strong>Rainfall forecasts</strong> from{" "}
                      <a href="https://www.yr.no" target="_blank" rel="noopener noreferrer" className="text-info">
                        yr.no
                      </a>
                    </li>
                  </ul>
                  {showConfidence && forecastSource === "s3" && (
                    <p className="text-muted mb-0">
                      <small>
                        The shaded area shows the 95% confidence interval - the actual river level
                        is expected to fall within this range 95% of the time.
                      </small>
                    </p>
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {/* Accuracy Metrics Table */}
          <Row className="justify-content-center mb-4">
            <Col md={10} lg={8}>
              <Card bg="dark" border="info" text="white">
                <Card.Header className="bg-info">
                  <h5 className="mb-0">Forecast Accuracy</h5>
                </Card.Header>
                <Card.Body>
                  {accuracyPending ? (
                    <div className="text-center py-3">
                      <Spinner animation="border" role="status" size="sm" />
                    </div>
                  ) : accuracyData?.accuracy_data?.length > 0 ? (
                    <>
                      <p className="text-muted mb-3">
                        <small>
                          Last evaluated: {new Date(accuracyData.evaluation_time).toLocaleString()}
                        </small>
                      </p>
                      <Table variant="dark" striped bordered hover responsive size="sm">
                        <thead>
                          <tr>
                            <th>Horizon</th>
                            <th>Quality</th>
                            <th>MAE (m)</th>
                            <th>RMSE (m)</th>
                            <th>Bias (m)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {accuracyData.accuracy_data.map((row) => {
                            const quality = getAccuracyRating(row.mae);
                            return (
                              <tr key={row.horizon_hours}>
                                <td><strong>{row.horizon_hours}h</strong></td>
                                <td>
                                  <Badge bg={quality.color}>{quality.label}</Badge>
                                </td>
                                <td>{formatMetric(row.mae)}</td>
                                <td>{formatMetric(row.rmse)}</td>
                                <td>
                                  {row.bias !== null ? (
                                    <span className={row.bias > 0 ? "text-warning" : "text-info"}>
                                      {row.bias > 0 ? "+" : ""}{formatMetric(row.bias)}
                                    </span>
                                  ) : "N/A"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                      <div className="mt-3">
                        <small className="text-muted">
                          <strong>MAE</strong> = Mean Absolute Error (average prediction error) &bull;{" "}
                          <strong>RMSE</strong> = Root Mean Square Error &bull;{" "}
                          <strong>Bias</strong> = Positive means over-predicts, negative means under-predicts
                        </small>
                      </div>
                    </>
                  ) : (
                    <p className="mb-0">No accuracy data available</p>
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {/* Stats Section */}
          {forecastSource === "s3" && (
            <Row className="justify-content-center mb-4">
              <Col md={10} lg={8}>
                <Card bg="dark" border="secondary" text="white">
                  <Card.Header 
                    className="d-flex justify-content-between align-items-center"
                    style={{ cursor: "pointer" }}
                    onClick={() => setShowStats(!showStats)}
                  >
                    <h5 className="mb-0">Stats</h5>
                    <span>{showStats ? "▼" : "▶"}</span>
                  </Card.Header>
                  {showStats && (
                    <Card.Body>
                      {s3Pending ? (
                        <Spinner animation="border" role="status" size="sm" />
                      ) : s3Data?.forecast_data?.length > 0 ? (
                        <>
                          {/* Forecast Metadata */}
                          <h6 className="text-info mb-3">Current Forecast</h6>
                          <Table variant="dark" size="sm" className="mb-4">
                            <tbody>
                              <tr>
                                <td className="text-muted text-white-50">Forecast generated</td>
                                <td className="text-white">{s3Data.metadata?.forecast_time ? new Date(s3Data.metadata.forecast_time).toLocaleString() : "N/A"}</td>
                              </tr>
                              <tr>
                                <td className="text-muted text-white-50">River level at forecast time</td>
                                <td className="text-white">{s3Data.metadata?.current_level ? `${s3Data.metadata.current_level.toFixed(3)}m` : "N/A"}</td>
                              </tr>
                              <tr>
                                <td className="text-muted text-white-50">Data points</td>
                                <td className="text-white">{s3Data.forecast_data.length}</td>
                              </tr>
                              <tr>
                                <td className="text-muted text-white-50">Forecast range</td>
                                <td className="text-white">
                                  {new Date(s3Data.forecast_data[0].forecast_date).toLocaleString()} →{" "}
                                  {new Date(s3Data.forecast_data[s3Data.forecast_data.length - 1].forecast_date).toLocaleString()}
                                </td>
                              </tr>
                              <tr>
                                <td className="text-muted text-white-50">Max horizon</td>
                                <td className="text-white">{Math.max(...s3Data.forecast_data.map(d => d.horizon_hours))} hours</td>
                              </tr>
                            </tbody>
                          </Table>

                          {/* Forecast Statistics */}
                          <h6 className="text-info mb-3">Prediction Statistics</h6>
                          {(() => {
                            const readings = s3Data.forecast_data.map(d => d.forecast_reading);
                            const minReading = Math.min(...readings);
                            const maxReading = Math.max(...readings);
                            const avgReading = readings.reduce((a, b) => a + b, 0) / readings.length;
                            return (
                              <Table variant="dark" size="sm" className="mb-4">
                                <tbody>
                                  <tr>
                                    <td className="text-white-50">Predicted minimum</td>
                                    <td className="text-white">{minReading.toFixed(3)}m</td>
                                  </tr>
                                  <tr>
                                    <td className="text-white-50">Predicted maximum</td>
                                    <td className="text-white">{maxReading.toFixed(3)}m</td>
                                  </tr>
                                  <tr>
                                    <td className="text-white-50">Predicted range</td>
                                    <td className="text-white">{(maxReading - minReading).toFixed(3)}m</td>
                                  </tr>
                                  <tr>
                                    <td className="text-white-50">Average prediction</td>
                                    <td className="text-white">{avgReading.toFixed(3)}m</td>
                                  </tr>
                                </tbody>
                              </Table>
                            );
                          })()}

                          {/* Accuracy Extended Stats */}
                          {accuracyData?.accuracy_data?.length > 0 && (
                            <>
                              <h6 className="text-info mb-3">Accuracy Details</h6>
                              <Table variant="dark" striped size="sm" responsive>
                                <thead>
                                  <tr>
                                    <th className="text-white">Horizon</th>
                                    <th className="text-white">MAE</th>
                                    <th className="text-white">RMSE</th>
                                    <th className="text-white">Bias</th>
                                    <th className="text-white">Max Error</th>
                                    <th className="text-white">Samples</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {accuracyData.accuracy_data.map((row) => (
                                    <tr key={row.horizon_hours}>
                                      <td className="text-white">{row.horizon_hours}h</td>
                                      <td className="text-white">{formatMetric(row.mae)}</td>
                                      <td className="text-white">{formatMetric(row.rmse)}</td>
                                      <td className="text-white">{formatMetric(row.bias)}</td>
                                      <td className="text-white">{formatMetric(row.max_error)}</td>
                                      <td className="text-white">{row.predictions_compared || "N/A"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </Table>
                            </>
                          )}

                        </>
                      ) : (
                        <p className="mb-0">No forecast data available</p>
                      )}
                    </Card.Body>
                  )}
                </Card>
              </Col>
            </Row>
          )}

          {/* Forecast Stability Analytics Section */}
          {forecastSource === "s3" && (
            <Row className="justify-content-center mb-4">
              <Col md={10} lg={8}>
                <Card bg="dark" border="info" text="white">
                  <Card.Header 
                    className="d-flex justify-content-between align-items-center"
                    style={{ cursor: "pointer" }}
                    onClick={() => setShowStability(!showStability)}
                  >
                    <h5 className="mb-0">
                      Forecast Stability{" "}
                      {s3Data?.forecast_data?.length > 0 && (() => {
                        // Calculate overall stability from forecast data
                        const stabilityValues = s3Data.forecast_data
                          .filter(d => d.stability_std !== null)
                          .map(d => d.stability_std);
                        if (stabilityValues.length > 0) {
                          const avgStability = stabilityValues.reduce((a, b) => a + b, 0) / stabilityValues.length;
                          const rating = getStabilityRating(avgStability);
                          return <Badge bg={rating.color} className="ms-2">{rating.icon} {rating.label}</Badge>;
                        }
                        return null;
                      })()}
                    </h5>
                    <span>{showStability ? "▼" : "▶"}</span>
                  </Card.Header>
                  {showStability && (
                    <Card.Body>
                      {stabilityPending ? (
                        <div className="text-center py-3">
                          <Spinner animation="border" role="status" size="sm" />
                        </div>
                      ) : (
                        <>
                          {/* Explanation */}
                          <p className="text-white-50 mb-3">
                            <small>
                              Stability shows how consistent the forecast has been over the last 12 hours.
                              Low stability means the model is confident; high stability means predictions have been changing.
                            </small>
                          </p>

                          {/* Spaghetti Plot - How predictions evolved */}
                          {stabilityData?.stability_data?.length > 0 && (
                            <>
                              <h6 className="text-info mb-3">Prediction Evolution</h6>
                              <p className="text-white-50 mb-2">
                                <small>
                                  Shows how predictions for each target time have changed over the last 6 hours.
                                  The solid line is the current forecast; dashed lines show what was predicted earlier.
                                </small>
                              </p>
                              <StabilityChart stabilityData={stabilityData.stability_data} />
                            </>
                          )}

                          {/* Rainfall Forecast Summary */}
                          {stabilityData?.stability_data?.length > 0 && (() => {
                            // Get rainfall data points - filter to show key horizons
                            const rainfallPoints = stabilityData.stability_data
                              .filter(row => row.rain_forecast_mm !== null && row.rain_forecast_mm !== undefined);
                            
                            if (rainfallPoints.length === 0) return null;
                            
                            // Get the max (cumulative) rainfall
                            const maxRain = Math.max(...rainfallPoints.map(r => r.rain_forecast_mm));
                            const rainRating = getRainfallRating(maxRain);
                            
                            // Get key time points: +12h, +24h, +48h, +72h
                            const now = new Date();
                            const getClosestTo = (targetHours) => {
                              const targetTime = new Date(now.getTime() + targetHours * 60 * 60 * 1000);
                              return rainfallPoints.reduce((closest, row) => {
                                const rowTime = new Date(row.target_time);
                                const closestTime = closest ? new Date(closest.target_time) : null;
                                if (!closestTime) return row;
                                return Math.abs(rowTime - targetTime) < Math.abs(closestTime - targetTime) ? row : closest;
                              }, null);
                            };
                            
                            const keyPoints = [
                              { label: '12 hours', data: getClosestTo(12) },
                              { label: '24 hours', data: getClosestTo(24) },
                              { label: '48 hours', data: getClosestTo(48) },
                              { label: '72 hours', data: getClosestTo(72) },
                            ].filter((p, i, arr) => {
                              // Remove duplicates and entries without data
                              if (!p.data) return false;
                              return i === arr.findIndex(x => x.data?.target_time === p.data?.target_time);
                            });
                            
                            return (
                              <>
                                <h6 className="text-info mb-3 mt-4">
                                  Rainfall Forecast{" "}
                                  <Badge bg={rainRating.color}>{rainRating.icon} {rainRating.label}</Badge>
                                </h6>
                                <p className="text-white-50 mb-3">
                                  Cumulative rainfall forecast across the Trent catchment.
                                  {maxRain >= 10 && " Higher rainfall increases forecast uncertainty."}
                                </p>
                                <Row className="g-2 mb-3">
                                  {keyPoints.map((point, idx) => {
                                    const rating = getRainfallRating(point.data.rain_forecast_mm);
                                    return (
                                      <Col key={idx} xs={6} md={3}>
                                        <Card bg="secondary" text="white" className="h-100 text-center">
                                          <Card.Body className="py-2 px-1">
                                            <div className="small text-white-50">{point.label}</div>
                                            <div className="h5 mb-0">
                                              <Badge bg={rating.color} className="w-100">
                                                {rating.icon} {point.data.rain_forecast_mm.toFixed(1)}mm
                                              </Badge>
                                            </div>
                                          </Card.Body>
                                        </Card>
                                      </Col>
                                    );
                                  })}
                                </Row>
                                <small className="text-white-50">
                                  Cumulative rainfall forecast for the Trent catchment.
                                </small>
                              </>
                            );
                          })()}

                          {/* Stability Summary from forecast data */}
                          {s3Data?.forecast_data?.length > 0 && (
                            <>
                              <h6 className="text-info mb-3 mt-4">Stability by Horizon</h6>
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
                                  {s3Data.forecast_data
                                    .filter((_, i) => i % 3 === 0) // Show every 3rd row for readability
                                    .slice(0, 12) // Limit to 12 rows
                                    .map((row, idx) => {
                                      const stability = getStabilityRating(row.stability_std);
                                      return (
                                        <tr key={idx}>
                                          <td>{new Date(row.forecast_date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                          <td>{row.horizon_hours}h</td>
                                          <td>{row.forecast_reading.toFixed(3)}m</td>
                                          <td>
                                            <Badge bg={stability.color}>
                                              {stability.icon} {row.stability_std !== null ? `${(row.stability_std * 100).toFixed(1)}cm` : 'N/A'}
                                            </Badge>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                </tbody>
                              </Table>
                            </>
                          )}

                          {/* Detailed Stability Table with Revision Trends */}
                          {stabilityData?.stability_data?.length > 0 && (
                            <>
                              <h6 className="text-info mb-3 mt-4">Revision Trends</h6>
                              <p className="text-white-50 mb-2">
                                <small>
                                  <strong>↑ Rising</strong> = model is revising predictions upward &bull;{" "}
                                  <strong>↓ Falling</strong> = revising downward &bull;{" "}
                                  <strong>→ Stable</strong> = consistent predictions
                                </small>
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
                                  {stabilityData.stability_data
                                    .filter((_, i) => i % 4 === 0) // Show every 4th row
                                    .slice(0, 10) // Limit rows
                                    .map((row, idx) => {
                                      const stability = getStabilityRating(row.stability_std);
                                      const trend = getRevisionTrend(row.revision_trend);
                                      return (
                                        <tr key={idx}>
                                          <td>{new Date(row.target_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                          <td>{row.forecast_current.toFixed(3)}m</td>
                                          <td>
                                            <Badge bg={stability.color}>
                                              {row.stability_std !== null ? `${(row.stability_std * 100).toFixed(1)}cm` : 'N/A'}
                                            </Badge>
                                          </td>
                                          <td>
                                            {row.stability_range !== null ? `${(row.stability_range * 100).toFixed(1)}cm` : 'N/A'}
                                          </td>
                                          <td>
                                            <Badge bg={trend.color}>
                                              {trend.icon} {trend.label}
                                            </Badge>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                </tbody>
                              </Table>
                            </>
                          )}

                          {/* Legend */}
                          <div className="mt-3">
                            <small className="text-white-50">
                              <strong className="text-white">Stability thresholds:</strong>{" "}
                              <Badge bg="success" className="me-1">{"<"}10cm</Badge> Stable &bull;{" "}
                              <Badge bg="warning" className="me-1">10-25cm</Badge> Variable &bull;{" "}
                              <Badge bg="danger" className="me-1">{">"}25cm</Badge> Unstable
                            </small>
                          </div>
                        </>
                      )}
                    </Card.Body>
                  )}
                </Card>
              </Col>
            </Row>
          )}

          {/* Limitations */}
          <Row className="justify-content-center">
            <Col md={10} lg={8}>
              <Card bg="dark" border="warning" text="white">
                <Card.Header className="bg-warning text-dark">
                  <h5 className="mb-0">⚠️ Limitations</h5>
                </Card.Header>
                <Card.Body>
                  <ul className="mb-0">
                    <li>
                      The forecast is a prediction and may not account for sudden changes
                    </li>
                    <li>
                      Extreme weather events may cause larger variations
                    </li>
                  </ul>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Container>
      </Container>
    </>
  );
}
