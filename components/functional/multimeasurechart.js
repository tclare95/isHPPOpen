import PropTypes from "prop-types";
import Alert from "react-bootstrap/Alert";
import Card from "react-bootstrap/Card";
import { Chart } from "react-google-charts";

function getStationMeasure(snapshot, stationId, measureType) {
  const station = snapshot?.stations?.find((item) => item.stationId === stationId);
  return station?.measures?.[measureType] ?? null;
}

function getDataPointsToShow(numDays) {
  if (numDays === 7) {
    return 672;
  }

  if (numDays === 3) {
    return 288;
  }

  return 96;
}

function smoothSeries(values, windowSize) {
  return values.map((_, index) => {
    const window = values
      .slice(Math.max(0, index - windowSize + 1), index + 1)
      .filter((value) => typeof value === "number");

    if (window.length === 0) {
      return null;
    }

    const total = window.reduce((sum, value) => sum + value, 0);
    return total / window.length;
  });
}

function buildCombinedSeries(stations) {
  return {
    ...stations.reduce(
      (accumulator, _, index) => ({
        ...accumulator,
        [index]: { targetAxisIndex: 0 },
      }),
      {}
    ),
    ...stations.reduce(
      (accumulator, _, index) => ({
        ...accumulator,
        [index + stations.length]: { targetAxisIndex: 1 },
      }),
      {}
    ),
  };
}

function buildChartState(stations, stationSnapshot, numDays) {
  const measureEntries = stations
    .map((station) => ({
      station,
      readings:
        getStationMeasure(stationSnapshot, station.stationId, station.measureType ?? "level")?.readings ?? [],
    }))
    .sort((left, right) => right.readings.length - left.readings.length);

  const availableEntries = measureEntries.filter((entry) => entry.readings.length > 0);
  const unavailableStations = measureEntries
    .filter((entry) => entry.readings.length === 0)
    .map((entry) => entry.station.name);

  if (availableEntries.length === 0) {
    return {
      errorMessage: "No selected gauge data is available right now.",
      unavailableStations,
    };
  }

  const dataPointsToShow = getDataPointsToShow(numDays);
  const timestamps = availableEntries[0].readings
    .slice(0, dataPointsToShow)
    .map((item) => item.dateTime)
    .reverse();

  const chartData = [
    ["Time", ...availableEntries.map((entry) => entry.station.name)],
    ...timestamps.map((timestamp) => {
      const row = [new Date(timestamp)];

      availableEntries.forEach((entry) => {
        const match = entry.readings.find((item) => item.dateTime === timestamp);
        row.push(match ? match.value : null);
      });

      return row;
    }),
  ];

  const smoothedSeries = availableEntries.map((_, columnIndex) =>
    smoothSeries(chartData.slice(1).map((row) => row[columnIndex + 1]), 8)
  );

  const rateOfChangeData = [
    ["Time", ...availableEntries.map((entry) => entry.station.name)],
    ...chartData.slice(1).map((row, rowIndex) => {
      const rateRow = [row[0]];

      smoothedSeries.forEach((series) => {
        const previousValue = rowIndex === 0 ? null : series[rowIndex - 1];
        const currentValue = series[rowIndex];
        const hasValues = typeof previousValue === "number" && typeof currentValue === "number";
        rateRow.push(hasValues ? currentValue - previousValue : null);
      });

      return rateRow;
    }),
  ];

  return {
    availableStations: availableEntries.map((entry) => entry.station),
    unavailableStations,
    chartData,
    rateOfChangeData,
    combinedData: [
      [
        "Time",
        ...availableEntries.map((entry) => `${entry.station.name} level`),
        ...availableEntries.map((entry) => `${entry.station.name} change`),
      ],
      ...chartData.slice(1).map((row, index) => [
        row[0],
        ...row.slice(1),
        ...rateOfChangeData[index + 1].slice(1),
      ]),
    ],
  };
}

