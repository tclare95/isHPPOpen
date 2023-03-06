import Row from "react-bootstrap/Row";
import Collapse from "react-bootstrap/Collapse";
import {useState} from "react";
import Events from "../../functional/events";
import Col from "react-bootstrap/Col";
import Button from "react-bootstrap/Button";


export default function EventsArea () {
    const [open, setOpen] = useState(false);
    return (
        <div className="mt-4 text-white text-center justify-content-center">
            <Row className="justify-content-center">
                <h2>Upcoming Events</h2>
            </Row>
            <Row className="justify-content-center">
                <Col>
                <Button onClick={() => setOpen(!open)} aria-controls="toggle-events-area" aria-expanded={open}>Toggle Events</Button>
                </Col>
            </Row>
            <Row className="justify-content-center">
                <Collapse in={open}>
                    <div in={open}>
                       <Events />
                    </div>
                </Collapse>
            </Row>
        </div>
    )
}