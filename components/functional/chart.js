import React, { useState, useEffect } from 'react';
import Chart from 'react-google-charts';
import PropTypes from 'prop-types';

const chartArrayHeader = [
  { type: 'datetime', label: 'Date' },
  { type: 'string', role: 'annotation' },
  { type: 'string', role: 'annotationText' },
  { type: 'number', label: 'River Level' },
  { type: 'number', label: 'Normal Low' },
  { type: 'number', label: 'Cut Off' },
  { type: 'number', label: 'Forecast' },
];

const ChartRender = ({ graphData, graphForeCastData, lowerBound, upperBound }) => {
  const [chartData, setChartData] = useState([chartArrayHeader]);

  useEffect(() => {
    const data = [];

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
      ]);
    });

    graphForeCastData.forEach((element) => {
      const dateConvert = new Date(Date.parse(element.forecast_date));
      data.push([
        dateConvert,
        null,
        null,
        null,
        lowerBound,
        upperBound,
        element.forecast_reading,
      ]);
    });

    // Add 'now' line
    const now = new Date();
    data.push([now, 'Now', null, null, null, null, null]);

    // Sort the data array
    data.sort((a, b) => a[0] - b[0]);

    // Set chart data with header
    setChartData([chartArrayHeader, ...data]);
  }, [graphData, graphForeCastData, lowerBound, upperBound]); // Dependency array to trigger update

  return (
    <Chart
      width={'100%'}
      height={350}
      chartType="ComboChart"
      loader={<div>Loading Chart...</div>}
      data={chartData}
      options={{
          intervals: { style: "sticks" },
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
            0: {pointSize: 3},
            1: {lineDashStyle:[2,2], tooltip : false},
            2: {lineDashStyle:[10,2], tooltip : false},
            3: {lineDashStyle:[4,2]}
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
          // crosshair: { trigger: 'both', orientation: 'horizontal', opacity: 0.3, },
          
        }}
    />
  );
};

export default ChartRender;

ChartRender.propTypes = {
  graphData: PropTypes.arrayOf(
    PropTypes.shape({
      reading_date: PropTypes.string.isRequired,
      reading_level: PropTypes.number.isRequired,
    })
  ).isRequired,
  graphForeCastData: PropTypes.arrayOf(
    PropTypes.shape({
      forecast_date: PropTypes.string.isRequired,
      forecast_reading: PropTypes.number.isRequired,
    })
  ).isRequired,
  lowerBound: PropTypes.number.isRequired,
  upperBound: PropTypes.number.isRequired,
};
