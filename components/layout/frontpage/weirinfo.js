import Link from "next/link";
import Row from "react-bootstrap/Row";
import Accordion from "react-bootstrap/Accordion";
import Card from "react-bootstrap/Card";
import { useContext } from "react";
import GraphContext from "../../../libs/context/graphcontrol";

// Extract weir info array outside the component for clarity
const weirs = [
  {
    eventKey: "0",
    header: "Newark Weir",
    description:
      "A friendly green wave in low levels, it builds gradually, eventually turning into a sticky walled in monster when it gets too high. Look before you leap! Very grotty and dirty water - keep an eye out for stuff floating in the eddies!",
    levels: "1.9m - 2.4m",
    location:
      "Parking on a small area of rough ground after a bridge over the river. Get in after crossing the bridges on river left.",
    mapLink:
      "https://www.google.co.uk/maps/place/53%C2%B004'29.6%22N+0%C2%B049'03.1%22W/",
    lowerBound: "1.9",
    upperBound: "2.4",
  },
  {
    eventKey: "1",
    header: "Trent Lock",
    description:
      "A big green fast wave that you can front surf and carve around on to your heart's content. As the river rises it gets more of a pile, but is a bit finicky in shorter boats. As it only comes in when the Trent is in flood, watch out for debris.",
    levels: "2.85m - 3.6m",
    location:
      "Parking at the Trent Lock inn. Get on, and paddle down the main Trent, go past the buoys (on the left) and under the bridges. You should see the wave.",
    mapLink:
      "https://www.google.com/maps/place/52%C2%B052'35.9%22N+1%C2%B016'25.6%22W/",
    lowerBound: "2.85",
    upperBound: "3.6",
  },
  {
    eventKey: "2",
    header: "Sawley Weir",
    description:
      "A big wave that comes in when Trent Lock is too high. As it only comes in when the Trent is in flood, watch out for debris.",
    levels: "4m+",
    location: "To be added",
    mapLink:
      "https://www.google.co.uk/maps/place/52%C2%B052'29.8%22N+1%C2%B018'26.2%22W/",
    lowerBound: "4",
    upperBound: "5",
  },
];

export default function WeirInfo() {
  const { upperBound, lowerBound, updateBounds } = useContext(GraphContext);

  return (
    <section className="history-panel text-white text-center" id="weirs" aria-labelledby="weirs-heading">
      <h2 id="weirs-heading" className="h4">Trent weirs</h2>
      <p className="history-muted">
        Weirs that are at a working level are listed under the river level at the top of the page. Open a weir for its levels and location.
      </p>
      <p><Link href="/trentweirs" className="text-info">Compare Trent gauges →</Link></p>
      <Accordion className="history-accordion text-start">
        {weirs.map((weir) => (
          <Accordion.Item eventKey={weir.eventKey} key={weir.eventKey}>
            <Accordion.Header>{weir.header}</Accordion.Header>
            <Accordion.Body>
              <p>{weir.description}</p>
              <ul className="list-unstyled mb-0">
                <li className="mb-2"><span className="fw-semibold">Water levels:</span> {weir.levels}</li>
                <li className="mb-2">
                  <span className="fw-semibold">Location:</span> {weir.location}{" "}
                  <a href={weir.mapLink} target="_blank" rel="noopener noreferrer" className="text-info">
                    Google Maps link
                  </a>
                </li>
                <li className="mb-2">Weirs can be dangerous. Always inspect a weir yourself before paddling it.</li>
                <li>
                  <a
                    href="#chart"
                    role="button"
                    className="btn btn-sm btn-outline-light"
                    data-lowerbound={weir.lowerBound}
                    data-upperbound={weir.upperBound}
                    onClick={updateBounds}
                  >
                    Show level guides on graph
                  </a>
                </li>
              </ul>
            </Accordion.Body>
          </Accordion.Item>
        ))}
      </Accordion>
    </section>
  );
}
