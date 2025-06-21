import useSWR from 'swr';
import { useState } from 'react';
import { Chart } from 'react-google-charts';
import { Card, Col, Dropdown } from 'react-bootstrap';
import { fetcher } from '../../libs/fetcher';

export default function TrentWeirBlock({ gaugeName, gaugeId = 4126, measureType = 'level' }) {
  const [numDays, setNumDays] = useState(7);
  const { data, error } = useSWR(
    `https://environment.data.gov.uk/flood-monitoring/id/stations/${gaugeId}/readings?_sorted&_limit=672`,
    fetcher
  );

  const isPending = !data && !error;

  let measureData = [];
  let chartData = [['Time', measureType]];

  let levelData = { level: 0, rateOfChangeHour: 0, rateOfChangeDay: 0 };

  if (data && data.items) {
    measureData = data.items.filter(item => item.measure.includes(measureType));
    const latestReading = measureData[0]?.value || 0;
    const readingOneHourAgo = measureData[4]?.value || latestReading;
    const readingOneDayAgo = measureData[96]?.value || latestReading;
    levelData = {
      level: latestReading,
      rateOfChangeHour: ((latestReading - readingOneHourAgo) * (measureType === 'level'? 100 : 1)).toFixed(1),
      rateOfChangeDay: ((latestReading - readingOneDayAgo) * (measureType === 'level'? 100 : 1)).toFixed(1)
    };
    const dataPointsToShow = numDays === 7 ? 672 : numDays === 3 ? 288 : 96;
    chartData.push(
      ...measureData.slice(0, dataPointsToShow).reverse().map(item => [new Date(item.dateTime).toLocaleTimeString(), item.value])
    );
  }

  return (
    <Col md={6}>
      <Card className="mb-4">
        <Card.Body>
          <Card.Title>
            {gaugeName}
            <Dropdown className="float-right">
              <Dropdown.Toggle variant="secondary">
                {numDays} Day{numDays > 1 ? 's' : ''}
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item onClick={() => setNumDays(1)}>1 Day</Dropdown.Item>
                <Dropdown.Item onClick={() => setNumDays(3)}>3 Days</Dropdown.Item>
                <Dropdown.Item onClick={() => setNumDays(7)}>7 Days</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </Card.Title>
          {isPending && <p>Loading...</p>}
          {error && <p>Error: {error.message}</p>}
          {data && (
            <>
              <p>Current Level: {levelData.level}</p>
              <p>Rate of Change (Last Hour): {levelData.rateOfChangeHour} { measureType === 'level'? 'cm' : 'cumecs' }</p>
              <p>Rate of Change (Last Day): {levelData.rateOfChangeDay} { measureType === 'level'? 'cm' : 'cumecs' }</p>
              <Chart
                width={'100%'}
                height={'400px'}
                chartType="LineChart"
                loader={<div>Loading Chart</div>}
                data={chartData}
                options={{
                  hAxis: { title: 'Time', format: 'HH:mm' },
                  vAxis: { title: measureType.charAt(0).toUpperCase() + measureType.slice(1) },
                  chartArea: { width: '80%', height: '70%' },
                }}
              />
            </>
          )}
        </Card.Body>
      </Card>
    </Col>
  );
}
