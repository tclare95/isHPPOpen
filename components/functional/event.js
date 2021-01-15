import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";

export default function Event (props) {
        const start = new Date(props.startDate);
        const end = new Date(props.endDate);
        return(
            <Row className=" border align-middle border-white p-4 m-3 bg-light text-dark rounded">
                
                <Col className="align-middle">
                <h4 className="eventText">{props.name}</h4>
                </Col>
                <Col className="align-middle">
                <h6 className="eventText"><span className="font-italic">Start Date:</span> {start.toDateString()}</h6>
                </Col>
                <Col className="align-middle">
                <h6 className="eventText"><span className="font-italic">End Date:</span>  {end.toDateString()}</h6>
                </Col>
                <Col className="align-middle">
                <p className="eventText">{props.eventDetails}</p>
                </Col>

                </Row>
            
        )
}