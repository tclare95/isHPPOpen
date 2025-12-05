import { useState } from "react";
import Link from "next/link";
import { Col, Container, Row, ButtonGroup, Button, Spinner, Card, Table, Badge, Form } from "react-bootstrap";
import Meta from "../components/meta";
import ForecastChartWithConfidence from "../components/functional/forecastChart";
import useFetch from "../libs/useFetch";
import GraphContext from "../libs/context/graphcontrol";
import { useContext } from "react";

// Helper to format numbers to fixed decimals, handling nulls
const formatMetric = (value, decimals = 3) => {
  if (value === null || value === undefined) return "N/A";
  return value.toFixed(decimals);
};

// Helper to get badge variant based on MAE quality
const getQualityBadge = (mae) => {
  if (mae === null) return { variant: "secondary", text: "No Data" };
  if (mae < 0.05) return { variant: "success", text: "Excellent" };
  if (mae < 0.1) return { variant: "info", text: "Good" };
  if (mae < 0.2) return { variant: "warning", text: "Fair" };
  return { variant: "danger", text: "Poor" };
};

export default function NewForecast() {
  const [forecastSource, setForecastSource] = useState("ea"); // "ea" or "s3"
  const [showConfidence, setShowConfidence] = useState(true);
  
  const { data: levelData, error: levelError, isPending: levelPending } = useFetch("/api/levels");
  const { data: s3Data, error: s3Error, isPending: s3Pending } = useFetch("/api/s3forecast");
  const { data: accuracyData, error: accuracyError, isPending: accuracyPending } = useFetch("/api/forecastaccuracy");
  
  const { lowerBound, upperBound, updateBounds } = useContext(GraphContext);

  const isPending = levelPending || s3Pending;
  const hasError = levelError || s3Error;

  // Select which forecast to display based on toggle
  const selectedForecast = forecastSource === "ea" 
    ? levelData?.forecast_data || []
    : s3Data?.forecast_data || [];

  return (
    <Container fluid className="bg-dark min-vh-100">
      <Meta title="Forecast Comparison - Is HPP Open" />
      <Container className="text-white text-center py-4">
        <Row className="mb-4">
          <Col>
            <h1>Forecast Comparison</h1>
            <Link href="/">
              <h3 className="navHeader">← Back to Main Page</h3>
            </Link>
            <p className="text-muted">
              Testing page to compare existing EA forecast with new S3-hosted forecast model
            </p>
          </Col>
        </Row>

        {/* Forecast Source Toggle */}
        <Row className="justify-content-center mb-4">
          <Col xs="auto">
            <ButtonGroup>
              <Button
                variant={forecastSource === "ea" ? "primary" : "outline-primary"}
                onClick={() => setForecastSource("ea")}
              >
                EA Forecast (MongoDB)
              </Button>
              <Button
                variant={forecastSource === "s3" ? "primary" : "outline-primary"}
                onClick={() => setForecastSource("s3")}
              >
                New Forecast (S3)
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
              <Card bg="secondary" text="white" className="p-2">
                <small>
                  <strong>Forecast generated:</strong> {new Date(s3Data.metadata.forecast_time).toLocaleString()}
                  {" | "}
                  <strong>Current level at forecast time:</strong> {s3Data.metadata.current_level}m
                </small>
              </Card>
            </Col>
          </Row>
        )}

        {/* Error Display */}
        {hasError && (
          <Row className="justify-content-center mb-3">
            <Col xs="auto">
              <div className="alert alert-danger">
                {levelError && <p>Error loading level data: {levelError.message}</p>}
                {s3Error && <p>Error loading S3 forecast: {s3Error.message}</p>}
              </div>
            </Col>
          </Row>
        )}

        {/* Chart */}
        <Row className="justify-content-center">
          <Col>
            {isPending ? (
              <Spinner animation="border" role="status">
                <span className="visually-hidden">Loading...</span>
              </Spinner>
            ) : levelData?.level_data ? (
              <>
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
                  data-lowerbound="0.98"
                  data-upperbound="2.2"
                  onClick={updateBounds}
                >
                  Reset graph to HPP guidelines
                </Button>
                {forecastSource === "s3" && showConfidence && accuracyData?.accuracy_data && (
                  <p className="text-muted mt-2">
                    <small>
                      Shaded area shows 95% confidence interval based on historical forecast accuracy (±1.96 × MAE)
                    </small>
                  </p>
                )}
              </>
            ) : (
              <p>No data available</p>
            )}
          </Col>
        </Row>

        {/* Forecast Data Summary */}
        <Row className="justify-content-center mt-4">
          <Col md={6}>
            <Card bg="dark" border="secondary" text="white">
              <Card.Header>
                {forecastSource === "ea" ? "EA Forecast" : "New S3 Forecast"} Summary
              </Card.Header>
              <Card.Body>
                <p><strong>Data points:</strong> {selectedForecast.length}</p>
                {selectedForecast.length > 0 && (
                  <>
                    <p>
                      <strong>First forecast:</strong>{" "}
                      {new Date(selectedForecast[0].forecast_date).toLocaleString()} - {selectedForecast[0].forecast_reading}m
                    </p>
                    <p>
                      <strong>Last forecast:</strong>{" "}
                      {new Date(selectedForecast[selectedForecast.length - 1].forecast_date).toLocaleString()} - {selectedForecast[selectedForecast.length - 1].forecast_reading}m
                    </p>
                  </>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Forecast Accuracy Section */}
        <Row className="justify-content-center mt-4">
          <Col md={10}>
            <Card bg="dark" border="info" text="white">
              <Card.Header className="bg-info">
                <h5 className="mb-0">📊 Forecast Accuracy Metrics</h5>
              </Card.Header>
              <Card.Body>
                {accuracyPending ? (
                  <Spinner animation="border" role="status" size="sm">
                    <span className="visually-hidden">Loading accuracy data...</span>
                  </Spinner>
                ) : accuracyError ? (
                  <p className="text-warning">Unable to load accuracy data</p>
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
                          <th>Max Error (m)</th>
                          <th>Samples</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accuracyData.accuracy_data.map((row) => {
                          const quality = getQualityBadge(row.mae);
                          return (
                            <tr key={row.horizon_hours}>
                              <td><strong>{row.horizon_hours}h</strong></td>
                              <td>
                                <Badge bg={quality.variant}>{quality.text}</Badge>
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
                              <td>{formatMetric(row.max_error)}</td>
                              <td>{row.predictions_compared || "N/A"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                    <div className="text-start mt-3">
                      <small className="text-muted">
                        <strong>Legend:</strong><br />
                        • <strong>MAE</strong> (Mean Absolute Error): Average prediction error<br />
                        • <strong>RMSE</strong> (Root Mean Square Error): Penalizes larger errors more<br />
                        • <strong>Bias</strong>: Positive = over-predicts, Negative = under-predicts<br />
                        • <strong>Max Error</strong>: Largest single prediction error
                      </small>
                    </div>
                  </>
                ) : (
                  <p>No accuracy data available</p>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </Container>
  );
}
