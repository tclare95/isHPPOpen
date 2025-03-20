import React, { useState, useEffect } from 'react';
import Chart from 'react-google-charts';

const chartArrayHeader = [
  { type: 'datetime', label: 'Date' },
  { type: 'number', label: 'Active CSO per Square kM' },
];

const CsoChart = () => {
  const [chartData, setChartData] = useState([chartArrayHeader]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/waterquality/csodensity');
        const csoData = await response.json();
        const data = csoData.map((element) => {
          const dateConvert = new Date(Date.parse(element.timestamp));
          return [dateConvert, element.numberCSOsPerKm2];
        });

        // Set chart data with header
        setChartData([chartArrayHeader, ...data]);
      } catch (error) {
        console.error('Error fetching CSO data:', error);
      }
    };

    fetchData();
  }, []); // Empty dependency array to run only once on mount

  return (
    <Chart
      width={'100%'}
      height={350}
      chartType="LineChart"
      loader={<div>Loading Chart...</div>}
      data={chartData}
      options={{
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
          format: "0.00",
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
        },
        colors: ["#1c91c0"],
      }}
    />
  );
};

export default CsoChart;
