import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const Chart = dynamic(
  () => import('react-google-charts').then((mod) => mod.Chart),
  { ssr: false }
);

const chartArrayHeader = [
  { type: 'datetime', label: 'Date' },
  { type: 'number', label: 'Active CSO per Square kM' },
];

const CsoChart = () => {
  const [chartData, setChartData] = useState([chartArrayHeader]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;

    const fetchData = async () => {
      try {
        const response = await fetch('/api/waterquality/csodensity');
        if (!response.ok) {
          throw new Error(`CSO density request failed with status ${response.status}`);
        }

        const payload = await response.json();
        const csoData = payload?.ok === true ? payload.data : payload;
        const source = Array.isArray(csoData) ? csoData : [];
        const data = source
          .map((element) => {
            const dateConvert = new Date(Date.parse(element?.timestamp));
            const numberPerKm2 = Number(element?.numberCSOsPerKm2);

            if (Number.isNaN(dateConvert.getTime()) || !Number.isFinite(numberPerKm2)) {
              return null;
            }

            return [dateConvert, numberPerKm2];
          })
          .filter(Boolean);

        // Set chart data with header
        if (!ignore) {
          setChartData([chartArrayHeader, ...data]);
        }
      } catch (error) {
        console.error('Error fetching CSO data:', error);
        if (!ignore) {
          setError('Unable to load chart data right now.');
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      ignore = true;
    };
  }, []); // Empty dependency array to run only once on mount

  if (isLoading) {
    return <div>Loading chart...</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  if (chartData.length <= 1) {
    return <div>No chart data available.</div>;
  }

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
