import PropTypes from "prop-types";
import { Chart } from "react-google-charts";
import { Badge, Button, Card, Col, Stack } from "react-bootstrap";
import { getTrentStationKey } from "../../libs/trentWeirsConfig";
import ColwickAlertSignup from "./colwickAlertSignup";

function getDataPointsToShow(numDays) {
  if (numDays === 7) {
    return 672;
  }

  if (numDays === 3) {
    return 288;
  }

  return 96;
}

function formatCurrentValue(value, measureType) {
  if (typeof value !== "number") {
    return "Unavailable";
  }

  if (measureType === "flow") {
    return `${value.toFixed(1)} cumecs`;
  }

  return `${value.toFixed(2)} m`;
}

function formatChange(value, measureType, intervalLabel) {
  if (typeof value !== "number") {
    return `${intervalLabel}: unavailable`;
  }

  const prefix = value > 0 ? "+" : "";
  const unit = measureType === "flow" ? "cumecs" : "cm";
  return `${intervalLabel}: ${prefix}${value.toFixed(1)} ${unit}`;
}

function buildChartData(measureSnapshot, numDays, measureType) {
  const dataPointsToShow = getDataPointsToShow(numDays);
  const readings = measureSnapshot?.readings ?? [];

  return [
    ["Time", measureType],
    ...readings
      .slice(0, dataPointsToShow)
      .reverse()
      .map((item) => [new Date(item.dateTime), item.value]),
  ];
}

export default function TrentWeirBlock({
  station,
  measureSnapshot,
  numDays,
  isSelected,
  onSelect,
}) {
  const chartData = buildChartData(measureSnapshot, numDays, station.measureType);
  const selectionLabel = isSelected ? "Included in compare" : "Compare on chart";

  return (
    <Col xl={4} md={6}>
      <Card bg="dark" text="light" border="secondary" className="h-100 shadow-sm">
        <Card.Body className="d-flex flex-column">
          <Stack direction="horizontal" className="justify-content-between align-items-start mb-3 gap-2">
            <div>
              <Card.Title className="mb-1">{station.gaugeName}</Card.Title>
              <div className="text-secondary small">{station.summary}</div>
            </div>
            <Badge bg={isSelected ? "primary" : "secondary"}>{station.measureType}</Badge>
          </Stack>

          <div className="mb-3">
            <div className="text-secondary text-uppercase small">Current reading</div>
            <div className="fs-4 fw-semibold">{formatCurrentValue(measureSnapshot?.latestValue, station.measureType)}</div>
            <div className="small text-secondary mt-2">{formatChange(measureSnapshot?.rateOfChangeHour, station.measureType, "1h change")}</div>
            <div className="small text-secondary">{formatChange(measureSnapshot?.rateOfChangeDay, station.measureType, "24h change")}</div>
          </div>

          {measureSnapshot ? (
            <div className="mb-3 flex-grow-1">
              <Chart
                width="100%"
                height="220px"
                chartType="LineChart"
                loader={<div>Loading chart…</div>}
                data={chartData}
                options={{
                  backgroundColor: "transparent",
                  legend: { position: "none" },
                  hAxis: {
                    title: "Time",
                    format: numDays > 1 ? "d MMM HH:mm" : "HH:mm",
                    textStyle: { color: "#e9ecef" },
                    titleTextStyle: { color: "#f8f9fa" },
                  },
                  vAxis: {
                    title: station.measureType === "flow" ? "Flow (cumecs)" : "Level (m)",
                    textStyle: { color: "#e9ecef" },
                    titleTextStyle: { color: "#f8f9fa" },
                  },
                  chartArea: { width: "82%", height: "68%" },
                }}
              />
            </div>
          ) : (
            <Card.Text className="text-secondary flex-grow-1">No data available for this gauge right now.</Card.Text>
          )}

          {station.comparisonEnabled && onSelect ? (
            <div className="d-grid">
              <Button variant={isSelected ? "primary" : "outline-light"} onClick={() => onSelect(station)}>
                {selectionLabel}
              </Button>
            </div>
          ) : null}

          {station.alertingEnabled ? (
            <ColwickAlertSignup
              gaugeKey={getTrentStationKey(station)}
              gaugeName={station.gaugeName}
              forecastAvailable={station.forecastAvailable}
            />
          ) : null}
        </Card.Body>
      </Card>
    </Col>
  );
}

TrentWeirBlock.propTypes = {
  station: PropTypes.shape({
    stationId: PropTypes.number.isRequired,
    gaugeName: PropTypes.string.isRequired,
    measureType: PropTypes.string.isRequired,
    summary: PropTypes.string,
    comparisonEnabled: PropTypes.bool,
    alertingEnabled: PropTypes.bool,
    forecastAvailable: PropTypes.bool,
  }).isRequired,
  measureSnapshot: PropTypes.shape({
    latestValue: PropTypes.number,
    rateOfChangeHour: PropTypes.number,
    rateOfChangeDay: PropTypes.number,
    readings: PropTypes.arrayOf(
      PropTypes.shape({
        dateTime: PropTypes.string.isRequired,
        value: PropTypes.number.isRequired,
      })
    ),
  }),
  numDays: PropTypes.number.isRequired,
  isSelected: PropTypes.bool,
  onSelect: PropTypes.func,
};
