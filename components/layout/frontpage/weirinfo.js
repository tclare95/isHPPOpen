import Row from "react-bootstrap/Row";
import Accordion from "react-bootstrap/Accordion";
import Card from "react-bootstrap/Card";
import ListGroup from "react-bootstrap/ListGroup";
import { useContext } from "react";
import GraphContext from "../../../libs/context/graphcontrol";

export default function WeirInfo() {
  const { upperBound, lowerBound, updateBounds } = useContext(GraphContext);

  return (
    <div className="mt-4 text-white text-center justify-content-center" id="weirs">
      <Row className="justify-content-center mb-3">
        <h2>Trent Weirs</h2>
        <p>
          When the Trent is at the correct level for a weir to work, it will be displayed below the level at the top of the page. Tap on the weir name below for more info about levels, directions, and general info.
        </p>
      </Row>
      <Accordion className="mb-4">
        {[
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
              "A big green fast wave that you can front surf and carve around on to your hearts content. As the river rises it gets more of a pile, but is a bit finicky in shorter boats. As it only comes in when the Trent is in flood, watch out for debris.",
            levels: "2.85m - 3.6m",
            location:
              "Parking at the Trent Lock inn. Get on, and paddle down the main Trent, go past the bouys (on the left) and under the bridges. You should see the wave.",
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
        ].map((weir) => (
          <Accordion.Item eventKey={weir.eventKey} key={weir.eventKey}>
            <Accordion.Header className="bg-dark text-white">
              {weir.header}
            </Accordion.Header>
            <Accordion.Body>
              <h6 className="font-weight-bold">{weir.header}</h6>
              <p>{weir.description}</p>
              <ListGroup variant="flush">
                <ListGroup.Item className="bg-secondary text-white">
                  <span className="font-weight-bold">Water Levels:</span> {weir.levels}
                </ListGroup.Item>
                <ListGroup.Item className="bg-secondary text-white">
                  <span className="font-weight-bold">Location:</span> {weir.location}{" "}
                  <a href={weir.mapLink} target="_blank" rel="noopener noreferrer">
                    Google Maps Link
                  </a>
                </ListGroup.Item>
                <ListGroup.Item className="bg-secondary text-white text-muted">
                  Weirs can be dangerous! Always check them yourself before committing!
                </ListGroup.Item>
                <ListGroup.Item className="bg-secondary">
                  <a
                    href="#chart"
                    role="button"
                    className="btn btn-sm btn-primary m-1"
                    data-lowerbound={weir.lowerBound}
                    data-upperbound={weir.upperBound}
                    onClick={updateBounds}
                  >
                    Show level guides on graph
                  </a>
                </ListGroup.Item>
              </ListGroup>
            </Accordion.Body>
          </Accordion.Item>
        ))}
      </Accordion>
    </div>
  );
}
