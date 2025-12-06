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

export default function ForecastInfo() {
  const [forecastSource, setForecastSource] = useState("s3");
  const [showConfidence, setShowConfidence] = useState(true);
  const [showStats, setShowStats] = useState(false);
  
  const { data: levelData, isPending: levelPending } = useFetch("/api/levels");
  const { data: s3Data, isPending: s3Pending } = useFetch("/api/s3forecast");
  const { data: accuracyData, isPending: accuracyPending } = useFetch("/api/forecastaccuracy");
  
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
