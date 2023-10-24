import useSWR from 'swr';
import { useState } from 'react';
import { Chart } from 'react-google-charts';
import { Card, Container, Row, Col, Dropdown } from 'react-bootstrap';

async function fetcher(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to fetch');
  }
  return res.json();
}

export default function TrentWeirBlock({ gaugeName, gaugeId = 4126 }) {
  const [numDays, setNumDays] = useState(7);
  const { data, error } = useSWR(
    `https://environment.data.gov.uk/flood-monitoring/id/stations/${gaugeId}/readings?_sorted&_limit=672`,
    fetcher
  );

  const isPending = !data && !error;

  let levelData = { level: 0, rateOfChangeHour: 0, rateOfChangeDay: 0 };
  let chartData = [['Time', 'Level']];

  if (data && data.items) {
    const latestReading = data.items[0].value;
    const readingOneHourAgo = data.items[4]?.value || latestReading;
    const readingOneDayAgo = data.items[96]?.value || latestReading;
    levelData = {
      level: latestReading,
      rateOfChangeHour: ((latestReading - readingOneHourAgo) * 100).toFixed(1),
      rateOfChangeDay: ((latestReading - readingOneDayAgo) * 100).toFixed(1)
    };
    const dataPointsToShow = numDays === 7 ? 672 : numDays === 3 ? 288 : 96;
    chartData.push(
      ...data.items.slice(0, dataPointsToShow).reverse().map(item => [new Date(item.dateTime).toLocaleTimeString(), item.value])
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
                  <p>Rate of Change (Last Hour): {levelData.rateOfChangeHour}cm</p>
                  <p>Rate of Change (Last Day): {levelData.rateOfChangeDay}cm</p>
                  <Chart
                    width={'100%'}
                    height={'400px'}
                    chartType="LineChart"
                    loader={<div>Loading Chart</div>}
                    data={chartData}
                    options={{
                      hAxis: { title: 'Time', format: 'HH:mm' },
                      vAxis: { title: 'Level' },
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
