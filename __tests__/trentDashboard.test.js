/* eslint-disable react/prop-types */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TrentDashboard from "../components/functional/trentDashboard";
import useFetch from "../libs/useFetch";

jest.mock("../libs/useFetch");
jest.mock("react-google-charts", () => ({
  Chart: ({ data }) => <div data-testid="chart" data-chart={JSON.stringify(data)} />,
}));

const mockUseFetch = useFetch;

function buildSnapshot() {
  return {
    stations: [
      {
        stationId: 4126,
        measures: {
          level: {
            latestValue: 2.95,
            rateOfChangeHour: -1.2,
            rateOfChangeDay: -16.8,
            readings: [
              { dateTime: "2026-03-08T12:00:00.000Z", value: 2.95 },
              { dateTime: "2026-03-08T11:45:00.000Z", value: 2.96 },
            ],
          },
        },
      },
      {
        stationId: 4009,
        measures: {
          level: {
            latestValue: 3.72,
            rateOfChangeHour: -2.2,
            rateOfChangeDay: -18.4,
            readings: [
              { dateTime: "2026-03-08T12:00:00.000Z", value: 3.72 },
              { dateTime: "2026-03-08T11:45:00.000Z", value: 3.73 },
            ],
          },
        },
      },
      {
        stationId: 4067,
        measures: {
          level: {
            latestValue: 1.12,
            rateOfChangeHour: -0.8,
            rateOfChangeDay: -6.4,
            readings: [
              { dateTime: "2026-03-08T12:00:00.000Z", value: 1.12 },
              { dateTime: "2026-03-08T11:45:00.000Z", value: 1.13 },
            ],
          },
        },
      },
      {
        stationId: 4007,
        measures: {
          level: {
            latestValue: 1.58,
            rateOfChangeHour: -0.9,
            rateOfChangeDay: -8.2,
            readings: [
              { dateTime: "2026-03-08T12:00:00.000Z", value: 1.58 },
              { dateTime: "2026-03-08T11:45:00.000Z", value: 1.59 },
            ],
          },
          flow: {
            latestValue: 51.2,
            rateOfChangeHour: -1.3,
            rateOfChangeDay: -7.8,
            readings: [
              { dateTime: "2026-03-08T12:00:00.000Z", value: 51.2 },
              { dateTime: "2026-03-08T11:45:00.000Z", value: 51.4 },
            ],
          },
        },
      },
      {
        stationId: 4074,
        measures: {
          level: {
            latestValue: 0.58,
            rateOfChangeHour: -0.4,
            rateOfChangeDay: -3.2,
            readings: [
              { dateTime: "2026-03-08T12:00:00.000Z", value: 0.58 },
              { dateTime: "2026-03-08T11:45:00.000Z", value: 0.59 },
            ],
          },
        },
      },
    ],
  };
}

describe("TrentDashboard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFetch.mockReturnValue({
      data: buildSnapshot(),
      error: undefined,
      isPending: false,
    });
  });

  test("renders the shared dashboard layout", () => {
    render(<TrentDashboard />);

    expect(screen.getByText("Explore and compare gauges")).toBeInTheDocument();
    expect(screen.getByText("Gauge snapshots")).toBeInTheDocument();
    expect(screen.getByText("Comparison workspace")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jump to comparison" })).toBeInTheDocument();
    expect(screen.getAllByTestId("chart").length).toBeGreaterThan(1);
  });

  test("supports chart view changes, station toggles, and overview hiding", async () => {
    const user = userEvent.setup();
    render(<TrentDashboard initialViewMode="combined" />);

    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByText("Smoothed rate of change")).toBeInTheDocument();

    const kegworthButtons = screen.getAllByRole("button", { name: "Kegworth" });
    await user.click(kegworthButtons[0]);
    expect(screen.getByText("4 selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide overview cards" }));
    expect(screen.queryByText("Gauge snapshots")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset to all gauges" }));
    expect(screen.getByText("5 selected")).toBeInTheDocument();
  });
});
