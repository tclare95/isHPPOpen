import React, { useState, useEffect } from 'react';
import Chart from 'react-google-charts';

/**
 * Spaghetti plot showing how predictions for target times evolved over the last 12 hours
 * Each line represents what was predicted N hours ago for each target time
 */
const StabilityChart = ({ stabilityData }) => {
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    if (!stabilityData || stabilityData.length === 0) {
      setChartData([]);
      return;
    }

    // Build header: Date, Current, 1h ago, 2h ago, ..., 12h ago
    const header = [
      { type: 'datetime', label: 'Target Time' },
      { type: 'number', label: 'Current' },
      { type: 'number', label: '1h ago' },
      { type: 'number', label: '2h ago' },
      { type: 'number', label: '3h ago' },
      { type: 'number', label: '4h ago' },
      { type: 'number', label: '5h ago' },
      { type: 'number', label: '6h ago' },
    ];

    const data = stabilityData.map((row) => {
      const targetTime = new Date(Date.parse(row.target_time));
      // Take current + first 6 historical forecasts for readability
      return [
        targetTime,
        row.forecast_current,
        row.historical_forecasts[0],
        row.historical_forecasts[1],
        row.historical_forecasts[2],
        row.historical_forecasts[3],
        row.historical_forecasts[4],
        row.historical_forecasts[5],
      ];
    });

    // Sort by target time
    data.sort((a, b) => a[0] - b[0]);

    setChartData([header, ...data]);
  }, [stabilityData]);

  if (!chartData || chartData.length <= 1) {
    return <p className="text-muted">No stability data available for chart</p>;
  }

  return (
    <Chart
      width={'100%'}
      height={300}
      chartType="LineChart"
      loader={<div>Loading Chart...</div>}
      data={chartData}
      options={{
        chartArea: {
          top: 10,
          right: 10,
          bottom: 60,
          left: 50,
          backgroundColor: {
            stroke: '#ccc',
            strokeWidth: 1,
          },
        },
        hAxis: {
          gridlines: {
            count: -1,
            units: {
              days: { format: ['E, d MMM', 'd MMM'] },
              hours: { format: ['d MMM, haa'] },
            },
            color: '#444',
          },
          textStyle: {
            bold: false,
            color: '#ccc',
          },
        },
        vAxis: {
          format: '0.00m',
          textStyle: {
            bold: false,
            color: '#ccc',
          },
          gridlines: {
            count: 5,
            color: '#444',
          },
        },
        backgroundColor: '#212529',
        legendTextStyle: {
          color: '#ccc',
        },
        legend: {
          position: 'bottom',
          maxLines: 2,
          textStyle: {
            color: '#ccc',
          },
        },
        colors: [
          '#1c91c0', // Current - bright blue
          '#FF6347', // 1h ago - tomato
          '#FFA500', // 2h ago - orange
          '#FFD700', // 3h ago - gold
          '#90EE90', // 4h ago - light green
          '#87CEEB', // 5h ago - sky blue
          '#DDA0DD', // 6h ago - plum
        ],
        series: {
          0: { lineWidth: 3 }, // Current forecast is thicker
          1: { lineWidth: 1, lineDashStyle: [4, 2] },
          2: { lineWidth: 1, lineDashStyle: [4, 2] },
          3: { lineWidth: 1, lineDashStyle: [4, 2] },
          4: { lineWidth: 1, lineDashStyle: [4, 2] },
          5: { lineWidth: 1, lineDashStyle: [4, 2] },
          6: { lineWidth: 1, lineDashStyle: [4, 2] },
        },
        curveType: 'function',
      }}
    />
  );
};

export default StabilityChart;
