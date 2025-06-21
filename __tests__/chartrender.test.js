import { render, screen, waitFor } from '@testing-library/react';
import ChartRender from '../components/functional/chart';

jest.mock('react-google-charts', () => props => {
  return <div data-testid="chart" data={JSON.stringify(props.data)}></div>;
});

describe('ChartRender component', () => {
  it('renders chart with data rows', async () => {
    const graphData = [
      { reading_date: '2025-06-19T00:00:00Z', reading_level: 1.2 }
    ];
    const graphForecastData = [
      { forecast_date: '2025-06-20T00:00:00Z', forecast_reading: 1.3 }
    ];
    render(
      <ChartRender graphData={graphData} graphForeCastData={graphForecastData} lowerBound={0.5} upperBound={2.0} />
    );
    await waitFor(() => {
      const el = screen.getByTestId('chart');
      const data = JSON.parse(el.getAttribute('data'));
      expect(data.length).toBe(1 + graphData.length + graphForecastData.length + 1);
    });
  });
});
