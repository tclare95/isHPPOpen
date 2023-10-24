import useSWR from "swr";
import { Chart } from "react-google-charts";
import { useState } from "react";

function simpleMovingAverage(data, windowSize) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const end = i + 1;
    const windowData = data.slice(start, end);
    const average =
      windowData.reduce((sum, value) => sum + parseFloat(value), 0) /
      windowData.length;
    result.push(average);
  }
  return result;
}

const fetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Failed to fetch");
  }
  return res.json();
};

const multiFetcher = async (urls) => {
  return await Promise.all(urls.map((url) => fetcher(url)));
};

export default function MultiMeasureChart({ stations }) {
  const [numDays, setNumDays] = useState(7);

  const { data: stationData, error } = useSWR("multi-station-fetch", () =>
    multiFetcher(
      stations.map(
        (station) =>
          `https://environment.data.gov.uk/flood-monitoring/id/stations/${station.id}/readings?_sorted&_limit=672`
      )
    )
  );
  const isPending = !stationData && !error;

  let chartData = [["Time", ...stations.map((station) => station.name)]];
  let rateOfChangeData = [["Time", ...stations.map((station) => station.name)]];
  let combinedData = [];

  if (stationData) {
    // Apply filtering to only include items where measureType includes 'level'
    const filteredStationData = stationData.map((data) => ({
      ...data,
      items: data.items.filter((item) => item.measure.includes("level")),
    }));

    if (!filteredStationData[0] || !filteredStationData[0].items) {
      return (
        <p>
          Error: Data for the first station is unavailable or improperly
          structured.
        </p>
      );
    }

    const timestamps = filteredStationData[0].items.map(
      (item) => item.dateTime
    );
    const reversedTimestamps = timestamps.reverse();

    reversedTimestamps.forEach((timestamp) => {
      const row = [new Date(timestamp).toLocaleTimeString()];
      filteredStationData.forEach((data, index) => {
        const measure = data.items.find((item) => item.dateTime === timestamp);
        row.push(measure ? measure.value : null);
      });
      chartData.push(row);
    });

    const smaChartData = chartData.map((row, rowIndex) => {
      if (rowIndex === 0) return row; // keep the header row
      const smaRow = [row[0]]; // convert timestamp to Date object
      for (let colIndex = 1; colIndex < row.length; colIndex++) {
        const columnData = chartData.map((row) => row[colIndex]);
        const smaColumnData = simpleMovingAverage(columnData, 8); 
        smaRow.push(smaColumnData[rowIndex] || null); // add smoothed data or null if undefined
      }
      return smaRow;
    });

    for (let i = 1; i < smaChartData.length; i++) {
      const timestamp = smaChartData[i][0];
      const row = [timestamp];
      for (let j = 1; j < smaChartData[i].length; j++) {
        const previousValue = parseFloat(smaChartData[i - 1][j]);
        const currentValue = parseFloat(smaChartData[i][j]);
        if (!isNaN(previousValue) && !isNaN(currentValue)) {
          const deltaValue = currentValue - previousValue;
          row.push(deltaValue);
        } else {
          row.push(null); // Push null for non-numeric data
        }
      }
      rateOfChangeData.push(row);
    }

    combinedData = [
      [
        "Time",
        ...stations.map((station) => `${station.name} Level`),
        ...stations.map((station) => `${station.name} RoC`),
      ],
      ...chartData
        .slice(1)
        .map((row, index) => [
          row[0],
          ...row.slice(1),
          ...rateOfChangeData[index + 1].slice(1),
        ]),
    ];
  }

  return (
    <>
      {isPending && <p>Loading...</p>}
      {error && <p>Error: {error.message}</p>}
      {stationData && (
        <>
          <Chart
            width={"100%"}
            height={"400px"}
            chartType="LineChart"
            loader={<div>Loading Chart</div>}
            data={chartData}
            options={{
              hAxis: { title: "Time", format: "HH:mm" },
              vAxis: { title: "Measure" },
              chartArea: { width: "80%", height: "70%" },
              focusTarget: "category",
            }}
          />
          <Chart
            width={"100%"}
            height={"400px"}
            chartType="LineChart"
            loader={<div>Loading Chart</div>}
            data={rateOfChangeData}
            options={{
              hAxis: { title: "Time", format: "HH:mm" },
              vAxis: { title: "Rate of Change" },
              chartArea: { width: "80%", height: "70%" },
              focusTarget: "category",
            }}
          />
          <Chart
            width={"100%"}
            height={"400px"}
            chartType="LineChart"
            loader={<div>Loading Chart</div>}
            data={combinedData}
            options={{
              hAxis: { title: "Time", format: "HH:mm" },
              vAxis: {
                0: { title: "Measure" },
                1: { title: "Rate of Change" },
              },
              series: {
                ...stations.reduce(
                  (acc, _, index) => ({
                    ...acc,
                    [index]: { targetAxisIndex: 0 },
                  }),
                  {}
                ),
                ...stations.reduce(
                  (acc, _, index) => ({
                    ...acc,
                    [index + stations.length]: { targetAxisIndex: 1 },
                  }),
                  {}
                ),
              },
              chartArea: { width: "80%", height: "70%" },
              focusTarget: "category",
            }}
          />
        </>
      )}
    </>
  );
}
