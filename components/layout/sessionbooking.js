import Button from "react-bootstrap/Button";
import Row from "react-bootstrap/Row";
import Collapse from "react-bootstrap/Collapse";
import {useState} from "react";

export default function SessionBooking () {
    const [open, setOpen] = useState(false);
    return (
        <div className="text-white text-center justify-content-center">
            <Row className="mt-4 justify-content-center">
                <h2>Session Booking Info</h2>
            </Row>
            <Row className="justify-content-center">
                <h6>Click to go to the next open session</h6>
            </Row>
            <Row className="mt-2 justify-content-center">
                <h6>Find Sessions with open Slots</h6>
            </Row>
            <Row className="justify-content-center">
                <Button value="3" className="m-1">Next 3 Days</Button>
                <Button value="7" className="m-1">Next 7 Days</Button>
                <Button value="14" className="m-1">Next 14 Days</Button>
                <Button value="28" className="m-1">Next 28 Days</Button>
            </Row>
            <Row className="mt-2 justify-content-center">
                <h6>Next 5 Days Session Overview</h6>
            </Row>
            <Row className="justify-content-center">
                <Button onClick={() => setOpen(!open)} aria-controls="toggle-sessions-area" aria-expanded={open}>Toggle Session Overview</Button>
            </Row>
            <Row className="justify-content-center">
                <Collapse in={open}>
                    <div id="toggle-sessions-area">
                        <p>Session overview will go here</p>
                    </div>
                </Collapse>
            </Row>
        </div>
    )
}