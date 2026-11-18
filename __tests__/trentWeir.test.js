/* eslint-disable react/prop-types */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TrentWeirBlock from "../components/functional/trentWeir";

jest.mock("react-google-charts", () => ({
  Chart: ({ data }) => <div data-testid="chart" data-chart={JSON.stringify(data)} />,
}));

const station = {
  stationId: 4009,
  gaugeName: "Colwick",
  measureType: "level",
  summary: "Useful downstream city reference with a broad comparison role.",
  comparisonEnabled: true,
  alertingEnabled: true,
  forecastAvailable: true,
};

describe("TrentWeirBlock", () => {
  test("renders a summary card and calls the comparison action", async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();

    render(
      <TrentWeirBlock
        station={station}
        numDays={3}
        isSelected={false}
        onSelect={onSelect}
        measureSnapshot={{
          latestValue: 1.23,
          rateOfChangeHour: 4.5,
          rateOfChangeDay: 22.1,
          readings: [
            { dateTime: "2026-03-08T12:00:00.000Z", value: 1.23 },
            { dateTime: "2026-03-08T11:45:00.000Z", value: 1.22 },
          ],
        }}
      />
    );

    expect(screen.getByText("Current reading")).toBeInTheDocument();
    expect(screen.getByText("1.23 m")).toBeInTheDocument();
    expect(screen.getByText("1h change: +4.5 cm")).toBeInTheDocument();
    expect(screen.getByTestId("chart")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email alerts" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Compare on chart" }));
    expect(onSelect).toHaveBeenCalledWith(station);
  });

  test("renders unavailable state when the station measure is missing", () => {
    render(<TrentWeirBlock station={station} numDays={1} isSelected={false} measureSnapshot={null} />);

    expect(screen.getByText("No data available for this gauge right now.")).toBeInTheDocument();
  });
  test("shows each reading's age and flags a gauge that has stopped reporting", () => {
    const now = new Date("2026-03-08T15:00:00.000Z");
    const snapshot = (dateTime) => ({ latestValue: 1.23, rateOfChangeHour: null, rateOfChangeDay: null, readings: [{ dateTime, value: 1.23 }] });
    const { rerender } = render(<TrentWeirBlock station={station} numDays={1} isSelected={false} now={now} measureSnapshot={snapshot("2026-03-08T14:50:00.000Z")} />);
    expect(screen.getByText("Observed 10 minutes ago.")).toBeInTheDocument();
    expect(document.querySelector('[data-state="stale"]')).toBeNull();

    rerender(<TrentWeirBlock station={station} numDays={1} isSelected={false} now={now} measureSnapshot={snapshot("2026-03-08T12:00:00.000Z")} />);
    expect(screen.getByText("Observed 3 hours ago, so it may be out of date.")).toHaveAttribute("data-state", "stale");
    // A series too short to reach back an hour or a day has no change, not "+0.0 cm".
    expect(screen.getByText("1h change: unavailable")).toBeInTheDocument();
    expect(screen.getByText("24h change: unavailable")).toBeInTheDocument();
  });
});
