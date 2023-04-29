import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import { useFetchedStatus } from "../../../libs/statussswrhook";

export default function StatusArea() {
  const { statusData, statusError, statusPending } = useFetchedStatus();

  if (statusPending || !statusData) {
    return <div>Loading</div>;
  }

  // get the percentage of days that HPP has been open in the last 30 days
  const last30DaysOpenPercentage =
    statusData.thirtyDaysAgoOpenIndicatorPercentage;

  return (
    <div
      className="mt-4 text-white text-center justify-content-center"
      id="stats"
    >
      <Row className="justify-content-center">
        <h2>HPP Closure Stats</h2>
      </Row>
      <Row className="justify-content-center">
        <p> HPP has been closed for {last30DaysOpenPercentage}% of the last 30 days due to water levels</p>
        <p>More coming soon!</p>
      </Row>
    </div>
  );
}
