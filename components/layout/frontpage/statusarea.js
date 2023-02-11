import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import { useFetchedStatus } from "../../../libs/statussswrhook";

export default function StatusArea() {
  const { statusData, statusError, statusPending } = useFetchedStatus();

  //  calculate the number of days it has been closed due to the floodlights
  const closureDate = new Date("2022-11-06");
  const today = new Date();
  const diffTime = Math.abs(today - closureDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (statusPending || !statusData) {
    return <div>Loading</div>;
  }

  return (
    <div
      className="mt-4 text-white text-center justify-content-center"
      id="stats"
    >
      <Row className="justify-content-center">
        <h2>HPP Closure Stats</h2>
      </Row>
      <Row className="justify-content-center">
        <p>More coming soon!</p> 
      </Row>
    </div>
  );
}
