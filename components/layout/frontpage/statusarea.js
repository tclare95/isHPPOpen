import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import { useFetchedStatus } from "../../../libs/statussswrhook";

export default function StatusArea() {
  const { statusData, statusError, statusPending } = useFetchedStatus();

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
        <p>HPP was last open on {statusData.effectiveLastOpenDate}</p>
        <p>More coming soon!</p>
      </Row>
    </div>
  );
}
