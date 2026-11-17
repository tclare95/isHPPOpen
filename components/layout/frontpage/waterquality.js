import Row from "react-bootstrap/Row";
import Link from "next/link";

export default function WaterQuality() {
  return (
    <div className="mt-4 text-white text-center justify-content-center" id="waterquality">
      <Row className="justify-content-center">
        <h2>Water Quality</h2>
      </Row>

      <Row className="justify-content-center my-2">
        <p className="mb-0 site-measure">
          A general indication from recent upstream storm-overflow activity and how quickly the river is rising. It is not
          a test of the water or a safe/unsafe verdict, and other pollution may be present, so take sensible precautions.
        </p>
      </Row>

      <Row className="justify-content-center mt-3 mb-4">
        <Link href="/waterquality" className="btn btn-primary water-quality-dashboard-link">
          View water quality dashboard
        </Link>
      </Row>
    </div>
  );
}
