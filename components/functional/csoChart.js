import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import useFetch from '../../libs/useFetch';
import { SWR_15_MINUTES } from '../../libs/dataFreshness';

const Chart = dynamic(
  () => import('react-google-charts').then((mod) => mod.Chart),
  { ssr: false }
);

const chartArrayHeader = [
  { type: 'datetime', label: 'Date' },
  { type: 'number', label: 'Active CSO per Square kM' },
];

const CsoChart = () => {
  const { data, error, isPending } = useFetch('/api/waterquality/csodensity', SWR_15_MINUTES);

  const chartData = useMemo(() => {
    const source = Array.isArray(data) ? data : [];
    const rows = source
      .map((element) => {
        const dateConvert = new Date(Date.parse(element?.timestamp));
        const numberPerKm2 = Number(element?.numberCSOsPerKm2);

        if (Number.isNaN(dateConvert.getTime()) || !Number.isFinite(numberPerKm2)) {
          return null;
        }

        return [dateConvert, numberPerKm2];
      })
      .filter(Boolean);

    return [chartArrayHeader, ...rows];
  }, [data]);

  if (isPending) {
    return <div>Loading chart...</div>;
  }

  if (error) {
    return <div>Unable to load chart data right now.</div>;
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
