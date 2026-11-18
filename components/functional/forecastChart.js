import React, { useState, useEffect, useMemo } from 'react';
import Chart from 'react-google-charts';
import { getForecastIntervals } from '../../libs/forecastConfidence';

// Chart header with confidence interval columns
const chartArrayHeader = [
  { type: 'datetime', label: 'Date' },
  { type: 'string', role: 'annotation' },
  { type: 'string', role: 'annotationText' },
  { type: 'number', label: 'River Level' },
  { type: 'number', label: 'Normal Low' },
  { type: 'number', label: 'Cut Off' },
  { type: 'number', label: 'Forecast' },
  { type: 'number', id: 'conf-low', role: 'interval' },
  { type: 'number', id: 'conf-high', role: 'interval' },
];

const ForecastChartWithConfidence = ({ 
  graphData, 
  graphForeCastData, 
  lowerBound, 
  upperBound,
  accuracyData,
  showConfidence = true,
}) => {
  const [now, setNow] = useState(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Sample the external clock when chart inputs change.
    setNow(new Date());
  }, [graphData, graphForeCastData, lowerBound, upperBound, accuracyData, showConfidence]);

  const chartData = useMemo(() => {
    const data = [];

    // Add historical level data (no confidence intervals)
    graphData.forEach((element) => {
      const dateConvert = new Date(Date.parse(element.reading_date));
      data.push([
        dateConvert,
        null,
        null,
        element.reading_level,
        lowerBound,
        upperBound,
        null,
        null,
        null,
      ]);
    });

    // The indicative ~95% band (1.96 × MAE, scaled by smoothed stability), shared with the homepage summary.
    const intervals = showConfidence && accuracyData && accuracyData.length > 0
      ? getForecastIntervals(graphForeCastData, accuracyData)
      : graphForeCastData.map(() => ({ low: null, high: null }));

    graphForeCastData.forEach((element, index) => {
      data.push([
        new Date(Date.parse(element.forecast_date)),
        null,
        null,
        null,
        lowerBound,
        upperBound,
        element.forecast_reading,
        intervals[index].low,
        intervals[index].high,
      ]);
    });

    // Add 'now' line
    if (now) data.push([now, 'Now', null, null, null, null, null, null, null]);

    // Sort the data array
    data.sort((a, b) => a[0] - b[0]);

    return [chartArrayHeader, ...data];
  }, [graphData, graphForeCastData, lowerBound, upperBound, accuracyData, showConfidence, now]);

  return (
    <Chart
      width={'100%'}
      height={400}
      chartType="ComboChart"
      loader={<div>Loading Chart...</div>}
      data={chartData}
      options={{
        intervals: { 
          style: 'area',
          color: '#FF6347',
          fillOpacity: 0.15,
        },
        legend: {
          position: "bottom",
        },
        chartArea: {
          top: 10,
          right: 10,
          bottom: 50,
          left: 50,
          backgroundColor: {
            stroke: "#ccc",
            strokeWidth: 1,
          },
        },
        hAxis: {
          gridlines: {
            count: -1,
            units: {
              days: { format: ["E, d MMM", "d MMM"] },
              hours: { format: ["d MMM, haa"] },
            },
          },
          viewWindowMode: "maximized",
          textStyle: {
            bold: false,
          },
        },
        vAxis: {
          baseline: "automatic",
          gridlines: {
            count: 5,
          },
          format: "0.00m",
          textStyle: {
            bold: false,
          },
          titleTextStyle: {
            italic: false,
            bold: false,
          },
          viewWindowMode: "pretty",
        },
        series: {
          0: { pointSize: 3 },
          1: { lineDashStyle: [2, 2], tooltip: false },
          2: { lineDashStyle: [10, 2], tooltip: false },
          3: { lineDashStyle: [4, 2] },
        },
        colors: ["#1c91c0", "#6f9654", "#e2431e", "#FF6347"],
        annotations: {
          textStyle: {
            color: '#000000',
            fontSize: 13
          },
          alwaysOutside: true,
          stem: {
            color: '#000000',
            width: 6
          },
          style: 'line'
        },
      }}
    />
  );
};

export default ForecastChartWithConfidence;
