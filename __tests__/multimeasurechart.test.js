/* eslint-disable react/prop-types */
import { render, screen } from "@testing-library/react";
import MultiMeasureChart from "../components/functional/multimeasurechart";

jest.mock("react-google-charts", () => ({
  Chart: ({ data }) => <div data-testid="chart" data-chart={JSON.stringify(data)} />,
}));

const stations = [
  { stationId: 4126, name: "Clifton Bridge", measureType: "level" },
  { stationId: 4009, name: "Colwick", measureType: "level" },
];

describe("MultiMeasureChart", () => {
  test("renders combined charts from the cached Trent snapshot", () => {
    render(
      <MultiMeasureChart
        stations={stations}
        stationSnapshot={{
          stations: [
            {
              stationId: 4126,
              measures: {
                level: {
                  readings: [
                    { dateTime: "2026-03-08T12:00:00.000Z", value: 2.2 },
                    { dateTime: "2026-03-08T11:45:00.000Z", value: 2.1 },
                  ],
                },
              },
            },
            {
              stationId: 4009,
              measures: {
                level: {
                  readings: [
                    { dateTime: "2026-03-08T12:00:00.000Z", value: 1.2 },
                    { dateTime: "2026-03-08T11:45:00.000Z", value: 1.1 },
                  ],
                },
              },
            },
          ],
        }}
        numDays={3}
        viewMode="combined"
      />
    );

    expect(screen.getByText("Combined level and change view")).toBeInTheDocument();
    expect(screen.getAllByTestId("chart")).toHaveLength(1);
  });

  test("renders a warning when selected gauges are unavailable", () => {
    render(
      <MultiMeasureChart
        stations={stations}
        stationSnapshot={{
          stations: [
            {
              stationId: 4009,
              measures: {
                level: {
                  readings: [
                    { dateTime: "2026-03-08T12:00:00.000Z", value: 1.2 },
                    { dateTime: "2026-03-08T11:45:00.000Z", value: 1.1 },
                  ],
                },
              },
            },
          ],
        }}
        numDays={1}
        viewMode="level"
      />
    );

    expect(
      screen.getByText(/Skipping unavailable gauges: Clifton Bridge\./)
    ).toBeInTheDocument();
  });
});
