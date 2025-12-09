import React, { useState, useEffect } from 'react';
import Chart from 'react-google-charts';

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

/**
 * Get the error margin for a given horizon in hours
 * Uses linear interpolation between known accuracy data points
 */
const getErrorForHorizon = (horizonHours, accuracyData) => {
  if (!accuracyData || accuracyData.length === 0) {
    return null;
  }

  // Sort by horizon
  const sorted = [...accuracyData]
    .filter(d => d.mae !== null)
    .sort((a, b) => a.horizon_hours - b.horizon_hours);

  if (sorted.length === 0) return null;

  // Find surrounding data points for interpolation
  let lower = null;
  let upper = null;

  for (const point of sorted) {
    if (point.horizon_hours <= horizonHours) {
      lower = point;
    }
    if (point.horizon_hours >= horizonHours && !upper) {
      upper = point;
    }
  }

  // If horizon is before first data point, use first point's error
  if (!lower && upper) {
    return upper.mae;
  }

  // If horizon is after last data point, extrapolate from last two points
  if (lower && !upper) {
    // Use last known MAE, or extrapolate if we have multiple points
    if (sorted.length >= 2) {
      const secondLast = sorted[sorted.length - 2];
      const last = sorted[sorted.length - 1];
      const slope = (last.mae - secondLast.mae) / (last.horizon_hours - secondLast.horizon_hours);
      return last.mae + slope * (horizonHours - last.horizon_hours);
    }
    return lower.mae;
  }

  // If exact match
  if (lower.horizon_hours === horizonHours) {
    return lower.mae;
  }

  // Linear interpolation between two points
  if (lower && upper) {
    const ratio = (horizonHours - lower.horizon_hours) / (upper.horizon_hours - lower.horizon_hours);
    return lower.mae + ratio * (upper.mae - lower.mae);
  }

  return null;
};

/**
 * Calculate stability factor for confidence interval scaling
 * When stability_std is high relative to MAE, widen the interval modestly
 * When stability is zero or null, factor stays at baseline (1.0)
 * @param {number|null} stabilityStd - Standard deviation of recent predictions
 * @param {number|null} mae - Mean absolute error for this horizon
 * @returns {number} Stability factor between 1.0 and 1.5
 */
const getStabilityFactor = (stabilityStd, mae) => {
  if (stabilityStd === null || stabilityStd === undefined || mae === null || mae === undefined || mae === 0) {
    return 1;
  }
  // Scale factor: 1.0 when stability is 0, up to 1.5 when stability >= MAE
  // Using 0.5x multiplier for more modest scaling
  const factor = 1 + 0.5 * (stabilityStd / mae);
  return Math.min(1.5, Math.max(1, factor));
};

const ForecastChartWithConfidence = ({ 
  graphData, 
  graphForeCastData, 
  lowerBound, 
  upperBound,
  accuracyData,
  showConfidence = true 
}) => {
  const [chartData, setChartData] = useState([chartArrayHeader]);

  useEffect(() => {
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

    // Get forecast start time to calculate horizons
    const forecastStartTime = graphForeCastData.length > 0 
      ? new Date(Date.parse(graphForeCastData[0].forecast_date))
      : new Date();

    // Pre-calculate smoothed stability values using a moving average (window of 5)
    const smoothedStability = graphForeCastData.map((element, index) => {
      const windowSize = 5;
      const halfWindow = Math.floor(windowSize / 2);
      const start = Math.max(0, index - halfWindow);
      const end = Math.min(graphForeCastData.length, index + halfWindow + 1);
      
      const windowValues = graphForeCastData
        .slice(start, end)
        .map(e => e.stability_std)
        .filter(v => v !== null && v !== undefined);
      
      if (windowValues.length === 0) return null;
      return windowValues.reduce((sum, v) => sum + v, 0) / windowValues.length;
    });

    // Add forecast data with confidence intervals (scaled by smoothed stability)
    graphForeCastData.forEach((element, index) => {
      const dateConvert = new Date(Date.parse(element.forecast_date));
      const forecastValue = element.forecast_reading;
      
      // Calculate horizon in hours from forecast start
      const horizonHours = (dateConvert - forecastStartTime) / (1000 * 60 * 60);
      
      // Get error margin for this horizon
      let confLow = null;
      let confHigh = null;
      
      if (showConfidence && accuracyData && accuracyData.length > 0) {
        const errorMargin = getErrorForHorizon(horizonHours, accuracyData);
        if (errorMargin !== null) {
          // Calculate stability factor using smoothed stability to avoid jagged bands
          const stabilityFactor = getStabilityFactor(smoothedStability[index], errorMargin);
          // Use 1.96x MAE for ~95% confidence interval, scaled by stability
          const interval = errorMargin * 1.96 * stabilityFactor;
          confLow = forecastValue - interval;
          confHigh = forecastValue + interval;
        }
      }

      data.push([
        dateConvert,
        null,
        null,
        null,
        lowerBound,
        upperBound,
        forecastValue,
        confLow,
        confHigh,
      ]);
    });

    // Add 'now' line
    const now = new Date();
    data.push([now, 'Now', null, null, null, null, null, null, null]);

    // Sort the data array
    data.sort((a, b) => a[0] - b[0]);

    // Set chart data with header
    setChartData([chartArrayHeader, ...data]);
  }, [graphData, graphForeCastData, lowerBound, upperBound, accuracyData, showConfidence]);

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