function getViewConfig(viewMode, chartState) {
  if (viewMode === "rate") {
    return {
      title: "Smoothed rate of change",
      description: "Shows the 15-minute change between smoothed readings so movement is easier to compare.",
      data: chartState.rateOfChangeData,
      options: {
        backgroundColor: "transparent",
        legend: { position: "top", textStyle: { color: "#f8f9fa" } },
        hAxis: {
          title: "Time",
          format: "d MMM HH:mm",
          textStyle: { color: "#e9ecef" },
          titleTextStyle: { color: "#f8f9fa" },
        },
        vAxis: {
          title: "Change per reading (m)",
          textStyle: { color: "#e9ecef" },
          titleTextStyle: { color: "#f8f9fa" },
        },
        chartArea: { width: "82%", height: "68%" },
        focusTarget: "category",
      },
    };
  }

  if (viewMode === "combined") {
    return {
      title: "Combined level and change view",
      description: "Keeps the raw level lines and smoothed per-reading change in one comparison chart.",
      data: chartState.combinedData,
      options: {
        backgroundColor: "transparent",
        legend: { position: "top", textStyle: { color: "#f8f9fa" } },
        hAxis: {
          title: "Time",
          format: "d MMM HH:mm",
          textStyle: { color: "#e9ecef" },
          titleTextStyle: { color: "#f8f9fa" },
        },
        vAxes: {
          0: { title: "Level (m)", textStyle: { color: "#e9ecef" }, titleTextStyle: { color: "#f8f9fa" } },
          1: { title: "Change per reading (m)", textStyle: { color: "#e9ecef" }, titleTextStyle: { color: "#f8f9fa" } },
        },
        series: buildCombinedSeries(chartState.availableStations),
        chartArea: { width: "82%", height: "68%" },
        focusTarget: "category",
      },
    };
  }

  return {
    title: "Level comparison",
    description: "Compare the selected gauge levels over the chosen time window.",
    data: chartState.chartData,
    options: {
      backgroundColor: "transparent",
      legend: { position: "top", textStyle: { color: "#f8f9fa" } },
      hAxis: {
        title: "Time",
        format: "d MMM HH:mm",
        textStyle: { color: "#e9ecef" },
        titleTextStyle: { color: "#f8f9fa" },
      },
      vAxis: {
        title: "Level (m)",
        textStyle: { color: "#e9ecef" },
        titleTextStyle: { color: "#f8f9fa" },
      },
      chartArea: { width: "82%", height: "68%" },
      focusTarget: "category",
    },
  };
}

export default function MultiMeasureChart({ stations, stationSnapshot, numDays, viewMode }) {
  const chartState = buildChartState(stations, stationSnapshot, numDays);

  if (chartState.errorMessage) {
    return <Alert variant="warning">{chartState.errorMessage}</Alert>;
  }

  const viewConfig = getViewConfig(viewMode, chartState);

  return (
    <Card bg="dark" text="light" border="secondary" className="shadow-sm">
      <Card.Body>
        <Card.Title className="mb-1">{viewConfig.title}</Card.Title>
        <Card.Text className="text-secondary">{viewConfig.description}</Card.Text>
        {chartState.unavailableStations.length > 0 ? (
          <Alert variant="warning" className="mb-3">
            Skipping unavailable gauges: {chartState.unavailableStations.join(", ")}.
          </Alert>
        ) : null}
        <Chart
          width="100%"
          height="420px"
          chartType="LineChart"
          loader={<div>Loading chart…</div>}
          data={viewConfig.data}
          options={viewConfig.options}
        />
      </Card.Body>
    </Card>
  );
}

MultiMeasureChart.propTypes = {
  stations: PropTypes.arrayOf(
    PropTypes.shape({
      stationId: PropTypes.number.isRequired,
      name: PropTypes.string.isRequired,
      measureType: PropTypes.string,
    })
  ).isRequired,
  stationSnapshot: PropTypes.shape({
    stations: PropTypes.arrayOf(PropTypes.object),
  }),
  numDays: PropTypes.number.isRequired,
  viewMode: PropTypes.oneOf(["level", "rate", "combined"]).isRequired,
};
