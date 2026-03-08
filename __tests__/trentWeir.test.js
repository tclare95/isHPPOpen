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

    await user.click(screen.getByRole("button", { name: "Compare on chart" }));
    expect(onSelect).toHaveBeenCalledWith(station);
  });

  test("renders unavailable state when the station measure is missing", () => {
    render(<TrentWeirBlock station={station} numDays={1} isSelected={false} measureSnapshot={null} />);

    expect(screen.getByText("No data available for this gauge right now.")).toBeInTheDocument();
  });
});
