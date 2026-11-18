import Link from "next/link";

export default function WaterQuality() {
  return (
    <section className="history-panel text-white text-center" id="waterquality" aria-labelledby="waterquality-heading">
      <h2 id="waterquality-heading" className="h4">Water quality</h2>
      <p className="history-muted col-lg-8 mx-auto">
        A general indication from recent upstream storm-overflow activity and how quickly the river is rising. It is not
        a test of the water or a safe/unsafe verdict, and other pollution may be present, so take sensible precautions.
      </p>
      <Link href="/waterquality" className="btn btn-outline-light">View water quality dashboard</Link>
    </section>
  );
}
